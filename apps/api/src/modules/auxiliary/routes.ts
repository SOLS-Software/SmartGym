import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
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

const boInativoField = z.preprocess((value) => toBool(value), z.boolean());

function textField(message: string) {
  return z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .min(1, message)
    .max(200, 'O campo deve ter no maximo 200 caracteres.');
}

const optionalTextField = z
  .string({ invalid_type_error: 'Dados invalidos.' })
  .trim()
  .max(200, 'O campo deve ter no maximo 200 caracteres.')
  .nullish();

function idField(message: string) {
  return z.coerce
    .number({ required_error: message, invalid_type_error: message })
    .int(message)
    .positive(message);
}

const optionalIdField = z.preprocess(
  (value) => (value === undefined || value === null || value === '' || value === 0 ? undefined : value),
  z.coerce
    .number({ invalid_type_error: 'Dados invalidos.' })
    .int('Dados invalidos.')
    .positive('Dados invalidos.')
    .optional(),
);

const roleBodySchema = z.object({
  dsCargo: textField('Informe o nome do cargo.'),
  boInativo: boInativoField,
});

const frequencyBodySchema = z.object({
  dsFrequencia: textField('Informe a frequencia.'),
  idUnidadeTempo: idField('Informe a unidade de tempo da frequencia.'),
  qtPeriodo: z.preprocess(
    (value) => (value === undefined || value === null || value === '' ? undefined : value),
    z.coerce
      .number({ invalid_type_error: 'Informe um periodo valido.' })
      .int('Informe um periodo valido.')
      .positive('Informe um periodo valido.')
      .optional(),
  ),
  boInativo: boInativoField,
});

const checkInTypeBodySchema = z.object({
  dsTipoCheckIn: textField('Informe o tipo de check-in.'),
  boInativo: boInativoField,
});

const levelBodySchema = z.object({
  dsNivel: textField('Informe o nivel.'),
  boInativo: boInativoField,
});

const bodyAreaBodySchema = z.object({
  dsAreaCorporal: textField('Informe a area corporal.'),
  boInativo: boInativoField,
});

const timeUnitBodySchema = z.object({
  dsUnidadeTempo: textField('Informe a unidade de tempo.'),
  boInativo: boInativoField,
});

const paymentStatusBodySchema = z.object({
  dsStatusPagamento: textField('Informe o status de pagamento.'),
  boInativo: boInativoField,
});

const paymentMethodBodySchema = z.object({
  dsFormaPagamento: textField('Informe a forma de pagamento.'),
  boInativo: boInativoField,
});

const trainingMethodBodySchema = z.object({
  nmMetodoTreino: textField('Informe o nome do metodo de treino.'),
  dsMetodoTreino: optionalTextField,
  boInativo: boInativoField,
});

const fileTypeBodySchema = z.object({
  dsTipo: textField('Informe o tipo de arquivo.'),
  boInativo: boInativoField,
});

const sportBodySchema = z.object({
  idEmpresa: optionalIdField,
  dsEsporte: textField('Informe o esporte.'),
  boInativo: boInativoField,
});

const categoryBodySchema = z.object({
  idEmpresa: optionalIdField,
  idEsporte: optionalIdField,
  dsCategoria: textField('Informe a categoria.'),
  boInativo: boInativoField,
});

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

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Dados invalidos.');
  }
  return parsed.data;
}

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Registro invalido.');
  }
  return id;
}

export async function registerAuxiliaryRoutes(app: FastifyInstance) {
  app.get('/roles', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.cargo.findMany({
      take,
      orderBy: {
        dsCargo: 'asc',
      },
    });
  });

  app.post<{
    Body: RolePayload;
  }>('/roles', async (request, reply) => {
    try {
      const { dsCargo, boInativo } = parseBody(roleBodySchema, request.body);

      const role = await prisma.cargo.create({
        data: {
          dsCargo,
          boInativo,
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
      const id = parseId(request.params.id);
      const { dsCargo, boInativo } = parseBody(roleBodySchema, request.body);

      return prisma.cargo.update({
        where: {
          id,
        },
        data: {
          dsCargo,
          boInativo,
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
      const id = parseId(request.params.id);
      const boInativo = toBool(request.body.boInativo);

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

  app.get('/frequencies', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.frequencia.findMany({
      take,
      where: {
        boInativo: false,
      },
      orderBy: {
        dsFrequencia: 'asc',
      },
    });
  });

  app.post<{
    Body: { dsFrequencia?: string; idUnidadeTempo?: number; qtPeriodo?: number; boInativo?: boolean };
  }>('/frequencies', async (request, reply) => {
    try {
      const { dsFrequencia, idUnidadeTempo, qtPeriodo, boInativo } = parseBody(frequencyBodySchema, request.body);
      return reply.code(201).send(
        await prisma.frequencia.create({
          data: {
            dsFrequencia,
            idUnidadeTempo,
            qtPeriodo: qtPeriodo ?? 1,
            boInativo,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar frequencia.' });
    }
  });

  app.put<{
    Params: { id: string };
    Body: { dsFrequencia?: string; idUnidadeTempo?: number; qtPeriodo?: number; boInativo?: number };
  }>('/frequencies/:id', async (request, reply) => {
    try {
      const { dsFrequencia, idUnidadeTempo, qtPeriodo, boInativo } = parseBody(frequencyBodySchema, request.body);
      return await prisma.frequencia.update({
        where: { id: parseId(request.params.id) },
        data: {
          dsFrequencia,
          idUnidadeTempo,
          qtPeriodo: qtPeriodo ?? 1,
          boInativo,
        },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar frequencia.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/frequencies/:id/status', async (request, reply) => {
    try {
      return await prisma.frequencia.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da frequencia.' });
    }
  });

  app.get('/check-in-types', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.tipoCheckIn.findMany({
      take,
      where: { boInativo: false },
      orderBy: { dsTipoCheckIn: 'asc' },
    });
  });

  app.post<{ Body: { dsTipoCheckIn?: string; boInativo?: number } }>('/check-in-types', async (request, reply) => {
    try {
      const { dsTipoCheckIn, boInativo } = parseBody(checkInTypeBodySchema, request.body);
      return reply.code(201).send(
        await prisma.tipoCheckIn.create({ data: { dsTipoCheckIn, boInativo } }),
      );
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar tipo de check-in.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsTipoCheckIn?: string; boInativo?: number } }>('/check-in-types/:id', async (request, reply) => {
    try {
      const { dsTipoCheckIn, boInativo } = parseBody(checkInTypeBodySchema, request.body);
      return await prisma.tipoCheckIn.update({
        where: { id: parseId(request.params.id) },
        data: { dsTipoCheckIn, boInativo },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar tipo de check-in.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/check-in-types/:id/status', async (request, reply) => {
    try {
      return await prisma.tipoCheckIn.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do tipo de check-in.' });
    }
  });

  app.get('/levels', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.nivel.findMany({
      take,
      where: {
        boInativo: false,
      },
      orderBy: {
        dsNivel: 'asc',
      },
    });
  });

  app.post<{ Body: { dsNivel?: string; boInativo?: number } }>('/levels', async (request, reply) => {
    try {
      const { dsNivel, boInativo } = parseBody(levelBodySchema, request.body);
      return reply.code(201).send(await prisma.nivel.create({ data: { dsNivel, boInativo } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar nivel.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsNivel?: string; boInativo?: number } }>('/levels/:id', async (request, reply) => {
    try {
      const { dsNivel, boInativo } = parseBody(levelBodySchema, request.body);
      return await prisma.nivel.update({
        where: { id: parseId(request.params.id) },
        data: { dsNivel, boInativo },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar nivel.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/levels/:id/status', async (request, reply) => {
    try {
      return await prisma.nivel.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do nivel.' });
    }
  });

  app.get('/body-areas', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.areaCorporal.findMany({
      take,
      where: { boInativo: false },
      orderBy: { dsAreaCorporal: 'asc' },
    });
  });

  app.post<{ Body: { dsAreaCorporal?: string; boInativo?: number } }>('/body-areas', async (request, reply) => {
    try {
      const { dsAreaCorporal, boInativo } = parseBody(bodyAreaBodySchema, request.body);
      return reply.code(201).send(
        await prisma.areaCorporal.create({
          data: { dsAreaCorporal, boInativo },
        }),
      );
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar area corporal.',
      });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsAreaCorporal?: string; boInativo?: number } }>(
    '/body-areas/:id',
    async (request, reply) => {
      try {
        const { dsAreaCorporal, boInativo } = parseBody(bodyAreaBodySchema, request.body);
        return await prisma.areaCorporal.update({
          where: { id: parseId(request.params.id) },
          data: { dsAreaCorporal, boInativo },
        });
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : 'Erro ao atualizar area corporal.',
        });
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/body-areas/:id/status', async (request, reply) => {
    try {
      return await prisma.areaCorporal.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da area corporal.' });
    }
  });

  app.get('/time-units', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.unidadeTempo.findMany({
      take,
      where: {
        boInativo: false,
      },
      orderBy: {
        dsUnidadeTempo: 'asc',
      },
    });
  });

  app.post<{ Body: { dsUnidadeTempo?: string; boInativo?: number } }>('/time-units', async (request, reply) => {
    try {
      const { dsUnidadeTempo, boInativo } = parseBody(timeUnitBodySchema, request.body);
      return reply.code(201).send(await prisma.unidadeTempo.create({ data: { dsUnidadeTempo, boInativo } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar unidade de tempo.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsUnidadeTempo?: string; boInativo?: number } }>('/time-units/:id', async (request, reply) => {
    try {
      const { dsUnidadeTempo, boInativo } = parseBody(timeUnitBodySchema, request.body);
      return await prisma.unidadeTempo.update({
        where: { id: parseId(request.params.id) },
        data: { dsUnidadeTempo, boInativo },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar unidade de tempo.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/time-units/:id/status', async (request, reply) => {
    try {
      return await prisma.unidadeTempo.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da unidade de tempo.' });
    }
  });

  app.get('/payment-statuses', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.statusPagamento.findMany({
      take,
      where: {
        boInativo: false,
      },
      orderBy: {
        dsStatusPagamento: 'asc',
      },
    });
  });

  app.post<{ Body: { dsStatusPagamento?: string; boInativo?: number } }>('/payment-statuses', async (request, reply) => {
    try {
      const { dsStatusPagamento, boInativo } = parseBody(paymentStatusBodySchema, request.body);
      return reply.code(201).send(await prisma.statusPagamento.create({ data: { dsStatusPagamento, boInativo } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar status de pagamento.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsStatusPagamento?: string; boInativo?: number } }>('/payment-statuses/:id', async (request, reply) => {
    try {
      const { dsStatusPagamento, boInativo } = parseBody(paymentStatusBodySchema, request.body);
      return await prisma.statusPagamento.update({
        where: { id: parseId(request.params.id) },
        data: { dsStatusPagamento, boInativo },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar status de pagamento.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/payment-statuses/:id/status', async (request, reply) => {
    try {
      return await prisma.statusPagamento.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status de pagamento.' });
    }
  });

  app.get('/payment-methods', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.formaPagamento.findMany({
      take,
      where: {
        boInativo: false,
      },
      orderBy: {
        dsFormaPagamento: 'asc',
      },
    });
  });

  app.post<{ Body: { dsFormaPagamento?: string; boInativo?: number } }>('/payment-methods', async (request, reply) => {
    try {
      const { dsFormaPagamento, boInativo } = parseBody(paymentMethodBodySchema, request.body);
      return reply.code(201).send(await prisma.formaPagamento.create({ data: { dsFormaPagamento, boInativo } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar forma de pagamento.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsFormaPagamento?: string; boInativo?: number } }>('/payment-methods/:id', async (request, reply) => {
    try {
      const { dsFormaPagamento, boInativo } = parseBody(paymentMethodBodySchema, request.body);
      return await prisma.formaPagamento.update({
        where: { id: parseId(request.params.id) },
        data: { dsFormaPagamento, boInativo },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar forma de pagamento.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/payment-methods/:id/status', async (request, reply) => {
    try {
      return await prisma.formaPagamento.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da forma de pagamento.' });
    }
  });

  app.get('/training-methods', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.metodoTreino.findMany({
      take,
      where: {
        boInativo: false,
      },
      orderBy: {
        nmMetodoTreino: 'asc',
      },
    });
  });

  app.post<{ Body: { nmMetodoTreino?: string; dsMetodoTreino?: string; boInativo?: number } }>('/training-methods', async (request, reply) => {
    try {
      const { nmMetodoTreino, dsMetodoTreino, boInativo } = parseBody(trainingMethodBodySchema, request.body);
      return reply.code(201).send(await prisma.metodoTreino.create({
        data: { nmMetodoTreino, dsMetodoTreino: dsMetodoTreino ?? '', boInativo },
      }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar metodo de treino.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { nmMetodoTreino?: string; dsMetodoTreino?: string; boInativo?: number } }>('/training-methods/:id', async (request, reply) => {
    try {
      const { nmMetodoTreino, dsMetodoTreino, boInativo } = parseBody(trainingMethodBodySchema, request.body);
      return await prisma.metodoTreino.update({
        where: { id: parseId(request.params.id) },
        data: { nmMetodoTreino, dsMetodoTreino: dsMetodoTreino ?? '', boInativo },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar metodo de treino.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/training-methods/:id/status', async (request, reply) => {
    try {
      return await prisma.metodoTreino.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do metodo de treino.' });
    }
  });

  app.get('/file-types', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.tipoArquivo.findMany({
      take,
      where: {
        boInativo: false,
      },
      orderBy: {
        dsTipo: 'asc',
      },
    });
  });

  app.post<{ Body: { dsTipo?: string; boInativo?: number } }>('/file-types', async (request, reply) => {
    try {
      const { dsTipo, boInativo } = parseBody(fileTypeBodySchema, request.body);
      return reply.code(201).send(await prisma.tipoArquivo.create({ data: { dsTipo, boInativo } }));
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar tipo de arquivo.' });
    }
  });

  app.put<{ Params: { id: string }; Body: { dsTipo?: string; boInativo?: number } }>('/file-types/:id', async (request, reply) => {
    try {
      const { dsTipo, boInativo } = parseBody(fileTypeBodySchema, request.body);
      return await prisma.tipoArquivo.update({
        where: { id: parseId(request.params.id) },
        data: { dsTipo, boInativo },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar tipo de arquivo.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/file-types/:id/status', async (request, reply) => {
    try {
      return await prisma.tipoArquivo.update({
        where: { id: parseId(request.params.id) },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do tipo de arquivo.' });
    }
  });

  app.get('/sports', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.esporte.findMany({
      take,
      where: {
        OR: [{ idEmpresa: null }, { empresa: { idCliente } }],
      },
      orderBy: {
        dsEsporte: 'asc',
      },
    });
  });

  app.post<{ Body: SportPayload }>('/sports', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const body = parseBody(sportBodySchema, request.body);

      const idEmpresa = body.idEmpresa ?? null;
      if (idEmpresa) {
        const empresa = await prisma.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) throw new Error('Empresa nao pertence ao cliente.');
      }

      return reply.code(201).send(
        await prisma.esporte.create({
          data: {
            idEmpresa,
            dsEsporte: body.dsEsporte,
            boInativo: body.boInativo,
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = parseId(request.params.id);
      const body = parseBody(sportBodySchema, request.body);

      const existing = await prisma.esporte.findFirst({
        where: { id, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
        select: { id: true },
      });
      if (!existing) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      const idEmpresa = body.idEmpresa ?? null;
      if (idEmpresa) {
        const empresa = await prisma.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) throw new Error('Empresa nao pertence ao cliente.');
      }

      return await prisma.esporte.update({
        where: { id },
        data: {
          idEmpresa,
          dsEsporte: body.dsEsporte,
          boInativo: body.boInativo,
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar esporte.',
      });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/sports/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = parseId(request.params.id);
      const existing = await prisma.esporte.findFirst({
        where: { id, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
        select: { id: true },
      });
      if (!existing) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      return await prisma.esporte.update({
        where: { id },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do esporte.' });
    }
  });

  app.get('/categories', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.categoria.findMany({
      take,
      where: {
        OR: [{ idEmpresa: null }, { empresa: { idCliente } }],
      },
      include: {
        esporte: true,
      },
      orderBy: {
        dsCategoria: 'asc',
      },
    });
  });

  app.post<{ Body: CategoryPayload }>('/categories', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const body = parseBody(categoryBodySchema, request.body);

      const idEmpresa = body.idEmpresa ?? null;
      if (idEmpresa) {
        const empresa = await prisma.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) throw new Error('Empresa nao pertence ao cliente.');
      }

      const idEsporte = body.idEsporte ?? null;
      if (idEsporte) {
        const esporte = await prisma.esporte.findFirst({
          where: { id: idEsporte, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
          select: { id: true },
        });
        if (!esporte) throw new Error('Esporte nao pertence ao cliente.');
      }

      return reply.code(201).send(
        await prisma.categoria.create({
          data: {
            idEmpresa,
            idEsporte,
            dsCategoria: body.dsCategoria,
            boInativo: body.boInativo,
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = parseId(request.params.id);
      const body = parseBody(categoryBodySchema, request.body);

      const existing = await prisma.categoria.findFirst({
        where: { id, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
        select: { id: true },
      });
      if (!existing) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      const idEmpresa = body.idEmpresa ?? null;
      if (idEmpresa) {
        const empresa = await prisma.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) throw new Error('Empresa nao pertence ao cliente.');
      }

      const idEsporte = body.idEsporte ?? null;
      if (idEsporte) {
        const esporte = await prisma.esporte.findFirst({
          where: { id: idEsporte, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
          select: { id: true },
        });
        if (!esporte) throw new Error('Esporte nao pertence ao cliente.');
      }

      return await prisma.categoria.update({
        where: { id },
        data: {
          idEmpresa,
          idEsporte,
          dsCategoria: body.dsCategoria,
          boInativo: body.boInativo,
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = parseId(request.params.id);
      const existing = await prisma.categoria.findFirst({
        where: { id, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
        select: { id: true },
      });
      if (!existing) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      return await prisma.categoria.update({
        where: { id },
        data: { boInativo: toBool(request.body.boInativo) },
        include: {
          esporte: true,
        },
      });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da categoria.' });
    }
  });

  app.get('/measurement-units', async (request, reply) => {
    const take = parseTake(request.query);
    if (take === null) return reply.code(400).send({ message: 'Parametros invalidos.' });
    return prisma.unidadeMedida.findMany({
      take,
      where: { boInativo: false },
      orderBy: { cnUnidade: 'asc' },
    });
  });
}
