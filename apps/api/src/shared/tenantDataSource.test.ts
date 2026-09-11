import { beforeAll, describe, expect, it } from 'vitest';
import { resolveTenantDataSource, type ClienteConexaoRow } from './tenantDataSource.js';
import { encryptSecret } from './secrets.js';

// Multi-tenancy de dados (hibrido/registro). O que importa provar aqui e a
// DECISAO pura: sem registro/override => cai no padrao (.env); com override =>
// devolve o destino decifrado; e credencial corrompida LANCA (nao cai no padrao
// em silencio). O caminho que abre conexao (getTenantDb) nao e exercitado aqui —
// abriria rede; e uma casca fina sobre esta funcao.

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY ??= 'y'.repeat(48);
  process.env.SUPABASE_STORAGE_BUCKET ??= 'bucket-padrao';
});

function baseRow(over: Partial<ClienteConexaoRow> = {}): ClienteConexaoRow {
  return {
    idCliente: 1,
    dsDatabaseUrlEnc: null,
    dsStorageUrlEnc: null,
    dsStorageKeyEnc: null,
    dsStorageBucket: null,
    dsStorageBucketClientes: null,
    boAtivo: true,
    ...over,
  };
}

describe('resolveTenantDataSource — modelo hibrido/registro', () => {
  it('sem registro (null): usa o padrao (databaseUrl e storage nulos)', () => {
    expect(resolveTenantDataSource(null)).toEqual({ databaseUrl: null, storage: null });
  });

  it('registro sem overrides: cai no padrao', () => {
    expect(resolveTenantDataSource(baseRow())).toEqual({ databaseUrl: null, storage: null });
  });

  it('boAtivo=false: ignora o registro e cai no padrao (mesmo com url setada)', () => {
    const row = baseRow({ dsDatabaseUrlEnc: encryptSecret('postgres://x/y'), boAtivo: false });
    expect(resolveTenantDataSource(row)).toEqual({ databaseUrl: null, storage: null });
  });

  it('banco dedicado: decifra a string de conexao', () => {
    const url = 'postgresql://u:p@tenant-db.example:5432/cliente1';
    const out = resolveTenantDataSource(baseRow({ dsDatabaseUrlEnc: encryptSecret(url) }));
    expect(out.databaseUrl).toBe(url);
    expect(out.storage).toBeNull();
  });

  it('storage dedicado: decifra url+key e usa buckets (com fallback ao bucket padrao)', () => {
    const out = resolveTenantDataSource(
      baseRow({
        dsStorageUrlEnc: encryptSecret('https://proj-cliente1.supabase.co'),
        dsStorageKeyEnc: encryptSecret('service-role-key-cliente1'),
        dsStorageBucket: 'arquivos-cliente1',
      }),
    );
    expect(out.storage).toEqual({
      url: 'https://proj-cliente1.supabase.co',
      serviceRoleKey: 'service-role-key-cliente1',
      bucket: 'arquivos-cliente1',
      bucketClientes: 'arquivos-cliente1',
    });
  });

  it('storage sem bucket proprio: herda o bucket padrao do .env', () => {
    const out = resolveTenantDataSource(
      baseRow({
        dsStorageUrlEnc: encryptSecret('https://p.supabase.co'),
        dsStorageKeyEnc: encryptSecret('k'),
      }),
    );
    expect(out.storage?.bucket).toBe('bucket-padrao');
  });

  it('storage so com url (sem key): nao ativa storage dedicado (precisa dos dois)', () => {
    const out = resolveTenantDataSource(baseRow({ dsStorageUrlEnc: encryptSecret('https://p.supabase.co') }));
    expect(out.storage).toBeNull();
  });

  it('credencial corrompida / nao cifrada: LANCA em vez de cair no padrao em silencio', () => {
    const row = baseRow({ dsDatabaseUrlEnc: 'texto-em-claro-nao-cifrado' });
    expect(() => resolveTenantDataSource(row)).toThrow();
  });
});
