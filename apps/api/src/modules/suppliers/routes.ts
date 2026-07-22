import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, normalizeFornecedorPayload } from '../../shared/normalize.js';
import type { FornecedorPayload } from '../../shared/api-types.js';

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce.number().int().optional(),
  ),
});

export async function registerSupplierRoutes(app: FastifyInstance) {
  // Isolamento de tenant: Fornecedor pertence ao cliente via Empresa.idCliente.
  async function findTenantSupplier(id: number, idCliente: number) {
    return prisma.fornecedor.findFirst({
      where: { id, empresa: { idCliente } },
      select: { id: true },
    });
  }

  // Garante que a empresa informada no payload pertence ao tenant (400 se nao).
  async function assertCompanyInTenant(idEmpresa: number, idCliente: number) {
    const company = await prisma.empresa.findFirst({
      where: { id: idEmpresa, idCliente },
      select: { id: true },
    });
    if (!company) throw new Error('Empresa nao pertence ao cliente.');
  }

  app.get<{
    Querystring: { search?: string };
  }>('/suppliers', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
    const search = parsedQuery.data.search?.trim();
    const take = Math.min(Math.max(parsedQuery.data.limit ?? 1000, 1), 1000);
    return prisma.fornecedor.findMany({
      where: search
        ? { empresa: { idCliente }, dsFornecedor: { contains: search, mode: 'insensitive' } }
        : { empresa: { idCliente } },
      orderBy: { dsFornecedor: 'asc' },
      take,
    });
  });

  app.post<{
    Body: FornecedorPayload;
  }>('/suppliers', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizeFornecedorPayload(request.body);
      if (data.idEmpresa) await assertCompanyInTenant(data.idEmpresa, idCliente);
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Fornecedor invalido.');
      const current = await findTenantSupplier(id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const data = normalizeFornecedorPayload(request.body);
      if (data.idEmpresa) await assertCompanyInTenant(data.idEmpresa, idCliente);
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Fornecedor invalido.');
      const current = await findTenantSupplier(id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const boInativo = toBool(request.body.boInativo);
      return prisma.fornecedor.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do fornecedor.' });
    }
  });
}
