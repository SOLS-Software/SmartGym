// Trilha de auditoria (LGPD art. 37/38 e 48). Um hook onResponse global grava,
// em tb_Auditoria, QUEM acessou/alterou dado pessoal, QUANDO e por qual rota —
// so metadados, NUNCA o corpo/query (a trilha nao pode virar mais um deposito
// de PII). O modelo de dados e a semantica append-only estao em
// packages/db/prisma/schema.prisma (model Auditoria).
//
// Modulo com a decisao (shouldAudit) separada da infra pelo mesmo motivo de
// permissions.ts: e regra que merece teste unitario sem banco.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../shared/prisma.js';
import { notifyOnAuditEvent } from '../shared/securityAlerts.js';
import type { AuthTokenPayload } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    // Rotulo de evento de seguranca que o hook de auth (ou um handler) marca
    // para a trilha registrar algo alem do status HTTP — ex.: distinguir um
    // 401 de "sessao revogada" de um 401 de "token ausente".
    auditReason?: string;
  }
}

// Rotas que tocam DADO PESSOAL de titular (leitura OU escrita). Catalogos
// (planos, exercicios, tabelas de dominio) ficam de fora: nao ha titular ali e
// auditar cada abertura de tela inundaria a trilha sem valor de LGPD.
const AUDIT_PII: RegExp[] = [
  /^\/students(\/|$)/, // ficha, arquivos, biometria, avaliacao, plano, pagamentos do aluno
  /^\/employees(\/|$)/, // ficha e documentos de RH
  /^\/leads(\/|$)/, // dados de interessados
  /^\/clients(\/|$)/, // dados cadastrais do cliente
  /^\/companies\/\d+\/(children|reception)(\/|$)/, // pagamentos/checkins/vendas por unidade
  /^\/reports(\/|$)/, // indicadores que agregam PII
  /^\/time-clock(\/|$)/, // ponto dos funcionarios
  /^\/access\/facial(\/|$)/, // reconhecimento facial (biometria, dado sensivel)
  /^\/plan-requests(\/|$)/, // solicitacoes de cancelamento/renovacao
  /^\/notifications(\/|$)/, // avisos direcionados a alunos
  /^\/payments(\/|$)/, // baixa/situacao financeira do aluno
  /^\/payment-accounts(\/|$)/, // conta que recebe o dinheiro (chave Pix/gateway)
  /^\/cashier(\/|$)/, // confirmacao/estorno de recebimento
  /^\/controlid\/(catracas|events|alertas|usuarios-nao-vinculados|cadastro-digital)(\/|$)/, // acesso fisico dos alunos
];

// Rotas de CREDENCIAL: quem tentou entrar / recuperar / trocar senha e evento
// de seguranca por si so, independente do resultado. /auth/me e /auth/verify
// ficam de fora de proposito — sao a propria sessao, altissima frequencia e
// baixo valor (o titular vendo os proprios dados).
const AUDIT_AUTH: RegExp[] = [
  /^\/auth\/(login|gestor-login|register|register-lookup|forgot-password|reset-password|change-password|logout)$/,
  // QUEBRA DE VIDRO: a SOLS entrando no sistema de um cliente. E o evento que
  // mais precisa estar aqui, e escapava: a regra generica so pega 401 e 403,
  // entao a tentativa RECUSADA era registrada e a bem-sucedida, nao —
  // exatamente ao contrario do que interessa numa auditoria de acesso.
  /^\/auth\/acesso-provedor$/,
];

// Decide se a requisicao entra na trilha. Pura e testavel sem banco.
export function shouldAudit(method: string, pathname: string, statusCode: number): boolean {
  if (AUDIT_AUTH.some((re) => re.test(pathname))) return true;
  if (AUDIT_PII.some((re) => re.test(pathname))) return true;
  // Toda tentativa NEGADA por autenticacao/permissao e sinal de seguranca,
  // mesmo fora dos prefixos acima (ex.: um aluno batendo em /employees, ou um
  // token revogado em qualquer rota).
  if (statusCode === 401 || statusCode === 403) return true;
  return false;
}

export function registerAuditPlugin(app: FastifyInstance) {
  app.addHook('onResponse', async (request: FastifyRequest, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (!shouldAudit(request.method, pathname, reply.statusCode)) return;

    // request.user so existe se o jwtVerify rodou e passou (rota autenticada).
    // Em rota publica (ex.: /auth/login anonimo) fica undefined — e o registro
    // sai com ator nulo, que e a informacao correta ("anonimo tentou X").
    const user = (request as FastifyRequest & { user?: AuthTokenPayload }).user;

    // Fire-and-forget: a resposta JA foi enviada (onResponse). A trilha nunca
    // atrasa nem derruba o request; uma falha de escrita vira warning.
    const evento = {
      idUsuario: typeof user?.sub === 'number' ? user.sub : null,
      idCliente: typeof user?.idCliente === 'number' ? user.idCliente : null,
      cnPapel: typeof user?.role === 'string' ? user.role.slice(0, 20) : null,
      cnMetodo: request.method.slice(0, 10),
      dsRota: pathname.slice(0, 255),
      nrStatus: reply.statusCode,
      anIp: (request.ip ?? '').slice(0, 64) || null,
      dsResultado: request.auditReason ? request.auditReason.slice(0, 100) : null,
      // De onde partiu: aplicativo ou navegador.
      //
      // O IP nao respondia isso. O painel fala com a API pela rede interna do
      // Docker, entao TODA acao do navegador chegava com o mesmo endereco — o
      // do container do proxy. Dava para adivinhar a origem pelo formato do IP,
      // o que e frágil, e do lado do painel a informacao era inutil porque todo
      // mundo aparecia igual.
      //
      // Nulo quando nao ha token (tentativa anonima) ou quando a sessao foi
      // aberta antes desta coluna existir. Nulo e "nao da para saber".
      cnOrigem: user?.cli === 'mobile' || user?.cli === 'web' ? user.cli : null,
    };
    void prisma.auditoria
      .create({ data: evento })
      .catch((err) => request.log.warn({ err }, 'Falha ao gravar trilha de auditoria.'));

    // Notificacao ativa (fire-and-forget, nunca lanca): evento critico vira
    // email para o operador. No-op se SECURITY_ALERT_EMAIL nao estiver definido.
    notifyOnAuditEvent(evento, request.log);
  });
}
