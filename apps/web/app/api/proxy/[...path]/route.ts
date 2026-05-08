import { type NextRequest, NextResponse } from 'next/server';

const apiUrl = process.env.API_URL ?? 'http://localhost:3333';
const API_PASSPHRASE = 'smartgym-2026-api-payload-key-sols';

let _key: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;
  const raw = new TextEncoder().encode(API_PASSPHRASE);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  _key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt']);
  return _key;
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
  const pathname = path.join('/');
  const search = request.nextUrl.search;
  const targetUrl = `${apiUrl}/${pathname}${search}`;

  const forwardHeaders: HeadersInit = {};
  const contentType = request.headers.get('content-type');
  if (contentType) forwardHeaders['content-type'] = contentType;

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
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
