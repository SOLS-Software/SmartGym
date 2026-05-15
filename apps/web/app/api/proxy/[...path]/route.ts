import { type NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_URL ?? 'http://localhost:3333';
const ENCRYPTED = process.env.NODE_ENV === 'production';
const API_PASSPHRASE = 'smartgym-2026-api-payload-key-sols';

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

type RouteContext = { params: Promise<{ path: string[] }> };

async function handler(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;

  let targetUrl: string;
  if (ENCRYPTED) {
    const encryptedPath = path.join('/');
    const decrypted = await decryptBase64(encryptedPath, true);
    const qIndex = decrypted.indexOf('?');
    const pathname = qIndex !== -1 ? decrypted.slice(0, qIndex) : decrypted;
    const search = qIndex !== -1 ? decrypted.slice(qIndex) : '';
    targetUrl = `${BACKEND_URL}/${pathname}${search}`;
  } else {
    targetUrl = `${BACKEND_URL}/${path.join('/')}${request.nextUrl.search}`;
  }

  const forwardHeaders: Record<string, string> = {};
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

    if (ENCRYPTED && responseContentType.includes('application/json')) {
      const text = await response.text();
      const encrypted = await encryptPayload(text);
      return new NextResponse(encrypted, {
        status: response.status,
        headers: { 'content-type': 'text/plain', 'x-encrypted': '1' },
      });
    }

    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { 'content-type': responseContentType || 'application/octet-stream' },
    });
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
