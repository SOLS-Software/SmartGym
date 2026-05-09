import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';

export async function registerSystemRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'smartgym-api',
    };
  });

  app.get('/members', async () => {
    return prisma.aluno.findMany({
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  });
}
