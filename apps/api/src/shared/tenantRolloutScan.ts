import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { TABLE_TIERS } from './tenantTables.js';

// Varredura do que falta no rollout multi-tenant: chamadas `prisma.<model>` em
// que `<model>` e de nivel application/catalog — dado que DEVERIA vir de
// `getTenantDb(idCliente)`.
//
// Vive fora do teste porque duas coisas a consomem: a catraca em
// tenantRolloutCoverage.test.ts (o numero so desce) e o script de diagnostico
// que mostra onde ele esta concentrado, para decidir a ordem dos modulos.
//
// LE O FONTE, nao o build: so funciona rodando do repositorio. Nada em runtime
// de producao depende disto.
//
// Heuristica textual, no espirito do tenantScope.test: nao prova semantica,
// flagra o caso cru. Conta a mais de proposito — falso positivo aparece na
// lista e vira allowlist com motivo; falso negativo passaria despercebido.

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url)); // apps/api/src

/** Nome do model no client Prisma: 'AlunoArquivo' -> 'alunoArquivo'. */
const clientProp = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

export const MODELS_DE_TENANT = new Set(
  Object.entries(TABLE_TIERS)
    .filter(([, tier]) => tier === 'application' || tier === 'catalog')
    .map(([model]) => clientProp(model)),
);

// So o singleton central. `db.` / `tx.` nao entram: sao o client ja resolvido
// por getTenantDb (ou a transacao dele), que e exatamente o destino.
export const CHAMADA_RE = /\bprisma\.([a-zA-Z]+)\.([a-zA-Z]+)\s*\(/g;

// Acessos ao central que NAO fazem parte do rollout. Formato `arquivo:linha`
// a partir de apps/api/src, com o motivo — excecao e decisao, nao descuido.
const ALLOWLIST = new Set<string>([]);

export function collectTsFiles(dir: string = SRC_ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

// FILTRO POR RELACAO: a consulta parte de um model CENTRAL, mas o `where` ou o
// `include` atravessa para uma tabela de aplicacao pelo caminho da relacao — um
// JOIN que simplesmente deixa de existir quando os dois moram em bancos
// diferentes. A varredura por `prisma.<model>` nao via nada disso, e eram 8
// casos, o mais importante deles o carregamento de perfil/RBAC a cada request
// autenticado. Medidor que nao ve o que falta e pior que medidor nenhum: ele
// autoriza a declarar pronto.
//
// O exemplo concreto de cada forma esta em tenantRolloutCoverage.test.ts, e nao
// aqui: escrito na prosa, ele seria varrido como se fosse codigo — por este
// scanner e pelo tenantScope.test.
const MODELS_CENTRAIS = new Set(
  Object.entries(TABLE_TIERS)
    .filter(([, tier]) => tier === 'control-plane')
    .map(([model]) => model.charAt(0).toLowerCase() + model.slice(1)),
);

const CHAMADA_CENTRAL_RE = /\bprisma\.([a-zA-Z]+)\.([a-zA-Z]+)\s*\(/g;

/** Recorta o argumento da chamada (parenteses balanceados) a partir do '('. */
function argumentoBalanceado(src: string, abre: number): string {
  let nivel = 0;
  for (let i = abre; i < src.length; i += 1) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') nivel += 1;
    else if (c === ')' || c === ']' || c === '}') {
      nivel -= 1;
      if (nivel === 0) return src.slice(abre, i + 1);
    }
  }
  return src.slice(abre, abre + 2000);
}

// SQL CRU. `prisma.$queryRaw` nao casa com `prisma.<model>`, entao a varredura
// por model sozinha tem um buraco — e um medidor furado da falsa confianca, que
// e exatamente o defeito que este rollout existe para fechar. Aqui casamos o
// nome FISICO da tabela (o @@map do schema) dentro do SQL que segue a chamada.
const RAW_RE = /\bprisma\.\$(queryRaw|executeRaw)(?:Unsafe)?\b/g;

// Quanto do texto apos a chamada e inspecionado atras do nome da tabela. Folgado
// o bastante para um SELECT com varios JOINs.
const JANELA_SQL = 1200;

/** Nome fisico -> model, apenas para tabelas de aplicacao/catalogo. */
function tabelasDeTenant(): Map<string, string> {
  const schema = readFileSync(
    fileURLToPath(new URL('../../../../packages/db/prisma/schema.prisma', import.meta.url)),
    'utf8',
  );
  const mapa = new Map<string, string>();
  const modelRe = /model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(schema))) {
    const model = m[1] ?? '';
    if (!MODELS_DE_TENANT.has(model.charAt(0).toLowerCase() + model.slice(1))) continue;
    const tabela = /@@map\("([^"]+)"\)/.exec(m[2] ?? '')?.[1];
    if (tabela) mapa.set(tabela, model);
  }
  return mapa;
}

export type AcessoPendente = {
  arquivo: string;
  linha: number;
  model: string;
  operacao: string;
};

/**
 * Analisa UM fonte. Pura (recebe o texto, nao le disco) para o teste poder
 * alimenta-la com um trecho conhecido e provar que a varredura enxerga — um
 * detector que para de casar vira teste vazio, e teste vazio autoriza a
 * declarar pronto o que nao esta.
 */
export function analisarFonte(
  rel: string,
  src: string,
  tabelas: Map<string, string>,
): AcessoPendente[] {
  const pendentes: AcessoPendente[] = [];
  let m: RegExpExecArray | null;

  // 1) Acesso direto a model de aplicacao pelo client central.
  CHAMADA_RE.lastIndex = 0;
  while ((m = CHAMADA_RE.exec(src))) {
    const model = m[1];
    if (!model || !MODELS_DE_TENANT.has(model)) continue;
    const linha = src.slice(0, m.index).split('\n').length;
    if (ALLOWLIST.has(`${rel}:${linha}`)) continue;
    pendentes.push({ arquivo: rel, linha, model, operacao: m[2] ?? '' });
  }

  // 2) Filtro/include por RELACAO, partindo de um model central.
  CHAMADA_CENTRAL_RE.lastIndex = 0;
  while ((m = CHAMADA_CENTRAL_RE.exec(src))) {
    const central = m[1];
    if (!central || !MODELS_CENTRAIS.has(central)) continue;
    const arg = argumentoBalanceado(src, m.index + m[0].length - 1);
    const relacao = [...MODELS_DE_TENANT].find((modelo) =>
      new RegExp(`\\b${modelo}\\s*:\\s*\\{`).test(arg),
    );
    if (!relacao) continue;
    const linha = src.slice(0, m.index).split('\n').length;
    if (ALLOWLIST.has(`${rel}:${linha}`)) continue;
    pendentes.push({ arquivo: rel, linha, model: relacao, operacao: `relacao:${m[2]}` });
  }

  // 3) SQL cru tocando tabela de tenant.
  RAW_RE.lastIndex = 0;
  while ((m = RAW_RE.exec(src))) {
    const sql = src.slice(m.index, m.index + JANELA_SQL);
    const alvo = [...tabelas].find(([tabela]) => sql.includes(`"${tabela}"`));
    if (!alvo) continue; // SQL de control-plane: fica no central de proposito.
    const linha = src.slice(0, m.index).split('\n').length;
    if (ALLOWLIST.has(`${rel}:${linha}`)) continue;
    pendentes.push({ arquivo: rel, linha, model: alvo[1], operacao: `$${m[1]}` });
  }

  return pendentes;
}

export function acessosPendentes(): AcessoPendente[] {
  const tabelas = tabelasDeTenant();
  const pendentes: AcessoPendente[] = [];
  for (const file of collectTsFiles()) {
    const rel = file.slice(SRC_ROOT.length).replace(/\\/g, '/').replace(/^\//, '');
    pendentes.push(...analisarFonte(rel, readFileSync(file, 'utf8'), tabelas));
  }
  return pendentes;
}

export { tabelasDeTenant };

/** Formato `arquivo:linha  prisma.model.op`, para mensagens de erro. */
export function acessosCentraisPendentes(): string[] {
  return acessosPendentes().map((a) => `${a.arquivo}:${a.linha}  prisma.${a.model}.${a.operacao}`);
}
