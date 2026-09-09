import { beforeAll, describe, expect, it } from 'vitest';
import { requiredPermission } from './permissions.js';
import { isStudentAllowed } from './studentRbac.js';
import { PUBLIC_ROUTES, PUBLIC_ROUTE_PATTERNS } from './auth.js';

// Teste de cobertura de autorizacao (achado M-2 da auditoria). Instancia o app
// REAL e afirma que TODA rota registrada esta coberta por uma regra intencional:
// publica (allowlist), alcancavel pelo aluno (studentRbac) ou mapeada a uma
// permissao de funcionario (ROUTE_RULES). "Nenhuma regra casou" (unmapped) e
// deny na pratica, mas por acidente — e o que este teste impede de nascer: uma
// rota nova sob um prefixo existente herda a permissao do prefixo em silencio,
// e uma rota fora de qualquer prefixo fica inalcancavel sem ninguem perceber.
//
// Pega o app real (nao uma lista curada) para enxergar rotas novas
// automaticamente — a lista curada teria o mesmo ponto cego que o teste combate.

function setFakeEnv() {
  // O app valida env no boot e registra o jwt (exige JWT_SECRET >= 32). Valores
  // de fachada: o teste so registra rotas e le a arvore, nunca conecta a nada.
  process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
  process.env.API_PORT ??= '3333';
  process.env.SUPABASE_URL ??= 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'fake-service-role-key';
  process.env.JWT_SECRET ??= 'x'.repeat(48);
  process.env.PII_ENCRYPTION_KEY ??= 'y'.repeat(48);
}

type Route = { method: string; url: string };

// Reconstroi a lista (method, path) a partir da arvore textual do printRoutes.
// A arvore indenta 4 caracteres por nivel e agrupa por prefixo comum, entao o
// caminho de um no e a concatenacao dos segmentos dos ancestrais.
function flattenRoutes(tree: string): Route[] {
  const out: Route[] = [];
  const stack: Record<number, string> = {};
  for (const raw of tree.split('\n')) {
    if (!raw.trim()) continue;
    const m = raw.match(/^([\s│├└─]*)(\S.*?)(?:\s+\(([A-Z, ]+)\))?$/);
    if (!m) continue;
    const prefix = m[1] ?? '';
    const segment = m[2] ?? '';
    const methods = m[3];
    const depth = Math.floor(prefix.length / 4);
    const parent = depth > 0 ? (stack[depth - 1] ?? '') : '';
    const full = parent + segment;
    stack[depth] = full;
    for (const key of Object.keys(stack)) {
      if (Number(key) > depth) delete stack[Number(key)];
    }
    if (methods) {
      for (const method of methods.split(',').map((s) => s.trim())) {
        if (method === 'HEAD' || method === 'OPTIONS') continue;
        out.push({ method, url: full });
      }
    }
  }
  return out;
}

// Substitui os parametros de rota por um valor concreto para casar as regras,
// que enxergam a URL real e nao o padrao do Fastify. Token do webhook precisa
// ter >= 16 chars do alfabeto certo; os demais viram um id numerico.
function toConcretePath(url: string): string {
  return url.replace(/:token/g, 'a'.repeat(24)).replace(/:[A-Za-z][A-Za-z0-9]*/g, '7');
}

describe('cobertura de autorizacao (permissao x rota)', () => {
  let routes: Route[];

  beforeAll(async () => {
    setFakeEnv();
    const mod = await import('../app.js');
    await mod.app.ready();
    routes = flattenRoutes(mod.app.printRoutes({ commonPrefix: false }));
  });

  it('extrai um numero plausivel de rotas do app', () => {
    expect(routes.length).toBeGreaterThan(200);
  });

  it('nenhuma rota registrada fica sem regra intencional (unmapped)', () => {
    const unmapped: string[] = [];
    for (const { method, url } of routes) {
      const path = toConcretePath(url);
      if (PUBLIC_ROUTES.has(path) || PUBLIC_ROUTE_PATTERNS.some((re) => re.test(path))) continue;
      // Alcancavel pelo aluno (idAluno=7, o mesmo id dos :params) conta como
      // intencional — e uma decisao explicita em studentRbac.
      if (isStudentAllowed(method, path, 7)) continue;
      if (requiredPermission(method, path).kind === 'unmapped') {
        unmapped.push(`${method} ${url}`);
      }
    }
    expect(unmapped).toEqual([]);
  });
});
