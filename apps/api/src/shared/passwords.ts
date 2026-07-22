import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

// Tipos de hash registrados em tb_Senhas.cnTipoHash.
export const HASH_TYPE_SHA256 = 1; // legado: SHA-256 sem salt — migrado no login
export const HASH_TYPE_BCRYPT = 2;

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Hash descartavel (senha aleatoria) usado apenas para equalizar o tempo de
// resposta do login quando o usuario NAO existe: sem isso, uma conta
// inexistente responde mais rapido (sem bcrypt) que uma senha errada de conta
// existente, criando um oraculo de enumeracao por timing. Computado uma vez.
const DUMMY_HASH = bcrypt.hashSync('smartgym-timing-equalizer', BCRYPT_ROUNDS);

export async function dummyVerify(password: string): Promise<void> {
  try {
    await bcrypt.compare(password || 'x', DUMMY_HASH);
  } catch {
    /* noop — so consome tempo comparavel ao caminho valido */
  }
}

function sha256Legacy(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

// Prazo de aposentadoria dos formatos legados (texto puro e SHA-256 sem salt).
// Definido em LEGACY_PASSWORD_DEADLINE (data ISO, ex.: "2026-12-31"). Passada a
// data, uma senha legada CORRETA e recusada no login: o usuario precisa
// redefinir via "Esqueci minha senha" para gerar um hash bcrypt. Sem a variavel
// (ou com valor invalido) nao ha prazo — o rehash progressivo no login segue
// sendo o unico mecanismo de migracao. Isto forca a migracao de contas dormentes
// que, de outra forma, manteriam o formato fraco indefinidamente.
function legacyDeadlinePassed(): boolean {
  const raw = process.env.LEGACY_PASSWORD_DEADLINE;
  if (!raw) return false;
  const deadline = new Date(raw);
  if (Number.isNaN(deadline.getTime())) return false;
  return new Date() > deadline;
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
// registro deve ser regravado com bcrypt apos o login bem-sucedido. `expired`
// sinaliza que a senha bateu, mas o formato legado ja passou do prazo
// (LEGACY_PASSWORD_DEADLINE) — o caller deve recusar e mandar redefinir.
export async function verifyPassword(
  password: string,
  stored: StoredPassword | null,
): Promise<{ valid: boolean; needsRehash: boolean; expired?: boolean }> {
  if (!stored?.dsSenha || !password) {
    return { valid: false, needsRehash: false };
  }

  if (stored.cnTipoHash === HASH_TYPE_BCRYPT) {
    return { valid: await bcrypt.compare(password, stored.dsSenha), needsRehash: false };
  }

  // Formatos legados: SHA-256 sem salt ou texto puro (cnTipoHash nulo). Aceitos
  // uma ultima vez e regravados com bcrypt no login — salvo se o prazo expirou,
  // caso em que a senha correta e recusada (expired) para forcar a redefinicao.
  const matched =
    stored.cnTipoHash === HASH_TYPE_SHA256
      ? safeEquals(stored.dsSenha, sha256Legacy(password))
      : safeEquals(stored.dsSenha, password);

  if (matched && legacyDeadlinePassed()) {
    return { valid: false, needsRehash: false, expired: true };
  }

  return { valid: matched, needsRehash: matched };
}
