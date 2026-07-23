import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../shared/prisma.js';
import { isStudentAllowed } from './studentRbac.js';

export type AuthRole = 'student' | 'employee' | 'gestor';

export type AuthTokenPayload = {
  sub: number;
  role: AuthRole;
  idAluno: number | null;
  idFuncionario: number | null;
  idCliente: number | null;
  // Operacao interna (SOLS): habilita acoes cross-tenant (ex.: criar clientes).
  superAdmin?: boolean;
  // Versao de sessao (Usuario.nrTokenVersion no momento da emissao). O plugin
  // rejeita o token se nao bater com o valor atual no banco — e assim que
  // logout e redefinicao de senha revogam sessoes vivas.
  tv?: number;
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

// A allowlist e a logica de RBAC do aluno vivem em ./studentRbac.ts (modulo
// puro, sem prisma/jwt) para permitir testes unitarios sem DB.

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

    // Revogacao de sessao + kill-switch de conta: um SELECT indexado por PK a
    // cada request. O token so vale se a conta segue ativa E a versao de sessao
    // do token (tv) bate com a atual. Logout / reset de senha incrementam a
    // versao, derrubando na hora qualquer token vivo (inclusive um vazado).
    const account = await prisma.usuario.findUnique({
      where: { id: request.user.sub },
      select: { boInativo: true, nrTokenVersion: true },
    });
    if (!account || account.boInativo || account.nrTokenVersion !== (request.user.tv ?? 0)) {
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
