import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';

export async function registerLookupRoutes(app: FastifyInstance) {
  app.get('/themes', async () => {
    return prisma.tema.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsTema: 'asc',
      },
    });
  });

  app.get('/promotion-plans', async () => {
    return prisma.promocaoPlano.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  });

  app.get('/points', async () => {
    return prisma.ponto.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsPontos: 'asc',
      },
    });
  });

  app.get('/student-training-sequences', async () => {
    return prisma.alunoTreinoSequencia.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  });

  app.get('/activities', async () => {
    return prisma.atividade.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsAtividade: 'asc',
      },
    });
  });

  app.get('/promotions', async () => {
    return prisma.promocao.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsPromocao: 'asc',
      },
    });
  });
}
