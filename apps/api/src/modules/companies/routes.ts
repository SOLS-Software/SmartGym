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
import { getCompanyFilePath } from '../../shared/files.js';
import type { CompanyChildPayload, CompanyChildResource, CompanyPayload } from '../../shared/api-types.js';

// ---------------------------------------------------------------------------
// Company child resource config
// ---------------------------------------------------------------------------

type CrudDelegate = {
  findMany(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

function asCrudDelegate(delegate: unknown) {
  return delegate as CrudDelegate;
}

const childResourceConfig = {
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
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  'student-plans': {
    delegate: asCrudDelegate(prisma.alunoPlano),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idAluno: optionalNumber(payload.idAluno),
        idPlano: optionalNumber(payload.idPlano),
        idPromocaoPlano: optionalNumber(payload.idPromocaoPlano),
        nrDiaPagamento: Number(payload.nrDiaPagamento ?? 1),
        dtAdmissao: optionalDate(payload.dtAdmissao) ?? new Date(),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  payments: {
    delegate: asCrudDelegate(prisma.pagamento),
    orderBy: { dtPagamento: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idAlunoPlano: optionalNumber(payload.idAlunoPlano),
        idProdutoMovimentacao: optionalNumber(payload.idProdutoMovimentacao),
        vlPagamento: Number(payload.vlPagamento ?? 0),
        idStatusPagamento: optionalNumber(payload.idStatusPagamento),
        idFormaPagamento: optionalNumber(payload.idFormaPagamento),
        dtPagamento: optionalDate(payload.dtPagamento) ?? new Date(),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  'product-movements': {
    delegate: asCrudDelegate(prisma.produtoMovimentacao),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idProduto: optionalNumber(payload.idProduto),
        idAluno: optionalNumber(payload.idAluno),
        qtMovimentada: Number(payload.qtMovimentada ?? 0),
        vlUnitario: Number(payload.vlUnitario ?? 0),
        qtDisponivel: Number(payload.qtDisponivel ?? 0),
        boInativo: Number(payload.boInativo ?? 0),
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
        boInativo: Number(payload.boInativo ?? 0),
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
        idPontos: optionalNumber(payload.idPontos),
        boInativo: Number(payload.boInativo ?? 0),
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
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
} satisfies Record<
  CompanyChildResource,
  {
    delegate: CrudDelegate;
    orderBy: Record<string, string>;
    companyField: string | null;
    normalize(companyId: number, payload: CompanyChildPayload): Record<string, unknown>;
  }
>;

function getChildResourceConfig(resource: string) {
  const config = childResourceConfig[resource as CompanyChildResource];
  if (!config) {
    throw new Error('Tabela filha invalida.');
  }
  return config;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerCompanyRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/companies', async (request) => {
    const search = request.query.search?.trim();
    return prisma.empresa.findMany({
      where: search
        ? {
            OR: [
              { dsEmpresa: { contains: search, mode: 'insensitive' } },
              { caCNPJ: { contains: search.replace(/\D/g, '') } },
            ],
          }
        : undefined,
      orderBy: { dsEmpresa: 'asc' },
    });
  });

  app.post<{
    Body: CompanyPayload;
  }>('/companies', async (request, reply) => {
    try {
      const data = normalizeCompanyPayload(request.body);
      const company = await prisma.empresa.create({ data });
      return reply.code(201).send(company);
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
      return prisma.empresa.update({ where: { id }, data });
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
      const boInativo = Number(request.body.boInativo ?? 0);
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
        where: { idEmpresa, boInativo: 0 },
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
        where: { id: fileId, idEmpresa, boInativo: 0 },
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
        where: { id: fileId, idEmpresa, boInativo: 0 },
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
        where: { id: fileId, idEmpresa, boInativo: 0 },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return prisma.empresaArquivo.update({ where: { id: fileId }, data: { boInativo: 1 } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo da empresa.',
      });
    }
  });

  // Company children (generic)

  app.get<{
    Params: { companyId: string; resource: string };
  }>('/companies/:companyId/children/:resource', async (request, reply) => {
    try {
      const companyId = Number(request.params.companyId);
      assertValidId(companyId, 'Empresa invalida.');
      const config = getChildResourceConfig(request.params.resource);
      const where = config.companyField ? { [config.companyField]: companyId } : undefined;
      return await config.delegate.findMany({ where, orderBy: config.orderBy });
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
      const data = config.normalize(companyId, request.body);
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
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status do registro filho.',
      });
    }
  });
}
