import type { NextConfig } from 'next';

// Headers de seguranca aplicados a todas as respostas do app web.
// - frame-ancestors 'none' + X-Frame-Options: DENY -> impede clickjacking das
//   telas de login/gestor.
// - nosniff, Referrer-Policy, HSTS -> hardening padrao.
// - Permissions-Policy: camera 'self' e mantida (login facial usa getUserMedia).
// Obs.: uma CSP completa de script-src/style-src exige testar hidratacao do
// Next + Google Fonts + Supabase e fica como proximo passo; aqui fixamos o
// frame-ancestors, que e o vetor concreto de clickjacking.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
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
