import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber, requiredText, optionalText, getMultipartFieldValue } from '../../shared/normalize.js';
import { getClientSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { assertAllowedUploadType, getClientFilePath } from '../../shared/files.js';

// Paginacao de listagens: aceita ?limit= com clamp em 1..1000 (default 1000).
const limitQuery = z.coerce
  .number()
  .int()
  .transform((value) => Math.min(Math.max(value, 1), 1000))
  .default(1000);

const listQuerySchema = z.object({ limit: limitQuery });
const clientsQuerySchema = z.object({ search: z.string().max(100).optional(), limit: limitQuery });

// Tipos aceitos por toBool (boolean/number/string); outros valores viram 400.
const boolLike = z.union([z.boolean(), z.number(), z.string()]);
const clientStatusBodySchema = z.object({ boInativo: boolLike.optional() });
const domainStatusBodySchema = z.object({ boAtivo: boolLike.optional() });

// Guarda apenas os campos numericos usados cru (Number) em normalizeThemeData.
const themeBodySchema = z.object({
  tamanhoBase: z.coerce.number().optional(),
  espacamentoPadrao: z.coerce.number().optional(),
  raioCardBorder: z.coerce.number().optional(),
});

function normalizeThemeData(b: Record<string, unknown>) {
  return {
    corPrimaria: optionalText(b.corPrimaria) || '#000000',
    corSecundaria: optionalText(b.corSecundaria) || '#FFFFFF',
    corAcentuacao: optionalText(b.corAcentuacao) || '#FF0000',
    corTexto: optionalText(b.corTexto) || '#000000',
    corFundo: optionalText(b.corFundo) || '#FFFFFF',
    fontePrincipal: optionalText(b.fontePrincipal) || 'Inter',
    fonteSecundaria: optionalText(b.fonteSecundaria) || 'Open Sans',
    tamanhoBase: Number(b.tamanhoBase ?? 14),
    espacamentoPadrao: Number(b.espacamentoPadrao ?? 16),
    raioCardBorder: Number(b.raioCardBorder ?? 8),
    boModoEscuro: toBool(b.boModoEscuro ?? false),
    idArquivoLogo: optionalNumber(b.idArquivoLogo),
    idArquivoFavicon: optionalNumber(b.idArquivoFavicon),
    idClienteArquivoLogo: optionalNumber(b.idClienteArquivoLogo),
    idClienteArquivoFavicon: optionalNumber(b.idClienteArquivoFavicon),
  };
}

const THEME_INCLUDE = { arquivoLogo: true, arquivoFavicon: true, clienteArquivoLogo: true, clienteArquivoFavicon: true } as const;

// Cliente e o proprio tenant: toda rota /clients/:id/** exige que o :id seja o
// idCliente do usuario autenticado. Responde 403/404 e retorna false quando o
// acesso e negado (404 para nao vazar a existencia de outros clientes).
function assertTenantClient(request: FastifyRequest, reply: FastifyReply, id: number): boolean {
  const idCliente = request.user.idCliente;
  if (!idCliente) {
    reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    return false;
  }
  if (id !== idCliente) {
    reply.code(404).send({ message: 'Registro nao encontrado.' });
    return false;
  }
  return true;
}

export async function registerClientRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  app.get<{ Querystring: { search?: string } }>('/clients', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const query = clientsQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
    const search = query.data.search?.trim();
    return prisma.cliente.findMany({
      where: search
        ? { id: idCliente, OR: [{ dsCliente: { contains: search, mode: 'insensitive' } }, { caCNPJ: { contains: search.replace(/\D/g, '') } }] }
        : { id: idCliente },
      orderBy: { dsCliente: 'asc' },
      take: query.data.limit,
    });
  });

  app.post<{ Body: Record<string, unknown> }>('/clients', async (request, reply) => {
    try {
      const dsCliente = requiredText(request.body.dsCliente, 'Informe o nome do cliente.');
      const cliente = await prisma.cliente.create({
        data: { dsCliente, caCNPJ: optionalText(request.body.caCNPJ) || null, boInativo: false },
      });
      return reply.code(201).send(cliente);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar cliente.' });
    }
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/clients/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const dsCliente = requiredText(request.body.dsCliente, 'Informe o nome do cliente.');
      return prisma.cliente.update({
        where: { id },
        data: { dsCliente, caCNPJ: optionalText(request.body.caCNPJ) || null, boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar cliente.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/clients/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const body = clientStatusBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      return prisma.cliente.update({ where: { id }, data: { boInativo: toBool(body.data.boInativo) } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do cliente.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Companies within a client
  // ---------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/clients/:id/companies', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      return prisma.empresa.findMany({
        where: { idCliente: id },
        orderBy: { dsEmpresa: 'asc' },
        take: query.data.limit,
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao listar empresas.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Client-level theme
  // ---------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/clients/:id/theme', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const tema = await prisma.temaCustomizado.findUnique({
        where: { idCliente: id },
        include: THEME_INCLUDE,
      });
      if (!tema) return reply.code(204).send();
      return tema;
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao buscar tema.' });
    }
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/clients/:id/theme', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      if (!themeBodySchema.safeParse(request.body).success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      const data = normalizeThemeData(request.body);
      const tema = await prisma.temaCustomizado.upsert({
        where: { idCliente: id },
        create: { idCliente: id, ...data },
        update: data,
        include: THEME_INCLUDE,
      });
      return tema;
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao salvar tema.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Domains
  // ---------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/clients/:id/domains', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      return prisma.dominioCorporativo.findMany({ where: { idCliente: id }, orderBy: { urlDominio: 'asc' }, take: query.data.limit });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao listar dominios.' });
    }
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>('/clients/:id/domains', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const urlDominio = requiredText(request.body.urlDominio, 'Informe a URL do dominio.');
      const dominio = await prisma.dominioCorporativo.create({
        data: { idCliente: id, urlDominio: urlDominio.toLowerCase(), boSubdominio: toBool(request.body.boSubdominio ?? true), boAtivo: toBool(request.body.boAtivo ?? true) },
      });
      return reply.code(201).send(dominio);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar dominio.' });
    }
  });

  app.put<{ Params: { id: string; domainId: string }; Body: Record<string, unknown> }>('/clients/:id/domains/:domainId', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const domainId = Number(request.params.domainId);
      assertValidId(id, 'Cliente invalido.');
      assertValidId(domainId, 'Dominio invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const urlDominio = requiredText(request.body.urlDominio, 'Informe a URL do dominio.');
      return prisma.dominioCorporativo.update({
        where: { id: domainId, idCliente: id },
        data: { urlDominio: urlDominio.toLowerCase(), boSubdominio: toBool(request.body.boSubdominio ?? true), boAtivo: toBool(request.body.boAtivo ?? true) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar dominio.' });
    }
  });

  app.patch<{ Params: { id: string; domainId: string }; Body: { boAtivo?: number } }>('/clients/:id/domains/:domainId/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const domainId = Number(request.params.domainId);
      assertValidId(id, 'Cliente invalido.');
      assertValidId(domainId, 'Dominio invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const body = domainStatusBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      return prisma.dominioCorporativo.update({ where: { id: domainId, idCliente: id }, data: { boAtivo: toBool(body.data.boAtivo ?? true) } });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao alterar status do dominio.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Client files (logo, favicon, etc.)
  // ---------------------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/clients/:id/files', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      return prisma.clienteArquivo.findMany({
        where: { idCliente: id, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
        take: query.data.limit,
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao listar arquivos do cliente.' });
    }
  });

  app.post<{ Params: { id: string } }>('/clients/:id/files', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;

      const cliente = await prisma.cliente.findUnique({ where: { id }, select: { id: true } });
      if (!cliente) return reply.code(404).send({ message: 'Cliente nao encontrado.' });

      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Envie um arquivo.' });
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const dsArquivo = (getMultipartFieldValue(fields, 'dsArquivo') as string | undefined) || file.filename;

      const buffer = await file.toBuffer();
      const path = getClientFilePath(id, file.filename);
      const { bucket } = getClientSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const record = await prisma.clienteArquivo.create({
        data: { idCliente: id, dsArquivo, anCaminho: path },
      });

      return reply.code(201).send(record);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao enviar arquivo do cliente.' });
    }
  });

  app.get<{ Params: { id: string; fileId: string } }>('/clients/:id/files/:fileId/url', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(id, 'Cliente invalido.');
      assertValidId(fileId, 'Arquivo invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;

      const record = await prisma.clienteArquivo.findFirst({
        where: { id: fileId, idCliente: id, boInativo: false },
      });
      if (!record) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });

      const { bucket } = getClientSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(record.anCaminho, 60 * 5);
      if (error) throw new Error(error.message);

      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.' });
    }
  });

  app.delete<{ Params: { id: string; fileId: string } }>('/clients/:id/files/:fileId', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(id, 'Cliente invalido.');
      assertValidId(fileId, 'Arquivo invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;

      const record = await prisma.clienteArquivo.findFirst({
        where: { id: fileId, idCliente: id, boInativo: false },
      });
      if (!record) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });

      const { bucket } = getClientSupabaseConfig();
      const supabase = getSupabaseClient();
      await supabase.storage.from(bucket).remove([record.anCaminho]);

      await prisma.clienteArquivo.update({ where: { id: fileId }, data: { boInativo: true } });
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao remover arquivo do cliente.' });
    }
  });
}