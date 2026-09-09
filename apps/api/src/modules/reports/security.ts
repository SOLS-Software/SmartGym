// Detecção de segurança sobre a trilha de auditoria (fecha a pendência do A-4:
// "alerta de força bruta, de uso de token revogado, de webhook recusado").
//
// É detecção CONSULTÁVEL, não notificação ativa: um operador da plataforma
// (super-admin/SOLS) abre e vê o que está acontecendo. Notificar por email/push
// em tempo real é o passo seguinte — mas sem esta consulta não havia como nem
// olhar. Restrito ao super-admin de propósito: a segurança da plataforma é
// responsabilidade do operador (SOLS), e os sinais de login (anônimos) não têm
// tenant para escopar a um gestor.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';

const querySchema = z.object({
  horas: z.coerce.number().int().min(1).max(720).optional(),
  // Quantas falhas de login de um mesmo IP ja acendem o alerta de brute force.
  minTentativas: z.coerce.number().int().min(2).max(1000).optional(),
});

const ROTAS_LOGIN = ['/auth/login', '/auth/gestor-login'];
// Rotulos que o hook de auth grava quando um token nao vale mais (ver
// plugins/auth.ts): uso de sessao revogada/conta morta e sinal de token vazado.
const RESULTADOS_SESSAO = ['sessao_revogada', 'conta_inativa', 'conta_inexistente'];

export function registerSecuritySignalRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { horas?: string; minTentativas?: string } }>(
    '/reports/security-signals',
    async (request, reply) => {
      // Operacao da plataforma: so o super-admin. Um gestor com reports.read NAO
      // ve isto — os sinais sao globais e cruzam tenants por natureza.
      if (!request.user.superAdmin) {
        return reply.code(403).send({ message: 'Restrito ao administrador do sistema.' });
      }

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

      const horas = parsed.data.horas ?? 24;
      const minTentativas = parsed.data.minTentativas ?? 5;
      const desde = new Date(Date.now() - horas * 60 * 60 * 1000);

      try {
        const [falhasLoginPorIp, sessoesRevogadas, negadosPorUsuario, webhooksRecusados] =
          await Promise.all([
            // Brute force: falhas de login (401) agrupadas por IP.
            prisma.auditoria.groupBy({
              by: ['anIp'],
              where: {
                dtEvento: { gte: desde },
                cnMetodo: 'POST',
                nrStatus: 401,
                dsRota: { in: ROTAS_LOGIN },
              },
              _count: { _all: true },
            }),
            // Uso de token/sessao ja revogada — candidato a credencial vazada.
            prisma.auditoria.findMany({
              where: { dtEvento: { gte: desde }, dsResultado: { in: RESULTADOS_SESSAO } },
              select: {
                dtEvento: true,
                idUsuario: true,
                idCliente: true,
                anIp: true,
                dsRota: true,
                dsResultado: true,
              },
              orderBy: { dtEvento: 'desc' },
              take: 50,
            }),
            // Acessos negados por permissao (403) agrupados por usuario.
            prisma.auditoria.groupBy({
              by: ['idUsuario', 'idCliente'],
              where: { dtEvento: { gte: desde }, nrStatus: 403 },
              _count: { _all: true },
            }),
            // Webhooks de pagamento recusados (token de header/URL invalido).
            prisma.auditoria.findMany({
              where: {
                dtEvento: { gte: desde },
                dsRota: { startsWith: '/webhooks' },
                nrStatus: { in: [401, 404] },
              },
              select: { dtEvento: true, anIp: true, dsRota: true, nrStatus: true },
              orderBy: { dtEvento: 'desc' },
              take: 50,
            }),
          ]);

        const bruteForce = falhasLoginPorIp
          .map((linha) => ({ ip: linha.anIp, tentativas: linha._count._all }))
          .filter((linha) => linha.tentativas >= minTentativas)
          .sort((a, b) => b.tentativas - a.tentativas);

        const acessosNegados = negadosPorUsuario
          .map((linha) => ({
            idUsuario: linha.idUsuario,
            idCliente: linha.idCliente,
            negacoes: linha._count._all,
          }))
          .sort((a, b) => b.negacoes - a.negacoes)
          .slice(0, 50);

        return {
          janela: { horas, desde: desde.toISOString(), minTentativas },
          bruteForce,
          sessoesRevogadas,
          acessosNegados,
          webhooksRecusados,
          resumo: {
            ipsEmBruteForce: bruteForce.length,
            sessoesRevogadasUsadas: sessoesRevogadas.length,
            usuariosComNegacao: acessosNegados.length,
            webhooksRecusados: webhooksRecusados.length,
          },
        };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: 'Erro ao consultar sinais de seguranca.' });
      }
    },
  );
}
