import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { normalizeProductPayload } from '../../shared/normalize.js';
import type { ProductPayload } from '../../shared/api-types.js';

export async function registerProductRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/products', async (request) => {
    const search = request.query.search?.trim();
    return prisma.produto.findMany({
      where: search
        ? { dsProduto: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: { dsProduto: 'asc' },
    });
  });

  app.post<{
    Body: ProductPayload;
  }>('/products', async (request, reply) => {
    try {
      const data = normalizeProductPayload(request.body);
      const product = await prisma.produto.create({ data });
      return reply.code(201).send(product);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar produto.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: ProductPayload;
  }>('/products/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const data = normalizeProductPayload(request.body);
      return prisma.produto.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar produto.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/products/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);
      return prisma.produto.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do produto.' });
    }
  });
}
