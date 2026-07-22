import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { normalizeFornecedorPayload } from '../../shared/normalize.js';
import type { FornecedorPayload } from '../../shared/api-types.js';

export async function registerSupplierRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/suppliers', async (request) => {
    const search = request.query.search?.trim();
    return prisma.fornecedor.findMany({
      where: search
        ? { dsFornecedor: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: { dsFornecedor: 'asc' },
    });
  });

  app.post<{
    Body: FornecedorPayload;
  }>('/suppliers', async (request, reply) => {
    try {
      const data = normalizeFornecedorPayload(request.body);
      const supplier = await prisma.fornecedor.create({ data });
      return reply.code(201).send(supplier);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar fornecedor.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: FornecedorPayload;
  }>('/suppliers/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const data = normalizeFornecedorPayload(request.body);
      return prisma.fornecedor.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar fornecedor.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/suppliers/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = toBool(request.body.boInativo);
      return prisma.fornecedor.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do fornecedor.' });
    }
  });
}
