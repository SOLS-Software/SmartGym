import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber, requiredText, optionalText } from '../../shared/normalize.js';

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
    boModoEscuro: Number(b.boModoEscuro ?? 0),
    idArquivoLogo: optionalNumber(b.idArquivoLogo),
    idArquivoFavicon: optionalNumber(b.idArquivoFavicon),
  };
}

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
        data: { dsCliente, caCNPJ: optionalText(request.body.caCNPJ) || null, boInativo: 0 },
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
        data: { dsCliente, caCNPJ: optionalText(request.body.caCNPJ) || null, boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar cliente.' });
    }
  });

  app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/clients/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      return prisma.cliente.update({ where: { id }, data: { boInativo: Number(request.body.boInativo ?? 0) } });
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
        include: { arquivoLogo: true, arquivoFavicon: true },
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
        include: { arquivoLogo: true, arquivoFavicon: true },
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
        data: { idCliente: id, urlDominio: urlDominio.toLowerCase(), boSubdominio: Number(request.body.boSubdominio ?? 1), boAtivo: Number(request.body.boAtivo ?? 1) },
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
        data: { urlDominio: urlDominio.toLowerCase(), boSubdominio: Number(request.body.boSubdominio ?? 1), boAtivo: Number(request.body.boAtivo ?? 1) },
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
      return prisma.dominioCorporativo.update({ where: { id: domainId }, data: { boAtivo: Number(request.body.boAtivo ?? 1) } });
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao alterar status do dominio.' });
    }
  });
}