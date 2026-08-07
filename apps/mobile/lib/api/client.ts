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
//
// Com a trava biométrica ligada o token é gravado com `requireAuthentication`,
// e aí quem barra a leitura é o proprio Keychain/Keystore: o sistema se recusa
// a devolver o valor sem biometria valida. Isso e o que separa trava de
// teatro — chamar authenticateAsync() e depois ler um token desprotegido nao
// protege nada, porque o arquivo continua legivel em aparelho com root.
//
// O cache em memoria e o que faz a trava valer "so apos inatividade": a
// biometria e pedida na PRIMEIRA leitura; as seguintes saem da memoria sem
// prompt. Quem zera o cache e `bloquearSessao()`, chamado pelo contador de
// inatividade — ver lib/auth/travaSessao.ts.

const TOKEN_KEY = 'smartgym_token';
const PROTEGIDO_KEY = 'smartgym_token_protegido';

let _cachedToken: string | null | undefined;
let _protegido: boolean | undefined;

/** Lê (uma vez) se o token gravado exige autenticação do sistema para ser lido. */
async function tokenEstaProtegido(): Promise<boolean> {
  if (_protegido !== undefined) return _protegido;
  try {
    _protegido = (await SecureStore.getItemAsync(PROTEGIDO_KEY)) === '1';
  } catch {
    _protegido = false;
  }
  return _protegido;
}

/** Erro de leitura do SecureStore protegido: biometria cancelada ou chave invalidada. */
export class SessaoBloqueadaError extends Error {
  constructor(readonly causa: 'cancelado' | 'chave-invalidada') {
    super(causa === 'chave-invalidada' ? 'Credencial invalidada.' : 'Autenticação cancelada.');
    this.name = 'SessaoBloqueadaError';
  }
}

/**
 * Token para uso nas requisições. NUNCA dispara biometria: se a sessão está
 * trancada, devolve null.
 *
 * Isso é deliberado. Se a leitura protegida pudesse acontecer aqui, qualquer
 * requisição de tela — inclusive o /auth/verify do boot — abriria o prompt do
 * sistema num momento arbitrário, e a trava valeria para toda abertura do app
 * em vez de só depois da inatividade. O prompt fica concentrado em
 * `desbloquearToken()`, chamado pelo botão da tela de bloqueio.
 */
export async function getAuthToken(): Promise<string | null> {
  if (_cachedToken !== undefined) return _cachedToken;

  if (await tokenEstaProtegido()) return null;

  try {
    _cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    _cachedToken = null;
  }
  return _cachedToken;
}

/** Há token guardado sob proteção, ainda não aberto nesta sessão de memória. */
export async function sessaoTrancada(): Promise<boolean> {
  if (_cachedToken !== undefined) return false;
  return tokenEstaProtegido();
}

/**
 * Lê o token protegido, disparando a autenticação do sistema. Único ponto do
 * app que abre o prompt.
 */
export async function desbloquearToken(): Promise<string | null> {
  if (_cachedToken !== undefined) return _cachedToken;

  if (!(await tokenEstaProtegido())) return getAuthToken();

  try {
    _cachedToken = await SecureStore.getItemAsync(TOKEN_KEY, { requireAuthentication: true });
  } catch (erro) {
    // A falha aqui é informação, não "sem token": pode ser biometria cancelada
    // (dá para tentar de novo) ou chave invalidada pelo sistema — o usuário
    // cadastrou digital nova e o Keystore descarta a chave de propósito, aí só
    // resta refazer o login por senha.
    const mensagem = String((erro as Error)?.message ?? '').toLowerCase();
    const invalidada = mensagem.includes('invalidat') || mensagem.includes('key not found');
    throw new SessaoBloqueadaError(invalidada ? 'chave-invalidada' : 'cancelado');
  }
  return _cachedToken;
}

export async function setAuthToken(
  token: string | null,
  opcoes?: { protegido?: boolean },
): Promise<void> {
  const protegido = opcoes?.protegido ?? false;
  _cachedToken = token;
  _protegido = protegido;
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token, {
        requireAuthentication: protegido,
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await SecureStore.setItemAsync(PROTEGIDO_KEY, protegido ? '1' : '0');
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(PROTEGIDO_KEY);
    }
  } catch {
    // SecureStore indisponível: mantém o token só em memória nesta execução.
  }
}

/**
 * Descarta o token da MEMÓRIA, preservando o que está gravado. A próxima
 * chamada a getAuthToken() volta ao SecureStore e, se houver proteção, dispara
 * a biometria. É assim que a trava por inatividade funciona sem deslogar.
 */
export function bloquearSessao(): void {
  _cachedToken = undefined;
}

/** Se a trava biométrica está ligada para o token guardado. */
export async function travaBiometricaAtiva(): Promise<boolean> {
  return tokenEstaProtegido();
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
