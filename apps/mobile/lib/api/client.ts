import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// Resolução da base da API (portado de app/index.tsx:23-40).
// Prioridade: EXPO_PUBLIC_API_URL -> IP da LAN do Metro (dev) -> emulador Android.
function getApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configuredUrl) return configuredUrl;

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3333`;

  return 'http://10.0.2.2:3333';
}

export const apiUrl = getApiUrl();

// --- Token de sessão (JWT) ---------------------------------------------------
// Guardado no SecureStore (Keychain/Keystore), nunca no AsyncStorage.

const TOKEN_KEY = 'smartgym_token';

let _cachedToken: string | null | undefined;

export async function getAuthToken(): Promise<string | null> {
  if (_cachedToken !== undefined) return _cachedToken;
  try {
    _cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    _cachedToken = null;
  }
  return _cachedToken;
}

export async function setAuthToken(token: string | null): Promise<void> {
  _cachedToken = token;
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    // SecureStore indisponível: mantém o token só em memória nesta execução.
  }
}

// fetch com Authorization: Bearer — usar no lugar do fetch global em chamadas à API.
// Nas telas, importe com alias para substituir o fetch do módulo:
//   import { authFetch as fetch } from '../../lib/api/client';
export async function authFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAuthToken();
  if (!token) return fetch(input, init);

  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

// Lê { message } do corpo de erro e lança Error (mesma convenção do web getApiError).
export async function getApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) message = body.message;
  } catch {
    // corpo não-JSON: mantém fallback
  }
  throw new Error(message);
}

type RequestInitLite = { signal?: AbortSignal };

export async function apiGet<T>(path: string, init?: RequestInitLite): Promise<T> {
  const response = await authFetch(`${apiUrl}${path}`, { signal: init?.signal });
  if (!response.ok) {
    await getApiError(response, 'Não foi possível carregar os dados.');
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown, init?: RequestInitLite): Promise<T> {
  const response = await authFetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
  if (!response.ok) {
    await getApiError(response, 'Não foi possível concluir a operação.');
  }
  return (await response.json()) as T;
}
