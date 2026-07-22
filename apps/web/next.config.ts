import type { NextConfig } from 'next';

// Headers de seguranca aplicados a todas as respostas do app web.
// - X-Frame-Options: DENY -> anti-clickjacking (belt-and-suspenders com o
//   frame-ancestors 'none' da CSP); vale tambem para /api e assets, que o
//   middleware nao cobre.
// - nosniff, Referrer-Policy, HSTS -> hardening padrao.
// - Permissions-Policy: camera 'self' e mantida (login facial usa getUserMedia).
// A Content-Security-Policy (script/style/img/connect + frame-ancestors) e
// definida por request no middleware.ts, que precisa do nonce por request para
// a CSP estrita baseada em nonce — algo que headers() estaticos nao conseguem.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@smartgym/shared'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
