import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';

const limitQuerySchema = z.object({
  limit: z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? undefined : value),
    z.coerce.number().int().optional(),
  ),
});

function parseTake(query: unknown): number | null {
  const parsed = limitQuerySchema.safeParse(query ?? {});
  if (!parsed.success) return null;
  return Math.min(Math.max(parsed.data.limit ?? 1000, 1), 1000);
}

export async function registerLookupRoutes(app: FastifyInstance) {
  app.get('/themes', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.tema.findMany({
      take,
      where: {
        boInativo: false,
      },
      orderBy: {
        dsTema: 'asc',
      },
    });
  });

  app.get('/promotion-plans', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.promocaoPlano.findMany({
      take,
      where: {
        boInativo: false,
        OR: [{ idEmpresa: null }, { empresa: { idCliente } }],
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

  app.get('/points', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.pontuacao.findMany({
      take,
      where: {
        boInativo: false,
        empresa: { idCliente },
      },
      orderBy: {
        dsPontuacao: 'asc',
      },
    });
  });

  app.get('/student-training-sequences', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.alunoTreinoSequencia.findMany({
      take,
      where: {
        boInativo: false,
        alunoTreino: { aluno: { idCliente } },
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  });

}
