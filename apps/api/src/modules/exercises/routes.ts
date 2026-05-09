import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { normalizeExercisePayload, assertValidId } from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { getExerciseFilePath } from '../../shared/files.js';
import type { ExercisePayload } from '../../shared/api-types.js';

export async function registerExerciseRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/exercises', async (request) => {
    const search = request.query.search?.trim();
    return prisma.exercicio.findMany({
      where: search
        ? { dsExercicio: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: { dsExercicio: 'asc' },
    });
  });

  app.post<{
    Body: ExercisePayload;
  }>('/exercises', async (request, reply) => {
    try {
      const data = normalizeExercisePayload(request.body);
      const exercise = await prisma.exercicio.create({ data });
      return reply.code(201).send(exercise);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar exercicio.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: ExercisePayload;
  }>('/exercises/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const data = normalizeExercisePayload(request.body);
      return prisma.exercicio.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar exercicio.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/exercises/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);
      return prisma.exercicio.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do exercicio.' });
    }
  });

  // Exercise files

  app.get<{
    Params: { id: string };
  }>('/exercises/:id/files', async (request, reply) => {
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');
      return prisma.exercicioArquivo.findMany({
        where: { idExercicio, boInativo: 0 },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar arquivos do exercicio.',
      });
    }
  });

  app.post<{
    Params: { id: string };
  }>('/exercises/:id/files', async (request, reply) => {
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');

      const exercise = await prisma.exercicio.findUnique({
        where: { id: idExercicio },
        select: { id: true },
      });

      if (!exercise) {
        return reply.code(404).send({ message: 'Exercicio nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

      const buffer = await file.toBuffer();
      const path = getExerciseFilePath(idExercicio, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const exerciseFile = await prisma.exercicioArquivo.create({
        data: {
          idExercicio,
          dsArquivo: file.filename,
          anCaminho: path,
          idTiposArquivos: null,
          cnChaveAcesso: 0,
          cnDistribuidor: 0,
        },
      });

      return reply.code(201).send(exerciseFile);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao enviar arquivo do exercicio.',
      });
    }
  });

  app.get<{
    Params: { id: string; fileId: string };
  }>('/exercises/:id/files/:fileId/url', async (request, reply) => {
    try {
      const idExercicio = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const exerciseFile = await prisma.exercicioArquivo.findFirst({
        where: { id: fileId, idExercicio, boInativo: 0 },
      });

      if (!exerciseFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(exerciseFile.anCaminho, 60 * 5);

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
  }>('/exercises/:id/files/:fileId', async (request, reply) => {
    try {
      const idExercicio = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await prisma.exercicioArquivo.findFirst({
        where: { id: fileId, idExercicio, boInativo: 0 },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return prisma.exercicioArquivo.update({
        where: { id: fileId },
        data: { boInativo: 1 },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo do exercicio.',
      });
    }
  });
}
