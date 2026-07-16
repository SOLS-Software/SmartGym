export const SESSION_KEY = 'smartgym_session';
export const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
export const GESTOR_SESSION_KEY = 'smartgym_gestor_session';

/**
 * Lê o idCliente da sessão do gestor guardada no localStorage
 * (formato: btoa(JSON.stringify({ data: GestorSession, cachedAt }))).
 * Retorna null se não houver sessão de gestor ativa.
 */
export function getGestorClienteId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GESTOR_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(atob(raw)) as { data?: { idCliente?: number } };
    return parsed?.data?.idCliente ?? null;
  } catch {
    return null;
  }
}

export type AuthUserType = 'student' | 'employee';

export type AuthenticatedUser = {
  id: number;
  idAluno: number | null;
  idFuncionario: number | null;
  idCliente?: number | null;
  name: string;
  type: AuthUserType;
};

export type StoredSession = {
  user: AuthenticatedUser;
  activeItem: string;
  cachedAt: number;
};

let _cachedKey: CryptoKey | null = null;

async function getSessionCryptoKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  const passphrase = new TextEncoder().encode(
    'smartgym-2026-secure-session-key-sols-encrypted',
  );
  const keyBytes = await crypto.subtle.digest('SHA-256', passphrase);
  _cachedKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return _cachedKey;
}

export async function encryptSession(session: StoredSession): Promise<string> {
  const key = await getSessionCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSession(stored: string): Promise<StoredSession> {
  const key = await getSessionCryptoKey();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted)) as StoredSession;
}

/**
 * Resolve o idCliente da sessão ativa: prioriza a sessão de gestor (login
 * multi-tenant) e, na ausência dela, lê o idCliente da sessão normal do
 * funcionário (derivado da empresa dele no login). Retorna null se nenhuma
 * sessão tiver cliente identificado.
 */
export async function getSessionClienteId(): Promise<number | null> {
  const gestorClienteId = getGestorClienteId();
  if (gestorClienteId) return gestorClienteId;

  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    const session = await decryptSession(stored);
    return session.user.idCliente ?? null;
  } catch {
    return null;
  }
}

export async function readJsonResponse<T>(response: Response, fallbackMessage: string) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 140);
    throw new Error(
      `${fallbackMessage} Resposta inesperada (${response.status}): ${preview || 'sem conteudo'}`,
    );
  }

  const data = JSON.parse(text) as T;

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as Record<string, unknown>).message === 'string'
        ? (data as Record<string, unknown>).message as string
        : fallbackMessage;
    throw new Error(message);
  }

  return data;
}
