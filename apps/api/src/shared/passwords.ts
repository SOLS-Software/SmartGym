import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

// Tipos de hash registrados em tb_Senhas.cnTipoHash.
export const HASH_TYPE_SHA256 = 1; // legado: SHA-256 sem salt — migrado no login
export const HASH_TYPE_BCRYPT = 2;

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function sha256Legacy(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

// Comparacao em tempo constante para os formatos legados (SHA-256 hex e texto
// puro). O bcrypt.compare ja e timing-safe por construcao.
function safeEquals(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

type StoredPassword = {
  dsSenha: string | null;
  cnTipoHash: number | null;
};

// Verifica a senha contra o registro de tb_Senhas, aceitando os formatos
// legados (SHA-256 e texto puro) uma ultima vez. `needsRehash` sinaliza que o
// registro deve ser regravado com bcrypt apos o login bem-sucedido.
export async function verifyPassword(
  password: string,
  stored: StoredPassword | null,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!stored?.dsSenha || !password) {
    return { valid: false, needsRehash: false };
  }

  if (stored.cnTipoHash === HASH_TYPE_BCRYPT) {
    return { valid: await bcrypt.compare(password, stored.dsSenha), needsRehash: false };
  }

  if (stored.cnTipoHash === HASH_TYPE_SHA256) {
    return { valid: safeEquals(stored.dsSenha, sha256Legacy(password)), needsRehash: true };
  }

  // Legado: senha gravada em texto puro (cnTipoHash nulo). Aceita para nao
  // travar o usuario e regrava com bcrypt no proprio login.
  return { valid: safeEquals(stored.dsSenha, password), needsRehash: true };
}
