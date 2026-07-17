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
import { getCompanyFilePath, getPromotionFilePath } from '../../shared/files.js';
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
// Company geo (PostGIS): geoEmpresa is an Unsupported geometry column, so it is
// read/written with raw SQL (same pattern as Localidade). Address scalars go
// through Prisma; only the point needs raw access.
// ---------------------------------------------------------------------------

// geoEmpresa is decomposed into latitude/longitude so the client can edit it.
const COMPANY_SELECT_COLUMNS = `
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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerCompanyRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/companies', async (request) => {
    const search = request.query.search?.trim();
    if (search) {
      const digits = search.replace(/\D/g, '');
      // Only match on CNPJ when the term actually has digits, otherwise a plain
      // text search would widen to every row via LIKE '%%'.
      if (digits) {
        return prisma.$queryRawUnsafe(
          `SELECT ${COMPANY_SELECT_COLUMNS} FROM "tb_Empresas"
           WHERE "dsEmpresa" ILIKE $1 OR "caCNPJ" LIKE $2
           ORDER BY "dsEmpresa" ASC`,
          `%${search}%`,
          `%${digits}%`,
        );
      }
      return prisma.$queryRawUnsafe(
        `SELECT ${COMPANY_SELECT_COLUMNS} FROM "tb_Empresas"
         WHERE "dsEmpresa" ILIKE $1
         ORDER BY "dsEmpresa" ASC`,
        `%${search}%`,
      );
    }
    return prisma.$queryRawUnsafe(
      `SELECT ${COMPANY_SELECT_COLUMNS} FROM "tb_Empresas" ORDER BY "dsEmpresa" ASC`,
    );
  });

  app.post<{
    Body: CompanyPayload;
  }>('/companies', async (request, reply) => {
    try {
      const data = normalizeCompanyPayload(request.body);
      const geo = parseCompanyGeo(request.body);
      const company = await prisma.$transaction(async (tx) => {
        const created = await tx.empresa.create({ data });
        if (geo.hasGeo) {
          await tx.$executeRawUnsafe(
            `UPDATE "tb_Empresas" SET "geoEmpresa" = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
            geo.longitude,
            geo.latitude,
            created.id,
          );
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
    try {
      const id = Number(request.params.id);
      const data = normalizeCompanyPayload(request.body);
      const geo = parseCompanyGeo(request.body);
      const company = await prisma.$transaction(async (tx) => {
        const updated = await tx.empresa.update({ where: { id }, data });
        if (geo.hasGeo) {
          await tx.$executeRawUnsafe(
            `UPDATE "tb_Empresas" SET "geoEmpresa" = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
            geo.longitude,
            geo.latitude,
            id,
          );
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
    try {
      const id = Number(request.params.id);
      const boInativo = toBool(request.body.boInativo);
      return prisma.empresa.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da empresa.' });
    }
  });

  // Company files

  app.get<{
    Params: { id: string };
  }>('/companies/:id/files', async (request, reply) => {
    try {
      const idEmpresa = Number(request.params.id);
      assertValidId(idEmpresa, 'Empresa invalida.');
      return prisma.empresaArquivo.findMany({
        where: { idEmpresa, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
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
    try {
      const idEmpresa = Number(request.params.id);
      assertValidId(idEmpresa, 'Empresa invalida.');

      const company = await prisma.empresa.findUnique({
        where: { id: idEmpresa },
        select: { id: true },
      });

      if (!company) {
        return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const dsArquivo = file.filename;
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;

      const buffer = await file.toBuffer();
      const path = getCompanyFilePath(idEmpresa, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

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
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await prisma.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const dsArquivo = file.filename;
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : existingFile.idTiposArquivos;

      const buffer = await file.toBuffer();
      const path = getCompanyFilePath(idEmpresa, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

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
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const companyFile = await prisma.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false },
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
    try {
      const idEmpresa = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idEmpresa, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await prisma.empresaArquivo.findFirst({
        where: { id: fileId, idEmpresa, boInativo: false },
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
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      return prisma.promocaoArquivo.findMany({
        where: { promocao: { idEmpresa: companyId } },
        orderBy: { dtCadastro: 'desc' },
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
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Envie um arquivo.' });

      const fields = file.fields as Record<string, unknown>;
      const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao'));
      assertValidId(idPromocao, 'Promocao invalida.');
      const promotion = await prisma.promocao.findFirst({ where: { id: idPromocao, idEmpresa: companyId }, select: { id: true } });
      if (!promotion) return reply.code(404).send({ message: 'Promocao nao encontrada.' });

      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
      const buffer = await file.toBuffer();
      const path = getPromotionFilePath(idPromocao, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });
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
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const current = await prisma.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId } },
      });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });

      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Envie um arquivo.' });
      const fields = file.fields as Record<string, unknown>;
      const idPromocao = Number(getMultipartFieldValue(fields, 'idPromocao') || current.idPromocao);
      assertValidId(idPromocao, 'Promocao invalida.');
      const promotion = await prisma.promocao.findFirst({ where: { id: idPromocao, idEmpresa: companyId }, select: { id: true } });
      if (!promotion) return reply.code(404).send({ message: 'Promocao nao encontrada.' });

      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const buffer = await file.toBuffer();
      const path = getPromotionFilePath(idPromocao, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });
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
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const promotionFile = await prisma.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId }, boInativo: false },
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
    try {
      const companyId = Number(request.params.companyId);
      const fileId = Number(request.params.fileId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(fileId, 'Arquivo invalido.');
      const current = await prisma.promocaoArquivo.findFirst({
        where: { id: fileId, promocao: { idEmpresa: companyId } },
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
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
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
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
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
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      const config = getChildResourceConfig(request.params.resource);
      const where = config.getWhere
        ? config.getWhere(companyId)
        : config.companyField
          ? { [config.companyField]: companyId }
          : undefined;
      return await config.delegate.findMany({
        where,
        orderBy: config.orderBy,
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
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      const config = getChildResourceConfig(request.params.resource);
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
    try {
      const companyId = Number(request.params.companyId);
      const childId = Number(request.params.childId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(childId, 'Registro invalido.');
      const config = getChildResourceConfig(request.params.resource);
      const data = config.normalize(companyId, request.body);
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
    try {
      const companyId = Number(request.params.companyId);
      const childId = Number(request.params.childId);
      assertValidId(companyId, 'Empresa invalida.');
      assertValidId(childId, 'Registro invalido.');
      const config = getChildResourceConfig(request.params.resource);
      return await config.delegate.update({
        where: { id: childId },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status do registro filho.',
      });
    }
  });
}
