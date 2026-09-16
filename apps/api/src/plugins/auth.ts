import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../shared/prisma.js';
import { isStudentAllowed } from './studentRbac.js';
import { isEmployeeAllowed } from './permissions.js';

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

declare module 'fastify' {
  interface FastifyRequest {
    // Permissoes efetivas do funcionario neste request (vazio para aluno,
    // gestor e super admin, que nao passam pelo RBAC de perfil). Preenchido
    // pelo hook onRequest para o handler nao precisar reconsultar o perfil.
    employeePermissions?: ReadonlySet<string>;
  }
}

// Rotas alcancaveis sem token (match exato do pathname, sem query string).
// Nunca usar startsWith aqui: '/auth/login-x' nao pode herdar a isencao.
// Exportado para o teste de cobertura de rotas usar a MESMA fonte de verdade.
export const PUBLIC_ROUTES = new Set([
  '/health',
  '/auth/login',
  '/auth/gestor-login',
  '/auth/register',
  '/auth/register-lookup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/theme',
  // Formulario de interesse do site: quem o preenche por definicao ainda nao
  // tem conta. E a unica rota de NEGOCIO sem token, e por isso a mais
  // defendida do modulo — rate limit proprio e tenant resolvido pelo dominio,
  // nunca pelo corpo da requisicao. Ver modules/leads/routes.ts.
  '/public/leads',
  // Endpoints consumidos pelas catracas Control iD — os devices nao enviam
  // JWT; a validacao deles e feita por device (serial/IP) no proprio modulo.
  // A rota de gestao /controlid/catracas continua protegida.
  '/controlid',
  '/controlid/push',
  '/controlid/push/push',
  // Retorno do comando de push (o equipamento posta o resultado em /result).
  '/controlid/result',
  '/controlid/push/result',
  // Modo online: a catraca consulta estes endpoints a cada identificacao, antes
  // de liberar a passagem. Autenticacao e por device (caToken), nao por JWT.
  '/controlid/new_user_identified.fcgi',
  '/controlid/new_card.fcgi',
  '/controlid/new_rex_log.fcgi',
  // Mesmo endpoint na raiz: `online_client.path` pode estar vazio no equipamento.
  '/new_user_identified.fcgi',
  '/controlid/health',
]);

// Rotas publicas cujo caminho carrega um valor variavel — o Set acima so faz
// match exato e nao serve para elas.
//
// O padrao e FECHADO de proposito (tamanho e alfabeto do token, ancorado nas
// duas pontas): e a mesma disciplina do Set, so que expressa em regex. Um
// `startsWith('/webhooks')` isentaria qualquer sub-rota futura de autenticacao
// sem ninguem perceber.
export const PUBLIC_ROUTE_PATTERNS: RegExp[] = [
  // Webhook de pagamento. A defesa esta no modulo: token na URL, token no
  // header conferido em tempo constante, e confirmacao de volta no provedor.
  /^\/webhooks\/payments\/[A-Za-z0-9_-]{16,64}$/,
  // Endereco por academia das catracas: /d/<chave>[/<endpoint do firmware>].
  // Mesma disciplina do webhook — o padrao lista os sufixos que o equipamento
  // realmente usa, em vez de liberar /d/<chave>/qualquer-coisa. A chave resolve
  // o tenant no control-plane (tb_Clientes.caChaveDispositivo) antes de tocar
  // banco de aplicacao; sem chave valida o modulo responde 404.
  /^\/d\/[a-f0-9]{32,64}(?:\/(?:push(?:\/(?:push|result))?|result|health|new_user_identified\.fcgi|new_card\.fcgi|new_rex_log\.fcgi))?$/,
];

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
    if (PUBLIC_ROUTE_PATTERNS.some((padrao) => padrao.test(pathname))) return;

    try {
      await request.jwtVerify();
    } catch {
      request.auditReason = 'token_invalido';
      return reply.code(401).send({ message: 'Sessao invalida ou expirada.' });
    }

    // Revogacao de sessao + kill-switch de conta: um SELECT indexado por PK a
    // cada request. O token so vale se a conta segue ativa E a versao de sessao
    // do token (tv) bate com a atual. Logout / reset de senha incrementam a
    // versao, derrubando na hora qualquer token vivo (inclusive um vazado).
    // As permissoes do perfil vem NESTE mesmo SELECT, e nao do token, de
    // proposito: um perfil editado (ou um funcionario movido de perfil) passa
    // a valer no request seguinte. Se viajassem no JWT, tirar o acesso de
    // alguem so surtiria efeito no proximo login — ate 30 dias no app.
    const account = await prisma.usuario.findUnique({
      where: { id: request.user.sub },
      select: {
        boInativo: true,
        nrTokenVersion: true,
        funcionario: {
          select: {
            perfilAcesso: {
              select: { boInativo: true, permissoes: { select: { cnPermissao: true } } },
            },
          },
        },
      },
    });
    if (!account || account.boInativo || account.nrTokenVersion !== (request.user.tv ?? 0)) {
      // Distingue, na trilha, o uso de um token ja revogado (logout/reset) ou de
      // conta desativada de um simples token malformado — sinal de sessao vazada.
      request.auditReason = !account
        ? 'conta_inexistente'
        : account.boInativo
          ? 'conta_inativa'
          : 'sessao_revogada';
      return reply.code(401).send({ message: 'Sessao invalida ou expirada.' });
    }

    if (
      request.user.role === 'student' &&
      !isStudentAllowed(request.method, pathname, request.user.idAluno)
    ) {
      return reply.code(403).send({ message: 'Acesso nao autorizado.' });
    }

    // RBAC de funcionario E de gestor. So o super admin (operacao interna SOLS)
    // passa direto — e o unico papel legitimamente cross-tenant e sem perfil.
    //
    // O papel 'gestor' NAO e mais um bypass: antes, qualquer funcionario que
    // passasse pelo /auth/gestor-login recebia role 'gestor' e escapava desta
    // checagem inteira, ganhando acesso total sem depender de perfil nenhum.
    // Agora o gestor responde ao mesmo RBAC do funcionario: o que ele alcanca
    // sao as permissoes do perfil dele, lidas do banco a cada request. Um
    // gerente com o perfil "Gerente" (todas as permissoes) segue vendo tudo; um
    // funcionario comum que entre pela porta do gestor fica preso ao perfil
    // dele. Perfil ausente ou inativo = nenhuma permissao (deny-by-default).
    if (request.user.role !== 'student' && !request.user.superAdmin) {
      const profile = account.funcionario?.perfilAcesso;
      const granted = new Set(
        profile && !profile.boInativo ? profile.permissoes.map((item) => item.cnPermissao) : [],
      );
      request.employeePermissions = granted;

      if (!isEmployeeAllowed(request.method, pathname, granted)) {
        return reply.code(403).send({
          message: 'Seu perfil de acesso nao permite esta acao.',
        });
      }
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

// Guard para MUTACAO de tabelas de dominio GLOBAIS (cargos, frequencias, status
// de pagamento, formas de pagamento, niveis, unidades...). Essas tabelas nao tem
// coluna de tenant: uma linha e a MESMA para todos os clientes. Sem este guard,
// um funcionario de qualquer tenant renomeia/desativa o status "Pendente" e
// quebra a geracao de pagamentos de TODOS os clientes (shared/payments.ts
// resolve o status por nome). Leitura continua liberada a qualquer autenticado.
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user.superAdmin) {
    return reply
      .code(403)
      .send({ message: 'Cadastro global: alteracao restrita ao administrador do sistema.' });
  }
}

// (Removido: `getTenantId(request)` — era codigo morto, 0 usos. Os handlers leem
// `request.user.idCliente` direto e conferem non-null na hora. Se a fase 2 do
// isolamento (RLS/Prisma extension — ver docs/isolamento-tenant-proposta.md)
// introduzir um acesso centralizado ao tenant, ele nasce ali, com uso real.)
