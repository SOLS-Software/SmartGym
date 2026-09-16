import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@smartgym/db';
import {
  normalizePlanPayload,
  assertOrdemDasDatas,
  assertValidId,
  numeroNaFaixa,
  optionalNumber,
  optionalDate,
  getMultipartFieldValue,
} from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { assertAllowedUploadType, assertUploadBuffer, getPromotionFilePath } from '../../shared/files.js';
import type { CompanyChildPayload, PlanChildResource, PlanPayload } from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { janelaDoBeneficio } from '../../shared/planBenefits.js';

// ---------------------------------------------------------------------------
// Validacao de entrada
// ---------------------------------------------------------------------------

const queryFlagSchema = z.enum(['true', 'false']).optional();

const queryIntSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().optional(),
);

const listQuerySchema = z.object({
  includeInactive: queryFlagSchema,
  includeDetails: queryFlagSchema,
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
  idProduto: bodyNumberSchema,
  idAtividade: bodyNumberSchema,
  idPromocao: bodyNumberSchema,
  vlVenda: bodyNumberSchema,
  qtDisponivel: bodyNumberSchema,
});

const statusBodySchema = z.object({
  boInativo: z.union([z.boolean(), z.number(), z.string()]).nullish(),
});

function clampLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 1000, 1), 1000);
}

// ---------------------------------------------------------------------------
// Plan child resource config
// ---------------------------------------------------------------------------

type PlanChildDelegate = {
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

// Plano pertence ao CLIENTE (tb_Planos.idCliente, desde 09/2026). Antes o dono
// se deduzia por PlanoEmpresa e "plano sem filial vinculada" era lido como
// global — o que fazia todo plano recem-criado, que nasce sem vinculo, ficar
// visivel a todos os clientes junto com o preco dele.
function planTenantWhere(idCliente: number) {
  return { idCliente };
}

// Filhos do plano (valor, atividade, produto, beneficio) tem idEmpresa
// opcional. Como o PAI ja tem dono, nulo aqui significa "vale em todas as
// filiais DESTE cliente" — nao mais "de todo mundo".
function tenantCompanyWhere(idCliente: number) {
  return { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] };
}

async function planBelongsToTenant(db: PrismaClient, idCliente: number, idPlano: number) {
  const plan = await db.plano.findFirst({
    where: { id: idPlano, idCliente },
    select: { id: true },
  });
  return Boolean(plan);
}

// Leitura e mutacao passaram a exigir a mesma coisa: ser dono. Continua como
// funcao propria porque as rotas distinguem os dois casos na mensagem e no
// codigo de resposta.
const planOwnedByTenant = planBelongsToTenant;

async function assertCompanyInTenant(db: PrismaClient, idCliente: number, idEmpresa: number | null | undefined) {
  if (idEmpresa == null) return;
  const company = await db.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!company) throw new Error('Empresa nao pertence ao cliente.');
}

async function assertProductInTenant(db: PrismaClient, idCliente: number, idProduto: number | null | undefined) {
  if (idProduto == null) return;
  const product = await db.produto.findFirst({
    where: { id: idProduto, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  if (!product) throw new Error('Produto nao pertence ao cliente.');
}

async function assertActivityInTenant(db: PrismaClient, idCliente: number, idAtividade: number | null | undefined) {
  if (idAtividade == null) return;
  const activity = await db.atividade.findFirst({
    where: { id: idAtividade, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  if (!activity) throw new Error('Atividade nao pertence ao cliente.');
}

async function assertPromotionInTenant(db: PrismaClient, idCliente: number, idPromocao: number | null | undefined) {
  if (idPromocao == null) return;
  const promotion = await db.promocao.findFirst({
    where: { id: idPromocao, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  if (!promotion) throw new Error('Promocao nao pertence ao cliente.');
}

// O delegate nao pode ser resolvido no carregamento do modulo: com banco por
// tenant, o client certo so existe no request. A config guarda COMO chegar ao
// delegate, e nao o delegate.
function asPlanChildDelegate(delegate: unknown) {
  return delegate as PlanChildDelegate;
}

const planChildResourceConfig = {
  values: {
    delegate: (db: PrismaClient) => asPlanChildDelegate(db.planoValor),
    childWhere(planId: number): Record<string, unknown> {
      return { idPlano: planId };
    },
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
    },
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        vlVenda: Number(payload.vlVenda ?? 0),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  products: {
    delegate: (db: PrismaClient) => asPlanChildDelegate(db.planoProduto),
    childWhere(planId: number): Record<string, unknown> {
      return { idPlano: planId };
    },
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
      await assertProductInTenant(db, idCliente, optionalNumber(payload.idProduto));
    },
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idProduto: optionalNumber(payload.idProduto),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  companies: {
    delegate: (db: PrismaClient) => asPlanChildDelegate(db.planoEmpresa),
    childWhere(planId: number): Record<string, unknown> {
      return { idPlano: planId };
    },
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
    },
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  activities: {
    delegate: (db: PrismaClient) => asPlanChildDelegate(db.planoAtividade),
    childWhere(planId: number): Record<string, unknown> {
      return { idPlano: planId };
    },
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
      await assertActivityInTenant(db, idCliente, optionalNumber(payload.idAtividade));
    },
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idAtividade: optionalNumber(payload.idAtividade),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  benefits: {
    delegate: (db: PrismaClient) => asPlanChildDelegate(db.planoBeneficio),
    childWhere(planId: number): Record<string, unknown> {
      return { idPlano: planId };
    },
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
      await assertProductInTenant(db, idCliente, optionalNumber(payload.idProduto));
    },
    normalize(planId: number, payload: CompanyChildPayload) {
      const cnTipo = String(payload.cnTipo ?? 'produto').trim().toLowerCase();
      const idProduto = optionalNumber(payload.idProduto);

      // Direito de produto sem produto nao da para entregar: viraria uma linha
      // na tela que a recepcao nao consegue cumprir.
      if (cnTipo === 'produto' && !idProduto) {
        throw new Error('Escolha o produto do beneficio.');
      }

      const qtLimite = optionalNumber(payload.qtLimite) ?? 1;
      if (qtLimite <= 0) throw new Error('A quantidade do beneficio deve ser maior que zero.');

      const cnJanela = janelaDoBeneficio(
        typeof payload.cnJanela === 'string' ? payload.cnJanela : null,
      );
      if (!cnJanela) {
        throw new Error('Informe quando o beneficio se renova: matricula, mes ou ano.');
      }

      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        cnTipo: cnTipo === 'avaliacao' ? 'avaliacao' : cnTipo === 'outro' ? 'outro' : 'produto',
        idProduto: cnTipo === 'produto' ? idProduto : null,
        dsBeneficio: typeof payload.dsBeneficio === 'string' ? payload.dsBeneficio.trim() : '',
        qtLimite,
        cnJanela,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'promotion-plans': {
    delegate: (db: PrismaClient) => asPlanChildDelegate(db.promocaoPlano),
    childWhere(planId: number): Record<string, unknown> {
      return { idPlano: planId };
    },
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
      await assertPromotionInTenant(db, idCliente, optionalNumber(payload.idPromocao));
    },
    normalize(planId: number, payload: CompanyChildPayload) {
      const dtInicio = optionalDate(payload.dtInicio) ?? new Date();
      const dtEncerramento = optionalDate(payload.dtEncerramento) ?? null;
      // Mesma regra da promocao: vigencia que termina antes de comecar some
      // das listagens de vigentes sem que nada acuse.
      assertOrdemDasDatas(
        dtInicio,
        dtEncerramento,
        'O encerramento nao pode ser anterior ao inicio.',
      );

      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idPromocao: optionalNumber(payload.idPromocao),
        qtDisponivel:
          numeroNaFaixa(payload.qtDisponivel ?? 0, 'qtDisponivel', 'A quantidade disponivel') ?? 0,
        dtInicio,
        dtEncerramento,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'promotion-products': {
    delegate: (db: PrismaClient) => asPlanChildDelegate(db.promocaoProduto),
    childWhere(planId: number): Record<string, unknown> {
      return { promocao: { promocaoPlanos: { some: { idPlano: planId } } } };
    },
    async assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload) {
      await assertCompanyInTenant(db, idCliente, optionalNumber(payload.idEmpresa));
      await assertPromotionInTenant(db, idCliente, optionalNumber(payload.idPromocao));
      await assertProductInTenant(db, idCliente, optionalNumber(payload.idProduto));
    },
    normalize(_planId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: optionalNumber(payload.idEmpresa),
        idPromocao: optionalNumber(payload.idPromocao),
        idProduto: optionalNumber(payload.idProduto),
        qtDisponivel: optionalNumber(payload.qtDisponivel),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
} satisfies Record<
  PlanChildResource,
  {
    delegate: (db: PrismaClient) => PlanChildDelegate;
    childWhere(planId: number): Record<string, unknown>;
    assertTenant(db: PrismaClient, idCliente: number, payload: CompanyChildPayload): Promise<void>;
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

async function getPromotionIdsByPlan(db: PrismaClient, idPlano: number) {
  const records = await db.promocaoPlano.findMany({
    where: { idPlano },
    select: { idPromocao: true },
  });

  return records
    .map((record) => record.idPromocao)
    .filter((idPromocao): idPromocao is number => Number.isInteger(idPromocao));
}

async function assertPromotionBelongsToPlan(db: PrismaClient, idPlano: number, idPromocao: number) {
  assertValidId(idPromocao, 'Promocao invalida.');
  const relation = await db.promocaoPlano.findFirst({
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
  }>('/plans', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const includeInactive = parsedQuery.data.includeInactive === 'true';
    const includeDetails = parsedQuery.data.includeDetails === 'true';
    const search = parsedQuery.data.search?.trim();

    return request.tenantDb.plano.findMany({
      take: clampLimit(parsedQuery.data.limit),
      where: {
        ...(includeInactive ? {} : { boInativo: false }),
        ...(search ? { dsPlano: { contains: search, mode: 'insensitive' } } : {}),
        ...planTenantWhere(idCliente),
      },
      include: includeDetails
        ? {
            frequencia: true,
            planoAtividades: {
              where: { boInativo: false, ...tenantCompanyWhere(idCliente) },
              include: { atividade: true },
              orderBy: { id: 'asc' },
            },
            planoProdutos: {
              where: { boInativo: false, ...tenantCompanyWhere(idCliente) },
              include: { produto: true },
              orderBy: { id: 'asc' },
            },
            planoEmpresas: {
              where: { boInativo: false, empresa: { idCliente } },
              include: { empresa: true },
              orderBy: { id: 'asc' },
            },
            planoValores: {
              where: { boInativo: false, ...tenantCompanyWhere(idCliente) },
              include: { empresa: true },
              orderBy: { dtCadastro: 'desc' },
            },
            promocaoPlanos: {
              where: { boInativo: false, ...tenantCompanyWhere(idCliente) },
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizePlanPayload(request.body);
      const existing = await request.tenantDb.plano.findFirst({
        where: {
          dsPlano: { equals: data.dsPlano, mode: 'insensitive' },
          ...planTenantWhere(idCliente),
        },
        select: { id: true },
      });
      if (existing) {
        return reply.code(400).send({ message: 'Já existe um plano com este nome.' });
      }
      // Tenant SEMPRE do token, nunca do body.
      const plan = await request.tenantDb.plano.create({ data: { ...data, idCliente } });
      return reply.code(201).send(plan);
    } catch (error) {
      const isPrismaUnique =
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002';
      return reply.code(400).send({
        message: isPrismaUnique
          ? 'Já existe um plano com este nome.'
          : 'Erro ao criar plano.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: PlanPayload;
  }>('/plans/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Plano invalido.');
      if (!(await planOwnedByTenant(request.tenantDb, idCliente, id))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizePlanPayload(request.body);
      const existing = await request.tenantDb.plano.findFirst({
        where: {
          dsPlano: { equals: data.dsPlano, mode: 'insensitive' },
          id: { not: id },
          ...planTenantWhere(idCliente),
        },
        select: { id: true },
      });
      if (existing) {
        return reply.code(400).send({ message: 'Já existe um plano com este nome.' });
      }
      return request.tenantDb.plano.update({ where: { id }, data });
    } catch (error) {
      const isPrismaUnique =
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002';
      return reply.code(400).send({
        message: isPrismaUnique
          ? 'Já existe um plano com este nome.'
          : 'Erro ao atualizar plano.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/plans/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Plano invalido.');
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await planOwnedByTenant(request.tenantDb, idCliente, id))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const boInativo = toBool(parsedBody.data.boInativo);
      return request.tenantDb.plano.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do plano.' });
    }
  });

  // Plan children - individual GET endpoints

  app.get<{ Params: { id: string } }>('/plans/:id/related/values', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.planoValor.findMany({
        where: { idPlano, ...tenantCompanyWhere(idCliente) },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar valores do plano.'),
      });
    }
  });

  app.get<{ Params: { id: string } }>('/plans/:id/related/products', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.planoProduto.findMany({
        where: { idPlano, ...tenantCompanyWhere(idCliente) },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar produtos do plano.'),
      });
    }
  });

  app.get<{ Params: { id: string } }>('/plans/:id/related/companies', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.planoEmpresa.findMany({
        where: { idPlano, empresa: { idCliente } },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar empresas do plano.'),
      });
    }
  });

  app.get<{ Params: { id: string } }>('/plans/:id/related/benefits', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      return request.tenantDb.planoBeneficio.findMany({
        where: { idPlano },
        include: {
          empresa: { select: { id: true, dsEmpresa: true } },
          produto: { select: { id: true, dsProduto: true } },
        },
        orderBy: { id: 'asc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar beneficios do plano.'),
      });
    }
  });

  app.get<{ Params: { id: string } }>('/plans/:id/related/activities', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return request.tenantDb.planoAtividade.findMany({
        where: { idPlano, ...tenantCompanyWhere(idCliente) },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar atividades do plano.'),
      });
    }
  });

  app.get<{ Params: { id: string } }>(
    '/plans/:id/related/promotion-plans',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPlano = Number(request.params.id);
        assertValidId(idPlano, 'Plano invalido.');
        const parsedQuery = relatedListQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: 'Parametros invalidos.' });
        }
        if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        return request.tenantDb.promocaoPlano.findMany({
          where: { idPlano, ...tenantCompanyWhere(idCliente) },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao listar promocoes do plano.'),
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/plans/:id/related/promotion-products',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPlano = Number(request.params.id);
        assertValidId(idPlano, 'Plano invalido.');
        const parsedQuery = relatedListQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: 'Parametros invalidos.' });
        }
        if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        const promotionIds = await getPromotionIdsByPlan(request.tenantDb, idPlano);

        if (promotionIds.length === 0) {
          return [];
        }

        return request.tenantDb.promocaoProduto.findMany({
          where: { idPromocao: { in: promotionIds }, ...tenantCompanyWhere(idCliente) },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            clientErrorMessage(error, 'Erro ao listar produtos de promocao.'),
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/plans/:id/related/promotion-files',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPlano = Number(request.params.id);
        assertValidId(idPlano, 'Plano invalido.');
        const parsedQuery = relatedListQuerySchema.safeParse(request.query);
        if (!parsedQuery.success) {
          return reply.code(400).send({ message: 'Parametros invalidos.' });
        }
        if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }
        const promotionIds = await getPromotionIdsByPlan(request.tenantDb, idPlano);

        if (promotionIds.length === 0) {
          return [];
        }

        return request.tenantDb.promocaoArquivo.findMany({
          where: { idPromocao: { in: promotionIds } },
          orderBy: { dtCadastro: 'desc' },
          take: clampLimit(parsedQuery.data.limit),
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            clientErrorMessage(error, 'Erro ao listar arquivos de promocao.'),
        });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/plans/:id/related/promotion-files',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPlano = Number(request.params.id);
        assertValidId(idPlano, 'Plano invalido.');
        if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ message: 'Envie um arquivo.' });
        }
        assertAllowedUploadType(file);

        const fields = file.fields as Record<string, unknown>;
        const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao'));
        await assertPromotionBelongsToPlan(request.tenantDb, idPlano, idPromocao);

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

        const promotionFile = await request.tenantDb.promocaoArquivo.create({
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
            clientErrorMessage(error, 'Erro ao enviar arquivo de promocao.'),
        });
      }
    },
  );

  app.put<{ Params: { id: string; fileId: string } }>(
    '/plans/:id/related/promotion-files/:fileId',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPlano = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPlano, 'Plano invalido.');
        assertValidId(fileId, 'Arquivo invalido.');

        if (!(await planOwnedByTenant(request.tenantDb, idCliente, idPlano))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const current = await request.tenantDb.promocaoArquivo.findFirst({
          where: { id: fileId, promocao: { promocaoPlanos: { some: { idPlano } } } },
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
        const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao') || current.idPromocao);
        await assertPromotionBelongsToPlan(request.tenantDb, idPlano, idPromocao);

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
            idPromocao,
            idTiposArquivos: rawFileTypeId ? Number(rawFileTypeId) : current.idTiposArquivos,
            dsArquivo: file.filename,
            anCaminho: path,
          },
        });
      } catch (error) {
        return reply.code(400).send({
          message:
            clientErrorMessage(error, 'Erro ao alterar arquivo de promocao.'),
        });
      }
    },
  );

  app.get<{ Params: { id: string; fileId: string } }>(
    '/plans/:id/related/promotion-files/:fileId/url',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPlano = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPlano, 'Plano invalido.');
        assertValidId(fileId, 'Arquivo invalido.');

        if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const promotionFile = await request.tenantDb.promocaoArquivo.findFirst({
          where: {
            id: fileId,
            boInativo: false,
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
            clientErrorMessage(error, 'Erro ao gerar link do arquivo.'),
        });
      }
    },
  );

  app.delete<{ Params: { id: string; fileId: string } }>(
    '/plans/:id/related/promotion-files/:fileId',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      try {
        const idPlano = Number(request.params.id);
        const fileId = Number(request.params.fileId);
        assertValidId(idPlano, 'Plano invalido.');
        assertValidId(fileId, 'Arquivo invalido.');

        if (!(await planOwnedByTenant(request.tenantDb, idCliente, idPlano))) {
          return reply.code(404).send({ message: 'Registro nao encontrado.' });
        }

        const current = await request.tenantDb.promocaoArquivo.findFirst({
          where: { id: fileId, promocao: { promocaoPlanos: { some: { idPlano } } } },
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
            clientErrorMessage(error, 'Erro ao remover arquivo de promocao.'),
        });
      }
    },
  );

  // Plan children - generic write endpoints

  app.post<{
    Params: { id: string; resource: string };
    Body: CompanyChildPayload;
  }>('/plans/:id/related/:resource', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPlano = Number(request.params.id);
      assertValidId(idPlano, 'Plano invalido.');
      if (!(await planBelongsToTenant(request.tenantDb, idCliente, idPlano))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPlanChildResourceConfig(request.params.resource);
      if (!childBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      await config.assertTenant(request.tenantDb, idCliente, request.body);
      if (request.params.resource === 'promotion-products') {
        const idPromocao = optionalNumber(request.body.idPromocao);
        await assertPromotionBelongsToPlan(request.tenantDb, idPlano, Number(idPromocao));
      }
      const record = await config.delegate(request.tenantDb).create({
        data: config.normalize(idPlano, request.body),
      });
      return reply.code(201).send(record);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar registro relacionado.'),
      });
    }
  });

  app.put<{
    Params: { id: string; resource: string; childId: string };
    Body: CompanyChildPayload;
  }>('/plans/:id/related/:resource/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPlano = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idPlano, 'Plano invalido.');
      assertValidId(childId, 'Registro invalido.');
      if (!(await planOwnedByTenant(request.tenantDb, idCliente, idPlano))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPlanChildResourceConfig(request.params.resource);
      const current = await config.delegate(request.tenantDb).findFirst({
        where: { id: childId, ...config.childWhere(idPlano) },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!childBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      await config.assertTenant(request.tenantDb, idCliente, request.body);
      if (request.params.resource === 'promotion-products') {
        const idPromocao = optionalNumber(request.body.idPromocao);
        await assertPromotionBelongsToPlan(request.tenantDb, idPlano, Number(idPromocao));
      }
      return config.delegate(request.tenantDb).update({
        where: { id: childId },
        data: config.normalize(idPlano, request.body),
      });
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao atualizar registro relacionado.'),
      });
    }
  });

  app.patch<{
    Params: { id: string; resource: string; childId: string };
    Body: { boInativo?: number };
  }>('/plans/:id/related/:resource/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idPlano = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idPlano, 'Plano invalido.');
      assertValidId(childId, 'Registro invalido.');
      if (!(await planOwnedByTenant(request.tenantDb, idCliente, idPlano))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const config = getPlanChildResourceConfig(request.params.resource);
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const current = await config.delegate(request.tenantDb).findFirst({
        where: { id: childId, ...config.childWhere(idPlano) },
      });
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
