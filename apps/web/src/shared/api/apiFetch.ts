const ENCRYPTED = process.env.NODE_ENV === 'production';
// ATENCAO: isto NAO e um controle de seguranca. A passphrase roda no browser
// (client bundle), entao a chave e publica — qualquer um a extrai e decifra.
// Serve apenas como ofuscacao leve do payload no trafego proxy. A
// confidencialidade real vem do TLS; a autenticacao, do cookie HttpOnly de
// sessao. Nao trate este envelope como criptografia confiavel ponta-a-ponta.
const API_PASSPHRASE = 'smartgym-2026-api-payload-key-sols';

let _key: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;
  const raw = new TextEncoder().encode(API_PASSPHRASE);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  _key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return _key;
}

async function encryptToBase64(plaintext: string, urlSafe = false): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  const b64 = btoa(String.fromCharCode(...combined));
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') : b64;
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

function isFormDataBody(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

async function encryptFormData(formData: FormData) {
  const encryptedFormData = new FormData();
  const fields: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      fields[key] = value;
    } else {
      encryptedFormData.append(key, value);
    }
  }

  encryptedFormData.append('payload', await encryptToBase64(JSON.stringify(fields)));
  return encryptedFormData;
}

/**
 * Traduz falha de TRANSPORTE — quando a requisicao nao chegou a virar resposta.
 *
 * Erro de regra de negocio a API devolve como JSON com `message`, e
 * `getApiError` cuida dele. Aqui e o caso em que nao houve resposta nenhuma, e
 * por isso o mapeamento de erro do servidor (`clientErrorMessage`, na API)
 * nunca chega a rodar: quem produz a mensagem e o navegador.
 *
 * Isso importa porque as telas mostram `error.message` direto ao usuario (mais
 * de duzentos lugares). Sem traducao, quem esta usando o sistema le "Failed to
 * fetch".
 */
function traduzirFalhaDeTransporte(error: unknown): unknown {
  // Cancelamento DELIBERADO. Varias telas abortam a busca anterior ao trocar de
  // registro e conferem `error.name === 'AbortError'` para ignorar em silencio
  // (ver StudentTrainingAssembly e MyTraining). Trocar o tipo aqui quebraria
  // essa checagem e transformaria cada troca de aluno em erro na tela.
  if (error instanceof DOMException && error.name === 'AbortError') {
    return error;
  }

  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new Error('O servidor demorou demais para responder. Tente novamente.');
  }

  // O fetch rejeita com TypeError para TUDO que impede a requisicao de sair ou
  // de voltar: rede fora, DNS, TLS invalido, servidor inacessivel — e tambem
  // bloqueio pela CSP da propria pagina. A mensagem nativa varia por navegador
  // ("Failed to fetch" no Chrome, "NetworkError..." no Firefox, "Load failed"
  // no Safari), esta sempre em ingles e nao diz nada a quem usa o sistema.
  if (error instanceof TypeError) {
    return new Error('Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.');
  }

  return error;
}

/** `fetch` que falha com mensagem legivel em vez do texto cru do navegador. */
async function fetchLegivel(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    throw traduzirFalhaDeTransporte(error);
  }
}

export async function getApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const data = (await response.json()) as { message?: string };
    if (data?.message) message = data.message;
  } catch {
    // ignore, use fallback
  }
  throw new Error(message);
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!ENCRYPTED) {
    return fetchLegivel(input, init);
  }

  // Encrypt the path + query string
  let urlStr = input instanceof URL ? input.toString() : String(input);
  const proxyBase = '/api/proxy/';
  const proxyIndex = urlStr.indexOf(proxyBase);
  if (proxyIndex !== -1) {
    const afterProxy = urlStr.slice(proxyIndex + proxyBase.length);
    const encryptedPath = await encryptToBase64(afterProxy, true);
    urlStr = urlStr.slice(0, proxyIndex + proxyBase.length) + encryptedPath;
    input = urlStr;
  }

  const headers = new Headers(init?.headers);
  let body = init?.body;

  if (isFormDataBody(body)) {
    body = await encryptFormData(body);
    headers.set('x-encrypted-form', '1');
  }

  const shouldEncryptBody = body !== undefined && body !== null && !isFormDataBody(body);

  if (shouldEncryptBody) {
    const bodyText = typeof body === 'string' ? body : new TextDecoder().decode(body as ArrayBuffer);
    const encrypted = await encryptToBase64(bodyText);
    headers.set('content-type', 'text/plain');
    headers.set('x-encrypted', '1');
    body = encrypted;
  }

  const response = await fetchLegivel(input, { ...init, headers, body });

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
