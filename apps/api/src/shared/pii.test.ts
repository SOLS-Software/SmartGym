import { describe, expect, it } from 'vitest';
import {
  cpfHash,
  decryptCpfValue,
  decryptPii,
  encryptCpfFields,
  encryptEmbedding,
  encryptPii,
  isEncrypted,
  withDecryptedCpf,
} from './pii.js';

// getKeys() e lazy (so roda na 1a chamada de cripto), entao basta a env estar
// setada antes dos testes rodarem — os imports acima nao disparam getKeys.
process.env.PII_ENCRYPTION_KEY = 'chave-de-teste-com-pelo-menos-32-caracteres';

describe('cripto de PII (AES-256-GCM + HMAC)', () => {
  it('round-trip encrypt/decrypt com prefixo enc:v1:', () => {
    const enc = encryptPii('12345678901');
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(decryptPii(enc)).toBe('12345678901');
  });

  it('IV aleatorio: o mesmo texto gera ciphertexts diferentes', () => {
    expect(encryptPii('abc')).not.toBe(encryptPii('abc'));
  });

  it('cpfHash e deterministico e ignora formatacao', () => {
    expect(cpfHash('502.066.408-11')).toBe(cpfHash('50206640811'));
    expect(cpfHash('502.066.408-11')).not.toBe(cpfHash('11144477735'));
    expect(cpfHash('x')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('GCM detecta adulteracao (auth tag corrompida -> lanca)', () => {
    const enc = encryptPii('segredo');
    const buf = Buffer.from(enc.slice('enc:v1:'.length), 'base64');
    const last = buf.length - 1;
    buf.writeUInt8(buf.readUInt8(last) ^ 0xff, last); // corrompe a tag
    const tampered = `enc:v1:${buf.toString('base64')}`;
    expect(() => decryptPii(tampered)).toThrow();
  });

  it('encryptCpfFields: vazio -> sem hash; preenchido -> cifrado + hash', () => {
    expect(encryptCpfFields('')).toEqual({ caCPF: '', caCPFHash: null });
    const fields = encryptCpfFields('502.066.408-11');
    expect(isEncrypted(fields.caCPF)).toBe(true);
    expect(fields.caCPFHash).toBe(cpfHash('50206640811'));
    expect(decryptPii(fields.caCPF)).toBe('50206640811');
  });

  it('decryptCpfValue e tolerante: legado passa; corrompido/vazio -> string vazia', () => {
    expect(decryptCpfValue('50206640811')).toBe('50206640811'); // legado texto puro
    expect(decryptCpfValue('')).toBe('');
    expect(decryptCpfValue(null)).toBe('');
    expect(decryptCpfValue('enc:v1:AAAA')).toBe(''); // cifrado invalido nao derruba a listagem
  });

  it('withDecryptedCpf remove o hash e devolve o CPF legivel', () => {
    const fields = encryptCpfFields('50206640811');
    const row = { id: 1, nome: 'Fulano', caCPF: fields.caCPF, caCPFHash: fields.caCPFHash };
    const out = withDecryptedCpf(row);
    expect(out.caCPF).toBe('50206640811');
    expect('caCPFHash' in out).toBe(false);
    expect(out.nome).toBe('Fulano');
  });

  it('encryptEmbedding: null -> null; valor -> { enc } cifrado e recuperavel', () => {
    expect(encryptEmbedding(null)).toBeNull();
    const embedding = encryptEmbedding([0.1, 0.2, 0.3]);
    expect(embedding).not.toBeNull();
    expect(isEncrypted(embedding!.enc)).toBe(true);
    expect(JSON.parse(decryptPii(embedding!.enc))).toEqual([0.1, 0.2, 0.3]);
  });
});
