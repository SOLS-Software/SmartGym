import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertValidId, optionalDate, optionalNumber, requiredText } from '../../shared/normalize.js';
import { prisma } from '../../shared/prisma.js';

// Data ISO (YYYY-MM-DD) em querystring; string vazia e tratada como ausente.
const isoDateParam = z.union([
  z.literal(''),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => !Number.isNaN(new Date(value).getTime())),
]);

const listActivitiesQuerySchema = z.object({
  includeDetails: z.string().optional(),
  includeInactive: z.string().optional(),
  search: z.string().optional(),
  dtInicio: isoDateParam.optional(),
  dtFim: isoDateParam.optional(),
  limit: z.union([z.literal(''), z.string().regex(/^\d+$/)]).optional(),
});

const statusBodySchema = z.object({
  boInativo: z.union([z.number(), z.boolean(), z.string()]).optional(),
});

// Clampa o limite de paginacao entre 1 e 1000 (padrao 1000).
function clampLimit(value?: string) {
  if (!value) return 1000;
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 1000;
  return Math.min(Math.max(Math.trunc(limit), 1), 1000);
}

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

// Atividade sem empresa (idEmpresa null) e tratada como catalogo global:
// visivel e gerenciavel por qualquer tenant autenticado.
function activityTenantFilter(idCliente: number) {
  return { OR: [{ idEmpresa: null }, { empresa: { idCliente } }] };
}

// Mutacao exige posse pelo tenant — nao casa idEmpresa nulo (evita editar
// catalogo global/de outro tenant). Leitura continua usando o filtro amplo.
function activityTenantOwnedFilter(idCliente: number) {
  return { empresa: { idCliente } };
}

// Valida que a empresa informada no payload pertence ao tenant do usuario.
async function assertEmpresaInTenant(idEmpresa: number, idCliente: number) {
  const empresa = await prisma.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!empresa) {
    throw new Error('Empresa nao pertence ao cliente.');
  }
}

// Cadeia de tenant: agenda deve pertencer a atividade e a uma empresa do cliente.
async function findScheduleInTenant(activityId: number, scheduleId: number, idCliente: number) {
  return prisma.atividadeAgenda.findFirst({
    where: { id: scheduleId, idAtividade: activityId, empresa: { idCliente } },
    select: { id: true },
  });
}

async function assertScheduleNotPast(scheduleId: number) {
  const schedule = await prisma.atividadeAgenda.findUnique({
    where: { id: scheduleId },
    select: { dtFinal: true },
  });

  if (schedule?.dtFinal && schedule.dtFinal < new Date()) {
    throw new Error('Esta aula ja foi encerrada e nao aceita mais inscricoes.');
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
      limit?: string;
    };
  }>('/activities', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    if (!listActivitiesQuerySchema.safeParse(request.query).success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const includeDetails = request.query.includeDetails === 'true';
    const includeInactive = request.query.includeInactive === 'true';
    const search = request.query.search?.trim();
    const { dtInicio, dtFim } = request.query;
    const dateRangeFilter = buildDateRangeFilter(dtInicio, dtFim);

    return prisma.atividade.findMany({
      where: {
        ...activityTenantFilter(idCliente),
        ...(includeInactive ? {} : { boInativo: false }),
        ...(search ? { dsAtividade: { contains: search, mode: 'insensitive' } } : {}),
        ...(dateRangeFilter
          ? {
              atividadeAgendas: {
                some: {
                  boInativo: false,
                  empresa: { idCliente },
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
                empresa: { idCliente },
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
      take: clampLimit(request.query.limit),
    });
  });

  app.post<{ Body: ActivityPayload }>('/activities', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizeActivityPayload(request.body);
      if (data.idEmpresa) await assertEmpresaInTenant(data.idEmpresa, idCliente);
      const existing = await prisma.atividade.findFirst({
        where: {
          dsAtividade: { equals: data.dsAtividade, mode: 'insensitive' },
          ...activityTenantFilter(idCliente),
        },
        select: { id: true },
      });
      if (existing) {
        return reply.code(400).send({ message: 'Já existe uma atividade com este nome.' });
      }
      return reply.code(201).send(await prisma.atividade.create({ data }));
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao criar atividade.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: ActivityPayload;
  }>('/activities/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Atividade invalida.');
      const current = await prisma.atividade.findFirst({
        where: { id, ...activityTenantOwnedFilter(idCliente) },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizeActivityPayload(request.body);
      if (data.idEmpresa) await assertEmpresaInTenant(data.idEmpresa, idCliente);
      const existing = await prisma.atividade.findFirst({
        where: {
          dsAtividade: { equals: data.dsAtividade, mode: 'insensitive' },
          id: { not: id },
          ...activityTenantFilter(idCliente),
        },
        select: { id: true },
      });
      if (existing) {
        return reply.code(400).send({ message: 'Já existe uma atividade com este nome.' });
      }
      return prisma.atividade.update({ where: { id }, data });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar atividade.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/activities/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Atividade invalida.');
      if (!statusBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const current = await prisma.atividade.findFirst({
        where: { id, ...activityTenantOwnedFilter(idCliente) },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      assertValidId(idAtividade, 'Atividade invalida.');
      const activity = await prisma.atividade.findFirst({
        where: { id: idAtividade, ...activityTenantFilter(idCliente) },
        select: { id: true },
      });
      if (!activity) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.atividadeAgenda.findMany({
        where: { idAtividade, empresa: { idCliente } },
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      assertValidId(idAtividade, 'Atividade invalida.');
      const activity = await prisma.atividade.findFirst({
        where: { id: idAtividade, ...activityTenantFilter(idCliente) },
        select: { id: true },
      });
      if (!activity) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizeActivitySchedulePayload(idAtividade, request.body);
      await assertEmpresaInTenant(data.idEmpresa, idCliente);
      return reply.code(201).send(await prisma.atividadeAgenda.create({ data }));
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao criar agenda da atividade.',
      });
    }
  });

  app.put<{
    Params: { id: string; scheduleId: string };
    Body: ActivitySchedulePayload;
  }>('/activities/:id/related/schedules/:scheduleId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      const current = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const data = normalizeActivitySchedulePayload(idAtividade, request.body);
      await assertEmpresaInTenant(data.idEmpresa, idCliente);
      return prisma.atividadeAgenda.update({
        where: { id: scheduleId },
        data,
      });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar agenda da atividade.',
      });
    }
  });

  app.patch<{
    Params: { id: string; scheduleId: string };
    Body: { boInativo?: number };
  }>('/activities/:id/related/schedules/:scheduleId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      if (!statusBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const current = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      const schedule = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!schedule) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      const schedule = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!schedule) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const data = normalizeScheduleEmployeePayload(scheduleId, request.body);
      await assertEmpresaInTenant(data.idEmpresa, idCliente);
      return reply.code(201).send(await prisma.funcionarioAtividadeAgenda.create({ data }));
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao adicionar funcionario na agenda.',
      });
    }
  });

  app.put<{
    Params: { id: string; scheduleId: string; employeeScheduleId: string };
    Body: ScheduleEmployeePayload;
  }>('/activities/:id/related/schedules/:scheduleId/employees/:employeeScheduleId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      const employeeScheduleId = Number(request.params.employeeScheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      assertValidId(employeeScheduleId, 'Funcionario da agenda invalido.');
      const schedule = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!schedule) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const current = await prisma.funcionarioAtividadeAgenda.findFirst({
        where: { id: employeeScheduleId, idAtividadeAgenda: scheduleId },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Funcionario da agenda nao encontrado.' });
      }

      const data = normalizeScheduleEmployeePayload(scheduleId, request.body);
      await assertEmpresaInTenant(data.idEmpresa, idCliente);
      return prisma.funcionarioAtividadeAgenda.update({
        where: { id: employeeScheduleId },
        data,
      });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar funcionario da agenda.',
      });
    }
  });

  app.patch<{
    Params: { id: string; scheduleId: string; employeeScheduleId: string };
    Body: { boInativo?: number };
  }>('/activities/:id/related/schedules/:scheduleId/employees/:employeeScheduleId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      const employeeScheduleId = Number(request.params.employeeScheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      assertValidId(employeeScheduleId, 'Funcionario da agenda invalido.');
      if (!statusBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const schedule = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!schedule) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      const schedule = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!schedule) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

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
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      const schedule = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!schedule) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      await assertScheduleNotPast(scheduleId);

      const data = normalizeScheduleStudentPayload(scheduleId, request.body);
      await assertEmpresaInTenant(data.idEmpresa, idCliente);
      return reply.code(201).send(await prisma.alunoAtividadeAgenda.create({ data }));
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao adicionar aluno na agenda.',
      });
    }
  });

  app.put<{
    Params: { id: string; scheduleId: string; studentScheduleId: string };
    Body: ScheduleStudentPayload;
  }>('/activities/:id/related/schedules/:scheduleId/students/:studentScheduleId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      const studentScheduleId = Number(request.params.studentScheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      assertValidId(studentScheduleId, 'Aluno da agenda invalido.');
      const schedule = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!schedule) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const current = await prisma.alunoAtividadeAgenda.findFirst({
        where: { id: studentScheduleId, idAtividadeAgenda: scheduleId },
        select: { id: true },
      });
      if (!current) {
        return reply.code(404).send({ message: 'Aluno da agenda nao encontrado.' });
      }

      const data = normalizeScheduleStudentPayload(scheduleId, request.body);
      await assertEmpresaInTenant(data.idEmpresa, idCliente);
      return prisma.alunoAtividadeAgenda.update({
        where: { id: studentScheduleId },
        data,
      });
    } catch (error) {
      const isValidation = error instanceof Error && !('code' in error);
      return reply.code(400).send({
        message: isValidation ? error.message : 'Erro ao atualizar aluno da agenda.',
      });
    }
  });

  app.patch<{
    Params: { id: string; scheduleId: string; studentScheduleId: string };
    Body: { boInativo?: number };
  }>('/activities/:id/related/schedules/:scheduleId/students/:studentScheduleId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAtividade = Number(request.params.id);
      const scheduleId = Number(request.params.scheduleId);
      const studentScheduleId = Number(request.params.studentScheduleId);
      assertValidId(idAtividade, 'Atividade invalida.');
      assertValidId(scheduleId, 'Agenda invalida.');
      assertValidId(studentScheduleId, 'Aluno da agenda invalido.');
      if (!statusBodySchema.safeParse(request.body).success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const schedule = await findScheduleInTenant(idAtividade, scheduleId, idCliente);
      if (!schedule) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

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
