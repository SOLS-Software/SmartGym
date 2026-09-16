import { PrismaClient } from '@smartgym/db';
import { prisma } from './prisma.js';
import { decryptSecret } from './secrets.js';
import { getSupabaseConfig } from './supabase.js';
import { guardTransactions, tenantOwner } from './tenantTx.js';
import type { SupabaseConfig } from './api-types.js';

// Multi-tenancy de DADOS — modelo hibrido/registro (control plane).
//
// PROBLEMA: hoje a conexao de banco e de storage e um endereco GLOBAL no .env, e
// os dados de todos os clientes moram nele. Para oferecer "locacao de dados"
// (infra minha, dado do cliente), a conexao dos dados do cliente nao pode ser um
// endereco fixo no .env — precisa ser resolvida POR TENANT.
//
// COMO: uma tabela control-plane `tb_ClienteConexoes` (criada por
// packages/db/scripts/cliente-conexoes.sql) guarda, por cliente, PARA ONDE
// apontam os dados dele (banco e storage), com as credenciais CIFRADAS
// (secrets.ts). Este resolver le esse registro e devolve o PrismaClient / config
// de storage do tenant. **Linha ausente, coluna nula ou boAtivo=false => cai no
// DEFAULT do .env** (o pool compartilhado de hoje). Assim, nada muda para quem
// nao foi migrado, e da para mover clientes para banco/bucket proprio um a um.
//
// ESTADO: esta e a CAMADA DE PARAMETRIZACAO. Adotar de fato (rotear as queries
// por getTenantDb em vez do singleton `prisma`, migrations por tenant,
// provisionamento) e o rollout — ver docs/multi-tenancy-dados.md.

// Linha crua de tb_ClienteConexoes (lida via $queryRaw; a tabela e control-plane
// e NAO faz parte do schema Prisma de dados de tenant).
export type ClienteConexaoRow = {
  idCliente: number;
  dsDatabaseUrlEnc: string | null;
  dsStorageUrlEnc: string | null;
  dsStorageKeyEnc: string | null;
  dsStorageBucket: string | null;
  dsStorageBucketClientes: string | null;
  boAtivo: boolean;
};

export type TenantStorage = SupabaseConfig & { bucketClientes: string };

export type TenantDataSource = {
  // null => usar o banco padrao (.env). string => banco dedicado do tenant.
  databaseUrl: string | null;
  // null => usar o storage padrao (.env). objeto => storage dedicado do tenant.
  storage: TenantStorage | null;
};

// PURO e testavel: decide a fonte de dados a partir da linha do registro (ou
// null). Decifra as credenciais aqui — se a decifragem falhar (chave errada,
// valor corrompido), LANCA de proposito, em vez de cair no default em silencio:
// um tenant provisionado que "some" para o pool compartilhado e um bug, nao um
// fallback aceitavel.
export function resolveTenantDataSource(row: ClienteConexaoRow | null): TenantDataSource {
  if (!row || row.boAtivo === false) return { databaseUrl: null, storage: null };

  const databaseUrl = row.dsDatabaseUrlEnc ? decryptSecret(row.dsDatabaseUrlEnc) : null;

  let storage: TenantStorage | null = null;
  if (row.dsStorageUrlEnc && row.dsStorageKeyEnc) {
    const bucket = row.dsStorageBucket ?? process.env.SUPABASE_STORAGE_BUCKET ?? '';
    storage = {
      url: decryptSecret(row.dsStorageUrlEnc),
      serviceRoleKey: decryptSecret(row.dsStorageKeyEnc),
      bucket,
      bucketClientes: row.dsStorageBucketClientes ?? bucket,
    };
  }

  return { databaseUrl, storage };
}

// Le o registro do control plane (que vive no banco padrao/bootstrap = `prisma`).
// Se a tabela ainda nao existe (ambiente nao provisionado), devolve null e o
// chamador cai no default — a camada e segura de mergear antes do rollout.
async function readConexao(idCliente: number): Promise<ClienteConexaoRow | null> {
  try {
    const rows = await prisma.$queryRaw<ClienteConexaoRow[]>`
      SELECT "idCliente", "dsDatabaseUrlEnc", "dsStorageUrlEnc", "dsStorageKeyEnc",
             "dsStorageBucket", "dsStorageBucketClientes", "boAtivo"
      FROM "tb_ClienteConexoes"
      WHERE "idCliente" = ${idCliente}
      LIMIT 1`;
    return rows[0] ?? null;
  } catch {
    // Tabela control-plane ausente (pre-rollout): opera no pool padrao.
    return null;
  }
}

// Cache de PrismaClient por tenant: cada banco dedicado abre seu proprio pool de
// conexoes, entao NAO recriar por request. (Rollout: avaliar LRU/eviction e
// connection_limit por client — ver o doc.)
//
// O CACHE TEM PRAZO, e isso nao e detalhe. Enquanto ele era eterno, o rollback
// documentado no runbook ("boAtivo=false volta o cliente ao padrao") NAO
// funcionava: o registro mudava no banco e o processo seguia servindo do silo
// ate alguem reiniciar a API. Um rollback que exige restart nao e rollback —
// e justamente na hora em que se precisa dele que ninguem quer derrubar o
// processo. Com prazo, o resolver relê o registro e a virada acontece sozinha.
type EntradaCache = { client: PrismaClient; url: string; expiraEm: number };

const tenantDbCache = new Map<number, EntradaCache>();

// Janela entre mudar o registro e a mudanca valer. Curto o bastante para um
// rollback ser operacional, longo o bastante para nao consultar o control plane
// a cada request.
const TTL_MS = Number(process.env.TENANT_DB_CACHE_TTL_MS ?? 60_000);

// Carencia antes de fechar um client trocado: requests em voo ainda o usam.
const CARENCIA_DESCONEXAO_MS = 30_000;

function descartar(entrada: EntradaCache): void {
  const timer = setTimeout(() => {
    void entrada.client.$disconnect().catch(() => {});
  }, CARENCIA_DESCONEXAO_MS);
  // Nao segura o processo no shutdown.
  timer.unref?.();
}

// Devolve o PrismaClient dos dados do tenant: o dedicado (se registrado) ou o
// padrao compartilhado (`prisma`). O rollout troca os call sites que hoje usam o
// singleton `prisma` por este resolver, nos caminhos que precisam ser por-tenant.
export async function getTenantDb(idCliente: number): Promise<PrismaClient> {
  const agora = Date.now();
  const cached = tenantDbCache.get(idCliente);
  if (cached && cached.expiraEm > agora) return cached.client;

  const { databaseUrl } = resolveTenantDataSource(await readConexao(idCliente));

  // Override removido/desativado: volta ao pool e derruba o client dedicado.
  if (!databaseUrl) {
    if (cached) {
      tenantDbCache.delete(idCliente);
      descartar(cached);
    }
    return prisma; // default pool — comportamento de hoje
  }

  // Mesmo destino de antes: so renova o prazo, mantendo o pool de conexoes.
  if (cached && cached.url === databaseUrl) {
    cached.expiraEm = agora + TTL_MS;
    return cached.client;
  }

  if (cached) {
    tenantDbCache.delete(idCliente);
    descartar(cached);
  }

  // A guarda de transacao acompanha o client: sem ela, uma escrita aqui dentro
  // de um $transaction do central escapa do rollback em silencio.
  const client = guardTransactions(
    new PrismaClient({ datasources: { db: { url: databaseUrl } } }),
    tenantOwner(idCliente),
  );
  tenantDbCache.set(idCliente, { client, url: databaseUrl, expiraEm: agora + TTL_MS });
  return client;
}

/**
 * Esquece o client em cache, forcando a releitura do registro no proximo
 * `getTenantDb`. Sem argumento, esquece todos. Use apos provisionar ou
 * desativar um tenant quando nao se quer esperar o TTL.
 */
export function invalidateTenantDb(idCliente?: number): void {
  const alvos = idCliente == null ? [...tenantDbCache.keys()] : [idCliente];
  for (const id of alvos) {
    const entrada = tenantDbCache.get(id);
    if (!entrada) continue;
    tenantDbCache.delete(id);
    descartar(entrada);
  }
}

// Config de storage do tenant: a dedicada (se registrada) ou a do .env.
export async function getTenantStorageConfig(idCliente: number): Promise<TenantStorage> {
  const { storage } = resolveTenantDataSource(await readConexao(idCliente));
  if (storage) return storage;

  const base = getSupabaseConfig();
  return { ...base, bucketClientes: process.env.SUPABASE_STORAGE_BUCKET_CLIENTES ?? base.bucket };
}

// Fecha os pools dedicados (shutdown gracioso). O `prisma` padrao tem seu proprio
// ciclo de vida e nao e fechado aqui.
export async function closeTenantDbs(): Promise<void> {
  await Promise.all(
    [...tenantDbCache.values()].map((e) => e.client.$disconnect().catch(() => {})),
  );
  tenantDbCache.clear();
}
