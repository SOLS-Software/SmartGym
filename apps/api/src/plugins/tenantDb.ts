import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@smartgym/db';
import { prisma } from '../shared/prisma.js';
import { getTenantDb } from '../shared/tenantDataSource.js';

// Banco de DADOS do request, resolvido uma vez por requisicao.
//
// POR QUE UM HOOK, E NAO `await getTenantDb(...)` em cada handler. Sao ~320
// handlers e 533 acessos a migrar. Uma linha extra em cada um multiplica a
// chance de alguem esquecer justamente num, e um handler esquecido nao falha —
// ele le do banco errado em silencio, que e o defeito que este rollout existe
// para fechar. Resolvendo no hook, migrar um modulo vira trocar `prisma.` por
// `request.tenantDb.` nas tabelas de aplicacao, e o que escapa aparece no
// medidor (tenantRolloutCoverage.test.ts).
//
// O QUE NAO PASSA POR AQUI. Tabelas do provedor — Cliente, DominioCorporativo,
// Auditoria e a identidade (Usuario/Senha/RecuperacaoSenha/UsuarioDispositivo)
// — continuam no `prisma` central, sempre. A classificacao e
// shared/tenantTables.ts; o medidor so cobra os niveis application e catalog.
//
// ROTAS PUBLICAS. Sem token nao ha tenant no request, entao `tenantDb` cai no
// central. Quem e publico e mexe em dado de tenant (webhook de pagamento, push
// de catraca, formulario de lead) descobre o cliente por outro caminho —
// dominio, token da conta, serial do equipamento — e deve chamar
// `getTenantDb(idCliente)` explicitamente depois de resolver quem e.

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Client dos dados do tenant deste request. Dedicado quando o cliente tem
     * registro proprio em tb_ClienteConexoes; o pool compartilhado caso
     * contrario. Nunca use para tabela de control-plane.
     *
     * Sempre preenchido: o hook abaixo roda em TODO request, e sem tenant
     * (rota publica) cai no central. Declarado sem `decorateRequest`, como
     * `employeePermissions` em plugins/auth.ts — o fastify 5 nao aceita um
     * decorator de valor nulo com tipo nao-nulavel.
     */
    tenantDb: PrismaClient;
  }
}

export async function registerTenantDbPlugin(app: FastifyInstance) {
  // Precisa vir DEPOIS do plugin de auth: e de `request.user.idCliente` que sai
  // o tenant. Registrado em app.ts logo apos registerAuthPlugin.
  app.addHook('onRequest', async (request) => {
    const idCliente = request.user?.idCliente ?? null;
    request.tenantDb = idCliente ? await getTenantDb(idCliente) : prisma;
  });
}
