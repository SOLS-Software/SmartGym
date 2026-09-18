import { describe, expect, it } from 'vitest';
import { Prisma } from '@solsfit/db';
import { TABLE_TIERS, tierOf, tenantAppModels } from './tenantTables.js';

// Cobertura de classificacao de tenancy (multi-tenancy de dados). Toda tabela
// precisa ter um NIVEL intencional (provedor / aplicacao / catalogo) — o
// roteamento e as migrations por tenant dependem disso. Se uma tabela nova
// nascer sem classificacao, ou uma classificada for renomeada/removida, este
// teste quebra antes do merge (no espirito do routeCoverage do M-2). A lista de
// models vem do DMMF do Prisma (o schema real), nao de uma lista curada.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dmmf = (Prisma as any).dmmf as { datamodel: { models: { name: string }[] } };
const schemaModels = dmmf.datamodel.models.map((m) => m.name).sort();

describe('classificacao de tenancy — cobertura (multi-tenancy de dados)', () => {
  it('a heuristica ve os models do schema (guarda contra DMMF vazio)', () => {
    expect(schemaModels.length).toBeGreaterThan(50);
  });

  it('TODO model do schema esta classificado', () => {
    const semTier = schemaModels.filter((m) => tierOf(m) === undefined);
    expect(semTier, `Models sem nivel de tenancy (classifique em tenantTables.ts):\n  ${semTier.join('\n  ')}`).toEqual([]);
  });

  it('nao ha classificacao para model que nao existe mais no schema', () => {
    const conjunto = new Set(schemaModels);
    const orfaos = Object.keys(TABLE_TIERS).filter((m) => !conjunto.has(m));
    expect(orfaos, `Classificacoes de models inexistentes (rename/remocao?):\n  ${orfaos.join('\n  ')}`).toEqual([]);
  });

  it('todo nivel e um valor valido', () => {
    for (const [model, tier] of Object.entries(TABLE_TIERS)) {
      expect(['control-plane', 'application', 'catalog'], model).toContain(tier);
    }
  });

  it('o banco de um cliente contem aplicacao + catalogo, nunca control-plane', () => {
    const tenant = new Set(tenantAppModels());
    // Amostra de invariantes: control-plane fora, aplicacao/catalogo dentro.
    expect(tenant.has('Cliente')).toBe(false); // control-plane
    expect(tenant.has('Usuario')).toBe(false); // identidade central
    expect(tenant.has('Aluno')).toBe(true); // aplicacao
    expect(tenant.has('Exercicio')).toBe(true); // catalogo (semeado por tenant)
  });
});
