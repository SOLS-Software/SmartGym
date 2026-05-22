import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import {
  normalizeTrainingPayload,
  assertValidId,
  optionalNumber,
  optionalDate,
} from '../../shared/normalize.js';
import type { CompanyChildPayload, TrainingPayload } from '../../shared/api-types.js';

export async function registerTrainingRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { includeInactive?: string; search?: string };
  }>('/trainings', async (request) => {
    const includeInactive = request.query.includeInactive === 'true';
    const search = request.query.search?.trim();

    return prisma.treino.findMany({
      where: {
        ...(includeInactive ? {} : { boInativo: 0 }),
        ...(search ? { dsTreino: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { dsTreino: 'asc' },
    });
  });

  app.post<{
    Body: TrainingPayload;
  }>('/trainings', async (request, reply) => {
    try {
      const data = normalizeTrainingPayload(request.body);
      const training = await prisma.treino.create({ data });
      return reply.code(201).send(training);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar treino.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: TrainingPayload;
  }>('/trainings/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const data = normalizeTrainingPayload(request.body);
      return prisma.treino.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar treino.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/trainings/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);
      return prisma.treino.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do treino.' });
    }
  });

  // Training exercises

  app.get<{
    Params: { id: string };
  }>('/trainings/:id/related/exercises', async (request, reply) => {
    try {
      const idTreino = Number(request.params.id);
      assertValidId(idTreino, 'Treino invalido.');
      return prisma.treinoExercicio.findMany({
        where: { idTreino },
        orderBy: { nrOrdem: 'asc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar exercicios do treino.',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: CompanyChildPayload;
  }>('/trainings/:id/related/exercises', async (request, reply) => {
    try {
      const idTreino = Number(request.params.id);
      assertValidId(idTreino, 'Treino invalido.');

      const training = await prisma.treino.findUnique({
        where: { id: idTreino },
        select: { id: true, idEmpresa: true },
      });

      if (!training) {
        return reply.code(404).send({ message: 'Treino nao encontrado.' });
      }

      const record = await prisma.treinoExercicio.create({
        data: {
          idTreino,
          idEmpresa: optionalNumber(request.body.idEmpresa) ?? training.idEmpresa,
          idExercicio: optionalNumber(request.body.idExercicio),
          idMetodoTreino: optionalNumber(request.body.idMetodoTreino),
          nrOrdem: Number(request.body.nrOrdem ?? 0),
          nrSeries: Number(request.body.nrSeries ?? 0),
          nrRepeticoes: Number(request.body.nrRepeticoes ?? 0),
          qtDescanso: Number(request.body.qtDescanso ?? 0),
          qtPeso: Number(request.body.qtPeso ?? 0),
          cnUnidadeMedida: String(request.body.cnUnidadeMedida ?? ''),
          boInativo: Number(request.body.boInativo ?? 0),
        },
      });

      return reply.code(201).send(record);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar exercicio do treino.',
      });
    }
  });

  app.put<{
    Params: { id: string; childId: string };
    Body: CompanyChildPayload;
  }>('/trainings/:id/related/exercises/:childId', async (request, reply) => {
    try {
      const idTreino = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idTreino, 'Treino invalido.');
      assertValidId(childId, 'Exercicio do treino invalido.');

      const current = await prisma.treinoExercicio.findFirst({
        where: { id: childId, idTreino },
        select: { id: true },
      });

      if (!current) {
        throw new Error('Exercicio do treino invalido.');
      }

      const training = await prisma.treino.findUnique({
        where: { id: idTreino },
        select: { idEmpresa: true },
      });

      return prisma.treinoExercicio.update({
        where: { id: childId },
        data: {
          idEmpresa: optionalNumber(request.body.idEmpresa) ?? training?.idEmpresa ?? null,
          idExercicio: optionalNumber(request.body.idExercicio),
          idMetodoTreino: optionalNumber(request.body.idMetodoTreino),
          nrOrdem: Number(request.body.nrOrdem ?? 0),
          nrSeries: Number(request.body.nrSeries ?? 0),
          nrRepeticoes: Number(request.body.nrRepeticoes ?? 0),
          qtDescanso: Number(request.body.qtDescanso ?? 0),
          qtPeso: Number(request.body.qtPeso ?? 0),
          cnUnidadeMedida: String(request.body.cnUnidadeMedida ?? ''),
          boInativo: Number(request.body.boInativo ?? 0),
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar exercicio do treino.',
      });
    }
  });

  app.patch<{
    Params: { id: string; childId: string };
    Body: { boInativo?: number };
  }>('/trainings/:id/related/exercises/:childId/status', async (request, reply) => {
    try {
      const idTreino = Number(request.params.id);
      const childId = Number(request.params.childId);
      assertValidId(idTreino, 'Treino invalido.');
      assertValidId(childId, 'Exercicio do treino invalido.');

      const current = await prisma.treinoExercicio.findFirst({
        where: { id: childId, idTreino },
        select: { id: true },
      });

      if (!current) {
        throw new Error('Exercicio do treino invalido.');
      }

      return prisma.treinoExercicio.update({
        where: { id: childId },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao alterar status do exercicio do treino.',
      });
    }
  });
}
