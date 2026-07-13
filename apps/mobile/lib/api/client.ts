import Constants from 'expo-constants';

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
  const response = await fetch(`${apiUrl}${path}`, { signal: init?.signal });
  if (!response.ok) {
    await getApiError(response, 'Não foi possível carregar os dados.');
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown, init?: RequestInitLite): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
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
