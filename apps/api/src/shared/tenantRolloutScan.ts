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

export type AcessoPendente = {
  arquivo: string;
  linha: number;
  model: string;
  operacao: string;
};

export function acessosPendentes(): AcessoPendente[] {
  const pendentes: AcessoPendente[] = [];
  for (const file of collectTsFiles()) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(SRC_ROOT.length).replace(/\\/g, '/').replace(/^\//, '');
    CHAMADA_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CHAMADA_RE.exec(src))) {
      const model = m[1];
      if (!model || !MODELS_DE_TENANT.has(model)) continue;
      const linha = src.slice(0, m.index).split('\n').length;
      if (ALLOWLIST.has(`${rel}:${linha}`)) continue;
      pendentes.push({ arquivo: rel, linha, model, operacao: m[2] ?? '' });
    }
  }
  return pendentes;
}

/** Formato `arquivo:linha  prisma.model.op`, para mensagens de erro. */
export function acessosCentraisPendentes(): string[] {
  return acessosPendentes().map((a) => `${a.arquivo}:${a.linha}  prisma.${a.model}.${a.operacao}`);
}
