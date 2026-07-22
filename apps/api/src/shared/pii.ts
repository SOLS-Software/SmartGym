import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// Criptografia de PII at-rest (LGPD): CPF e embedding biometrico.
//
// - Valores criptografados carregam o prefixo `enc:v1:` seguido de
//   base64(iv | ciphertext | authTag) com AES-256-GCM.
// - Lookups exatos usam HMAC-SHA256 do valor normalizado (coluna *Hash) —
//   deterministico para busca/unicidade sem expor o dado.
// - As duas subchaves derivam de PII_ENCRYPTION_KEY via HKDF, entao um vazamento
//   do banco sem a env nao expoe CPFs nem permite correlacao por hash.

const ENC_PREFIX = 'enc:v1:';

let _keys: { enc: Buffer; mac: Buffer } | null = null;

function getKeys() {
  if (_keys) return _keys;
  const master = process.env.PII_ENCRYPTION_KEY;
  if (!master || master.length < 32) {
    throw new Error('PII_ENCRYPTION_KEY deve ser definida com pelo menos 32 caracteres.');
  }
  const salt = 'smartgym-pii-v1';
  _keys = {
    enc: Buffer.from(hkdfSync('sha256', master, salt, 'enc', 32)),
    mac: Buffer.from(hkdfSync('sha256', master, salt, 'mac', 32)),
  };
  return _keys;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

export function encryptPii(plaintext: string): string {
  const { enc } = getKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', enc, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

export function decryptPii(value: string): string {
  const { enc } = getKeys();
  const combined = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', enc, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// HMAC deterministico do CPF normalizado (11 digitos) para busca/unicidade.
export function cpfHash(cpf: string): string {
  const { mac } = getKeys();
  const digits = cpf.replace(/\D/g, '');
  return createHmac('sha256', mac).update(digits).digest('hex');
}

// Par { caCPF criptografado, caCPFHash } pronto para gravar no Prisma.
export function encryptCpfFields(cpf: string): { caCPF: string; caCPFHash: string | null } {
  const digits = cpf.replace(/\D/g, '');
  if (!digits) return { caCPF: '', caCPFHash: null };
  return { caCPF: encryptPii(digits), caCPFHash: cpfHash(digits) };
}

// Descriptografa tolerante: valores legados ainda em texto puro (pre-backfill)
// passam direto; assim leitura funciona antes e depois do backfill.
export function decryptCpfValue(value: string | null | undefined): string {
  if (!value) return '';
  if (!isEncrypted(value)) return value;
  try {
    return decryptPii(value);
  } catch {
    // Chave errada/valor corrompido: nao derruba a listagem inteira.
    return '';
  }
}

// Mapeia um registro (Aluno/Funcionario) devolvendo caCPF legivel e sem o hash.
export function withDecryptedCpf<T extends { caCPF: string | null; caCPFHash?: string | null }>(
  row: T,
): Omit<T, 'caCPFHash'> & { caCPF: string } {
  const { caCPFHash: _hash, ...rest } = row;
  return { ...rest, caCPF: decryptCpfValue(row.caCPF) };
}

export function withDecryptedCpfList<T extends { caCPF: string | null; caCPFHash?: string | null }>(
  rows: T[],
): Array<Omit<T, 'caCPFHash'> & { caCPF: string }> {
  return rows.map(withDecryptedCpf);
}

// Embedding biometrico: criptografa o JSON serializado; a API nunca devolve
// esse campo aos clientes (o matching e feito pelo CompreFace).
export function encryptEmbedding(embedding: unknown): { enc: string } | null {
  if (embedding == null) return null;
  return { enc: encryptPii(JSON.stringify(embedding)) };
}
