import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@solsfit/db';
import {
  assertOrdemDasDatas,
  assertValidId,
  getMultipartFieldValue,
  numeroNaFaixa,
  optionalDate,
  optionalNumber,
  requiredWithin,
} from '../../shared/normalize.js';
import { LIMITES } from '@solsfit/shared';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { assertAllowedUploadType, assertUploadBuffer, getPromotionFilePath } from '../../shared/files.js';
import type { CompanyChildPayload } from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';

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
// Tenant isolation: Promocao.idCliente (desde 09/2026). idEmpresa continua
// opcional e restringe a campanha a UMA filial; nulo agora significa "todas as
// filiais deste cliente", nao mais "de todo mundo".
// ---------------------------------------------------------------------------

function tenantCompanyWhere(idCliente: number) {
  return { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] };
}

async function promotionBelongsToTenant(db: PrismaClient, idCliente: number, idPromocao: number) {
  const promotion = await db.promocao.findFirst({
    where: { id: idPromocao, idCliente },
    select: { id: true },
  });
  return Boolean(promotion);
}

// Leitura e mutacao exigem a mesma posse desde que a campanha tem dono
// proprio; as rotas continuam distinguindo os dois casos na mensagem.
const promotionOwnedByTenant = promotionBelongsToTenant;

async function assertCompanyInTenant(db: PrismaClient, idCliente: number, idEmpresa: number | null | undefined) {
  if (idEmpresa == null) return;
  const company = await db.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!company) throw new Error('Empresa nao pertence ao cliente.');
}

async function assertPlanInTenant(db: PrismaClient, idCliente: number, idPlano: number | null | undefined) {
  if (idPlano == null) return;
  const plan = await db.plano.findFirst({
    where: { id: idPlano, idCliente },
    select: { id: true },
  });
  if (!plan) throw new Error('Plano nao pertence ao cliente.');
}

async function assertProductInTenant(db: PrismaClient, idCliente: number, idProduto: number | null | undefined) {
  if (idProduto == null) return;
  const product = await db.produto.findFirst({
    where: { id: idProduto, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  if (!product) throw new Error('Produto nao pertence ao cliente.');
}

// O delegate nao pode ser resolvido no carregamento do modulo: com banco por
// tenant, o client certo so existe no request. Por isso a config guarda COMO
// chegar ao delegate, e nao o delegate.
function asPromotionChildDelegate(delegate: unknown) {
  return delegate as PromotionChildDelegate;
}

const promotionChildResourceConfig = {
  'promotion-plans': {
    delegate: (db: PrismaClient) => asPromotionChildDelegate(db.promocaoPlano),
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
      await assertPlanInTenant(db, idCliente, optionalNumber(payload.idPlano));
    },
    normalize(promotionId: number, payload: CompanyChildPayload) {
      const dtInicio = optionalDate(payload.dtInicio) ?? new Date();
      const dtEncerramento = optionalDate(payload.dtEncerramento) ?? null;
      assertOrdemDasDatas(
        dtInicio,
        dtEncerramento,
        'O encerramento nao pode ser anterior ao inicio.',
      );

      return {
        idEmpresa: optionalNumber(payload.idEmpresa),
        idPromocao: promotionId,
        idPlano: optionalNumber(payload.idPlano),
        qtDisponivel:
          numeroNaFaixa(payload.qtDisponivel ?? 0, 'qtDisponivel', 'A quantidade disponivel') ?? 0,
        dtInicio,
        dtEncerramento,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'promotion-products': {
    delegate: (db: PrismaClient) => asPromotionChildDelegate(db.promocaoProduto),
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
      await assertProductInTenant(db, idCliente, optionalNumber(payload.idProduto));
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
    delegate: (db: PrismaClient) => PromotionChildDelegate;
    assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload): Promise<void>;
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
  // As checagens eram so de piso ("nao pode ser negativo"): vlDesconto e
  // Decimal(12,4) e um valor de 13 digitos passava daqui direto para o
  // Postgres. numeroNaFaixa confere piso E teto contra a mesma faixa que o
  // input do front usa, entao a mensagem e igual nos dois lados.
  const qtPeriodo = numeroNaFaixa(payload.qtPeriodo ?? 0, 'qtPeriodo', 'O periodo') ?? 0;
  const vlDesconto = numeroNaFaixa(payload.vlDesconto ?? 0, 'vlDesconto', 'O valor de desconto') ?? 0;
  const pcDesconto =
    numeroNaFaixa(payload.pcDesconto ?? 0, 'pcDesconto', 'O percentual de desconto') ?? 0;

  const dtInicio = optionalDate(payload.dtInicio) ?? new Date();
  const dtEncerramento = optionalDate(payload.dtEncerramento) ?? null;
  // Promocao que encerra antes de comecar entrava na base e sumia das
  // listagens de vigentes sem que nada acusasse.
  assertOrdemDasDatas(
    dtInicio,
    dtEncerramento,
    'O encerramento da promocao nao pode ser anterior ao inicio.',
  );

  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    dsPromocao: requiredWithin(
      payload.dsPromocao,
      LIMITES.promocao.dsPromocao,
      'Informe a promocao.',
      'O nome da promocao',
    ),
    qtPeriodo,
    idUnidadeTempo: optionalNumber(payload.idUnidadeTempo),
    vlDesconto,
    pcDesconto,
    dtInicio,
    dtEncerramento,
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

    return request.tenantDb.promocao.findMany({
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
        idCliente,
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
      await assertCompanyInTenant(request.tenantDb, idCliente, data.idEmpresa);
      // Tenant SEMPRE do token, nunca do body.
      return reply.code(201).send(await request.tenantDb.promocao.create({ data: { ...data, idCliente } }));
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
      if (!(await promotionOwnedByTenant(request.tenantDb, idCliente, id))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizePromotionPayload(request.body);
      await assertCompanyInTenant(request.tenantDb, idCliente, data.idEmpresa);
      return request.tenantDb.promocao.update({ where: { id }, data });
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
      if (!(await promotionOwnedByTenant(request.tenantDb, idCliente, id))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.promocao.update({
        where: { id },
        data: { boInativo: toBool(parsedBody.data.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao alterar status da promocao.'),
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
        if (!(await promotionBelongsToTenant(request.tenantDb, idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        return request.tenantDb.promocaoPlano.findMany({
          where: { idPromocao, ...tenantCompanyWhere(idCliente) },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            clientErrorMessage(error, 'Erro ao listar planos da promocao.'),
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
        if (!(await promotionBelongsToTenant(request.tenantDb, idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        return request.tenantDb.promocaoProduto.findMany({
          where: { idPromocao, ...tenantCompanyWhere(idCliente) },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            clientErrorMessage(error, 'Erro ao listar produtos da promocao.'),
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
        if (!(await promotionBelongsToTenant(request.tenantDb, idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        return request.tenantDb.promocaoArquivo.findMany({
          where: { idPromocao },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            clientErrorMessage(error, 'Erro ao listar arquivos da promocao.'),
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

        if (!(await promotionBelongsToTenant(request.tenantDb, idCliente, idPromocao))) {
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
        const safeMime = await assertUploadBuffer(buffer);
        const path = getPromotionFilePath(idPromocao, file.filename);
        const { bucket } = getSupabaseConfig();
        const supabase = getSupabaseClient();
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, buffer, { contentType: safeMime, upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        return reply.code(201).send(await request.tenantDb.promocaoArquivo.create({
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
            clientErrorMessage(error, 'Erro ao enviar arquivo da promocao.'),
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

        if (!(await promotionOwnedByTenant(request.tenantDb, idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const current = await request.tenantDb.promocaoArquivo.findFirst({
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
        const safeMime = await assertUploadBuffer(buffer);
        const path = getPromotionFilePath(idPromocao, file.filename);
        const { bucket } = getSupabaseConfig();
        const supabase = getSupabaseClient();
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, buffer, { contentType: safeMime, upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        return request.tenantDb.promocaoArquivo.update({
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
            clientErrorMessage(error, 'Erro ao alterar arquivo da promocao.'),
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

        if (!(await promotionBelongsToTenant(request.tenantDb, idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const promotionFile = await request.tenantDb.promocaoArquivo.findFirst({
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
            clientErrorMessage(error, 'Erro ao gerar link do arquivo.'),
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

        if (!(await promotionOwnedByTenant(request.tenantDb, idCliente, idPromocao))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const current = await request.tenantDb.promocaoArquivo.findFirst({
          where: { id: fileId, idPromocao },
          select: { id: true },
        });

        if (!current) {
          return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
        }

        return request.tenantDb.promocaoArquivo.update({
          where: { id: fileId },
          data: { boInativo: true },
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            clientErrorMessage(error, 'Erro ao remover arquivo da promocao.'),
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
      if (!(await promotionBelongsToTenant(request.tenantDb, idCliente, idPromocao))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPromotionChildResourceConfig(request.params.resource);
      if (!childBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      await config.assertTenant(request.tenantDb, idCliente, request.body);
      return reply.code(201).send(await config.delegate(request.tenantDb).create({
        data: config.normalize(idPromocao, request.body),
      }));
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao criar registro relacionado.'),
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
      if (!(await promotionOwnedByTenant(request.tenantDb, idCliente, idPromocao))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPromotionChildResourceConfig(request.params.resource);
      const current = await config.delegate(request.tenantDb).findFirst({ where: { id: childId, idPromocao } });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!childBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      await config.assertTenant(request.tenantDb, idCliente, request.body);
      return config.delegate(request.tenantDb).update({
        where: { id: childId },
        data: config.normalize(idPromocao, request.body),
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao atualizar registro relacionado.'),
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
      if (!(await promotionOwnedByTenant(request.tenantDb, idCliente, idPromocao))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPromotionChildResourceConfig(request.params.resource);
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const current = await config.delegate(request.tenantDb).findFirst({ where: { id: childId, idPromocao } });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return config.delegate(request.tenantDb).update({
        where: { id: childId },
        data: { boInativo: toBool(parsedBody.data.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao alterar status do registro relacionado.'),
      });
    }
  });
}
