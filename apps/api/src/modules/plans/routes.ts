import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import {
  normalizePlanPayload,
  assertValidId,
  optionalNumber,
  optionalDate,
} from '../../shared/normalize.js';
import type { CompanyChildPayload, PlanChildResource, PlanPayload } from '../../shared/api-types.js';

// ---------------------------------------------------------------------------
// Plan child resource config
// ---------------------------------------------------------------------------

type PlanChildDelegate = {
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

function asPlanChildDelegate(delegate: unknown) {
  return delegate as PlanChildDelegate;
}

const planChildResourceConfig = {
  values: {
    delegate: asPlanChildDelegate(prisma.planoValor),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        vlVenda: Number(payload.vlVenda ?? 0),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  products: {
    delegate: asPlanChildDelegate(prisma.planoProduto),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idProduto: optionalNumber(payload.idProduto),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  companies: {
    delegate: asPlanChildDelegate(prisma.planoEmpresa),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  activities: {
    delegate: asPlanChildDelegate(prisma.planoAtividade),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idAtividade: optionalNumber(payload.idAtividade),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  'promotion-plans': {
    delegate: asPlanChildDelegate(prisma.promocaoPlano),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idPromocao: optionalNumber(payload.idPromocao),
        qtDisponivel: Number(payload.qtDisponivel ?? 0),
        dtInicio: optionalDate(payload.dtInicio) ?? new Date(),
        dtEncerramento: optionalDate(payload.dtEncerramento) ?? null,
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
} satisfies Record<
  PlanChildResource,
  {
    delegate: PlanChildDelegate;
    normalize(planId: number, payload: CompanyChildPayload): Record<string, unknown>;
  }
>;

function getPlanChildResourceConfig(resource: string) {
  const config = planChildResourceConfig[resource as PlanChildResource];
  if (!config) {
    throw new Error('Tabela relacionada invalida.');
  }
  return config;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerPlanRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { includeInactive?: string; search?: string };
  }>('/plans', async (request) => {
    const includeInactive = request.query.includeInactive === 'true';
    const search = request.query.search?.trim();

    return prisma.plano.findMany({
      where: {
        ...(includeInactive ? {} : { boInativo: 0 }),
        ...(search ? { dsPlano: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { dsPlano: 'asc' },
    });
  });

  app.post<{
    Body: PlanPayload;
  }>('/plans', async (request, reply) => {
    try {
      const data = normalizePlanPayload(request.body);
      const plan = await prisma.plano.create({ data });
      return reply.code(201).send(plan);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar plano.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: PlanPayload;
  }>('/plans/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const data = normalizePlanPayload(request.body);
      return prisma.plano.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar plano.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/plans/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);
      return prisma.plano.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do plano.' });
    }
  });

  // Plan children - individual GET endpoints

  app.get<{ Params: { id: string } }>('/plans/:id/related/values', async (request, reply) => {
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      return prisma.planoValor.findMany({ where: { idPlano }, orderBy: { dtCadastro: 'desc' } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar valores do plano.',
      });
    }
  });

  app.get<{ Params: { id: string } }>('/plans/:id/related/products', async (request, reply) => {
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      return prisma.planoProduto.findMany({ where: { idPlano }, orderBy: { dtCadastro: 'desc' } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar produtos do plano.',
      });
    }
  });

  app.get<{ Params: { id: string } }>('/plans/:id/related/companies', async (request, reply) => {
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      return prisma.planoEmpresa.findMany({ where: { idPlano }, orderBy: { dtCadastro: 'desc' } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar empresas do plano.',
      });
    }
  });

  app.get<{ Params: { id: string } }>('/plans/:id/related/activities', async (request, reply) => {
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      return prisma.planoAtividade.findMany({ where: { idPlano }, orderBy: { dtCadastro: 'desc' } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar atividades do plano.',
      });
    }
  });

  app.get<{ Params: { id: string } }>(
    '/plans/:id/related/promotion-plans',
    async (request, reply) => {
      try {
        const idPlano = Number(request.params.id);
        assertValidId(idPlano, 'Plano invalido.');
        return prisma.promocaoPlano.findMany({
          where: { idPlano },
          orderBy: { dtCadastro: 'desc' },
        });
      } catch (error) {
        return reply.code(400).send({
          message: error instanceof Error ? error.message : 'Erro ao listar promocoes do plano.',
        });
      }
    },
  );

  // Plan children - generic write endpoints

  app.post<{
    Params: { id: string; resource: string };
    Body: CompanyChildPayload;
  }>('/plans/:id/related/:resource', async (request, reply) => {
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      const config = getPlanChildResourceConfig(request.params.resource);
      const record = await config.delegate.create({
        data: config.normalize(idPlano, request.body),
      });
      return reply.code(201).send(record);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar registro relacionado.',
      });
    }
  });

  app.put<{
    Params: { id: string; resource: string; childId: string };
    Body: CompanyChildPayload;
  }>('/plans/:id/related/:resource/:childId', async (request, reply) => {
    try {
      const idPlano = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idPlano, 'Plano invalido.');
      assertValidId(childId, 'Registro invalido.');
      const config = getPlanChildResourceConfig(request.params.resource);
      return config.delegate.update({
        where: { id: childId },
        data: config.normalize(idPlano, request.body),
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar registro relacionado.',
      });
    }
  });

  app.patch<{
    Params: { resource: string; childId: string };
    Body: { boInativo?: number };
  }>('/plans/:id/related/:resource/:childId/status', async (request, reply) => {
    try {
      const childId = Number(request.params.childId);
      assertValidId(childId, 'Registro invalido.');
      const config = getPlanChildResourceConfig(request.params.resource);
      return config.delegate.update({
        where: { id: childId },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao alterar status do registro relacionado.',
      });
    }
  });
}
