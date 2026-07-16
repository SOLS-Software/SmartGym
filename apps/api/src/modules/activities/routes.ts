import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { assertValidId, optionalDate, optionalNumber, requiredText } from '../../shared/normalize.js';
import { prisma } from '../../shared/prisma.js';

type ActivityPayload = {
  idEmpresa?: number | string | null;
  idEsporte?: number | string | null;
  dsAtividade?: string;
  boInativo?: number;
};

type ActivitySchedulePayload = {
  idEmpresa?: number | string | null;
  idCategoria?: number | string | null;
  idLocalidade?: number | string | null;
  dtInicial?: string | null;
  dtFinal?: string | null;
  qtAlunos?: number | string | null;
  boInativo?: number;
};

type ScheduleEmployeePayload = {
  idEmpresa?: number | string | null;
  idFuncionario?: number | string | null;
  boInativo?: number;
};

type ScheduleStudentPayload = {
  idEmpresa?: number | string | null;
  idAluno?: number | string | null;
  boInativo?: number;
};

function normalizeActivityPayload(payload: ActivityPayload) {
  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    idEsporte: optionalNumber(payload.idEsporte),
    dsAtividade: requiredText(payload.dsAtividade, 'Informe a atividade.'),
    boInativo: toBool(payload.boInativo),
  };
}

function normalizeActivitySchedulePayload(activityId: number, payload: ActivitySchedulePayload) {
  const idEmpresa = optionalNumber(payload.idEmpresa);
  if (!idEmpresa) throw new Error('Informe a empresa da agenda.');
  return {
    idEmpresa,
    idAtividade: activityId,
    idCategoria: optionalNumber(payload.idCategoria),
    idLocalidade: optionalNumber(payload.idLocalidade),
    dtInicial: optionalDate(payload.dtInicial) ?? null,
    dtFinal: optionalDate(payload.dtFinal) ?? null,
    qtAlunos: optionalNumber(payload.qtAlunos),
    boInativo: toBool(payload.boInativo),
  };
}

function normalizeScheduleEmployeePayload(scheduleId: number, payload: ScheduleEmployeePayload) {
  const idEmpresa = optionalNumber(payload.idEmpresa);
  if (!idEmpresa) throw new Error('Informe a empresa.');
  const idFuncionario = optionalNumber(payload.idFuncionario);
  if (!idFuncionario) throw new Error('Informe o funcionario.');
  return {
    idEmpresa,
    idAtividadeAgenda: scheduleId,
    idFuncionario,
    boInativo: toBool(payload.boInativo),
  };
}

function normalizeScheduleStudentPayload(scheduleId: number, payload: ScheduleStudentPayload) {
  const idEmpresa = optionalNumber(payload.idEmpresa);
  if (!idEmpresa) throw new Error('Informe a empresa.');
  const idAluno = optionalNumber(payload.idAluno);
  if (!idAluno) throw new Error('Informe o aluno.');
  return {
    idEmpresa,
    idAtividadeAgenda: scheduleId,
    idAluno,
    boInativo: toBool(payload.boInativo),
  };
}

async function assertScheduleBelongsToActivity(activityId: number, scheduleId: number) {
  const schedule = await prisma.atividadeAgenda.findFirst({
    where: { id: scheduleId, idAtividade: activityId },
    select: { id: true },
  });

  if (!schedule) {
    throw new Error('Agenda nao encontrada.');
  }
}

function buildDateRangeFilter(dtInicio?: string, dtFim?: string) {
  if (!dtInicio && !dtFim) return undefined;
  return {
    ...(dtInicio ? { gte: new Date(dtInicio) } : {}),
    ...(dtFim ? { lte: new Date(`${dtFim}T23:59:59`) } : {}),
  };
}

export async function registerActivityRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      includeDetails?: string;
      includeInactive?: string;
      search?: string;
      dtInicio?: string;
      dtFim?: string;
    };
  }>('/activities', async (request) => {
    const includeDetails = request.query.includeDetails === 'true';
    const includeInactive = request.query.includeInactive === 'true';
    const search = request.query.search?.trim();
    const { dtInicio, dtFim } = request.query;
    const dateRangeFilter = buildDateRangeFilter(dtInicio, dtFim);

    return prisma.atividade.findMany({
      where: {
        ...(includeInactive ? {} : { boInativo: false }),
        ...(search ? { dsAtividade: { contains: search, mode: 'insensitive' } } : {}),
        ...(dateRangeFilter
          ? {
              atividadeAgendas: {
                some: {
                  boInativo: false,
                  dtInicial: dateRangeFilter,
                },
              },
            }
          : {}),
      },
      include: includeDetails
        ? {
            empresa: true,
            esporte: true,
            atividadeAgendas: {
              where: {
                boInativo: false,
                ...(dateRangeFilter ? { dtInicial: dateRangeFilter } : {}),
              },
              include: {
                empresa: true,
                categoria: true,
                funcionarioAtividadeAgendas: {
                  where: { boInativo: false },
                  include: { funcionario: true },
                  orderBy: { dtCadastro: 'desc' },
                },
                alunoAtividadeAgendas: {
                  where: { boInativo: false },
                  select: { id: true, idAluno: true },
                },
              },
              orderBy: { dtInicial: 'asc' },
            },
          }
        : undefined,
      orderBy: { dsAtividade: 'asc' },
    });
  });

  app.post<{ Body: ActivityPayload }>('/activities', async (request, reply) => {
    try {
      const data = normalizeActivityPayload(request.body);
      return reply.code(201).send(await prisma.atividade.create({ data }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar atividade.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: ActivityPayload;
  }>('/activities/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Atividade invalida.');
      const data = normalizeActivityPayload(request.body);
      return prisma.atividade.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar atividade.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/activities/:id/status', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Atividade invalida.');
      return prisma.atividade.update({
        where: { id },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status da atividade.',
      });
    }
  });

  app.get<{ Params: { id: string } }>('/activities/:id/related/schedules', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      assertValidId(idAtividade, 'Atividade invalida.');
      return prisma.atividadeAgenda.findMany({
        where: { idAtividade },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar agendas da atividade.',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: ActivitySchedulePayload;
  }>('/activities/:id/related/schedules', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      assertValidId(idAtividade, 'Atividade invalida.');
      const activity = await prisma.atividade.findUnique({ where: { id: idAtividade }, select: { id: true } });
      if (!activity) {
        return reply.code(404).send({ message: 'Atividade nao encontrada.' });
      }
      return reply.code(201).send(await prisma.atividadeAgenda.create({
        data: normalizeActivitySchedulePayload(idAtividade, request.body),
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar agenda da atividade.',
      });
    }
  });

  app.put<{
    Params: { id: string; scheduleId: string };
    Body: ActivitySchedulePayload;
  }>('/activities/:id/related/schedules/:scheduleId', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      const current = await prisma.atividadeAgenda.findFirst({
        where: { id: scheduleId, idAtividade },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Agenda nao encontrada.' });
      }
      return prisma.atividadeAgenda.update({
        where: { id: scheduleId },
        data: normalizeActivitySchedulePayload(idAtividade, request.body),
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar agenda da atividade.',
      });
    }
  });

  app.patch<{
    Params: { id: string; scheduleId: string };
    Body: { boInativo?: number };
  }>('/activities/:id/related/schedules/:scheduleId/status', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      const current = await prisma.atividadeAgenda.findFirst({
        where: { id: scheduleId, idAtividade },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Agenda nao encontrada.' });
      }
      return prisma.atividadeAgenda.update({
        where: { id: scheduleId },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status da agenda.',
      });
    }
  });

  app.get<{
    Params: { id: string; scheduleId: string };
  }>('/activities/:id/related/schedules/:scheduleId/employees', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      await assertScheduleBelongsToActivity(idAtividade, scheduleId);

      return prisma.funcionarioAtividadeAgenda.findMany({
        where: { idAtividadeAgenda: scheduleId },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar funcionarios da agenda.',
      });
    }
  });

  app.post<{
    Params: { id: string; scheduleId: string };
    Body: ScheduleEmployeePayload;
  }>('/activities/:id/related/schedules/:scheduleId/employees', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      await assertScheduleBelongsToActivity(idAtividade, scheduleId);

      return reply.code(201).send(await prisma.funcionarioAtividadeAgenda.create({
        data: normalizeScheduleEmployeePayload(scheduleId, request.body),
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao adicionar funcionario na agenda.',
      });
    }
  });

  app.put<{
    Params: { id: string; scheduleId: string; employeeScheduleId: string };
    Body: ScheduleEmployeePayload;
  }>('/activities/:id/related/schedules/:scheduleId/employees/:employeeScheduleId', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      const employeeScheduleId = Number(request.params.employeeScheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      assertValidId(employeeScheduleId, 'Funcionario da agenda invalido.');
      await assertScheduleBelongsToActivity(idAtividade, scheduleId);

      const current = await prisma.funcionarioAtividadeAgenda.findFirst({
        where: { id: employeeScheduleId, idAtividadeAgenda: scheduleId },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Funcionario da agenda nao encontrado.' });
      }

      return prisma.funcionarioAtividadeAgenda.update({
        where: { id: employeeScheduleId },
        data: normalizeScheduleEmployeePayload(scheduleId, request.body),
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar funcionario da agenda.',
      });
    }
  });

  app.patch<{
    Params: { id: string; scheduleId: string; employeeScheduleId: string };
    Body: { boInativo?: number };
  }>('/activities/:id/related/schedules/:scheduleId/employees/:employeeScheduleId/status', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      const employeeScheduleId = Number(request.params.employeeScheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      assertValidId(employeeScheduleId, 'Funcionario da agenda invalido.');
      await assertScheduleBelongsToActivity(idAtividade, scheduleId);

      const current = await prisma.funcionarioAtividadeAgenda.findFirst({
        where: { id: employeeScheduleId, idAtividadeAgenda: scheduleId },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Funcionario da agenda nao encontrado.' });
      }

      return prisma.funcionarioAtividadeAgenda.update({
        where: { id: employeeScheduleId },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status do funcionario da agenda.',
      });
    }
  });

  app.get<{
    Params: { id: string; scheduleId: string };
  }>('/activities/:id/related/schedules/:scheduleId/students', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      await assertScheduleBelongsToActivity(idAtividade, scheduleId);

      return prisma.alunoAtividadeAgenda.findMany({
        where: { idAtividadeAgenda: scheduleId },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar alunos da agenda.',
      });
    }
  });

  app.post<{
    Params: { id: string; scheduleId: string };
    Body: ScheduleStudentPayload;
  }>('/activities/:id/related/schedules/:scheduleId/students', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      await assertScheduleBelongsToActivity(idAtividade, scheduleId);

      return reply.code(201).send(await prisma.alunoAtividadeAgenda.create({
        data: normalizeScheduleStudentPayload(scheduleId, request.body),
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao adicionar aluno na agenda.',
      });
    }
  });

  app.put<{
    Params: { id: string; scheduleId: string; studentScheduleId: string };
    Body: ScheduleStudentPayload;
  }>('/activities/:id/related/schedules/:scheduleId/students/:studentScheduleId', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      const studentScheduleId = Number(request.params.studentScheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      assertValidId(studentScheduleId, 'Aluno da agenda invalido.');
      await assertScheduleBelongsToActivity(idAtividade, scheduleId);

      const current = await prisma.alunoAtividadeAgenda.findFirst({
        where: { id: studentScheduleId, idAtividadeAgenda: scheduleId },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Aluno da agenda nao encontrado.' });
      }

      return prisma.alunoAtividadeAgenda.update({
        where: { id: studentScheduleId },
        data: normalizeScheduleStudentPayload(scheduleId, request.body),
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar aluno da agenda.',
      });
    }
  });

  app.patch<{
    Params: { id: string; scheduleId: string; studentScheduleId: string };
    Body: { boInativo?: number };
  }>('/activities/:id/related/schedules/:scheduleId/students/:studentScheduleId/status', async (request, reply) => {
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      const studentScheduleId = Number(request.params.studentScheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      assertValidId(studentScheduleId, 'Aluno da agenda invalido.');
      await assertScheduleBelongsToActivity(idAtividade, scheduleId);

      const current = await prisma.alunoAtividadeAgenda.findFirst({
        where: { id: studentScheduleId, idAtividadeAgenda: scheduleId },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Aluno da agenda nao encontrado.' });
      }

      return prisma.alunoAtividadeAgenda.update({
        where: { id: studentScheduleId },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status do aluno da agenda.',
      });
    }
  });
}
