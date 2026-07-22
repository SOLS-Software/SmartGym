import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { normalizeExercisePayload, assertValidId } from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import { assertAllowedUploadType, assertUploadBuffer, getExerciseFilePath } from '../../shared/files.js';
import type {
  ExercicioAreaCorporalPayload,
  ExercicioEquipamentoPayload,
  ExercisePayload,
} from '../../shared/api-types.js';

const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp)$/i;

// ---------------------------------------------------------------------------
// Validacao de entrada
// ---------------------------------------------------------------------------

const queryFlagSchema = z.enum(['true', 'false']).optional();

const queryIntSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().optional(),
);

const queryOffsetSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().min(0).optional(),
);

const listQuerySchema = z.object({
  search: z.string().optional(),
  limit: queryIntSchema,
  offset: queryOffsetSchema,
  includeCover: queryFlagSchema,
  ids: z.string().regex(/^[\d,\s]*$/, 'Lista de ids invalida.').optional(),
});

const relatedListQuerySchema = z.object({ limit: queryIntSchema });

const bodyNumberSchema = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .refine(
    (value) => value == null || value === '' || Number.isFinite(Number(value)),
    'Valor numerico invalido.',
  );

const equipmentBodySchema = z.object({ idEquipamento: bodyNumberSchema });

const areaBodySchema = z.object({ idAreaCorporal: bodyNumberSchema });

const statusBodySchema = z.object({
  boInativo: z.union([z.boolean(), z.number(), z.string()]).nullish(),
});

function clampLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 1000, 1), 1000);
}

// ---------------------------------------------------------------------------
// Tenant isolation: Exercicio.idEmpresa -> Empresa.idCliente. Registros com
// idEmpresa nulo sao tratados como catalogo global (visiveis a todos).
// ---------------------------------------------------------------------------

function tenantCompanyWhere(idCliente: number) {
  return { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] };
}

async function exerciseBelongsToTenant(idCliente: number, idExercicio: number) {
  const exercise = await prisma.exercicio.findFirst({
    where: { id: idExercicio, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  return Boolean(exercise);
}

// Mutacao exige posse pelo tenant — nao casa idEmpresa nulo (evita editar
// catalogo global/de outro tenant). Leitura continua usando exerciseBelongsToTenant.
async function exerciseOwnedByTenant(idCliente: number, idExercicio: number) {
  const exercise = await prisma.exercicio.findFirst({
    where: { id: idExercicio, empresa: { idCliente } },
    select: { id: true },
  });
  return Boolean(exercise);
}

async function assertCompanyInTenant(idCliente: number, idEmpresa: number | null | undefined) {
  if (idEmpresa == null) return;
  const company = await prisma.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!company) throw new Error('Empresa nao pertence ao cliente.');
}

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
      where: { idExercicio: { in: exerciseIds }, boInativo: false },
      orderBy: { dtCadastro: 'asc' },
    }),
    prisma.exercicioAreaCorporal.findMany({
      where: { idExercicio: { in: exerciseIds }, boInativo: false },
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

  const areasByExercise = new Map<number, Array<{ id: number; dsAreaCorporal: string; boInativo: boolean }>>();
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
  }>('/exercises', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const search = parsedQuery.data.search?.trim();
    const includeCover = parsedQuery.data.includeCover === 'true';
    const ids = parsedQuery.data.ids
      ? parsedQuery.data.ids.split(',').map(Number).filter(Number.isFinite)
      : undefined;

    const exercises = await prisma.exercicio.findMany({
      where: {
        ...(search ? { dsExercicio: { contains: search, mode: 'insensitive' } } : {}),
        ...(ids ? { id: { in: ids } } : {}),
        ...tenantCompanyWhere(idCliente),
      },
      orderBy: { dsExercicio: 'asc' },
      take: clampLimit(parsedQuery.data.limit),
      skip: parsedQuery.data.offset,
    });

    return includeCover ? attachExerciseCovers(exercises) : exercises;
  });

  app.post<{
    Body: ExercisePayload;
  }>('/exercises', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizeExercisePayload(request.body);
      await assertCompanyInTenant(idCliente, data.idEmpresa);
      const exercise = await prisma.exercicio.create({ data });
      return reply.code(201).send(exercise);
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao criar exercicio.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: ExercisePayload;
  }>('/exercises/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Exercicio invalido.');
      if (!(await exerciseOwnedByTenant(idCliente, id))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizeExercisePayload(request.body);
      await assertCompanyInTenant(idCliente, data.idEmpresa);
      return prisma.exercicio.update({ where: { id }, data });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar exercicio.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/exercises/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Exercicio invalido.');
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await exerciseOwnedByTenant(idCliente, id))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const boInativo = toBool(parsedBody.data.boInativo);
      return prisma.exercicio.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do exercicio.' });
    }
  });

  // Exercise files

  app.get<{
    Params: { id: string };
  }>('/exercises/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await exerciseBelongsToTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.exercicioArquivo.findMany({
        where: { idExercicio, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');

      if (!(await exerciseBelongsToTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const buffer = await file.toBuffer();
      const safeMime = await assertUploadBuffer(buffer);
      const path = getExerciseFilePath(idExercicio, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: safeMime, upsert: false });

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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      if (!(await exerciseBelongsToTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const exerciseFile = await prisma.exercicioArquivo.findFirst({
        where: { id: fileId, idExercicio, boInativo: false },
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      if (!(await exerciseOwnedByTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existingFile = await prisma.exercicioArquivo.findFirst({
        where: { id: fileId, idExercicio, boInativo: false },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return prisma.exercicioArquivo.update({
        where: { id: fileId },
        data: { boInativo: true },
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await exerciseBelongsToTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.exercicioEquipamento.findMany({
        where: { idExercicio, boInativo: false },
        include: { equipamento: true },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      if (!equipmentBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const idExercicio = Number(request.params.id);
      const idEquipamento = Number(request.body.idEquipamento);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(idEquipamento, 'Equipamento invalido.');

      if (!(await exerciseBelongsToTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await prisma.exercicioEquipamento.findFirst({
        where: { idExercicio, idEquipamento, boInativo: false },
      });

      if (existing) {
        return reply.code(409).send({ message: 'Equipamento ja vinculado a este exercicio.' });
      }

      const link = await prisma.exercicioEquipamento.create({
        data: { idExercicio, idEquipamento },
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      const linkId = Number(request.params.linkId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(linkId, 'Vinculo invalido.');

      if (!(await exerciseOwnedByTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await prisma.exercicioEquipamento.findFirst({
        where: { id: linkId, idExercicio },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Vinculo nao encontrado.' });
      }

      return prisma.exercicioEquipamento.update({
        where: { id: linkId },
        data: { boInativo: true },
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      assertValidId(idExercicio, 'Exercicio invalido.');
      const parsedQuery = relatedListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      if (!(await exerciseBelongsToTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.exercicioAreaCorporal.findMany({
        where: { idExercicio, boInativo: false },
        include: { areaCorporal: true },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      if (!areaBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const idExercicio = Number(request.params.id);
      const idAreaCorporal = Number(request.body.idAreaCorporal);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(idAreaCorporal, 'Area corporal invalida.');

      if (!(await exerciseBelongsToTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await prisma.exercicioAreaCorporal.findFirst({
        where: { idExercicio, idAreaCorporal, boInativo: false },
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idExercicio = Number(request.params.id);
      const linkId = Number(request.params.linkId);
      assertValidId(idExercicio, 'Exercicio invalido.');
      assertValidId(linkId, 'Vinculo invalido.');

      if (!(await exerciseOwnedByTenant(idCliente, idExercicio))) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existing = await prisma.exercicioAreaCorporal.findFirst({
        where: { id: linkId, idExercicio },
      });

      if (!existing) {
        return reply.code(404).send({ message: 'Vinculo nao encontrado.' });
      }

      return prisma.exercicioAreaCorporal.update({
        where: { id: linkId },
        data: { boInativo: true },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover area do exercicio.',
      });
    }
  });
}
