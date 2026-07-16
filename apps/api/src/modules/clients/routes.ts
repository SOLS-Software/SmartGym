import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber, requiredText, optionalText, getMultipartFieldValue } from '../../shared/normalize.js';
import { getClientSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { getClientFilePath } from '../../shared/files.js';

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

export async function registerClientRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  app.get<{ Querystring: { search?: string } }>('/clients', async (request) => {
    const search = request.query.search?.trim();
    return prisma.cliente.findMany({
      where: search
        ? { OR: [{ dsCliente: { contains: search, mode: 'insensitive' } }, { caCNPJ: { contains: search.replace(/\D/g, '') } }] }
        : undefined,
      orderBy: { dsCliente: 'asc' },
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
      return prisma.cliente.update({ where: { id }, data: { boInativo: toBool(request.body.boInativo) } });
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
      return prisma.empresa.findMany({
        where: { idCliente: id },
        orderBy: { dsEmpresa: 'asc' },
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
      return prisma.dominioCorporativo.findMany({ where: { idCliente: id }, orderBy: { urlDominio: 'asc' } });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao listar dominios.' });
    }
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>('/clients/:id/domains', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
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
      const urlDominio = requiredText(request.body.urlDominio, 'Informe a URL do dominio.');
      return prisma.dominioCorporativo.update({
        where: { id: domainId },
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
      return prisma.dominioCorporativo.update({ where: { id: domainId }, data: { boAtivo: toBool(request.body.boAtivo ?? true) } });
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
      return prisma.clienteArquivo.findMany({
        where: { idCliente: id, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao listar arquivos do cliente.' });
    }
  });

  app.post<{ Params: { id: string } }>('/clients/:id/files', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');

      const cliente = await prisma.cliente.findUnique({ where: { id }, select: { id: true } });
      if (!cliente) return reply.code(404).send({ message: 'Cliente nao encontrado.' });

      const file = await request.file();
      if (!file) return reply.code(400).send({ message: 'Envie um arquivo.' });

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