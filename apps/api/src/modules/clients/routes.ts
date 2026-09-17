import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import {
  assertValidId,
  corDoTema,
  fonteDoTema,
  numeroNaFaixa,
  optionalNumber,
  optionalText,
  requiredWithin,
  getMultipartFieldValue,
} from '../../shared/normalize.js';
import { LIMITES, isValidCnpj, isValidHostname, onlyDigits } from '@smartgym/shared';
import { getClientSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { assertAllowedUploadType, assertUploadBuffer, getClientFilePath } from '../../shared/files.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { ensureDefaultProfiles } from '../../shared/accessProfiles.js';
import { getTenantDb } from '../../shared/tenantDataSource.js';

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

/**
 * CNPJ do cliente: opcional, mas se vier tem de ser um CNPJ de verdade.
 *
 * A coluna e UNIQUE e o campo era gravado com `optionalText` — qualquer texto
 * entrava, inclusive um "CNPJ" de 3 caracteres, e a unicidade passava a
 * proteger lixo. Empresa e Fornecedor ja conferiam o digito verificador; o
 * Cliente, que e o proprio tenant, era o unico que nao conferia.
 */
function normalizeClientCnpj(value: unknown) {
  const digitos = onlyDigits(optionalText(value));
  if (!digitos) return null;
  if (!isValidCnpj(digitos)) {
    throw new Error('Informe um CNPJ valido.');
  }
  return digitos;
}

/**
 * Dominio corporativo.
 *
 * E a chave que resolve o TENANT no formulario publico: `POST /public/leads`
 * compara este valor com o `window.location.hostname` da pagina. Um cadastro
 * com "https://" na frente, barra no fim ou espaco no meio nunca casa, e a
 * tela publica responde "Academia nao encontrada" — o erro aparece longe de
 * onde foi cometido. `requiredText` aceitava qualquer coisa, inclusive texto
 * maior que a coluna VarChar(255).
 */
function normalizeUrlDominio(value: unknown) {
  const url = optionalText(value).toLowerCase();
  if (!url) {
    throw new Error('Informe a URL do dominio.');
  }
  if (url.length > LIMITES.dominio.urlDominio) {
    throw new Error(`A URL do dominio deve ter no maximo ${LIMITES.dominio.urlDominio} caracteres.`);
  }
  if (!isValidHostname(url)) {
    throw new Error('Informe apenas o dominio, sem http:// e sem barra (ex.: academia.com.br).');
  }
  return url;
}

function normalizeThemeData(b: Record<string, unknown>) {
  return {
    corPrimaria: corDoTema(b.corPrimaria, '#000000', 'A cor primaria'),
    corSecundaria: corDoTema(b.corSecundaria, '#FFFFFF', 'A cor secundaria'),
    corAcentuacao: corDoTema(b.corAcentuacao, '#FF0000', 'A cor de acentuacao'),
    corTexto: corDoTema(b.corTexto, '#000000', 'A cor do texto'),
    corFundo: corDoTema(b.corFundo, '#FFFFFF', 'A cor de fundo'),
    fontePrincipal: fonteDoTema(b.fontePrincipal, 'Inter', 'A fonte principal'),
    fonteSecundaria: fonteDoTema(b.fonteSecundaria, 'Open Sans', 'A fonte secundaria'),
    // O zod ja garante que sao numeros; a FAIXA e que garante que cabem no
    // layout (fonte 300px nao e tema customizado, e tela quebrada).
    tamanhoBase: numeroNaFaixa(b.tamanhoBase ?? 14, 'tamanhoBase', 'O tamanho da fonte') ?? 14,
    espacamentoPadrao:
      numeroNaFaixa(b.espacamentoPadrao ?? 16, 'espacamentoPadrao', 'O espacamento') ?? 16,
    raioCardBorder:
      numeroNaFaixa(b.raioCardBorder ?? 8, 'raioCardBorder', 'O raio da borda') ?? 8,
    boModoEscuro: toBool(b.boModoEscuro ?? false),
    idArquivoLogo: optionalNumber(b.idArquivoLogo),
    idArquivoFavicon: optionalNumber(b.idArquivoFavicon),
    idClienteArquivoLogo: optionalNumber(b.idClienteArquivoLogo),
    idClienteArquivoFavicon: optionalNumber(b.idClienteArquivoFavicon),
  };
}

const THEME_INCLUDE = { arquivoLogo: true, arquivoFavicon: true, clienteArquivoLogo: true, clienteArquivoFavicon: true } as const;

// Cadastro de DOMINIO e operacao da plataforma (SOLS), nao do cliente.
//
// O dominio e o que resolve QUAL CLIENTE E ESTE: /auth/theme faz o de-para
// urlDominio -> Cliente. Enquanto isto exigia apenas companies.write — a
// permissao que o gestor da propria academia tem —, nada impedia o cliente A
// de reivindicar o dominio pelo qual o cliente B entra. Mesmo racional de
// POST /clients, que ja nascia restrito ao super-admin.
//
// A LEITURA (GET) continua com o cliente: a tela de configuracao mostra os
// dominios da propria conta, e ver o proprio dominio nao muda nada.
function assertPlatformAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.user.superAdmin) {
    reply.code(403).send({
      message: 'Dominio corporativo: cadastro restrito ao administrador do sistema.',
    });
    return false;
  }
  return true;
}

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
    // Criar um tenant e operacao interna (SOLS): exige usuario super-admin.
    if (!request.user.superAdmin) {
      return reply.code(403).send({ message: 'Acesso restrito ao administrador do sistema.' });
    }
    try {
      const dsCliente = requiredWithin(
        request.body.dsCliente,
        LIMITES.cliente.dsCliente,
        'Informe o nome do cliente.',
        'O nome do cliente',
      );
      const caCNPJ = normalizeClientCnpj(request.body.caCNPJ);
      const cliente = await prisma.cliente.create({
        data: { dsCliente, caCNPJ, boInativo: false },
      });
      // Cliente novo ja nasce com os perfis de acesso padrao: sem eles, o
      // primeiro funcionario cadastrado nao teria perfil algum para receber e
      // o RBAC (deny-by-default) o deixaria sem nenhuma tela.
      //
      // Pelo banco DO TENANT, nao pelo central: tb_PerfisAcesso e tabela de
      // aplicacao. Para um cliente recem-criado o resolver cai no pool padrao
      // (ele ainda nao tem registro em tb_ClienteConexoes), entao hoje o
      // destino e o mesmo — mas deixar `prisma` aqui seria uma bomba-relogio
      // para o dia em que o provisionamento passar a criar o banco junto.
      await ensureDefaultProfiles(await getTenantDb(cliente.id), cliente.id);
      return reply.code(201).send(cliente);
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao criar cliente.') });
    }
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/clients/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      const dsCliente = requiredWithin(
        request.body.dsCliente,
        LIMITES.cliente.dsCliente,
        'Informe o nome do cliente.',
        'O nome do cliente',
      );
      const caCNPJ = normalizeClientCnpj(request.body.caCNPJ);
      return prisma.cliente.update({
        where: { id },
        data: {
          dsCliente,
          caCNPJ,
          boInativo: toBool(request.body.boInativo),
          // Corte do alerta de evasao. Fora da faixa 1-365 nao e configuracao,
          // e engano: 0 alertaria sobre quem treinou hoje de manha.
          //
          // Antes o valor fora da faixa era IGNORADO em silencio: a tela dizia
          // "Cliente salvo" e o corte continuava o antigo. Agora vira erro do
          // campo, pela mesma faixa que o input usa em min/max.
          ...(request.body.nrDiasSemCheckIn === undefined ||
          request.body.nrDiasSemCheckIn === null ||
          request.body.nrDiasSemCheckIn === ''
            ? {}
            : {
                nrDiasSemCheckIn:
                  numeroNaFaixa(
                    request.body.nrDiasSemCheckIn,
                    'nrDiasSemCheckIn',
                    'Os dias sem check-in',
                  ) ?? 10,
              }),
        },
      });
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao atualizar cliente.') });
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
      return request.tenantDb.empresa.findMany({
        where: { idCliente: id },
        orderBy: { dsEmpresa: 'asc' },
        take: query.data.limit,
      });
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao listar empresas.') });
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
      const tema = await request.tenantDb.temaCustomizado.findUnique({
        where: { idCliente: id },
        include: THEME_INCLUDE,
      });
      if (!tema) return reply.code(204).send();
      return tema;
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao buscar tema.') });
    }
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/clients/:id/theme', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;
      if (!themeBodySchema.safeParse(request.body).success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      const data = normalizeThemeData(request.body);
      const tema = await request.tenantDb.temaCustomizado.upsert({
        where: { idCliente: id },
        create: { idCliente: id, ...data },
        update: data,
        include: THEME_INCLUDE,
      });
      return tema;
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao salvar tema.') });
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
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao listar dominios.') });
    }
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>('/clients/:id/domains', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Cliente invalido.');
      // Super-admin, e nao o dono do :id: quem cadastra dominio e a plataforma,
      // inclusive para clientes que nao sao o seu.
      if (!assertPlatformAdmin(request, reply)) return reply;
      const cliente = await prisma.cliente.findUnique({ where: { id }, select: { id: true } });
      if (!cliente) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const urlDominio = normalizeUrlDominio(request.body.urlDominio);
      const dominio = await prisma.dominioCorporativo.create({
        data: { idCliente: id, urlDominio: urlDominio.toLowerCase(), boSubdominio: toBool(request.body.boSubdominio ?? true), boAtivo: toBool(request.body.boAtivo ?? true) },
      });
      return reply.code(201).send(dominio);
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao criar dominio.') });
    }
  });

  app.put<{ Params: { id: string; domainId: string }; Body: Record<string, unknown> }>('/clients/:id/domains/:domainId', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const domainId = Number(request.params.domainId);
      assertValidId(id, 'Cliente invalido.');
      assertValidId(domainId, 'Dominio invalido.');
      if (!assertPlatformAdmin(request, reply)) return reply;
      const urlDominio = normalizeUrlDominio(request.body.urlDominio);
      return prisma.dominioCorporativo.update({
        where: { id: domainId, idCliente: id },
        data: { urlDominio: urlDominio.toLowerCase(), boSubdominio: toBool(request.body.boSubdominio ?? true), boAtivo: toBool(request.body.boAtivo ?? true) },
      });
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao atualizar dominio.') });
    }
  });

  app.patch<{ Params: { id: string; domainId: string }; Body: { boAtivo?: number } }>('/clients/:id/domains/:domainId/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const domainId = Number(request.params.domainId);
      assertValidId(id, 'Cliente invalido.');
      assertValidId(domainId, 'Dominio invalido.');
      if (!assertPlatformAdmin(request, reply)) return reply;
      const body = domainStatusBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      return prisma.dominioCorporativo.update({ where: { id: domainId, idCliente: id }, data: { boAtivo: toBool(body.data.boAtivo ?? true) } });
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao alterar status do dominio.') });
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
      return request.tenantDb.clienteArquivo.findMany({
        where: { idCliente: id, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
        take: query.data.limit,
      });
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao listar arquivos do cliente.') });
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
      const safeMime = await assertUploadBuffer(buffer);
      const path = getClientFilePath(id, file.filename);
      const { bucket } = getClientSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const record = await request.tenantDb.clienteArquivo.create({
        data: { idCliente: id, dsArquivo, anCaminho: path },
      });

      return reply.code(201).send(record);
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao enviar arquivo do cliente.') });
    }
  });

  app.get<{ Params: { id: string; fileId: string } }>('/clients/:id/files/:fileId/url', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(id, 'Cliente invalido.');
      assertValidId(fileId, 'Arquivo invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;

      const record = await request.tenantDb.clienteArquivo.findFirst({
        where: { id: fileId, idCliente: id, boInativo: false },
      });
      if (!record) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });

      const { bucket } = getClientSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(record.anCaminho, 60 * 5);
      if (error) throw new Error(error.message);

      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao gerar link do arquivo.') });
    }
  });

  app.delete<{ Params: { id: string; fileId: string } }>('/clients/:id/files/:fileId', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(id, 'Cliente invalido.');
      assertValidId(fileId, 'Arquivo invalido.');
      if (!assertTenantClient(request, reply, id)) return reply;

      const record = await request.tenantDb.clienteArquivo.findFirst({
        where: { id: fileId, idCliente: id, boInativo: false },
      });
      if (!record) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });

      const { bucket } = getClientSupabaseConfig();
      const supabase = getSupabaseClient();
      await supabase.storage.from(bucket).remove([record.anCaminho]);

      await request.tenantDb.clienteArquivo.update({ where: { id: fileId }, data: { boInativo: true } });
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ message: clientErrorMessage(error, 'Erro ao remover arquivo do cliente.') });
    }
  });
}