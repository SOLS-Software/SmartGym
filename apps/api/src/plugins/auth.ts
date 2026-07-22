import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type AuthRole = 'student' | 'employee' | 'gestor';

export type AuthTokenPayload = {
  sub: number;
  role: AuthRole;
  idAluno: number | null;
  idFuncionario: number | null;
  idCliente: number | null;
  // Operacao interna (SOLS): habilita acoes cross-tenant (ex.: criar clientes).
  superAdmin?: boolean;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

// Rotas alcancaveis sem token (match exato do pathname, sem query string).
// Nunca usar startsWith aqui: '/auth/login-x' nao pode herdar a isencao.
const PUBLIC_ROUTES = new Set([
  '/health',
  '/auth/login',
  '/auth/gestor-login',
  '/auth/register',
  '/auth/register-lookup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/theme',
  // Endpoints consumidos pelas catracas Control iD — os devices nao enviam
  // JWT; a validacao deles e feita por device (serial/IP) no proprio modulo.
  // A rota de gestao /controlid/catracas continua protegida.
  '/controlid',
  '/controlid/push',
  '/controlid/push/push',
  '/controlid/health',
]);

// Tokens de sessao: 12h para web (o cookie do proxy acompanha) e 30d para o
// app mobile (guardado no SecureStore do dispositivo).
export const TOKEN_EXPIRY_WEB = '12h';
export const TOKEN_EXPIRY_MOBILE = '30d';

// Catalogos que o aluno pode ler (GET) — superficie usada pelo app do aluno
// (mobile + telas de aluno no web). Tudo fora daqui e negado para alunos.
// Allowlist EXPLICITA de leituras (GET) do app do aluno. Sao padroes de rota
// EXATOS — nunca prefixo cru. Um prefixo (startsWith) concede, por construcao,
// qualquer sub-recurso de gestao presente ou futuro sob ele (ex.: listas de
// inscritos/professores de uma aula), o que vazaria PII de outros alunos.
// Cada entrada abaixo e um endpoint de catalogo realmente consumido pelo app
// do aluno; nada de listagens de terceiros.
const STUDENT_GET_ALLOW: RegExp[] = [
  /^\/activities$/,
  /^\/activities\/\d+$/,
  /^\/exercises$/,
  /^\/plans$/,
  /^\/promotions$/,
  /^\/trainings$/,
  /^\/trainings\/\d+\/related\/exercises$/,
  /^\/clients\/\d+$/,
  /^\/clients\/\d+\/theme$/,
];

// RBAC v1 para o papel aluno: deny-by-default.
// - Leituras de catalogo (allowlist acima).
// - Recursos proprios em /students/:id — somente o proprio idAluno, com
//   mutacoes restritas a matricula em aula e edicao do proprio cadastro.
function isStudentAllowed(method: string, pathname: string, idAluno: number | null): boolean {
  if (pathname === '/auth/verify') return true;

  const studentMatch = pathname.match(/^\/students\/(\d+)(\/|$)/);
  if (studentMatch) {
    if (!idAluno || Number(studentMatch[1]) !== idAluno) return false;
    if (method === 'GET') return true;
    return (
      (method === 'POST' && /^\/students\/\d+\/activity-schedules\/enroll$/.test(pathname)) ||
      (method === 'PUT' && /^\/students\/\d+$/.test(pathname))
    );
  }

  if (method === 'GET') {
    return STUDENT_GET_ALLOW.some((re) => re.test(pathname));
  }

  return false;
}

export async function registerAuthPlugin(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET deve ser definido com pelo menos 32 caracteres.');
  }

  await app.register(jwt, { secret });

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (PUBLIC_ROUTES.has(pathname)) return;

    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ message: 'Sessao invalida ou expirada.' });
    }

    if (
      request.user.role === 'student' &&
      !isStudentAllowed(request.method, pathname, request.user.idAluno)
    ) {
      return reply.code(403).send({ message: 'Acesso nao autorizado.' });
    }
  });
}

// Guard de RBAC para rotas de gestao: bloqueia alunos. Usar como preHandler.
export async function requireEmployee(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role === 'student') {
    return reply.code(403).send({ message: 'Acesso restrito a funcionarios.' });
  }
}

// Guard para rotas exclusivas do gestor (login multi-tenant).
export async function requireGestor(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== 'gestor') {
    return reply.code(403).send({ message: 'Acesso restrito ao gestor.' });
  }
}

// Tenant do usuario autenticado. Funcionario/gestor derivam de Empresa.idCliente
// e aluno de Aluno.idCliente (ambos populados no login). Rotas de gestao devem
// exigir non-null.
export function getTenantId(request: FastifyRequest): number | null {
  return request.user.idCliente ?? null;
}
