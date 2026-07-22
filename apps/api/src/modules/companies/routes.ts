import { z } from 'zod';
import { Prisma } from '@smartgym/db';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import {
  normalizeCompanyPayload,
  assertValidId,
  optionalNumber,
  requiredText,
  optionalText,
  optionalDate,
  getMultipartFieldValue,
} from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { getStudentAccessStatus } from '../../shared/studentAccess.js';
import { assertAllowedUploadType, assertUploadBuffer, getCompanyFilePath, getPromotionFilePath } from '../../shared/files.js';
import type { CompanyChildPayload, CompanyChildResource, CompanyPayload } from '../../shared/api-types.js';

// ---------------------------------------------------------------------------
// Company child resource config
// ---------------------------------------------------------------------------

type CrudDelegate = {
  findMany(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

type ChildResourceConfig = {
  delegate: CrudDelegate;
  orderBy: Record<string, string>;
  companyField: string | null;
  include?: Record<string, unknown>;
  getWhere?(companyId: number): Record<string, unknown>;
  normalize(companyId: number, payload: CompanyChildPayload): Record<string, unknown>;
};

function asCrudDelegate(delegate: unknown) {
  return delegate as CrudDelegate;
}

const childResourceConfig: Record<CompanyChildResource, ChildResourceConfig> = {
  promotions: {
    delegate: asCrudDelegate(prisma.promocao),
    orderBy: { dsPromocao: 'asc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        dsPromocao: requiredText(payload.dsPromocao, 'Informe a promocao.'),
        qtPeriodo: Number(payload.qtPeriodo ?? 0),
        idUnidadeTempo: optionalNumber(payload.idUnidadeTempo),
        vlDesconto: Number(payload.vlDesconto ?? 0),
        pcDesconto: Number(payload.pcDesconto ?? 0),
        dtInicio: optionalDate(payload.dtInicio) ?? new Date(),
        dtEncerramento: optionalDate(payload.dtEncerramento) ?? null,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'promotion-products': {
    delegate: asCrudDelegate(prisma.promocaoProduto),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idPromocao: optionalNumber(payload.idPromocao),
        idProduto: optionalNumber(payload.idProduto),
        qtDisponivel: optionalNumber(payload.qtDisponivel),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'promotion-files': {
    delegate: asCrudDelegate(prisma.promocaoArquivo),
    orderBy: { dtCadastro: 'desc' },
    companyField: null,
    getWhere(companyId: number) {
      return { promocao: { idEmpresa: companyId } };
    },
    normalize(_companyId: number, payload: CompanyChildPayload) {
      return {
        idPromocao: optionalNumber(payload.idPromocao),
        idTiposArquivos: optionalNumber(payload.idTiposArquivos),
        dsArquivo: requiredText(payload.dsArquivo, 'Informe o arquivo.'),
        anCaminho: optionalText(payload.anCaminho),
        cnChaveAcesso: optionalNumber(payload.cnChaveAcesso),
        cnDistribuidor: optionalNumber(payload.cnDistribuidor),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'student-plans': {
    delegate: asCrudDelegate(prisma.alunoPlano),
    orderBy: { dtCadastro: 'desc' },
    companyField: null,
    getWhere(companyId: number) {
      // AlunoPlano nao tem mais idEmpresa: escopa via PlanoEmpresa (acesso multi-empresa)
      return { plano: { planoEmpresas: { some: { idEmpresa: companyId } } } };
    },
    include: {
      aluno: true,
      plano: true,
      promocaoPlano: {
        include: {
          promocao: true,
        },
      },
    },
    normalize(_companyId: number, payload: CompanyChildPayload) {
      const idAluno = optionalNumber(payload.idAluno);
      if (!idAluno) throw new Error('Selecione o aluno.');
      const idPlano = optionalNumber(payload.idPlano);
      if (!idPlano) throw new Error('Selecione o plano.');
      return {
        idAluno,
        idPlano,
        idPromocaoPlano: optionalNumber(payload.idPromocaoPlano),
        nrDiaPagamento: Number(payload.nrDiaPagamento ?? 1),
        dtAdmissao: optionalDate(payload.dtAdmissao) ?? new Date(),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  payments: {
    delegate: asCrudDelegate(prisma.pagamento),
    orderBy: { dtPagamento: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      const idStatusPagamento = optionalNumber(payload.idStatusPagamento);
      if (!idStatusPagamento) throw new Error('Informe o status do pagamento.');
      return {
        idEmpresa: companyId,
        idAlunoPlano: optionalNumber(payload.idAlunoPlano),
        idProdutoMovimentacao: optionalNumber(payload.idProdutoMovimentacao),
        vlPrevisto: Number(payload.vlPrevisto ?? payload.vlPago ?? 0),
        vlPago: optionalNumber(payload.vlPago),
        idStatusPagamento,
        idFormaPagamento: optionalNumber(payload.idFormaPagamento),
        dtVencimento: optionalDate(payload.dtVencimento),
        dtCompetencia: optionalDate(payload.dtCompetencia),
        dtPagamento: optionalDate(payload.dtPagamento) ?? new Date(),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'product-movements': {
    delegate: asCrudDelegate(prisma.produtoMovimentacao),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    include: {
      aluno: true,
      produto: true,
    },
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idProduto: optionalNumber(payload.idProduto),
        idAluno: optionalNumber(payload.idAluno),
        qtMovimentada: Number(payload.qtMovimentada ?? 0),
        vlUnitario: Number(payload.vlUnitario ?? 0),
        qtDisponivel: Number(payload.qtDisponivel ?? 0),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  purchases: {
    delegate: asCrudDelegate(prisma.produtoMovimentacao),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    include: {
      produto: true,
      fornecedor: true,
    },
    getWhere(companyId: number) {
      return { idEmpresa: companyId, idFornecedor: { not: null } };
    },
    normalize(companyId: number, payload: CompanyChildPayload) {
      const idProduto = optionalNumber(payload.idProduto);
      if (!idProduto) throw new Error('Selecione o produto.');
      const idFornecedor = optionalNumber(payload.idFornecedor);
      if (!idFornecedor) throw new Error('Selecione o fornecedor.');
      const qtMovimentada = Number(payload.qtMovimentada ?? 0);
      if (qtMovimentada <= 0) throw new Error('Informe uma quantidade valida.');
      return {
        idEmpresa: companyId,
        idProduto,
        idFornecedor,
        idAluno: null,
        qtMovimentada,
        vlUnitario: Number(payload.vlUnitario ?? 0),
        qtDisponivel: 0,
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'company-files': {
    delegate: asCrudDelegate(prisma.empresaArquivo),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idTiposArquivos: optionalNumber(payload.idTiposArquivos),
        dsArquivo: requiredText(payload.dsArquivo, 'Informe o arquivo.'),
        anCaminho: optionalText(payload.anCaminho),
        cnChaveAcesso: optionalNumber(payload.cnChaveAcesso),
        cnDistribuidor: optionalNumber(payload.cnDistribuidor),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  'student-check-ins': {
    delegate: asCrudDelegate(prisma.alunoCheckIn),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idAlunoPlano: optionalNumber(payload.idAlunoPlano),
        idAlunoTreinosSequencia: optionalNumber(payload.idAlunoTreinosSequencia),
        idPontuacao: optionalNumber(payload.idPontuacao),
        idTipoCheckIn: optionalNumber(payload.idTipoCheckIn),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  points: {
    delegate: asCrudDelegate(prisma.pontuacao),
    orderBy: { dsPontuacao: 'asc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        dsPontuacao: requiredText(payload.dsPontuacao, 'Informe a descricao da pontuacao.'),
        qtPontos: Number(payload.qtPontos ?? 0),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
  themes: {
    delegate: asCrudDelegate(prisma.tema),
    orderBy: { dsTema: 'asc' },
    companyField: null,
    normalize(_companyId: number, payload: CompanyChildPayload) {
      return {
        dsTema: requiredText(payload.dsTema, 'Informe o tema.'),
        boInativo: toBool(payload.boInativo),
      };
    },
  },
};

function getChildResourceConfig(resource: string) {
  const config = childResourceConfig[resource as CompanyChildResource];
  if (!config) {
    throw new Error('Tabela filha invalida.');
  }
  return config;
}

// ---------------------------------------------------------------------------
// Validacao de entrada (zod)
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

/** Valida a query de listagem; limit sofre clamp 1..1000 (default 1000). */
function parseListQuery(query: unknown) {
  const parsed = listQuerySchema.safeParse(query ?? {});
  if (!parsed.success) return null;
  const limit = Math.min(1000, Math.max(1, parsed.data.limit ?? 1000));
  return { search: parsed.data.search, limit };
}

// Body de status: aceita os mesmos tipos que toBool trata.
const statusBodySchema = z.object({
  boInativo: z.union([z.boolean(), z.number(), z.string()]).optional(),
});

// Bodies genericos (children/custom-theme): garante objeto antes do normalize.
const looseBodySchema = z.record(z.unknown());

// ---------------------------------------------------------------------------
// Company geo (PostGIS): geoEmpresa is an Unsupported geometry column, so it is
// read/written with raw SQL (same pattern as Localidade). Address scalars go
// through Prisma; only the point needs raw access.
// ---------------------------------------------------------------------------

// geoEmpresa is decomposed into latitude/longitude so the client can edit it.
const COMPANY_SELECT_COLUMNS = Prisma.sql`
  id, "idCliente", "idTema", "dsEmpresa", "caCNPJ",
  "anCEP", "anLogradouro", "nrEndereco", "anBairro", "anCidade", "anUF",
  "nrDDD", "nrContato",
  ST_Y("geoEmpresa") as latitude, ST_X("geoEmpresa") as longitude,
  "dtCadastro", "dtAlteracao", "idUsuarioCadastro", "idUsuarioAlteracao", "boInativo"
`;

/** Parses latitude/longitude from a company payload, validating ranges when present. */
function parseCompanyGeo(payload: CompanyPayload) {
  const latitude = optionalNumber(payload.latitude);
  const longitude = optionalNumber(payload.longitude);
  if (latitude === null && longitude === null) {
    return { hasGeo: false as const, latitude: null, longitude: null };
  }
  if (latitude === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Informe uma latitude valida.');
  }
  if (longitude === null || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Informe uma longitude valida.');
  }
  return { hasGeo: true as const, latitude, longitude };
}

/** Confere se a empresa pertence ao tenant (idCliente) do usuario autenticado. */
async function companyBelongsToTenant(companyId: number, idCliente: number) {
  const company = await prisma.empresa.findFirst({
    where: { id: companyId, idCliente },
    select: { id: true },
  });
  return Boolean(company);
}

/**
 * Confere se o registro filho pertence a empresa informada. Recursos sem
 * escopo de empresa (themes) sao globais e passam direto.
 */
async function childBelongsToCompany(config: ChildResourceConfig, companyId: number, childId: number) {
  const scope = config.getWhere
    ? config.getWhere(companyId)
    : config.companyField
      ? { [config.companyField]: companyId }
      : null;
  if (!scope) return true;
  const rows = (await config.delegate.findMany({
    where: { id: childId, ...scope },
    take: 1,
  })) as unknown[];
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerCompanyRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/companies', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = parseListQuery(request.query);
    if (!query) return reply.code(400).send({ message: 'Parametros invalidos.' });
    const search = query.search?.trim();
    // Tenant sempre presente; search entra como condicao adicional.
    const conditions = [Prisma.sql`"idCliente" = ${idCliente}`];
    if (search) {
      const digits = search.replace(/\D/g, '');
      // Only match on CNPJ when the term actually has digits, otherwise a plain
      // text search would widen to every row via LIKE '%%'.
      if (digits) {
        conditions.push(
          Prisma.sql`("dsEmpresa" ILIKE ${`%${search}%`} OR "caCNPJ" LIKE ${`%${digits}%`})`,
        );
      } else {
        conditions.push(Prisma.sql`"dsEmpresa" ILIKE ${`%${search}%`}`);
      }
    }
    return prisma.$queryRaw`
      SELECT ${COMPANY_SELECT_COLUMNS} FROM "tb_Empresas"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY "dsEmpresa" ASC
      LIMIT ${query.limit}`;
  });

  app.post<{
    Body: CompanyPayload;
  }>('/companies', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      // idCliente vem sempre do token: o body nunca define o tenant.
      const data = normalizeCompanyPayload({ ...request.body, idCliente });
      const geo = parseCompanyGeo(request.body);
      const company = await prisma.$transaction(async (tx) => {
        const created = await tx.empresa.create({ data });
        if (geo.hasGeo) {
          await tx.$executeRaw`UPDATE "tb_Empresas" SET "geoEmpresa" = ST_SetSRID(ST_MakePoint(${geo.longitude}, ${geo.latitude}), 4326) WHERE id = ${created.id}`;
        }
        return created;
      });
      return reply.code(201).send({ ...company, latitude: geo.latitude, longitude: geo.longitude });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar empresa.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: CompanyPayload;
  }>('/companies/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(id, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      // idCliente vem sempre do token: o body nunca define o tenant.
      const data = normalizeCompanyPayload({ ...request.body, idCliente });
      const geo = parseCompanyGeo(request.body);
      const company = await prisma.$transaction(async (tx) => {
        const updated = await tx.empresa.update({ where: { id }, data });
        if (geo.hasGeo) {
          await tx.$executeRaw`UPDATE "tb_Empresas" SET "geoEmpresa" = ST_SetSRID(ST_MakePoint(${geo.longitude}, ${geo.latitude}), 4326) WHERE id = ${id}`;
        }
        return updated;
      });
      return { ...company, latitude: geo.latitude, longitude: geo.longitude };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar empresa.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/companies/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(id, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const body = statusBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ message: 'Dados invalidos.' });
      const boInativo = toBool(body.data.boInativo);
      return prisma.empresa.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da empresa.' });
    }
  });

  // Company files

  app.get<{
    Params: { id: string };
  }>('/companies/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = parseListQuery(request.query);
    if (!query) return reply.code(400).send({ message: 'Parametros invalidos.' });
    try {
      const idEmpresa = Number(request.params.id);
      assertValidId(idEmpresa, 'Empresa invalida.');
      return prisma.empresaArquivo.findMany({
        where: { idEmpresa, boInativo: false, empresa: { idCliente } },
        orderBy: { dtCadastro: 'desc' },
        take: query.limit,
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar arquivos da empresa.',
      });
    }
  });

  app.post<{
    Params: { id: string };
  }>('/companies/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEmpresa = Number(request.params.id);
      assertValidId(idEmpresa, 'Empresa invalida.');

      if (!(await companyBelongsToTenant(idEmpresa, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const dsArquivo = file.filename;
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;

      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getCompanyFilePath(idEmpresa, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const companyFile = await prisma.empresaArquivo.create({
        data: { idEmpresa, idTiposArquivos, dsArquivo, anCaminho: path, cnChaveAcesso: 0, cnDistribuidor: 0 },
      });

      return reply.code(201).send(companyFile);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao enviar arquivo da empresa.',
      });
    }
  });

  app.put<{
    Params: { id: string; fileId: string };
  }>('/companies/:id/files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await prisma.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false, empresa: { idCliente } },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const dsArquivo = file.filename;
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : existingFile.idTiposArquivos;

      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getCompanyFilePath(idEmpresa, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return prisma.empresaArquivo.update({
        where: { id: fileId },
        data: { idTiposArquivos, dsArquivo, anCaminho: path },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar arquivo da empresa.',
      });
    }
  });

  app.get<{
    Params: { id: string; fileId: string };
  }>('/companies/:id/files/:fileId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const companyFile = await prisma.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false, empresa: { idCliente } },
      });

      if (!companyFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(companyFile.anCaminho, 60 * 5);

      if (error) {
        throw new Error(error.message);
      }

      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.',
      });
    }
  });

  app.delete<{
    Params: { id: string; fileId: string };
  }>('/companies/:id/files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await prisma.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false, empresa: { idCliente } },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return prisma.empresaArquivo.update({ where: { id: fileId }, data: { boInativo: true } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo da empresa.',
      });
    }
  });

  // Company children (generic)

  app.get<{
    Params: { companyId: string };
  }>('/companies/:companyId/promotion-files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = parseListQuery(request.query);
    if (!query) return reply.code(400).send({ message: 'Parametros invalidos.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      return prisma.promocaoArquivo.findMany({
        where: { promocao: { idEmpresa: companyId, empresa: { idCliente } } },
        orderBy: { dtCadastro: 'desc' },
        take: query.limit,
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar arquivos de promocao.',
      });
    }
  });

  app.post<{
    Params: { companyId: string };
  }>('/companies/:companyId/promotion-files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Envie um arquivo.' });
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao'));
      assertValidId(idPromocao, 'Promocao invalida.');
      const promotion = await prisma.promocao.findFirst({ where: { id: idPromocao, idEmpresa: companyId, empresa: { idCliente } }, select: { id: true } });
      if (!promotion) return reply.code(404).send({ message: 'Promocao nao encontrada.' });

      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getPromotionFilePath(idPromocao, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      return reply.code(201).send(await prisma.promocaoArquivo.create({
        data: { idPromocao, idTiposArquivos, dsArquivo: file.filename, anCaminho: path, cnChaveAcesso: 0, cnDistribuidor: 0 },
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao enviar arquivo de promocao.',
      });
    }
  });

  app.put<{
    Params: { companyId: string; fileId: string };
  }>('/companies/:companyId/promotion-files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const current = await prisma.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId, empresa: { idCliente } } },
      });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });

      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Envie um arquivo.' });
      assertAllowedUploadType(file);
      const fields = file.fields as Record<string, unknown>;
      const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao') || current.idPromocao);
      assertValidId(idPromocao, 'Promocao invalida.');
      const promotion = await prisma.promocao.findFirst({ where: { id: idPromocao, idEmpresa: companyId, empresa: { idCliente } }, select: { id: true } });
      if (!promotion) return reply.code(404).send({ message: 'Promocao nao encontrada.' });

      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getPromotionFilePath(idPromocao, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

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
        message: error instanceof Error ? error.message : 'Erro ao alterar arquivo de promocao.',
      });
    }
  });

  app.get<{
    Params: { companyId: string; fileId: string };
  }>('/companies/:companyId/promotion-files/:fileId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const promotionFile = await prisma.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId, empresa: { idCliente } }, boInativo: false },
      });
      if (!promotionFile) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(promotionFile.anCaminho, 60 * 5);
      if (error) throw new Error(error.message);
      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.',
      });
    }
  });

  app.delete<{
    Params: { companyId: string; fileId: string };
  }>('/companies/:companyId/promotion-files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const current = await prisma.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId, empresa: { idCliente } } },
        select: { id: true },
      });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      return prisma.promocaoArquivo.update({ where: { id: fileId }, data: { boInativo: true } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo de promocao.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Custom theme
  // ---------------------------------------------------------------------------

  app.get<{
    Params: { companyId: string };
  }>('/companies/:companyId/custom-theme', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }
      const tema = await prisma.temaCustomizado.findUnique({
        where: { idEmpresa: companyId },
        include: { arquivoLogo: true, arquivoFavicon: true },
      });
      if (!tema) return reply.code(204).send();
      return tema;
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao buscar tema.',
      });
    }
  });

  app.put<{
    Params: { companyId: string };
    Body: Record<string, unknown>;
  }>('/companies/:companyId/custom-theme', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }
      if (!looseBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const b = request.body;
      const data = {
        corPrimaria: optionalText(b.corPrimaria) ?? '#000000',
        corSecundaria: optionalText(b.corSecundaria) ?? '#FFFFFF',
        corAcentuacao: optionalText(b.corAcentuacao) ?? '#FF0000',
        corTexto: optionalText(b.corTexto) ?? '#000000',
        corFundo: optionalText(b.corFundo) ?? '#FFFFFF',
        fontePrincipal: optionalText(b.fontePrincipal) ?? 'Inter',
        fonteSecundaria: optionalText(b.fonteSecundaria) ?? 'Open Sans',
        tamanhoBase: Number(b.tamanhoBase ?? 14),
        espacamentoPadrao: Number(b.espacamentoPadrao ?? 16),
        raioCardBorder: Number(b.raioCardBorder ?? 8),
        boModoEscuro: toBool(b.boModoEscuro ?? false),
        idArquivoLogo: optionalNumber(b.idArquivoLogo),
        idArquivoFavicon: optionalNumber(b.idArquivoFavicon),
      };
      const tema = await prisma.temaCustomizado.upsert({
        where: { idEmpresa: companyId },
        create: { idEmpresa: companyId, ...data },
        update: data,
        include: { arquivoLogo: true, arquivoFavicon: true },
      });
      return tema;
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao salvar tema.',
      });
    }
  });

  app.get<{
    Params: { companyId: string; resource: string };
  }>('/companies/:companyId/children/:resource', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = parseListQuery(request.query);
    if (!query) return reply.code(400).send({ message: 'Parametros invalidos.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }
      const config = getChildResourceConfig(request.params.resource);
      const where = config.getWhere
        ? config.getWhere(companyId)
        : config.companyField
          ? { [config.companyField]: companyId }
          : undefined;
      return await config.delegate.findMany({
        where,
        orderBy: config.orderBy,
        take: query.limit,
        ...(config.include ? { include: config.include } : {}),
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar registros filhos.',
      });
    }
  });

  app.post<{
    Params: { companyId: string; resource: string };
    Body: CompanyChildPayload;
  }>('/companies/:companyId/children/:resource', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      if (!(await companyBelongsToTenant(companyId, idCliente))) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }
      const config = getChildResourceConfig(request.params.resource);
      if (!looseBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const data = config.normalize(companyId, request.body) as Record<string, unknown>;
      if (request.params.resource === 'student-check-ins') {
        if (!data.idAluno && data.idAlunoPlano) {
          const plan = await prisma.alunoPlano.findUnique({
            where: { id: Number(data.idAlunoPlano) },
            select: { idAluno: true },
          });
          if (!plan) throw new Error('Plano do aluno invalido.');
          data.idAluno = plan.idAluno;
        }
        const access = await getStudentAccessStatus(prisma, Number(data.idAluno));
        if (!access.canAccess) {
          throw new Error(access.reason ?? 'Aluno sem acesso liberado para check-in.');
        }
      }
      if (request.params.resource === 'purchases') {
        const created = await prisma.$transaction(async (tx) => {
          const movement = await tx.produtoMovimentacao.create({ data: data as never });
          const product = await tx.produto.update({
            where: { id: Number(data.idProduto) },
            data: { qtEstoque: { increment: Number(data.qtMovimentada) } },
          });
          return tx.produtoMovimentacao.update({
            where: { id: movement.id },
            data: { qtDisponivel: product.qtEstoque },
            include: config.include,
          });
        });
        return reply.code(201).send(created);
      }
      return reply.code(201).send(await config.delegate.create({ data }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar registro filho.',
      });
    }
  });

  app.put<{
    Params: { companyId: string; resource: string; childId: string };
    Body: CompanyChildPayload;
  }>('/companies/:companyId/children/:resource/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const childId = Number(request.params.childId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(childId, 'Registro invalido.');
      const config = getChildResourceConfig(request.params.resource);
      if (!(await companyBelongsToTenant(companyId, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!(await childBelongsToCompany(config, companyId, childId))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!looseBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const data = config.normalize(companyId, request.body) as Record<string, unknown>;
      if (request.params.resource === 'purchases') {
        const existing = await prisma.produtoMovimentacao.findUnique({ where: { id: childId } });
        if (!existing) throw new Error('Compra nao encontrada.');
        const updated = await prisma.$transaction(async (tx) => {
          if (existing.boInativo === false) {
            await tx.produto.update({
              where: { id: existing.idProduto },
              data: { qtEstoque: { decrement: existing.qtMovimentada } },
            });
          }
          let product = null;
          if (data.boInativo === false) {
            product = await tx.produto.update({
              where: { id: Number(data.idProduto) },
              data: { qtEstoque: { increment: Number(data.qtMovimentada) } },
            });
          } else {
            product = await tx.produto.findUnique({ where: { id: Number(data.idProduto) } });
          }
          return tx.produtoMovimentacao.update({
            where: { id: childId },
            data: { ...data, qtDisponivel: product?.qtEstoque ?? 0 },
            include: config.include,
          });
        });
        return updated;
      }
      return await config.delegate.update({ where: { id: childId }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar registro filho.',
      });
    }
  });

  app.patch<{
    Params: { companyId: string; resource: string; childId: string };
    Body: { boInativo?: number };
  }>('/companies/:companyId/children/:resource/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const companyId = Number(request.params.companyId);
      const childId = Number(request.params.childId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(childId, 'Registro invalido.');
      const config = getChildResourceConfig(request.params.resource);
      if (!(await companyBelongsToTenant(companyId, idCliente))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      if (!(await childBelongsToCompany(config, companyId, childId))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const body = statusBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ message: 'Dados invalidos.' });
      const nextInativo = toBool(body.data.boInativo);
      if (request.params.resource === 'purchases') {
        const existing = await prisma.produtoMovimentacao.findUnique({ where: { id: childId } });
        if (!existing) throw new Error('Compra nao encontrada.');
        return await prisma.$transaction(async (tx) => {
          if (existing.boInativo !== nextInativo) {
            const delta = nextInativo ? -existing.qtMovimentada : existing.qtMovimentada;
            await tx.produto.update({
              where: { id: existing.idProduto },
              data: { qtEstoque: { increment: delta } },
            });
          }
          return tx.produtoMovimentacao.update({
            where: { id: childId },
            data: { boInativo: nextInativo },
            include: config.include,
          });
        });
      }
      return await config.delegate.update({
        where: { id: childId },
        data: { boInativo: nextInativo },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status do registro filho.',
      });
    }
  });
}
