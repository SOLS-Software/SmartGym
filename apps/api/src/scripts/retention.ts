// Retencao / expurgo automatico (LGPD art. 15 termino do tratamento + art. 16
// eliminacao; e retencao da trilha de auditoria, residuo do achado A-4).
//
// POR QUE ESTE SCRIPT EXISTE: a acao manual por titular ja existe
// (POST /students/:id/anonymize e a exclusao da trilha nunca acontecia). Faltava
// o processo que roda em LOTE, periodicamente, aplicando a POLITICA de retencao
// do controlador — anonimizar ex-alunos inativos ha mais que X e expurgar a
// trilha mais antiga que Y. Este script e esse processo.
//
// O QUE ELE FAZ:
//   1. ALUNOS: anonimiza (mesma logica de shared/anonymize.ts — mantem o
//      financeiro) os alunos que estao INATIVOS, ainda tem PII (nao anonimizados)
//      e cuja ficha nao muda ha mais de RETENTION_ALUNO_DIAS, desde que NAO
//      tenham nenhum plano vigente. Sinal conservador de "ex-aluno ha tempos".
//   2. AUDITORIA: apaga as linhas de tb_Auditoria com dtEvento anterior ao corte
//      RETENTION_AUDITORIA_DIAS (metadados de acesso; retencao proporcional a
//      finalidade). Delete fisico, em lotes.
//
// SEGURANCA: DRY-RUN por padrao — sem --apply ele so CONTA e LISTA amostras, nao
// escreve nada. Guardas de prazo minimo evitam apagar tudo por engano. NUNCA
// rode --apply contra a base compartilhada de dev.
//
// PRAZOS = DECISAO DO CONTROLADOR (juridico). Os defaults abaixo sao um PISO
// conservador, nao uma recomendacao legal — ajuste por env/flag. Ver
// docs/retencao-expurgo.md.
//
// Uso (na pasta apps/api):
//   pnpm exec tsx --env-file-if-exists ../../.env \
//     --env-file-if-exists ../../packages/db/.env src/scripts/retention.ts
//       # dry-run: so conta/lista. Nada muda.
//   ...adicione --apply para executar de verdade.
//   Flags: --only=alunos|auditoria|all  --tenant=<id>  --limit=<n>
//          --aluno-dias=<n>  --auditoria-dias=<n>  --skip-external
//   Env equivalentes: RETENTION_APPLY, RETENTION_ALUNO_DIAS,
//          RETENTION_AUDITORIA_DIAS.

import { prisma } from '../shared/prisma.js';
import { anonymizeStudent } from '../shared/anonymize.js';
import { getTenantDb } from '../shared/tenantDataSource.js';

const DIA_MS = 86_400_000;

// Defaults conservadores (PISO, nao recomendacao juridica). 5 anos para o
// ex-aluno (alinha com prazos fiscais comuns) e 2 anos para a trilha de acesso.
const DEFAULT_ALUNO_DIAS = 1825;
const DEFAULT_AUDITORIA_DIAS = 730;

// Guardas: recusa prazos curtos demais, que apagariam dado recente por engano.
const MIN_ALUNO_DIAS = 365;
const MIN_AUDITORIA_DIAS = 90;

type Only = 'alunos' | 'auditoria' | 'all';

type Config = {
  apply: boolean;
  only: Only;
  tenant?: number;
  limit: number;
  alunoDias: number;
  auditoriaDias: number;
  skipExternal: boolean;
};

function parseArgs(argv: string[]): Config {
  const flag = (name: string) => argv.includes(`--${name}`);
  const opt = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  const int = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  };

  const onlyRaw = (opt('only') ?? 'all') as Only;
  const only: Only = ['alunos', 'auditoria', 'all'].includes(onlyRaw) ? onlyRaw : 'all';
  const tenantRaw = opt('tenant');
  const tenant = tenantRaw !== undefined && Number.isFinite(Number(tenantRaw)) ? Number(tenantRaw) : undefined;

  return {
    apply: flag('apply') || process.env.RETENTION_APPLY === 'true',
    only,
    tenant,
    limit: int(opt('limit'), 500),
    alunoDias: int(opt('aluno-dias') ?? process.env.RETENTION_ALUNO_DIAS, DEFAULT_ALUNO_DIAS),
    auditoriaDias: int(opt('auditoria-dias') ?? process.env.RETENTION_AUDITORIA_DIAS, DEFAULT_AUDITORIA_DIAS),
    skipExternal: flag('skip-external'),
  };
}

function log(msg = '') {
  // eslint-disable-next-line no-console
  console.log(msg);
}

// Lista de tenants a varrer. Com banco por cliente NAO existe mais "varrer
// todos de uma vez": cada um pode estar num banco diferente, e um SELECT so
// nunca alcancaria os dois. A lista de clientes e control-plane (fica sempre no
// central); a varredura acontece uma vez por cliente, no banco DELE.
async function tenantsParaVarrer(cfg: Config): Promise<number[]> {
  if (cfg.tenant !== undefined) return [cfg.tenant];
  const clientes = await prisma.cliente.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  return clientes.map((c) => c.id);
}

async function processAlunos(cfg: Config, cutoff: Date) {
  let restante = cfg.limit;
  for (const idCliente of await tenantsParaVarrer(cfg)) {
    if (restante <= 0) break;
    restante -= await processAlunosDoTenant(cfg, cutoff, idCliente, restante);
  }
}

/** Varre UM tenant, no banco dele. Devolve quantos candidatos o lote consumiu. */
async function processAlunosDoTenant(
  cfg: Config,
  cutoff: Date,
  idCliente: number,
  limite: number,
): Promise<number> {
  const db = await getTenantDb(idCliente);
  log(`\n== ALUNOS ==  corte: inativos sem alteracao desde ${cutoff.toISOString().slice(0, 10)} (${cfg.alunoDias} dias)`);

  // Candidato: inativo, ainda com PII (caCPFHash != null => nao anonimizado),
  // ficha parada ha mais que o corte, e SEM nenhum plano vigente (nao encerrado
  // e nao inativo, ou com encerramento no futuro). Escopo de tenant opcional.
  const where = {
    boInativo: true,
    caCPFHash: { not: null },
    dtAlteracao: { lt: cutoff },
    idCliente,
    NOT: {
      alunoPlanos: {
        some: {
          boInativo: false,
          OR: [{ dtEncerramento: null }, { dtEncerramento: { gt: new Date() } }],
        },
      },
    },
  };

  const total = await db.aluno.count({ where });
  const candidatos = await db.aluno.findMany({
    where,
    select: { id: true, idCliente: true, dtAlteracao: true },
    orderBy: { dtAlteracao: 'asc' },
    take: limite,
  });

  log(`   elegiveis: ${total}  |  neste lote (limit ${cfg.limit}): ${candidatos.length}`);
  if (candidatos.length === 0) return 0;

  if (!cfg.apply) {
    const amostra = candidatos.slice(0, 10);
    for (const a of amostra) {
      log(`   [dry-run] anonimizaria aluno #${a.id} (cliente ${a.idCliente}, parado desde ${a.dtAlteracao.toISOString().slice(0, 10)})`);
    }
    if (candidatos.length > amostra.length) log(`   ... +${candidatos.length - amostra.length} (amostra de 10)`);
    return candidatos.length;
  }

  let ok = 0;
  const pendencias: string[] = [];
  for (const a of candidatos) {
    try {
      const r = await anonymizeStudent(a.id, a.idCliente, { log: console, skipExternal: cfg.skipExternal });
      ok += 1;
      if (r.pendenciasExternas.length > 0) pendencias.push(`aluno #${a.id}: ${r.pendenciasExternas.join(', ')}`);
    } catch (err) {
      log(`   ERRO ao anonimizar aluno #${a.id}: ${(err as Error).message}`);
    }
  }
  log(`   anonimizados: ${ok}/${candidatos.length}`);
  if (pendencias.length > 0) {
    log(`   pendencias externas (reprocessar a mao):`);
    for (const p of pendencias) log(`     - ${p}`);
  }
  return candidatos.length;
}

async function processAuditoria(cfg: Config, cutoff: Date) {
  log(`\n== AUDITORIA ==  corte: eventos anteriores a ${cutoff.toISOString().slice(0, 10)} (${cfg.auditoriaDias} dias)`);

  const where = {
    dtEvento: { lt: cutoff },
    ...(cfg.tenant !== undefined ? { idCliente: cfg.tenant } : {}),
  };

  const total = await prisma.auditoria.count({ where });
  log(`   linhas a expurgar: ${total}`);
  if (total === 0) return;

  if (!cfg.apply) {
    log(`   [dry-run] apagaria ${total} linha(s) de tb_Auditoria.`);
    return;
  }

  // Delete em lotes por id: o deleteMany do Prisma nao aceita LIMIT, entao
  // selecionamos ate `lote` ids que casam e apagamos so esses, repetindo ate
  // esgotar. Evita um unico DELETE gigante segurando lock na tabela inteira.
  let apagadas = 0;
  const lote = 1000;
  for (;;) {
    const rows = await prisma.auditoria.findMany({
      where,
      select: { id: true },
      take: lote,
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;
    const r = await prisma.auditoria.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
    apagadas += r.count;
    if (rows.length < lote) break;
  }
  log(`   expurgadas: ${apagadas} linha(s).`);
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));

  if (cfg.alunoDias < MIN_ALUNO_DIAS) {
    throw new Error(`--aluno-dias=${cfg.alunoDias} abaixo do minimo de guarda (${MIN_ALUNO_DIAS}). Recuse-se a anonimizar ex-alunos recentes.`);
  }
  if (cfg.auditoriaDias < MIN_AUDITORIA_DIAS) {
    throw new Error(`--auditoria-dias=${cfg.auditoriaDias} abaixo do minimo de guarda (${MIN_AUDITORIA_DIAS}). Recuse-se a expurgar a trilha recente.`);
  }

  const now = Date.now();
  const cutoffAluno = new Date(now - cfg.alunoDias * DIA_MS);
  const cutoffAud = new Date(now - cfg.auditoriaDias * DIA_MS);

  log('========================================================================');
  log(`Retencao/expurgo — modo: ${cfg.apply ? 'APPLY (ESCREVE!)' : 'DRY-RUN (nada muda)'}`);
  log(`escopo: ${cfg.only}${cfg.tenant !== undefined ? ` | tenant ${cfg.tenant}` : ' | todos os tenants'} | limit ${cfg.limit}${cfg.skipExternal ? ' | skip-external' : ''}`);
  log('========================================================================');

  if (cfg.only === 'alunos' || cfg.only === 'all') await processAlunos(cfg, cutoffAluno);
  if (cfg.only === 'auditoria' || cfg.only === 'all') await processAuditoria(cfg, cutoffAud);

  log('\nConcluido.');
  if (!cfg.apply) log('(dry-run — rode de novo com --apply para executar. NUNCA na base de dev.)');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
