import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import {
  assertValidId,
  getMultipartFieldValue,
  optionalDate,
  optionalNumber,
  requiredText,
} from '../../shared/normalize.js';
import { prisma } from '../../shared/prisma.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { assertAllowedUploadType, getPromotionFilePath } from '../../shared/files.js';
import type { CompanyChildPayload } from '../../shared/api-types.js';

// ---------------------------------------------------------------------------
// Validacao de entrada
// ---------------------------------------------------------------------------

const queryFlagSchema = z.enum(['true', 'false']).optional();

const queryIntSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().optional(),
);

const listQuerySchema = z.object({
  companyId: queryIntSchema,
  currentOnly: queryFlagSchema,
  includeDetails: queryFlagSchema,
  includeInactive: queryFlagSchema,
  search: z.string().optional(),
  limit: queryIntSchema,
});

const relatedListQuerySchema = z.object({ limit: queryIntSchema });

const bodyNumberSchema = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .refine(
    (value) => value == null || value === '' || Number.isFinite(Number(value)),
    'Valor numerico invalido.',
  );

const childBodySchema = z.object({
  idEmpresa: bodyNumberSchema,
  idPlano: bodyNumberSchema,
  idProduto: bodyNumberSchema,
  qtDisponivel: bodyNumberSchema,
});

const statusBodySchema = z.object({
  boInativo: z.union([z.boolean(), z.number(), z.string()]).nullish(),
});

function clampLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 1000, 1), 1000);
}

type PromotionChildResource = 'promotion-plans' | 'promotion-products';

type PromotionChildDelegate = {
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Tenant isolation: Promocao.idEmpresa -> Empresa.idCliente. Registros com
// idEmpresa nulo sao tratados como globais (visiveis a todos).
// ---------------------------------------------------------------------------

function tenantCompanyWhere(idCliente: number) {
  return { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] };
}

async function promotionBelongsToTenant(idCliente: number, idPromocao: number) {
  const promotion = await prisma.promocao.findFirst({
    where: { id: idPromocao, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  return Boolean(promotion);
}

async function assertCompanyInTenant(idCliente: number, idEmpresa: number | null | undefined) {
  if (idEmpresa == null) return;
  const company = await prisma.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!company) throw new Error('Empresa nao pertence ao cliente.');
}

// Plano nao tem idEmpresa: o vinculo com o tenant e via PlanoEmpresa. Planos
// sem nenhuma empresa vinculada sao tratados como globais.
async function assertPlanInTenant(idCliente: number, idPlano: number | null | undefined) {
  if (idPlano == null) return;
  const plan = await prisma.plano.findFirst({
    where: {
      id: idPlano,
      OR: [
        { planoEmpresas: { some: { empresa: { idCliente } } } },
        { planoEmpresas: { none: {} } },
      ],
    },
    select: { id: true },
  });
  if (!plan) throw new Error('Plano nao pertence ao cliente.');
}

async function assertProductInTenant(idCliente: number, idProduto: number | null | undefined) {
  if (idProduto == null) return;
  const product = await prisma.produto.findFirst({
    where: { id: idProduto, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  if (!product) throw new Error('Produto nao pertence ao cliente.');
}

function asPromotionChildDelegate(delegate: unknown) {
  return delegate as PromotionChildDelegate;
}

const promotionChildResourceConfig = {
  'promotion-plans': {
    delegate: asPromotionChildDelegate(prisma.promocaoPlano),
    async assertTenant(idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(idCliente, optionalNumber(payload.idEmpresa));
      await assertPlanInTenant(idCliente, optionalNumber(payload.idPlano));
    },
    normalize(promotionId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: optionalNumber(payload.idEmpresa),
        idPromocao: promotionId,
        idPlano: optionalNumber(payload.idPlano),
        qtDisponivel: Number(payload.qtDisponivel ?? 0),
        dtInicio: optionalDate(payload.dtInicio) ?? new Date(),
        dtEncerramento: optionalDate(payload.dtEncerramento) ?? null,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'promotion-products': {
    delegate: asPromotionChildDelegate(prisma.promocaoProduto),
    async assertTenant(idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(idCliente, optionalNumber(payload.idEmpresa));
      await assertProductInTenant(idCliente, optionalNumber(payload.idProduto));
    },
    normalize(promotionId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: optionalNumber(payload.idEmpresa),
        idPromocao: promotionId,
        idProduto: optionalNumber(payload.idProduto),
        qtDisponivel: optionalNumber(payload.qtDisponivel),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
} satisfies Record<
  PromotionChildResource,
  {
    delegate: PromotionChildDelegate;
    assertTenant(idCliente: number, payload: CompanyChildPayload): Promise<void>;
    normalize(promotionId: number, payload: CompanyChildPayload): Record<string, unknown>;
  }
>;

function getPromotionChildResourceConfig(resource: string) {
  const config = promotionChildResourceConfig[resource as PromotionChildResource];
  if (!config) {
    throw new Error('Tabela relacionada invalida.');
  }
  return config;
}

function normalizePromotionPayload(payload: CompanyChildPayload) {
  // !(x >= 0) tambem rejeita NaN.
  const qtPeriodo = Number(payload.qtPeriodo ?? 0);
  if (!(qtPeriodo >= 0)) throw new Error('Periodo nao pode ser negativo.');
  const vlDesconto = Number(payload.vlDesconto ?? 0);
  if (!(vlDesconto >= 0)) throw new Error('Valor de desconto nao pode ser negativo.');
  const pcDesconto = Number(payload.pcDesconto ?? 0);
  if (!(pcDesconto >= 0 && pcDesconto <= 100)) throw new Error('Percentual de desconto deve estar entre 0 e 100.');
  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    dsPromocao: requiredText(payload.dsPromocao, 'Informe a promocao.'),
    qtPeriodo,
    idUnidadeTempo: optionalNumber(payload.idUnidadeTempo),
    vlDesconto,
    pcDesconto,
    dtInicio: optionalDate(payload.dtInicio) ?? new Date(),
    dtEncerramento: optionalDate(payload.dtEncerramento) ?? null,
    boInativo: toBool(payload.boInativo),
  };
}

export async function registerPromotionRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      companyId?: string;
      currentOnly?: string;
      includeDetails?: string;
      includeInactive?: string;
      search?: string;
    };
  }>('/promotions', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const companyId = parsedQuery.data.companyId;
    const currentOnly = parsedQuery.data.currentOnly === 'true';
    const includeDetails = parsedQuery.data.includeDetails === 'true';
    const includeInactive = parsedQuery.data.includeInactive === 'true';
    const search = parsedQuery.data.search?.trim();
    const now = new Date();

    return prisma.promocao.findMany({
      take: clampLimit(parsedQuery.data.limit),
      where: {
        ...(companyId ? { idEmpresa: companyId } : {}),
        ...(includeInactive ? {} : { boInativo: false }),
        ...(currentOnly
          ? {
              dtInicio: { lte: now },
              OR: [{ dtEncerramento: null }, { dtEncerramento: { gte: now } }],
            }
          : {}),
        ...(search ? { dsPromocao: { contains: search, mode: 'insensitive' } } : {}),
        // AND para nao colidir com o OR do currentOnly.
        AND: [tenantCompanyWhere(idCliente)],
      },
      include: includeDetails
        ? {
            empresa: true,
            unidadeTempo: true,
            promocaoPlanos: {
              where: { boInativo: false, ...tenantCompanyWhere(idCliente) },
              include: { empresa: true, plano: true },
              orderBy: { dtCadastro: 'desc' },
            },
            promocaoProdutos: {
              where: { boInativo: false, ...tenantCompanyWhere(idCliente) },
              include: { empresa: true, produto: true },
              orderBy: { dtCadastro: 'desc' },
            },
          }
        : undefined,
      orderBy: { dsPromocao: 'asc' },
    });
  });

  app.post<{
    Body: CompanyChildPayload;
  }>('/promotions', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizePromotionPayload(request.body);
      await assertCompanyInTenant(idCliente, data.idEmpresa);
      return reply.code(201).send(await prisma.promocao.create({ data }));
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao criar promocao.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: CompanyChildPayload;
  }>('/promotions/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Promocao invalida.');
      if (!(await promotionBelongsToTenant(idCliente, id))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizePromotionPayload(request.body);
      await assertCompanyInTenant(idCliente, data.idEmpresa);
      return prisma.promocao.update({ where: { id }, data });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar promocao.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/promotions/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Promocao invalida.');
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await promotionBelongsToTenant(idCliente, id))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.promocao.update({
        where: { id },
        data: { boInativo: toBool(parsedBody.data.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status da promocao.',
      });
    }
  });

  app.get<{ Params: { id: string } }>(
    '/promotions/:id/related/promotion-plans',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPromocao = Number(request.params.id);
        assertValidId(idPromocao, 'Promocao invalida.');
        const parsedQuery = relatedListQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: 'Parametros invalidos.' });
        }
        if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        return prisma.promocaoPlano.findMany({
          where: { idPromocao, ...tenantCompanyWhere(idCliente) },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao listar planos da promocao.',
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/promotions/:id/related/promotion-products',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPromocao = Number(request.params.id);
        assertValidId(idPromocao, 'Promocao invalida.');
        const parsedQuery = relatedListQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: 'Parametros invalidos.' });
        }
        if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        return prisma.promocaoProduto.findMany({
          where: { idPromocao, ...tenantCompanyWhere(idCliente) },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao listar produtos da promocao.',
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/promotions/:id/related/promotion-files',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPromocao = Number(request.params.id);
        assertValidId(idPromocao, 'Promocao invalida.');
        const parsedQuery = relatedListQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: 'Parametros invalidos.' });
        }
        if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        return prisma.promocaoArquivo.findMany({
          where: { idPromocao },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao listar arquivos da promocao.',
        });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/promotions/:id/related/promotion-files',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPromocao = Number(request.params.id);
        assertValidId(idPromocao, 'Promocao invalida.');

        if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ message: 'Envie um arquivo.' });
        }
        assertAllowedUploadType(file);

        const fields = file.fields as Record<string, unknown>;
        const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
        const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
        if (idTiposArquivos !== null) {
          assertValidId(idTiposArquivos, 'Tipo de arquivo invalido.');
        }
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

        return reply.code(201).send(await prisma.promocaoArquivo.create({
          data: {
            idPromocao,
            idTiposArquivos,
            dsArquivo: file.filename,
            anCaminho: path,
            cnChaveAcesso: 0,
            cnDistribuidor: 0,
          },
        }));
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao enviar arquivo da promocao.',
        });
      }
    },
  );

  app.put<{ Params: { id: string; fileId: string } }>(
    '/promotions/:id/related/promotion-files/:fileId',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPromocao = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPromocao, 'Promocao invalida.');
        assertValidId(fileId, 'Arquivo invalido.');

        if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const current = await prisma.promocaoArquivo.findFirst({
          where: { id: fileId, idPromocao },
        });

        if (!current) {
          return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
        }

        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ message: 'Envie um arquivo.' });
        }
        assertAllowedUploadType(file);

        const fields = file.fields as Record<string, unknown>;
        const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
        if (rawFileTypeId) {
          assertValidId(Number(rawFileTypeId), 'Tipo de arquivo invalido.');
        }
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
            idTiposArquivos: rawFileTypeId ? Number(rawFileTypeId) : current.idTiposArquivos,
            dsArquivo: file.filename,
            anCaminho: path,
          },
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao alterar arquivo da promocao.',
        });
      }
    },
  );

  app.get<{ Params: { id: string; fileId: string } }>(
    '/promotions/:id/related/promotion-files/:fileId/url',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPromocao = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPromocao, 'Promocao invalida.');
        assertValidId(fileId, 'Arquivo invalido.');

        if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const promotionFile = await prisma.promocaoArquivo.findFirst({
          where: { id: fileId, idPromocao, boInativo: false },
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
    '/promotions/:id/related/promotion-files/:fileId',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPromocao = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPromocao, 'Promocao invalida.');
        assertValidId(fileId, 'Arquivo invalido.');

        if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const current = await prisma.promocaoArquivo.findFirst({
          where: { id: fileId, idPromocao },
          select: { id: true },
        });

        if (!current) {
          return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
        }

        return prisma.promocaoArquivo.update({
          where: { id: fileId },
          data: { boInativo: true },
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            error instanceof Error ? error.message : 'Erro ao remover arquivo da promocao.',
        });
      }
    },
  );

  app.post<{
    Params: { id: string; resource: string };
    Body: CompanyChildPayload;
  }>('/promotions/:id/related/:resource', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPromocao = Number(request.params.id);
      assertValidId(idPromocao, 'Promocao invalida.');
      if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPromotionChildResourceConfig(request.params.resource);
      if (!childBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      await config.assertTenant(idCliente, request.body);
      return reply.code(201).send(await config.delegate.create({
        data: config.normalize(idPromocao, request.body),
      }));
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao criar registro relacionado.',
      });
    }
  });

  app.put<{
    Params: { id: string; resource: string; childId: string };
    Body: CompanyChildPayload;
  }>('/promotions/:id/related/:resource/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPromocao = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idPromocao, 'Promocao invalida.');
      assertValidId(childId, 'Registro invalido.');
      if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPromotionChildResourceConfig(request.params.resource);
      const current = await config.delegate.findFirst({ where: { id: childId, idPromocao } });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!childBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      await config.assertTenant(idCliente, request.body);
      return config.delegate.update({
        where: { id: childId },
        data: config.normalize(idPromocao, request.body),
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao atualizar registro relacionado.',
      });
    }
  });

  app.patch<{
    Params: { id: string; resource: string; childId: string };
    Body: { boInativo?: number };
  }>('/promotions/:id/related/:resource/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPromocao = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idPromocao, 'Promocao invalida.');
      assertValidId(childId, 'Registro invalido.');
      if (!(await promotionBelongsToTenant(idCliente, idPromocao))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPromotionChildResourceConfig(request.params.resource);
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const current = await config.delegate.findFirst({ where: { id: childId, idPromocao } });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return config.delegate.update({
        where: { id: childId },
        data: { boInativo: toBool(parsedBody.data.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao alterar status do registro relacionado.',
      });
    }
  });
}
