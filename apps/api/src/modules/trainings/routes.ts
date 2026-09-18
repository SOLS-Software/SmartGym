import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@solsfit/db';
import {
  normalizeTrainingPayload,
  assertValidId,
  optionalNumber,
  optionalDate,
} from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import type { CompanyChildPayload, TrainingPayload } from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';

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
  includeInactive: queryFlagSchema,
  search: z.string().optional(),
  limit: queryIntSchema,
  offset: queryOffsetSchema,
});

const relatedExercisesQuerySchema = z.object({
  includeCover: queryFlagSchema,
  limit: queryIntSchema,
});

const bodyNumberSchema = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .refine(
    (value) => value == null || value === '' || Number.isFinite(Number(value)),
    'Valor numerico invalido.',
  );

const trainingExerciseBodySchema = z.object({
  idEmpresa: bodyNumberSchema,
  idExercicio: bodyNumberSchema,
  idMetodoTreino: bodyNumberSchema,
  nrOrdem: bodyNumberSchema,
  nrSeries: bodyNumberSchema,
  nrRepeticoes: bodyNumberSchema,
  qtDescanso: bodyNumberSchema,
  qtPeso: bodyNumberSchema,
  idUnidadeMedida: bodyNumberSchema,
});

const statusBodySchema = z.object({
  boInativo: z.union([z.boolean(), z.number(), z.string()]).nullish(),
});

function clampLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 1000, 1), 1000);
}

// ---------------------------------------------------------------------------
// Tenant isolation
//
// Treino pertence ao CLIENTE (tb_Treinos.idCliente, desde 09/2026). idEmpresa
// segue opcional e significa "ficha modelo, valida em qualquer filial deste
// cliente" — antes essa mesma ausencia era lida como GLOBAL, e a ficha montada
// pelo professor de uma academia ficava legivel por todas as outras.
//
// tenantCompanyWhere continua com a semantica antiga porque ainda serve o
// EXERCICIO, onde idEmpresa nulo e catalogo global de verdade (mantido pelo
// super-admin, ver exercises/routes.ts).
// ---------------------------------------------------------------------------

function trainingTenantWhere(idCliente: number) {
  return { idCliente };
}

function tenantCompanyWhere(idCliente: number) {
  return { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] };
}

async function assertCompanyInTenant(db: PrismaClient, idCliente: number, idEmpresa: number | null | undefined) {
  if (idEmpresa == null) return;
  const company = await db.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!company) throw new Error('Empresa nao pertence ao cliente.');
}

async function assertExerciseInTenant(db: PrismaClient, idCliente: number, idExercicio: number | null | undefined) {
  if (idExercicio == null) return;
  const exercise = await db.exercicio.findFirst({
    where: { id: idExercicio, ...tenantCompanyWhere(idCliente) },
    select: { id: true },
  });
  if (!exercise) throw new Error('Exercicio nao pertence ao cliente.');
}

async function attachExerciseCoversToTrainingExercises<
  T extends { idExercicio: number | null; exercicio: { id: number } | null },
>(db: PrismaClient, records: T[], idCliente: number) {
  const exerciseIds = records
    .map((record) => record.exercicio?.id)
    .filter((id): id is number => typeof id === 'number');

  if (exerciseIds.length === 0) {
    return records.map((record) => ({
      ...record,
      exercicio: record.exercicio
        ? { ...record.exercicio, coverImageUrl: null, areas: [], equipamentos: [] }
        : null,
    }));
  }

  const [files, areaLinks, equipmentLinks] = await Promise.all([
    db.exercicioArquivo.findMany({
      where: { idExercicio: { in: exerciseIds }, boInativo: false },
      orderBy: { dtCadastro: 'asc' },
    }),
    db.exercicioAreaCorporal.findMany({
      where: { idExercicio: { in: exerciseIds }, boInativo: false },
      include: { areaCorporal: true },
    }),
    // Mesmo criterio de exercises/routes.ts: equipamento vem em lote para o
    // card, filtrado pelo que o tenant enxerga (proprio + catalogo global).
    db.exercicioEquipamento.findMany({
      where: {
        idExercicio: { in: exerciseIds },
        boInativo: false,
        equipamento: { OR: [{ idCliente: null }, { idCliente }] },
      },
      include: { equipamento: true },
      orderBy: { dtCadastro: 'asc' },
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

  const equipmentByExercise = new Map<number, Array<{ id: number; nmEquipamento: string | null; dsEquipamento: string | null }>>();
  for (const link of equipmentLinks) {
    if (!link.equipamento) continue;
    const list = equipmentByExercise.get(link.idExercicio) ?? [];
    list.push({
      id: link.equipamento.id,
      nmEquipamento: link.equipamento.nmEquipamento,
      dsEquipamento: link.equipamento.dsEquipamento,
    });
    equipmentByExercise.set(link.idExercicio, list);
  }

  return records.map((record) => {
    if (!record.exercicio) return { ...record, exercicio: null };
    const path = coverPathByExercise.get(record.exercicio.id);
    return {
      ...record,
      exercicio: {
        ...record.exercicio,
        coverImageUrl: path ? signedUrlByPath.get(path) ?? null : null,
        areas: areasByExercise.get(record.exercicio.id) ?? [],
        equipamentos: equipmentByExercise.get(record.exercicio.id) ?? [],
      },
    };
  });
}

export async function registerTrainingRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { includeInactive?: string; search?: string; limit?: string; offset?: string };
  }>('/trainings', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const includeInactive = parsedQuery.data.includeInactive === 'true';
    const search = parsedQuery.data.search?.trim();

    return request.tenantDb.treino.findMany({
      where: {
        ...(includeInactive ? {} : { boInativo: false }),
        ...(search ? { dsTreino: { contains: search, mode: 'insensitive' } } : {}),
        ...trainingTenantWhere(idCliente),
      },
      orderBy: { dsTreino: 'asc' },
      take: clampLimit(parsedQuery.data.limit),
      skip: parsedQuery.data.offset,
    });
  });

  app.post<{
    Body: TrainingPayload;
  }>('/trainings', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizeTrainingPayload(request.body);
      await assertCompanyInTenant(request.tenantDb, idCliente, data.idEmpresa);
      const existing = await request.tenantDb.treino.findFirst({
        where: {
          dsTreino: { equals: data.dsTreino, mode: 'insensitive' },
          ...trainingTenantWhere(idCliente),
        },
        select: { id: true },
      });
      if (existing) {
        return reply.code(400).send({ message: 'Já existe um treino com este nome.' });
      }
      // Tenant SEMPRE do token, nunca do body.
      const training = await request.tenantDb.treino.create({ data: { ...data, idCliente } });
      return reply.code(201).send(training);
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao criar treino.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: TrainingPayload;
  }>('/trainings/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Treino invalido.');
      const current = await request.tenantDb.treino.findFirst({
        where: { id, ...trainingTenantWhere(idCliente) },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizeTrainingPayload(request.body);
      await assertCompanyInTenant(request.tenantDb, idCliente, data.idEmpresa);
      const existing = await request.tenantDb.treino.findFirst({
        where: {
          dsTreino: { equals: data.dsTreino, mode: 'insensitive' },
          id: { not: id },
          ...trainingTenantWhere(idCliente),
        },
        select: { id: true },
      });
      if (existing) {
        return reply.code(400).send({ message: 'Já existe um treino com este nome.' });
      }
      return request.tenantDb.treino.update({ where: { id }, data });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar treino.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/trainings/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Treino invalido.');
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const current = await request.tenantDb.treino.findFirst({
        where: { id, ...trainingTenantWhere(idCliente) },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const boInativo = toBool(parsedBody.data.boInativo);
      return request.tenantDb.treino.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do treino.' });
    }
  });

  // Training exercises

  app.get<{
    Params: { id: string };
    Querystring: { includeCover?: string };
  }>('/trainings/:id/related/exercises', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idTreino = Number(request.params.id);
      assertValidId(idTreino, 'Treino invalido.');
      const parsedQuery = relatedExercisesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const training = await request.tenantDb.treino.findFirst({
        where: { id: idTreino, ...trainingTenantWhere(idCliente) },
        select: { id: true },
      });
      if (!training) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const records = await request.tenantDb.treinoExercicio.findMany({
        where: { idTreino },
        orderBy: { nrOrdem: 'asc' },
        include: { exercicio: true, unidadeMedida: true },
        take: clampLimit(parsedQuery.data.limit),
      });

      if (parsedQuery.data.includeCover !== 'true') {
        return records;
      }

      return attachExerciseCoversToTrainingExercises(request.tenantDb, records, idCliente);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar exercicios do treino.'),
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: CompanyChildPayload;
  }>('/trainings/:id/related/exercises', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idTreino = Number(request.params.id);
      assertValidId(idTreino, 'Treino invalido.');

      const training = await request.tenantDb.treino.findFirst({
        where: { id: idTreino, ...trainingTenantWhere(idCliente) },
        select: { id: true, idEmpresa: true },
      });

      if (!training) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      if (!trainingExerciseBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const idExercicioNovo = optionalNumber(request.body.idExercicio);
      if (!idExercicioNovo) throw new Error('Selecione o exercicio.');
      await assertCompanyInTenant(request.tenantDb, idCliente, optionalNumber(request.body.idEmpresa));
      await assertExerciseInTenant(request.tenantDb, idCliente, idExercicioNovo);
      const record = await request.tenantDb.treinoExercicio.create({
        data: {
          idTreino,
          idEmpresa: optionalNumber(request.body.idEmpresa) ?? training.idEmpresa,
          idExercicio: idExercicioNovo,
          idMetodoTreino: optionalNumber(request.body.idMetodoTreino),
          nrOrdem: Number(request.body.nrOrdem ?? 0),
          nrSeries: Number(request.body.nrSeries ?? 0),
          nrRepeticoes: Number(request.body.nrRepeticoes ?? 0),
          qtDescanso: Number(request.body.qtDescanso ?? 0),
          qtPeso: Number(request.body.qtPeso ?? 0),
          idUnidadeMedida: optionalNumber(request.body.idUnidadeMedida),
          boInativo: toBool(request.body.boInativo),
        },
      });

      return reply.code(201).send(record);
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao criar exercicio do treino.',
      });
    }
  });

  app.put<{
    Params: { id: string; childId: string };
    Body: CompanyChildPayload;
  }>('/trainings/:id/related/exercises/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idTreino = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idTreino, 'Treino invalido.');
      assertValidId(childId, 'Exercicio do treino invalido.');

      const training = await request.tenantDb.treino.findFirst({
        where: { id: idTreino, ...trainingTenantWhere(idCliente) },
        select: { idEmpresa: true },
      });

      if (!training) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const current = await request.tenantDb.treinoExercicio.findFirst({
        where: { id: childId, idTreino },
        select: { id: true },
      });

      if (!current) {
        throw new Error('Exercicio do treino invalido.');
      }

      if (!trainingExerciseBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const idExercicioEdit = optionalNumber(request.body.idExercicio);
      if (!idExercicioEdit) throw new Error('Selecione o exercicio.');
      await assertCompanyInTenant(request.tenantDb, idCliente, optionalNumber(request.body.idEmpresa));
      await assertExerciseInTenant(request.tenantDb, idCliente, idExercicioEdit);
      return request.tenantDb.treinoExercicio.update({
        where: { id: childId },
        data: {
          idEmpresa: optionalNumber(request.body.idEmpresa) ?? training?.idEmpresa ?? null,
          idExercicio: idExercicioEdit,
          idMetodoTreino: optionalNumber(request.body.idMetodoTreino),
          nrOrdem: Number(request.body.nrOrdem ?? 0),
          nrSeries: Number(request.body.nrSeries ?? 0),
          nrRepeticoes: Number(request.body.nrRepeticoes ?? 0),
          qtDescanso: Number(request.body.qtDescanso ?? 0),
          qtPeso: Number(request.body.qtPeso ?? 0),
          idUnidadeMedida: optionalNumber(request.body.idUnidadeMedida),
          boInativo: toBool(request.body.boInativo),
        },
      });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar exercicio do treino.',
      });
    }
  });

  app.patch<{
    Params: { id: string; childId: string };
    Body: { boInativo?: number };
  }>('/trainings/:id/related/exercises/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idTreino = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idTreino, 'Treino invalido.');
      assertValidId(childId, 'Exercicio do treino invalido.');

      const training = await request.tenantDb.treino.findFirst({
        where: { id: idTreino, ...trainingTenantWhere(idCliente) },
        select: { id: true },
      });

      if (!training) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const current = await request.tenantDb.treinoExercicio.findFirst({
        where: { id: childId, idTreino },
        select: { id: true },
      });

      if (!current) {
        throw new Error('Exercicio do treino invalido.');
      }

      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      return request.tenantDb.treinoExercicio.update({
        where: { id: childId },
        data: { boInativo: toBool(parsedBody.data.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          clientErrorMessage(error, 'Erro ao alterar status do exercicio do treino.'),
      });
    }
  });
}
