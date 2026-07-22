import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, getMultipartFieldValue, normalizeProductPayload } from '../../shared/normalize.js';
import { assertAllowedUploadType, getProductFilePath } from '../../shared/files.js';
import { getSupabaseClient, getSupabaseConfig } from '../../shared/supabase.js';
import type { CompanyChildPayload, ProductPayload } from '../../shared/api-types.js';

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce.number().int().optional(),
  ),
});

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function assertIdentificationFileType(idTiposArquivos: number | null) {
  if (!idTiposArquivos) {
    throw new Error('Selecione o tipo de arquivo identificacao.');
  }

  const fileType = await prisma.tipoArquivo.findUnique({
    where: { id: idTiposArquivos },
    select: { dsTipo: true, boInativo: true },
  });

  if (!fileType || fileType.boInativo || !normalizeText(fileType.dsTipo).includes('identificacao')) {
    throw new Error('Para produto, o tipo de arquivo deve ser identificacao.');
  }
}

export async function registerProductRoutes(app: FastifyInstance) {
  // Isolamento de tenant: Produto pertence ao cliente via Empresa.idCliente.
  async function findTenantProduct(id: number, idCliente: number) {
    return prisma.produto.findFirst({
      where: { id, empresa: { idCliente } },
      select: { id: true },
    });
  }

  // Garante que a empresa informada no payload pertence ao tenant (400 se nao).
  async function assertCompanyInTenant(idEmpresa: number, idCliente: number) {
    const company = await prisma.empresa.findFirst({
      where: { id: idEmpresa, idCliente },
      select: { id: true },
    });
    if (!company) throw new Error('Empresa nao pertence ao cliente.');
  }

  app.get<{
    Querystring: { search?: string };
  }>('/products', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
    const search = parsedQuery.data.search?.trim();
    const take = Math.min(Math.max(parsedQuery.data.limit ?? 1000, 1), 1000);
    return prisma.produto.findMany({
      where: search
        ? { empresa: { idCliente }, dsProduto: { contains: search, mode: 'insensitive' } }
        : { empresa: { idCliente } },
      orderBy: { dsProduto: 'asc' },
      take,
    });
  });

  app.post<{
    Body: ProductPayload;
  }>('/products', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizeProductPayload(request.body);
      if (data.idEmpresa) await assertCompanyInTenant(data.idEmpresa, idCliente);
      const product = await prisma.produto.create({ data });
      return reply.code(201).send(product);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar produto.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: ProductPayload;
  }>('/products/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Produto invalido.');
      const current = await findTenantProduct(id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const data = normalizeProductPayload(request.body);
      if (data.idEmpresa) await assertCompanyInTenant(data.idEmpresa, idCliente);
      return prisma.produto.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar produto.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/products/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Produto invalido.');
      const current = await findTenantProduct(id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const boInativo = toBool(request.body.boInativo);
      return prisma.produto.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do produto.' });
    }
  });

  app.get<{ Params: { id: string } }>('/products/:id/related/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idProduto = Number(request.params.id);
      assertValidId(idProduto, 'Produto invalido.');
      const product = await findTenantProduct(idProduto, idCliente);
      if (!product) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      return prisma.produtoArquivo.findMany({
        where: { idProduto },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar arquivos do produto.',
      });
    }
  });

  app.post<{ Params: { id: string }; Body: CompanyChildPayload }>('/products/:id/related/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idProduto = Number(request.params.id);
      assertValidId(idProduto, 'Produto invalido.');
      const product = await findTenantProduct(idProduto, idCliente);
      if (!product) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
      await assertIdentificationFileType(idTiposArquivos);
      const buffer = await file.toBuffer();
      const path = getProductFilePath(idProduto, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return reply.code(201).send(await prisma.produtoArquivo.create({
        data: {
          idProduto,
          idTiposArquivos,
          dsArquivo: file.filename,
          anCaminho: path,
          cnChaveAcesso: 0,
          cnDistribuidor: 0,
        },
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar arquivo do produto.',
      });
    }
  });

  app.put<{ Params: { id: string; childId: string }; Body: CompanyChildPayload }>('/products/:id/related/files/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idProduto = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idProduto, 'Produto invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const product = await findTenantProduct(idProduto, idCliente);
      if (!product) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const current = await prisma.produtoArquivo.findFirst({ where: { id: childId, idProduto }, select: { id: true } });
      if (!current) throw new Error('Arquivo do produto invalido.');

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
      await assertIdentificationFileType(idTiposArquivos);
      const buffer = await file.toBuffer();
      const path = getProductFilePath(idProduto, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return prisma.produtoArquivo.update({
        where: { id: childId },
        data: {
          idTiposArquivos,
          dsArquivo: file.filename,
          anCaminho: path,
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar arquivo do produto.',
      });
    }
  });

  app.patch<{ Params: { id: string; childId: string }; Body: { boInativo?: number } }>('/products/:id/related/files/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idProduto = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idProduto, 'Produto invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const product = await findTenantProduct(idProduto, idCliente);
      if (!product) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const current = await prisma.produtoArquivo.findFirst({ where: { id: childId, idProduto }, select: { id: true } });
      if (!current) throw new Error('Arquivo do produto invalido.');
      return prisma.produtoArquivo.update({
        where: { id: childId },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status do arquivo do produto.',
      });
    }
  });

  app.get<{ Params: { id: string; childId: string } }>('/products/:id/related/files/:childId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idProduto = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idProduto, 'Produto invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const product = await findTenantProduct(idProduto, idCliente);
      if (!product) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const productFile = await prisma.produtoArquivo.findFirst({ where: { id: childId, idProduto, boInativo: false } });
      if (!productFile) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(productFile.anCaminho, 60 * 5);
      if (error) throw new Error(error.message);
      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.',
      });
    }
  });

  app.delete<{ Params: { id: string; childId: string } }>('/products/:id/related/files/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idProduto = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idProduto, 'Produto invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const product = await findTenantProduct(idProduto, idCliente);
      if (!product) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const current = await prisma.produtoArquivo.findFirst({ where: { id: childId, idProduto }, select: { id: true } });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      return prisma.produtoArquivo.update({ where: { id: childId }, data: { boInativo: true } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo do produto.',
      });
    }
  });
}
