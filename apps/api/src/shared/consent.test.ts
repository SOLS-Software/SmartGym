import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertConsent, consentEnforcementEnabled, hasActiveConsent } from './consent.js';

// db falso: devolve o "registro mais recente" que o teste programar.
function fakeDb(maisRecente: { boConcedido: boolean } | null) {
  return {
    consentimento: {
      findFirst: vi.fn().mockResolvedValue(maisRecente),
    },
  };
}

afterEach(() => {
  delete process.env.CONSENT_ENFORCEMENT;
});

describe('consentEnforcementEnabled', () => {
  it('liga por padrao (decisao de negocio: bloquear)', () => {
    delete process.env.CONSENT_ENFORCEMENT;
    expect(consentEnforcementEnabled()).toBe(true);
  });
  it('desliga so com o kill-switch explicito', () => {
    process.env.CONSENT_ENFORCEMENT = 'false';
    expect(consentEnforcementEnabled()).toBe(false);
    process.env.CONSENT_ENFORCEMENT = 'true';
    expect(consentEnforcementEnabled()).toBe(true);
  });
});

describe('hasActiveConsent', () => {
  it('true quando o registro mais recente concede', async () => {
    expect(await hasActiveConsent(fakeDb({ boConcedido: true }), 1, 'biometria_facial')).toBe(true);
  });
  it('false quando o mais recente revoga', async () => {
    expect(await hasActiveConsent(fakeDb({ boConcedido: false }), 1, 'push')).toBe(false);
  });
  it('false quando nunca houve consentimento', async () => {
    expect(await hasActiveConsent(fakeDb(null), 1, 'push')).toBe(false);
  });
});

describe('assertConsent', () => {
  it('lanca sem consentimento vigente quando o gate esta ligado', async () => {
    await expect(assertConsent(fakeDb(null), 1, 'biometria_facial', 'negado')).rejects.toThrow('negado');
  });
  it('passa quando ha consentimento vigente', async () => {
    await expect(assertConsent(fakeDb({ boConcedido: true }), 1, 'biometria_facial', 'negado')).resolves.toBeUndefined();
  });
  it('e no-op quando o kill-switch desliga o gate', async () => {
    process.env.CONSENT_ENFORCEMENT = 'false';
    const db = fakeDb(null);
    await expect(assertConsent(db, 1, 'biometria_facial', 'negado')).resolves.toBeUndefined();
    // Nem consulta o banco quando o gate esta desligado.
    expect(db.consentimento.findFirst).not.toHaveBeenCalled();
  });
});
