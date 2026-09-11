import { describe, expect, it } from 'vitest';
import { normalizeDomain } from './tenantResolver.js';

// A resolucao por dominio precede a escolha de conexao no multi-tenancy de dados.
// A consulta ao banco (resolveTenantByDomain) nao e unit-testada aqui (precisa de
// DB); o que garantimos e a normalizacao pura — em especial o contrato "dominio
// vazio/em branco => '' => sem tenant" (o chamador desambigua por senha).

describe('normalizeDomain', () => {
  it('trim + lowercase', () => {
    expect(normalizeDomain('  App.Academia.COM.BR  ')).toBe('app.academia.com.br');
  });

  it('undefined, vazio e so espacos viram "" (sem tenant)', () => {
    expect(normalizeDomain(undefined)).toBe('');
    expect(normalizeDomain('')).toBe('');
    expect(normalizeDomain('   ')).toBe('');
  });

  it('preserva o host ja normalizado', () => {
    expect(normalizeDomain('academia.smartgym.com.br')).toBe('academia.smartgym.com.br');
  });
});
