const API_PASSPHRASE = 'smartgym-2026-api-payload-key-sols';

let _key: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;
  const raw = new TextEncoder().encode(API_PASSPHRASE);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  _key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['decrypt']);
  return _key;
}

async function decryptPayload(base64: string): Promise<string> {
  const key = await getKey();
  const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export const apiUrl = '/api/proxy';

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (response.headers.get('x-encrypted') !== '1') {
    return response;
  }

  try {
    const base64 = await response.text();
    const plaintext = await decryptPayload(base64);
    return new Response(plaintext, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ message: 'Erro ao processar resposta.' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
