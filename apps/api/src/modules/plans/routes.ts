import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import {
  normalizePlanPayload,
  assertValidId,
  optionalNumber,
  optionalDate,
  getMultipartFieldValue,
} from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { getPromotionFilePath } from '../../shared/files.js';
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
  'promotion-products': {
    delegate: asPlanChildDelegate(prisma.promocaoProduto),
    normalize(_planId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: optionalNumber(payload.idEmpresa),
        idPromocao: optionalNumber(payload.idPromocao),
        idProduto: optionalNumber(payload.idProduto),
        qtDisponivel: optionalNumber(payload.qtDisponivel),
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

async function getPromotionIdsByPlan(idPlano: number) {
  const records = await prisma.promocaoPlano.findMany({
    where: { idPlano },
    select: { idPromocao: true },
  });

  return records
    .map((record) => record.idPromocao)
    .filter((idPromocao): idPromocao is number => Number.isInteger(idPromocao));
}

async function assertPromotionBelongsToPlan(idPlano: number, idPromocao: number) {
  assertValidId(idPromocao, 'Promocao invalida.');
  const relation = await prisma.promocaoPlano.findFirst({
    where: { idPlano, idPromocao },
    select: { id: true },
  });

  if (!relation) {
    throw new Error('Promocao nao relacionada ao plano.');
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerPlanRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { includeInactive?: string; includeDetails?: string; search?: string };
  }>('/plans', async (request) => {
    const includeInactive = request.query.includeInactive === 'true';
    const includeDetails = request.query.includeDetails === 'true';
    const search = request.query.search?.trim();

    return prisma.plano.findMany({
      where: {
        ...(includeInactive ? {} : { boInativo: 0 }),
        ...(search ? { dsPlano: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: includeDetails
        ? {
            frequencia: true,
            planoAtividades: {
              where: { boInativo: 0 },
              include: { atividade: true },
              orderBy: { id: 'asc' },
            },
            planoProdutos: {
              where: { boInativo: 0 },
              include: { produto: true },
              orderBy: { id: 'asc' },
            },
            planoEmpresas: {
              where: { boInativo: 0 },
              include: { empresa: true },
              orderBy: { id: 'asc' },
            },
            planoValores: {
              where: { boInativo: 0 },
              include: { empresa: true },
              orderBy: { dtCadastro: 'desc' },
            },
            promocaoPlanos: {
              where: { boInativo: 0 },
              include: { promocao: true },
              orderBy: { dtCadastro: 'desc' },
            },
          }
        : undefined,
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

  app.get<{ Params: { id: string } }>(
    '/plans/:id/related/promotion-products',
    async (request, reply) => {
      try {
        const idPlano = Number(request.params.id);
        assertValidId(idPlano, 'Plano invalido.');
        const promotionIds = await getPromotionIdsByPlan(idPlano);

        if (promotionIds.length === 0) {
          return [];
        }

        return prisma.promocaoProduto.findMany({
          where: { idPromocao: { in: promotionIds } },
          orderBy: { dtCadastro: 'desc' },
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao listar produtos de promocao.',
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/plans/:id/related/promotion-files',
    async (request, reply) => {
      try {
        const idPlano = Number(request.params.id);
        assertValidId(idPlano, 'Plano invalido.');
        const promotionIds = await getPromotionIdsByPlan(idPlano);

        if (promotionIds.length === 0) {
          return [];
        }

        return prisma.promocaoArquivo.findMany({
          where: { idPromocao: { in: promotionIds } },
          orderBy: { dtCadastro: 'desc' },
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao listar arquivos de promocao.',
        });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/plans/:id/related/promotion-files',
    async (request, reply) => {
      try {
        const idPlano = Number(request.params.id);
        assertValidId(idPlano, 'Plano invalido.');

        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ message: 'Envie um arquivo.' });
        }

        const fields = file.fields as Record<string, unknown>;
        const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao'));
        await assertPromotionBelongsToPlan(idPlano, idPromocao);

        const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
        const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
        const buffer = await file.toBuffer();
        const path = getPromotionFilePath(idPromocao, file.filename);
        const { bucket } = getSupabaseConfig();
        const supabase = getSupabaseClient();
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, buffer, { contentType: file.mimetype, upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const promotionFile = await prisma.promocaoArquivo.create({
          data: {
            idPromocao,
            idTiposArquivos,
            dsArquivo: file.filename,
            anCaminho: path,
            cnChaveAcesso: 0,
            cnDistribuidor: 0,
          },
        });

        return reply.code(201).send(promotionFile);
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao enviar arquivo de promocao.',
        });
      }
    },
  );

  app.put<{ Params: { id: string; fileId: string } }>(
    '/plans/:id/related/promotion-files/:fileId',
    async (request, reply) => {
      try {
        const idPlano = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPlano, 'Plano invalido.');
        assertValidId(fileId, 'Arquivo invalido.');

        const current = await prisma.promocaoArquivo.findFirst({
          where: { id: fileId, promocao: { promocaoPlanos: { some: { idPlano } } } },
        });

        if (!current) {
          return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
        }

        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ message: 'Envie um arquivo.' });
        }

        const fields = file.fields as Record<string, unknown>;
        const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao') || current.idPromocao);
        await assertPromotionBelongsToPlan(idPlano, idPromocao);

        const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
        const buffer = await file.toBuffer();
        const path = getPromotionFilePath(idPromocao, file.filename);
        const { bucket } = getSupabaseConfig();
        const supabase = getSupabaseClient();
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, buffer, { contentType: file.mimetype, upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        return prisma.promocaoArquivo.update({
          where: { id: fileId },
          data: {
            idPromocao,
            idTiposArquivos: rawFileTypeId ? Number(rawFileTypeId) : current.idTiposArquivos,
            dsArquivo: file.filename,
            anCaminho: path,
          },
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao alterar arquivo de promocao.',
        });
      }
    },
  );

  app.get<{ Params: { id: string; fileId: string } }>(
    '/plans/:id/related/promotion-files/:fileId/url',
    async (request, reply) => {
      try {
        const idPlano = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPlano, 'Plano invalido.');
        assertValidId(fileId, 'Arquivo invalido.');

        const promotionFile = await prisma.promocaoArquivo.findFirst({
          where: {
            id: fileId,
            boInativo: 0,
            promocao: { promocaoPlanos: { some: { idPlano } } },
          },
        });

        if (!promotionFile) {
          return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
        }

        const { bucket } = getSupabaseConfig();
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(promotionFile.anCaminho, 60 * 5);

        if (error) {
          throw new Error(error.message);
        }

        return { url: data.signedUrl, expiresIn: 60 * 5 };
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.',
        });
      }
    },
  );

  app.delete<{ Params: { id: string; fileId: string } }>(
    '/plans/:id/related/promotion-files/:fileId',
    async (request, reply) => {
      try {
        const idPlano = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPlano, 'Plano invalido.');
        assertValidId(fileId, 'Arquivo invalido.');

        const current = await prisma.promocaoArquivo.findFirst({
          where: { id: fileId, promocao: { promocaoPlanos: { some: { idPlano } } } },
          select: { id: true },
        });

        if (!current) {
          return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
        }

        return prisma.promocaoArquivo.update({
          where: { id: fileId },
          data: { boInativo: 1 },
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao remover arquivo de promocao.',
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
      if (request.params.resource === 'promotion-products') {
        const idPromocao = optionalNumber(request.body.idPromocao);
        await assertPromotionBelongsToPlan(idPlano, Number(idPromocao));
      }
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
      if (request.params.resource === 'promotion-products') {
        const idPromocao = optionalNumber(request.body.idPromocao);
        await assertPromotionBelongsToPlan(idPlano, Number(idPromocao));
      }
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
