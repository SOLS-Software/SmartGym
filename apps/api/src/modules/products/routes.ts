import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, getMultipartFieldValue, normalizeProductPayload } from '../../shared/normalize.js';
import { getProductFilePath } from '../../shared/files.js';
import { getSupabaseClient, getSupabaseConfig } from '../../shared/supabase.js';
import type { CompanyChildPayload, ProductPayload } from '../../shared/api-types.js';

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

  if (!fileType || fileType.boInativo !== 0 || !normalizeText(fileType.dsTipo).includes('identificacao')) {
    throw new Error('Para produto, o tipo de arquivo deve ser identificacao.');
  }
}

export async function registerProductRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/products', async (request) => {
    const search = request.query.search?.trim();
    return prisma.produto.findMany({
      where: search
        ? { dsProduto: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: { dsProduto: 'asc' },
    });
  });

  app.post<{
    Body: ProductPayload;
  }>('/products', async (request, reply) => {
    try {
      const data = normalizeProductPayload(request.body);
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
    try {
      const id = Number(request.params.id);
      const data = normalizeProductPayload(request.body);
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
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);
      return prisma.produto.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do produto.' });
    }
  });

  app.get<{ Params: { id: string } }>('/products/:id/related/files', async (request, reply) => {
    try {
      const idProduto = Number(request.params.id);
      assertValidId(idProduto, 'Produto invalido.');
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
    try {
      const idProduto = Number(request.params.id);
      assertValidId(idProduto, 'Produto invalido.');
      const product = await prisma.produto.findUnique({ where: { id: idProduto }, select: { id: true } });
      if (!product) return reply.code(404).send({ message: 'Produto nao encontrado.' });

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

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
    try {
      const idProduto = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idProduto, 'Produto invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const current = await prisma.produtoArquivo.findFirst({ where: { id: childId, idProduto }, select: { id: true } });
      if (!current) throw new Error('Arquivo do produto invalido.');

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

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
    try {
      const idProduto = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idProduto, 'Produto invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const current = await prisma.produtoArquivo.findFirst({ where: { id: childId, idProduto }, select: { id: true } });
      if (!current) throw new Error('Arquivo do produto invalido.');
      return prisma.produtoArquivo.update({
        where: { id: childId },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status do arquivo do produto.',
      });
    }
  });

  app.get<{ Params: { id: string; childId: string } }>('/products/:id/related/files/:childId/url', async (request, reply) => {
    try {
      const idProduto = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idProduto, 'Produto invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const productFile = await prisma.produtoArquivo.findFirst({ where: { id: childId, idProduto, boInativo: 0 } });
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
    try {
      const idProduto = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idProduto, 'Produto invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const current = await prisma.produtoArquivo.findFirst({ where: { id: childId, idProduto }, select: { id: true } });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      return prisma.produtoArquivo.update({ where: { id: childId }, data: { boInativo: 1 } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo do produto.',
      });
    }
  });
}
