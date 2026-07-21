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
import { getPromotionFilePath } from '../../shared/files.js';
import type { CompanyChildPayload } from '../../shared/api-types.js';

type PromotionChildResource = 'promotion-plans' | 'promotion-products';

type PromotionChildDelegate = {
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

function asPromotionChildDelegate(delegate: unknown) {
  return delegate as PromotionChildDelegate;
}

const promotionChildResourceConfig = {
  'promotion-plans': {
    delegate: asPromotionChildDelegate(prisma.promocaoPlano),
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
  const qtPeriodo = Number(payload.qtPeriodo ?? 0);
  if (qtPeriodo < 0) throw new Error('Periodo nao pode ser negativo.');
  const vlDesconto = Number(payload.vlDesconto ?? 0);
  if (vlDesconto < 0) throw new Error('Valor de desconto nao pode ser negativo.');
  const pcDesconto = Number(payload.pcDesconto ?? 0);
  if (pcDesconto < 0 || pcDesconto > 100) throw new Error('Percentual de desconto deve estar entre 0 e 100.');
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
  }>('/promotions', async (request) => {
    const companyId = optionalNumber(request.query.companyId);
    const currentOnly = request.query.currentOnly === 'true';
    const includeDetails = request.query.includeDetails === 'true';
    const includeInactive = request.query.includeInactive === 'true';
    const search = request.query.search?.trim();
    const now = new Date();

    return prisma.promocao.findMany({
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
      },
      include: includeDetails
        ? {
            empresa: true,
            unidadeTempo: true,
            promocaoPlanos: {
              where: { boInativo: false },
              include: { empresa: true, plano: true },
              orderBy: { dtCadastro: 'desc' },
            },
            promocaoProdutos: {
              where: { boInativo: false },
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
    try {
      const data = normalizePromotionPayload(request.body);
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
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Promocao invalida.');
      const data = normalizePromotionPayload(request.body);
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
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Promocao invalida.');
      return prisma.promocao.update({
        where: { id },
        data: { boInativo: toBool(request.body.boInativo) },
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
      try {
        const idPromocao = Number(request.params.id);
        assertValidId(idPromocao, 'Promocao invalida.');
        return prisma.promocaoPlano.findMany({
          where: { idPromocao },
          orderBy: { dtCadastro: 'desc' },
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
      try {
        const idPromocao = Number(request.params.id);
        assertValidId(idPromocao, 'Promocao invalida.');
        return prisma.promocaoProduto.findMany({
          where: { idPromocao },
          orderBy: { dtCadastro: 'desc' },
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
      try {
        const idPromocao = Number(request.params.id);
        assertValidId(idPromocao, 'Promocao invalida.');
        return prisma.promocaoArquivo.findMany({
          where: { idPromocao },
          orderBy: { dtCadastro: 'desc' },
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
      try {
        const idPromocao = Number(request.params.id);
        assertValidId(idPromocao, 'Promocao invalida.');

        const promotion = await prisma.promocao.findUnique({
          where: { id: idPromocao },
          select: { id: true },
        });

        if (!promotion) {
          return reply.code(404).send({ message: 'Promocao nao encontrada.' });
        }

        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ message: 'Envie um arquivo.' });
        }

        const fields = file.fields as Record<string, unknown>;
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
      try {
        const idPromocao = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPromocao, 'Promocao invalida.');
        assertValidId(fileId, 'Arquivo invalido.');

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

        const fields = file.fields as Record<string, unknown>;
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
      try {
        const idPromocao = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPromocao, 'Promocao invalida.');
        assertValidId(fileId, 'Arquivo invalido.');

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
      try {
        const idPromocao = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPromocao, 'Promocao invalida.');
        assertValidId(fileId, 'Arquivo invalido.');

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
    try {
      const idPromocao = Number(request.params.id);
      assertValidId(idPromocao, 'Promocao invalida.');
      const config = getPromotionChildResourceConfig(request.params.resource);
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
    try {
      const idPromocao = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idPromocao, 'Promocao invalida.');
      assertValidId(childId, 'Registro invalido.');
      const config = getPromotionChildResourceConfig(request.params.resource);
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
    Params: { resource: string; childId: string };
    Body: { boInativo?: number };
  }>('/promotions/:id/related/:resource/:childId/status', async (request, reply) => {
    try {
      const childId = Number(request.params.childId);
      assertValidId(childId, 'Registro invalido.');
      const config = getPromotionChildResourceConfig(request.params.resource);
      return config.delegate.update({
        where: { id: childId },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao alterar status do registro relacionado.',
      });
    }
  });
}
