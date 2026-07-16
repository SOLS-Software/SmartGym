import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';

export async function registerLookupRoutes(app: FastifyInstance) {
  app.get('/themes', async () => {
    return prisma.tema.findMany({
      where: {
        boInativo: false,
      },
      orderBy: {
        dsTema: 'asc',
      },
    });
  });

  app.get('/promotion-plans', async () => {
    return prisma.promocaoPlano.findMany({
      where: {
        boInativo: false,
      },
      include: {
        plano: true,
        promocao: true,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  });

  app.get('/points', async () => {
    return prisma.pontuacao.findMany({
      where: {
        boInativo: false,
      },
      orderBy: {
        dsPontuacao: 'asc',
      },
    });
  });

  app.get('/student-training-sequences', async () => {
    return prisma.alunoTreinoSequencia.findMany({
      where: {
        boInativo: false,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  });

}
