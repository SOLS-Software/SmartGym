import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HASH_TYPE_BCRYPT,
  HASH_TYPE_SHA256,
  dummyVerify,
  hashPassword,
  verifyPassword,
} from './passwords.js';

const sha256 = (p: string) => createHash('sha256').update(p).digest('hex');

describe('verifyPassword', () => {
  afterEach(() => {
    delete process.env.LEGACY_PASSWORD_DEADLINE;
  });

  it('aceita bcrypt correto, sem rehash', async () => {
    const stored = { dsSenha: await hashPassword('secret'), cnTipoHash: HASH_TYPE_BCRYPT };
    expect(await verifyPassword('secret', stored)).toEqual({ valid: true, needsRehash: false });
  });

  it('rejeita bcrypt com senha errada', async () => {
    const stored = { dsSenha: await hashPassword('secret'), cnTipoHash: HASH_TYPE_BCRYPT };
    expect(await verifyPassword('errada', stored)).toEqual({ valid: false, needsRehash: false });
  });

  it('aceita SHA-256 legado e sinaliza rehash', async () => {
    const stored = { dsSenha: sha256('secret'), cnTipoHash: HASH_TYPE_SHA256 };
    expect(await verifyPassword('secret', stored)).toEqual({ valid: true, needsRehash: true });
  });

  it('aceita texto puro legado (cnTipoHash nulo) e sinaliza rehash', async () => {
    expect(await verifyPassword('secret', { dsSenha: 'secret', cnTipoHash: null })).toEqual({
      valid: true,
      needsRehash: true,
    });
  });

  it('trata entradas vazias/nulas como invalidas', async () => {
    expect(await verifyPassword('', { dsSenha: 'x', cnTipoHash: HASH_TYPE_BCRYPT })).toEqual({
      valid: false,
      needsRehash: false,
    });
    expect(await verifyPassword('x', null)).toEqual({ valid: false, needsRehash: false });
    expect(await verifyPassword('x', { dsSenha: null, cnTipoHash: HASH_TYPE_BCRYPT })).toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  describe('prazo de senha legada (B3)', () => {
    it('sem prazo definido: legado correto continua valido', async () => {
      const stored = { dsSenha: sha256('secret'), cnTipoHash: HASH_TYPE_SHA256 };
      expect((await verifyPassword('secret', stored)).valid).toBe(true);
    });

    it('prazo no futuro: ainda aceita e migra', async () => {
      process.env.LEGACY_PASSWORD_DEADLINE = '2999-01-01';
      const stored = { dsSenha: sha256('secret'), cnTipoHash: HASH_TYPE_SHA256 };
      expect(await verifyPassword('secret', stored)).toEqual({ valid: true, needsRehash: true });
    });

    it('prazo no passado: recusa legado correto com expired', async () => {
      process.env.LEGACY_PASSWORD_DEADLINE = '2000-01-01';
      const stored = { dsSenha: sha256('secret'), cnTipoHash: HASH_TYPE_SHA256 };
      expect(await verifyPassword('secret', stored)).toEqual({
        valid: false,
        needsRehash: false,
        expired: true,
      });
    });

    it('prazo no passado: texto puro correto tambem expira', async () => {
      process.env.LEGACY_PASSWORD_DEADLINE = '2000-01-01';
      expect(await verifyPassword('secret', { dsSenha: 'secret', cnTipoHash: null })).toEqual({
        valid: false,
        needsRehash: false,
        expired: true,
      });
    });

    it('prazo no passado: senha ERRADA nao vaza expired (sem oraculo de enumeracao)', async () => {
      process.env.LEGACY_PASSWORD_DEADLINE = '2000-01-01';
      const stored = { dsSenha: sha256('secret'), cnTipoHash: HASH_TYPE_SHA256 };
      const result = await verifyPassword('errada', stored);
      expect(result.valid).toBe(false);
      expect(result.expired).toBeUndefined();
    });

    it('prazo no passado: bcrypt NAO e afetado', async () => {
      process.env.LEGACY_PASSWORD_DEADLINE = '2000-01-01';
      const stored = { dsSenha: await hashPassword('secret'), cnTipoHash: HASH_TYPE_BCRYPT };
      expect(await verifyPassword('secret', stored)).toEqual({ valid: true, needsRehash: false });
    });

    it('prazo com valor invalido e ignorado (sem prazo)', async () => {
      process.env.LEGACY_PASSWORD_DEADLINE = 'nao-e-uma-data';
      const stored = { dsSenha: sha256('secret'), cnTipoHash: HASH_TYPE_SHA256 };
      expect((await verifyPassword('secret', stored)).valid).toBe(true);
    });
  });
});

describe('hashPassword', () => {
  it('produz bcrypt verificavel e diferente do texto puro', async () => {
    const hash = await hashPassword('secret');
    expect(hash).not.toBe('secret');
    expect(hash.startsWith('$2')).toBe(true);
    expect(await bcrypt.compare('secret', hash)).toBe(true);
  });
});

describe('dummyVerify', () => {
  it('resolve sem lancar (equalizador de timing)', async () => {
    await expect(dummyVerify('qualquer-senha')).resolves.toBeUndefined();
    await expect(dummyVerify('')).resolves.toBeUndefined();
  });
});
