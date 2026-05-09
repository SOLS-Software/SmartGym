import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { normalizeEmployeePayload } from '../../shared/normalize.js';
import type { EmployeePayload } from '../../shared/api-types.js';

export async function registerEmployeeRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/employees', async (request) => {
    const search = request.query.search?.trim();
    return prisma.funcionario.findMany({
      where: search
        ? {
            OR: [
              { nmFuncionario: { contains: search, mode: 'insensitive' } },
              { caCPF: { contains: search.replace(/\D/g, '') } },
              { anEmail: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { nmFuncionario: 'asc' },
    });
  });

  app.post<{
    Body: EmployeePayload;
  }>('/employees', async (request, reply) => {
    try {
      const data = normalizeEmployeePayload(request.body);
      const employee = await prisma.funcionario.create({
        data: data as unknown as Parameters<typeof prisma.funcionario.create>[0]['data'],
      });
      return reply.code(201).send(employee);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar funcionario.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: EmployeePayload;
  }>('/employees/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const data = normalizeEmployeePayload(request.body);
      return prisma.funcionario.update({
        where: { id },
        data: data as unknown as Parameters<typeof prisma.funcionario.update>[0]['data'],
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar funcionario.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/employees/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);
      return prisma.funcionario.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do funcionario.' });
    }
  });
}
