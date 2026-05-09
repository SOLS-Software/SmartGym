import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, getMultipartFieldValue, normalizeEmployeePayload } from '../../shared/normalize.js';
import { getEmployeeFilePath } from '../../shared/files.js';
import { getSupabaseClient, getSupabaseConfig } from '../../shared/supabase.js';
import type { CompanyChildPayload, EmployeePayload } from '../../shared/api-types.js';

export async function registerEmployeeRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/employees', async (request) => {
    const search = request.query.search?.trim();
    return prisma.funcionario.findMany({
      where: search
        ? {
            OR: [
              { nmFuncionario: { contains: search, mode: 'insensitive' } },
              { caCPF: { contains: search.replace(/\D/g, '') } },
              { anEmail: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { nmFuncionario: 'asc' },
    });
  });

  app.post<{
    Body: EmployeePayload;
  }>('/employees', async (request, reply) => {
    try {
      const data = normalizeEmployeePayload(request.body);
      const employee = await prisma.funcionario.create({
        data: data as unknown as Parameters<typeof prisma.funcionario.create>[0]['data'],
      });
      return reply.code(201).send(employee);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar funcionario.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: EmployeePayload;
  }>('/employees/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const data = normalizeEmployeePayload(request.body);
      return prisma.funcionario.update({
        where: { id },
        data: data as unknown as Parameters<typeof prisma.funcionario.update>[0]['data'],
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar funcionario.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/employees/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);
      return prisma.funcionario.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do funcionario.' });
    }
  });

  app.get<{ Params: { id: string } }>('/employees/:id/related/files', async (request, reply) => {
    try {
      const idFuncionario = Number(request.params.id);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      return prisma.funcionarioArquivo.findMany({
        where: { idFuncionario },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar arquivos do funcionario.',
      });
    }
  });

  app.post<{ Params: { id: string }; Body: CompanyChildPayload }>('/employees/:id/related/files', async (request, reply) => {
    try {
      const idFuncionario = Number(request.params.id);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      const employee = await prisma.funcionario.findUnique({ where: { id: idFuncionario }, select: { id: true } });
      if (!employee) return reply.code(404).send({ message: 'Funcionario nao encontrado.' });

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;
      const buffer = await file.toBuffer();
      const path = getEmployeeFilePath(idFuncionario, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return reply.code(201).send(await prisma.funcionarioArquivo.create({
        data: {
          idFuncionario,
          idTiposArquivos,
          dsArquivo: file.filename,
          anCaminho: path,
          cnChaveAcesso: 0,
          cnDistribuidor: 0,
        },
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar arquivo do funcionario.',
      });
    }
  });

  app.put<{ Params: { id: string; childId: string }; Body: CompanyChildPayload }>('/employees/:id/related/files/:childId', async (request, reply) => {
    try {
      const idFuncionario = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const current = await prisma.funcionarioArquivo.findFirst({ where: { id: childId, idFuncionario }, select: { id: true } });
      if (!current) throw new Error('Arquivo do funcionario invalido.');

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

      const fields = file.fields as Record<string, unknown>;
      const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
      const buffer = await file.toBuffer();
      const path = getEmployeeFilePath(idFuncionario, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      return prisma.funcionarioArquivo.update({
        where: { id: childId },
        data: {
          idTiposArquivos: rawFileTypeId ? Number(rawFileTypeId) : undefined,
          dsArquivo: file.filename,
          anCaminho: path,
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar arquivo do funcionario.',
      });
    }
  });

  app.patch<{ Params: { id: string; childId: string }; Body: { boInativo?: number } }>('/employees/:id/related/files/:childId/status', async (request, reply) => {
    try {
      const idFuncionario = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const current = await prisma.funcionarioArquivo.findFirst({ where: { id: childId, idFuncionario }, select: { id: true } });
      if (!current) throw new Error('Arquivo do funcionario invalido.');
      return prisma.funcionarioArquivo.update({
        where: { id: childId },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status do arquivo do funcionario.',
      });
    }
  });

  app.get<{ Params: { id: string; childId: string } }>('/employees/:id/related/files/:childId/url', async (request, reply) => {
    try {
      const idFuncionario = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const employeeFile = await prisma.funcionarioArquivo.findFirst({ where: { id: childId, idFuncionario, boInativo: 0 } });
      if (!employeeFile) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(employeeFile.anCaminho, 60 * 5);
      if (error) throw new Error(error.message);
      return { url: data.signedUrl, expiresIn: 60 * 5 };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.',
      });
    }
  });

  app.delete<{ Params: { id: string; childId: string } }>('/employees/:id/related/files/:childId', async (request, reply) => {
    try {
      const idFuncionario = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idFuncionario, 'Funcionario invalido.');
      assertValidId(childId, 'Arquivo invalido.');
      const current = await prisma.funcionarioArquivo.findFirst({ where: { id: childId, idFuncionario }, select: { id: true } });
      if (!current) return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      return prisma.funcionarioArquivo.update({ where: { id: childId }, data: { boInativo: 1 } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo do funcionario.',
      });
    }
  });
}
