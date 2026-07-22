import { type NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL ?? 'http://localhost:3333';
const ENCRYPTED = process.env.NODE_ENV === 'production';
const API_PASSPHRASE = 'smartgym-2026-api-payload-key-sols';

// Cookie HttpOnly com o JWT da API: o browser nunca ve o token — o proxy
// injeta o Authorization ao encaminhar cada requisicao para o backend.
const SESSION_COOKIE = 'smartgym_token';
const SESSION_COOKIE_MAX_AGE = 12 * 60 * 60; // acompanha TOKEN_EXPIRY_WEB da API

// Rotas de login cuja resposta traz o token a ser movido para o cookie.
const LOGIN_PATHS = new Set(['auth/login', 'auth/gestor-login']);

let _key: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;
  const raw = new TextEncoder().encode(API_PASSPHRASE);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  _key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return _key;
}

async function decryptBase64(input: string, urlSafe = false): Promise<string> {
  const key = await getKey();
  const b64 = urlSafe
    ? input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4)
    : input;
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

async function encryptPayload(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handler(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;

  // Resolve o path real da API (sem barra inicial) nos dois modos.
  let apiPath: string;
  let search = '';
  if (ENCRYPTED) {
    const decrypted = await decryptBase64(path.join('/'), true);
    const qIndex = decrypted.indexOf('?');
    apiPath = qIndex !== -1 ? decrypted.slice(0, qIndex) : decrypted;
    search = qIndex !== -1 ? decrypted.slice(qIndex) : '';
  } else {
    apiPath = path.join('/');
    search = request.nextUrl.search;
  }

  // Logout: resolvido no proprio proxy — basta descartar o cookie de sessao.
  if (apiPath === 'auth/logout') {
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response);
    return response;
  }

  const targetUrl = `${BACKEND_URL}/${apiPath}${search}`;

  const forwardHeaders: Record<string, string> = {};

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    forwardHeaders['authorization'] = `Bearer ${sessionToken}`;
  }

  let body: BodyInit | undefined;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const isEncrypted = ENCRYPTED && request.headers.get('x-encrypted') === '1';
    const isEncryptedForm = ENCRYPTED && request.headers.get('x-encrypted-form') === '1';

    if (isEncrypted) {
      const base64 = await request.text();
      const plaintext = await decryptBase64(base64);
      body = plaintext;
      forwardHeaders['content-type'] = 'application/json';
    } else if (isEncryptedForm) {
      const incomingFormData = await request.formData();
      const encryptedPayload = incomingFormData.get('payload');
      const outgoingFormData = new FormData();

      if (typeof encryptedPayload === 'string' && encryptedPayload) {
        const plaintext = await decryptBase64(encryptedPayload);
        const fields = JSON.parse(plaintext) as Record<string, string>;
        for (const [key, value] of Object.entries(fields)) {
          outgoingFormData.append(key, value);
        }
      }

      for (const [key, value] of incomingFormData.entries()) {
        if (key !== 'payload' && typeof value !== 'string') {
          outgoingFormData.append(key, value);
        }
      }

      body = outgoingFormData;
    } else {
      body = await request.arrayBuffer();
      const contentType = request.headers.get('content-type');
      if (contentType) forwardHeaders['content-type'] = contentType;
    }
  } else {
    const contentType = request.headers.get('content-type');
    if (contentType) forwardHeaders['content-type'] = contentType;
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: body !== undefined ? body : undefined,
      signal: AbortSignal.timeout(9000),
    });

    if (response.status === 204 || response.status === 304) {
      return new NextResponse(null, { status: response.status });
    }

    const responseContentType = response.headers.get('content-type') ?? '';

    // Nas rotas de login, move o token da resposta para o cookie HttpOnly:
    // o JS do browser recebe o perfil, mas nunca a credencial.
    let issuedToken: string | null = null;
    let jsonText: string | null = null;

    if (responseContentType.includes('application/json')) {
      jsonText = await response.text();

      if (LOGIN_PATHS.has(apiPath) && response.ok) {
        try {
          const data = JSON.parse(jsonText) as { token?: unknown };
          if (typeof data.token === 'string' && data.token) {
            issuedToken = data.token;
            delete data.token;
            jsonText = JSON.stringify(data);
          }
        } catch {
          // resposta nao-JSON valida: segue sem mexer
        }
      }
    }

    let nextResponse: NextResponse;

    if (jsonText !== null && ENCRYPTED) {
      const encrypted = await encryptPayload(jsonText);
      nextResponse = new NextResponse(encrypted, {
        status: response.status,
        headers: { 'content-type': 'text/plain', 'x-encrypted': '1' },
      });
    } else if (jsonText !== null) {
      nextResponse = new NextResponse(jsonText, {
        status: response.status,
        headers: { 'content-type': responseContentType },
      });
    } else {
      const responseBody = await response.arrayBuffer();
      nextResponse = new NextResponse(responseBody, {
        status: response.status,
        headers: { 'content-type': responseContentType || 'application/octet-stream' },
      });
    }

    if (issuedToken) {
      setSessionCookie(nextResponse, issuedToken);
    }

    return nextResponse;
  } catch (error) {
    console.error('[api/proxy]', error);
    const message = JSON.stringify({ message: 'Erro ao conectar ao servidor.' });
    if (ENCRYPTED) {
      const encrypted = await encryptPayload(message);
      return new NextResponse(encrypted, {
        status: 502,
        headers: { 'content-type': 'text/plain', 'x-encrypted': '1' },
      });
    }
    return new NextResponse(message, {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
