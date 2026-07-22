import { type NextRequest, NextResponse } from 'next/server';

// CSP completa (script/style/img/connect...) por request.
//
// Em PRODUCAO usamos CSP estrita baseada em nonce: cada request gera um nonce,
// injetado no header. O Next detecta o nonce no header de CSP e o aplica
// automaticamente a TODAS as suas tags <script> (bootstrap + chunks). Com
// 'strict-dynamic', apenas scripts com o nonce (e os que eles carregam) rodam —
// nada de inline/eval nem allowlist de host. Isso mata XSS por injecao de
// <script>, sem depender de 'unsafe-inline'.
//
// Em DEV mantemos uma politica frouxa ('unsafe-eval'/'unsafe-inline'): o HMR /
// react-refresh do Next usa eval e scripts inline que nao recebem nonce, e uma
// CSP estrita quebraria o dev server.
//
// Origens externas permitidas (levantadas do codigo):
// - style-src fonts.googleapis.com + font-src fonts.gstatic.com: HomePage e
//   GestorPage injetam <link> de Google Fonts conforme o tema do cliente.
// - img-src https:: tiles do Leaflet (OpenStreetMap), marcadores do unpkg.com e
//   URLs assinadas do Supabase (logos/fotos). Imagem e vetor de baixo risco.
// - connect-src 'self': o browser so fala com o proxy same-origin (/api/proxy);
//   nunca com a API/Supabase direto. Em dev, ws/wss para o HMR.
export function middleware(request: NextRequest) {
  const isProd = process.env.NODE_ENV === 'production';

  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'unsafe-eval' 'unsafe-inline'`;

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self'${isProd ? '' : ' ws: wss:'}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('content-security-policy', csp);
  if (isProd) requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Aplica a documentos (paginas). Exclui /api (proxy devolve payload cifrado/
  // binario — CSP nao se aplica), assets do Next e o favicon. O `missing`
  // pula requests de prefetch: a pagina prefetchada e cacheada sem o nonce
  // por-request, o que causaria mismatch.
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
