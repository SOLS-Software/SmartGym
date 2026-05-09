import { type NextRequest, NextResponse } from 'next/server';

const apiUrl = process.env.API_URL ?? 'http://localhost:3333';
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

function decryptPayload(base64: string): Promise<string> {
  return decryptBase64(base64, false);
}

function decryptPath(base64url: string): Promise<string> {
  return decryptBase64(base64url, true);
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
  const encryptedPath = path.join('/');
  const decrypted = await decryptPath(encryptedPath); // e.g. "trainings?includeInactive=true"
  const qIndex = decrypted.indexOf('?');
  const pathname = qIndex !== -1 ? decrypted.slice(0, qIndex) : decrypted;
  const search = qIndex !== -1 ? decrypted.slice(qIndex) : '';
  const targetUrl = `${apiUrl}/${pathname}${search}`;

  const forwardHeaders: Record<string, string> = {};
  const isEncrypted = request.headers.get('x-encrypted') === '1';
  const isEncryptedForm = request.headers.get('x-encrypted-form') === '1';

  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (isEncrypted) {
      const base64 = await request.text();
      const plaintext = await decryptPayload(base64);
      body = plaintext;
      forwardHeaders['content-type'] = 'application/json';
    } else if (isEncryptedForm) {
      const incomingFormData = await request.formData();
      const encryptedPayload = incomingFormData.get('payload');
      const outgoingFormData = new FormData();

      if (typeof encryptedPayload === 'string' && encryptedPayload) {
        const plaintext = await decryptPayload(encryptedPayload);
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
    });

    const responseContentType = response.headers.get('content-type') ?? '';

    if (responseContentType.includes('application/json')) {
      const text = await response.text();
      const encrypted = await encryptPayload(text);
      return new NextResponse(encrypted, {
        status: response.status,
        headers: {
          'content-type': 'text/plain',
          'x-encrypted': '1',
        },
      });
    }

    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { 'content-type': responseContentType || 'application/octet-stream' },
    });
  } catch (error) {
    console.error('[api/proxy]', error);
    const encrypted = await encryptPayload(JSON.stringify({ message: 'Erro ao conectar ao servidor.' }));
    return new NextResponse(encrypted, {
      status: 502,
      headers: { 'content-type': 'text/plain', 'x-encrypted': '1' },
    });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
