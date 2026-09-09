import { describe, expect, it } from 'vitest';
import { shouldAudit } from './audit.js';

describe('shouldAudit', () => {
  it('audita acesso a dado pessoal (leitura e escrita)', () => {
    expect(shouldAudit('GET', '/students/491', 200)).toBe(true);
    expect(shouldAudit('PUT', '/students/491', 200)).toBe(true);
    expect(shouldAudit('GET', '/students/491/facial-biometrics', 200)).toBe(true);
    expect(shouldAudit('GET', '/employees/5', 200)).toBe(true);
    expect(shouldAudit('POST', '/access/facial/recognize', 200)).toBe(true);
    expect(shouldAudit('GET', '/reports/overview', 200)).toBe(true);
    expect(shouldAudit('GET', '/payment-accounts', 200)).toBe(true);
    expect(shouldAudit('GET', '/companies/2/children/payments', 200)).toBe(true);
  });

  it('audita eventos de credencial, independente do resultado', () => {
    expect(shouldAudit('POST', '/auth/login', 200)).toBe(true);
    expect(shouldAudit('POST', '/auth/login', 401)).toBe(true);
    expect(shouldAudit('POST', '/auth/gestor-login', 401)).toBe(true);
    expect(shouldAudit('POST', '/auth/reset-password', 400)).toBe(true);
    expect(shouldAudit('POST', '/auth/change-password', 200)).toBe(true);
  });

  it('audita toda tentativa negada (401/403), mesmo em rota neutra', () => {
    expect(shouldAudit('GET', '/plans', 403)).toBe(true);
    expect(shouldAudit('GET', '/exercises', 401)).toBe(true);
  });

  it('NAO audita catalogos e lookups quando o acesso e permitido', () => {
    expect(shouldAudit('GET', '/plans', 200)).toBe(false);
    expect(shouldAudit('GET', '/exercises', 200)).toBe(false);
    expect(shouldAudit('GET', '/frequencies', 200)).toBe(false);
    expect(shouldAudit('GET', '/measurement-units', 200)).toBe(false);
    expect(shouldAudit('GET', '/auth/verify', 200)).toBe(false);
    expect(shouldAudit('GET', '/auth/me', 200)).toBe(false);
    expect(shouldAudit('GET', '/health', 200)).toBe(false);
  });

  it('nao confunde prefixo (ex.: /payment-accounts vs /payments)', () => {
    expect(shouldAudit('GET', '/payments/7', 200)).toBe(true);
    expect(shouldAudit('GET', '/payment-accounts/7', 200)).toBe(true);
    // /plan-requests e auditado; /plans nao (permitido)
    expect(shouldAudit('GET', '/plan-requests', 200)).toBe(true);
  });
});
