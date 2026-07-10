import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { normalizeExercisePayload, assertValidId } from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { getExerciseFilePath } from '../../shared/files.js';
import type {
  ExercicioAreaCorporalPayload,
  ExercicioEquipamentoPayload,
  ExercisePayload,
} from '../../shared/api-types.js';

const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp)$/i;

async function attachExerciseCovers<T extends { id: number }>(exercises: T[]) {
  if (exercises.length === 0) {
    return exercises.map((exercise) => ({
      ...exercise,
      coverImageUrl: null as string | null,
      areas: [] as Array<{ id: number; dsAreaCorporal: string; boInativo: number }>,
    }));
  }

  const exerciseIds = exercises.map((exercise) => exercise.id);

  const [files, areaLinks] = await Promise.all([
    prisma.exercicioArquivo.findMany({
      where: { idExercicio: { in: exerciseIds }, boInativo: 0 },
      orderBy: { dtCadastro: 'asc' },
    }),
    prisma.exercicioAreaCorporal.findMany({
      where: { idExercicio: { in: exerciseIds }, boInativo: 0 },
      include: { areaCorporal: true },
    }),
  ]);

  const coverPathByExercise = new Map<number, string>();
  for (const file of files) {
    if (
      file.idExercicio !== null &&
      !coverPathByExercise.has(file.idExercicio) &&
      IMAGE_EXTENSION_PATTERN.test(file.anCaminho)
    ) {
      coverPathByExercise.set(file.idExercicio, file.anCaminho);
    }
  }

  const paths = [...new Set(coverPathByExercise.values())];
  const signedUrlByPath = new Map<string, string>();

  if (paths.length > 0) {
    const { bucket } = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 5);
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) signedUrlByPath.set(item.path, item.signedUrl);
    }
  }

  const areasByExercise = new Map<number, Array<{ id: number; dsAreaCorporal: string; boInativo: number }>>();
  for (const link of areaLinks) {
    if (link.idExercicio === null || !link.areaCorporal) continue;
    const list = areasByExercise.get(link.idExercicio) ?? [];
    list.push(link.areaCorporal);
    areasByExercise.set(link.idExercicio, list);
  }

  return exercises.map((exercise) => {
    const path = coverPathByExercise.get(exercise.id);
    return {
      ...exercise,
      coverImageUrl: path ? signedUrlByPath.get(path) ?? null : null,
      areas: areasByExercise.get(exercise.id) ?? [],
    };
  });
}

export async function registerExerciseRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string; limit?: string; offset?: string; includeCover?: string; ids?: string };
  }>('/exercises', async (request) => {
    const search = request.query.search?.trim();
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const offset = request.query.offset ? Number(request.query.offset) : undefined;
    const includeCover = request.query.includeCover === 'true';
    const ids = request.query.ids
      ? request.query.ids.split(',').map(Number).filter(Number.isFinite)
      : undefined;

    const exercises = await prisma.exercicio.findMany({
      where: {
        ...(search ? { dsExercicio: { contains: search, mode: 'insensitive' } } : {}),
        ...(ids ? { id: { in: ids } } : {}),
      },
      orderBy: { dsExercicio: 'asc' },
      take: limit,
      skip: offset,
    });

    return includeCover ? attachExerciseCovers(exercises) : exercises;
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

  // Exercise equipment

  app.get<{
    Params: { id: string };
  }>('/exercises/:id/equipment', async (request, reply) => {
    try {
      const idExericio = Number(request.params.id);
      assertValidId(idExericio, 'Exercicio invalido.');
      return prisma.exercicioEquipamento.findMany({
        where: { idExericio, boInativo: 0 },
        include: { equipamento: true },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar equipamentos do exercicio.',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: ExercicioEquipamentoPayload;
  }>('/exercises/:id/equipment', async (request, reply) => {
    try {
      const idExericio = Number(request.params.id);
      const idEquipamento = Number(request.body.idEquipamento);
      assertValidId(idExericio, 'Exercicio invalido.');
      assertValidId(idEquipamento, 'Equipamento invalido.');

      const existing = await prisma.exercicioEquipamento.findFirst({
        where: { idExericio, idEquipamento, boInativo: 0 },
      });

      if (existing) {
        return reply.code(409).send({ message: 'Equipamento ja vinculado a este exercicio.' });
      }

      const link = await prisma.exercicioEquipamento.create({
        data: { idExericio, idEquipamento },
        include: { equipamento: true },
      });

      return reply.code(201).send(link);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao vincular equipamento ao exercicio.',
      });
    }
  });

  app.delete<{
    Params: { id: string; linkId: string };
  }>('/exercises/:id/equipment/:linkId', async (request, reply) => {
    try {
      const idExericio = Number(request.params.id);
      const linkId = Number(request.params.linkId);
      assertValidId(idExericio, 'Exercicio invalido.');
      assertValidId(linkId, 'Vinculo invalido.');

      const existing = await prisma.exercicioEquipamento.findFirst({
        where: { id: linkId, idExericio },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Vinculo nao encontrado.' });
      }

      return prisma.exercicioEquipamento.update({
        where: { id: linkId },
        data: { boInativo: 1 },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover equipamento do exercicio.',
      });
    }
  });

  // Exercise body areas

  app.get<{
    Params: { id: string };
  }>('/exercises/:id/areas', async (request, reply) => {
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');
      return prisma.exercicioAreaCorporal.findMany({
        where: { idExercicio, boInativo: 0 },
        include: { areaCorporal: true },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar areas do exercicio.',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: ExercicioAreaCorporalPayload;
  }>('/exercises/:id/areas', async (request, reply) => {
    try {
      const idExercicio = Number(request.params.id);
      const idAreaCorporal = Number(request.body.idAreaCorporal);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(idAreaCorporal, 'Area corporal invalida.');

      const existing = await prisma.exercicioAreaCorporal.findFirst({
        where: { idExercicio, idAreaCorporal, boInativo: 0 },
      });

      if (existing) {
        return reply.code(409).send({ message: 'Area ja vinculada a este exercicio.' });
      }

      const link = await prisma.exercicioAreaCorporal.create({
        data: { idExercicio, idAreaCorporal },
        include: { areaCorporal: true },
      });

      return reply.code(201).send(link);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao vincular area ao exercicio.',
      });
    }
  });

  app.delete<{
    Params: { id: string; linkId: string };
  }>('/exercises/:id/areas/:linkId', async (request, reply) => {
    try {
      const idExercicio = Number(request.params.id);
      const linkId = Number(request.params.linkId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(linkId, 'Vinculo invalido.');

      const existing = await prisma.exercicioAreaCorporal.findFirst({
        where: { id: linkId, idExercicio },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Vinculo nao encontrado.' });
      }

      return prisma.exercicioAreaCorporal.update({
        where: { id: linkId },
        data: { boInativo: 1 },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover area do exercicio.',
      });
    }
  });
}
