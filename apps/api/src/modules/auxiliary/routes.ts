import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';

type RolePayload = {
  dsCargo?: string;
  boInativo?: number;
};

type SportPayload = {
  idEmpresa?: number | null;
  dsEsporte?: string;
  boInativo?: number;
};

type CategoryPayload = {
  idEmpresa?: number | null;
  idEsporte?: number | null;
  dsCategoria?: string;
  boInativo?: number;
};

function nullableNumber(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return null;
  return Number(value);
}

export async function registerAuxiliaryRoutes(app: FastifyInstance) {
  app.get('/roles', async () => {
    return prisma.cargo.findMany({
      orderBy: {
        dsCargo: 'asc',
      },
    });
  });

  app.post<{
    Body: RolePayload;
  }>('/roles', async (request, reply) => {
    try {
      const dsCargo = request.body.dsCargo?.trim();

      if (!dsCargo) {
        throw new Error('Informe o nome do cargo.');
      }

      const role = await prisma.cargo.create({
        data: {
          dsCargo,
          boInativo: Number(request.body.boInativo ?? 0),
        },
      });

      return reply.code(201).send(role);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar cargo.',
      });
    }
  });

  app.put<{
    Params: {
      id: string;
    };
    Body: RolePayload;
  }>('/roles/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const dsCargo = request.body.dsCargo?.trim();

      if (!dsCargo) {
        throw new Error('Informe o nome do cargo.');
      }

      return prisma.cargo.update({
        where: {
          id,
        },
        data: {
          dsCargo,
          boInativo: Number(request.body.boInativo ?? 0),
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao atualizar cargo.',
      });
    }
  });

  app.patch<{
    Params: {
      id: string;
    };
    Body: {
      boInativo?: number;
    };
  }>('/roles/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);

      return prisma.cargo.update({
        where: {
          id,
        },
        data: {
          boInativo,
        },
      });
    } catch {
      return reply.code(400).send({
        message: 'Erro ao alterar status do cargo.',
      });
    }
  });

  app.get('/frequencies', async () => {
    return prisma.frequencia.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsFrequencia: 'asc',
      },
    });
  });

  app.post<{
    Body: { dsFrequencia?: string; boInativo?: number };
  }>('/frequencies', async (request, reply) => {
    try {
      const dsFrequencia = request.body.dsFrequencia?.trim();
      if (!dsFrequencia) throw new Error('Informe a frequencia.');
      return reply.code(201).send(
        await prisma.frequencia.create({
          data: { dsFrequencia, boInativo: Number(request.body.boInativo ?? 0) },
        }),
      );
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar frequencia.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsFrequencia?: string; boInativo?: number } }>('/frequencies/:id', async (request, reply) => {
    try {
      const dsFrequencia = request.body.dsFrequencia?.trim();
      if (!dsFrequencia) throw new Error('Informe a frequencia.');
      return await prisma.frequencia.update({
        where: { id: Number(request.params.id) },
        data: { dsFrequencia, boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar frequencia.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/frequencies/:id/status', async (request, reply) => {
    try {
      return await prisma.frequencia.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da frequencia.' });
    }
  });

  app.get('/levels', async () => {
    return prisma.nivel.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsNivel: 'asc',
      },
    });
  });

  app.post<{ Body: { dsNivel?: string; boInativo?: number } }>('/levels', async (request, reply) => {
    try {
      const dsNivel = request.body.dsNivel?.trim();
      if (!dsNivel) throw new Error('Informe o nivel.');
      return reply.code(201).send(await prisma.nivel.create({ data: { dsNivel, boInativo: Number(request.body.boInativo ?? 0) } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar nivel.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsNivel?: string; boInativo?: number } }>('/levels/:id', async (request, reply) => {
    try {
      const dsNivel = request.body.dsNivel?.trim();
      if (!dsNivel) throw new Error('Informe o nivel.');
      return await prisma.nivel.update({
        where: { id: Number(request.params.id) },
        data: { dsNivel, boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar nivel.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/levels/:id/status', async (request, reply) => {
    try {
      return await prisma.nivel.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do nivel.' });
    }
  });

  app.get('/time-units', async () => {
    return prisma.unidadeTempo.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsUnidadeTempo: 'asc',
      },
    });
  });

  app.post<{ Body: { dsUnidadeTempo?: string; boInativo?: number } }>('/time-units', async (request, reply) => {
    try {
      const dsUnidadeTempo = request.body.dsUnidadeTempo?.trim();
      if (!dsUnidadeTempo) throw new Error('Informe a unidade de tempo.');
      return reply.code(201).send(await prisma.unidadeTempo.create({ data: { dsUnidadeTempo, boInativo: Number(request.body.boInativo ?? 0) } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar unidade de tempo.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsUnidadeTempo?: string; boInativo?: number } }>('/time-units/:id', async (request, reply) => {
    try {
      const dsUnidadeTempo = request.body.dsUnidadeTempo?.trim();
      if (!dsUnidadeTempo) throw new Error('Informe a unidade de tempo.');
      return await prisma.unidadeTempo.update({
        where: { id: Number(request.params.id) },
        data: { dsUnidadeTempo, boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar unidade de tempo.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/time-units/:id/status', async (request, reply) => {
    try {
      return await prisma.unidadeTempo.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da unidade de tempo.' });
    }
  });

  app.get('/payment-statuses', async () => {
    return prisma.statusPagamento.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsStatusPagamento: 'asc',
      },
    });
  });

  app.post<{ Body: { dsStatusPagamento?: string; boInativo?: number } }>('/payment-statuses', async (request, reply) => {
    try {
      const dsStatusPagamento = request.body.dsStatusPagamento?.trim();
      if (!dsStatusPagamento) throw new Error('Informe o status de pagamento.');
      return reply.code(201).send(await prisma.statusPagamento.create({ data: { dsStatusPagamento, boInativo: Number(request.body.boInativo ?? 0) } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar status de pagamento.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsStatusPagamento?: string; boInativo?: number } }>('/payment-statuses/:id', async (request, reply) => {
    try {
      const dsStatusPagamento = request.body.dsStatusPagamento?.trim();
      if (!dsStatusPagamento) throw new Error('Informe o status de pagamento.');
      return await prisma.statusPagamento.update({
        where: { id: Number(request.params.id) },
        data: { dsStatusPagamento, boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar status de pagamento.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/payment-statuses/:id/status', async (request, reply) => {
    try {
      return await prisma.statusPagamento.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status de pagamento.' });
    }
  });

  app.get('/payment-methods', async () => {
    return prisma.formaPagamento.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsFormaPagamento: 'asc',
      },
    });
  });

  app.post<{ Body: { dsFormaPagamento?: string; boInativo?: number } }>('/payment-methods', async (request, reply) => {
    try {
      const dsFormaPagamento = request.body.dsFormaPagamento?.trim();
      if (!dsFormaPagamento) throw new Error('Informe a forma de pagamento.');
      return reply.code(201).send(await prisma.formaPagamento.create({ data: { dsFormaPagamento, boInativo: Number(request.body.boInativo ?? 0) } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar forma de pagamento.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsFormaPagamento?: string; boInativo?: number } }>('/payment-methods/:id', async (request, reply) => {
    try {
      const dsFormaPagamento = request.body.dsFormaPagamento?.trim();
      if (!dsFormaPagamento) throw new Error('Informe a forma de pagamento.');
      return await prisma.formaPagamento.update({
        where: { id: Number(request.params.id) },
        data: { dsFormaPagamento, boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar forma de pagamento.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/payment-methods/:id/status', async (request, reply) => {
    try {
      return await prisma.formaPagamento.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da forma de pagamento.' });
    }
  });

  app.get('/training-methods', async () => {
    return prisma.metodoTreino.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        nmMetodoTreino: 'asc',
      },
    });
  });

  app.post<{ Body: { nmMetodoTreino?: string; dsMetodoTreino?: string; boInativo?: number } }>('/training-methods', async (request, reply) => {
    try {
      const nmMetodoTreino = request.body.nmMetodoTreino?.trim();
      const dsMetodoTreino = request.body.dsMetodoTreino?.trim() ?? '';
      if (!nmMetodoTreino) throw new Error('Informe o nome do metodo de treino.');
      return reply.code(201).send(await prisma.metodoTreino.create({
        data: { nmMetodoTreino, dsMetodoTreino, boInativo: Number(request.body.boInativo ?? 0) },
      }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar metodo de treino.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { nmMetodoTreino?: string; dsMetodoTreino?: string; boInativo?: number } }>('/training-methods/:id', async (request, reply) => {
    try {
      const nmMetodoTreino = request.body.nmMetodoTreino?.trim();
      const dsMetodoTreino = request.body.dsMetodoTreino?.trim() ?? '';
      if (!nmMetodoTreino) throw new Error('Informe o nome do metodo de treino.');
      return await prisma.metodoTreino.update({
        where: { id: Number(request.params.id) },
        data: { nmMetodoTreino, dsMetodoTreino, boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar metodo de treino.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/training-methods/:id/status', async (request, reply) => {
    try {
      return await prisma.metodoTreino.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do metodo de treino.' });
    }
  });

  app.get('/file-types', async () => {
    return prisma.tipoArquivo.findMany({
      where: {
        boInativo: 0,
      },
      orderBy: {
        dsTipo: 'asc',
      },
    });
  });

  app.post<{ Body: { dsTipo?: string; boInativo?: number } }>('/file-types', async (request, reply) => {
    try {
      const dsTipo = request.body.dsTipo?.trim();
      if (!dsTipo) throw new Error('Informe o tipo de arquivo.');
      return reply.code(201).send(await prisma.tipoArquivo.create({ data: { dsTipo, boInativo: Number(request.body.boInativo ?? 0) } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar tipo de arquivo.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsTipo?: string; boInativo?: number } }>('/file-types/:id', async (request, reply) => {
    try {
      const dsTipo = request.body.dsTipo?.trim();
      if (!dsTipo) throw new Error('Informe o tipo de arquivo.');
      return await prisma.tipoArquivo.update({
        where: { id: Number(request.params.id) },
        data: { dsTipo, boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar tipo de arquivo.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/file-types/:id/status', async (request, reply) => {
    try {
      return await prisma.tipoArquivo.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do tipo de arquivo.' });
    }
  });

  app.get('/sports', async () => {
    return prisma.esporte.findMany({
      orderBy: {
        dsEsporte: 'asc',
      },
    });
  });

  app.post<{ Body: SportPayload }>('/sports', async (request, reply) => {
    try {
      const dsEsporte = request.body.dsEsporte?.trim();

      if (!dsEsporte) {
        throw new Error('Informe o esporte.');
      }

      return reply.code(201).send(
        await prisma.esporte.create({
          data: {
            idEmpresa: nullableNumber(request.body.idEmpresa),
            dsEsporte,
            boInativo: Number(request.body.boInativo ?? 0),
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar esporte.',
      });
    }
  });

  app.put<{ Params: { id: string }; Body: SportPayload }>('/sports/:id', async (request, reply) => {
    try {
      const dsEsporte = request.body.dsEsporte?.trim();

      if (!dsEsporte) {
        throw new Error('Informe o esporte.');
      }

      return await prisma.esporte.update({
        where: { id: Number(request.params.id) },
        data: {
          idEmpresa: nullableNumber(request.body.idEmpresa),
          dsEsporte,
          boInativo: Number(request.body.boInativo ?? 0),
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar esporte.',
      });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/sports/:id/status', async (request, reply) => {
    try {
      return await prisma.esporte.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do esporte.' });
    }
  });

  app.get('/categories', async () => {
    return prisma.categoria.findMany({
      include: {
        esporte: true,
      },
      orderBy: {
        dsCategoria: 'asc',
      },
    });
  });

  app.post<{ Body: CategoryPayload }>('/categories', async (request, reply) => {
    try {
      const dsCategoria = request.body.dsCategoria?.trim();

      if (!dsCategoria) {
        throw new Error('Informe a categoria.');
      }

      return reply.code(201).send(
        await prisma.categoria.create({
          data: {
            idEmpresa: nullableNumber(request.body.idEmpresa),
            idEsporte: nullableNumber(request.body.idEsporte),
            dsCategoria,
            boInativo: Number(request.body.boInativo ?? 0),
          },
          include: {
            esporte: true,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar categoria.',
      });
    }
  });

  app.put<{ Params: { id: string }; Body: CategoryPayload }>('/categories/:id', async (request, reply) => {
    try {
      const dsCategoria = request.body.dsCategoria?.trim();

      if (!dsCategoria) {
        throw new Error('Informe a categoria.');
      }

      return await prisma.categoria.update({
        where: { id: Number(request.params.id) },
        data: {
          idEmpresa: nullableNumber(request.body.idEmpresa),
          idEsporte: nullableNumber(request.body.idEsporte),
          dsCategoria,
          boInativo: Number(request.body.boInativo ?? 0),
        },
        include: {
          esporte: true,
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar categoria.',
      });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/categories/:id/status', async (request, reply) => {
    try {
      return await prisma.categoria.update({
        where: { id: Number(request.params.id) },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
        include: {
          esporte: true,
        },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da categoria.' });
    }
  });
}
