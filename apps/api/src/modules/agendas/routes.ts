import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId } from '../../shared/normalize.js';
import { decryptCpfValue } from '../../shared/pii.js';

// Data ISO (YYYY-MM-DD) em querystring; string vazia e tratada como ausente.
const isoDateParam = z.union([
  z.literal(''),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => !Number.isNaN(new Date(value).getTime())),
]);

// Id numerico em querystring; string vazia e tratada como ausente.
const idParam = z.union([z.literal(''), z.string().regex(/^\d+$/)]);

const agendaSessionsQuerySchema = z.object({
  dtInicial: isoDateParam.optional(),
  dtFinal: isoDateParam.optional(),
  idAtividade: idParam.optional(),
  idEsporte: idParam.optional(),
  idFuncionario: idParam.optional(),
  idEmpresa: idParam.optional(),
  idCategoria: idParam.optional(),
  limit: idParam.optional(),
});

const limitQuerySchema = z.object({ limit: idParam.optional() });

const idLike = z.union([z.number(), z.string()]);

const enrollBodySchema = z.object({
  idAluno: idLike,
  idEmpresa: idLike.nullish(),
});

const unenrollBodySchema = z.object({ idAluno: idLike });

const presenceBodySchema = z.object({ idEmpresa: idLike.nullish() });

const statusBodySchema = z.object({
  boInativo: z.union([z.number(), z.boolean(), z.string()]),
});

// Clampa o limite de paginacao entre 1 e 1000 (padrao 1000).
function clampLimit(value?: string) {
  if (!value) return 1000;
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 1000;
  return Math.min(Math.max(Math.trunc(limit), 1), 1000);
}

// Valida que a empresa informada (query ou payload) pertence ao tenant do usuario.
async function assertEmpresaInTenant(idEmpresa: number, idCliente: number) {
  const empresa = await prisma.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!empresa) {
    throw new Error('Empresa nao pertence ao cliente.');
  }
}

export async function registerAgendaRoutes(app: FastifyInstance) {
  // GET /agenda-sessions — list sessions with filters and enrollment counts
  app.get<{
    Querystring: {
      dtInicial?: string;
      dtFinal?: string;
      idAtividade?: string;
      idEsporte?: string;
      idFuncionario?: string;
      idEmpresa?: string;
      idCategoria?: string;
      limit?: string;
    };
  }>('/agenda-sessions', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    if (!agendaSessionsQuerySchema.safeParse(request.query).success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    try {
      const { dtInicial, dtFinal, idAtividade, idEsporte, idFuncionario, idEmpresa, idCategoria } = request.query;

      if (idEmpresa) await assertEmpresaInTenant(Number(idEmpresa), idCliente);

      const sessions = await prisma.atividadeAgenda.findMany({
        where: {
          empresa: { idCliente },
          ...(idEmpresa ? { idEmpresa: Number(idEmpresa) } : {}),
          ...(idAtividade ? { idAtividade: Number(idAtividade) } : {}),
          ...(idCategoria ? { idCategoria: Number(idCategoria) } : {}),
          ...((dtInicial || dtFinal)
            ? {
                dtInicial: {
                  ...(dtInicial ? { gte: new Date(dtInicial) } : {}),
                  ...(dtFinal ? { lte: new Date(`${dtFinal}T23:59:59`) } : {}),
                },
              }
            : {}),
          ...(idEsporte ? { atividade: { idEsporte: Number(idEsporte) } } : {}),
          ...(idFuncionario
            ? { funcionarioAtividadeAgendas: { some: { idFuncionario: Number(idFuncionario), boInativo: false } } }
            : {}),
        },
        include: {
          atividade: { select: { id: true, dsAtividade: true, idEsporte: true } },
          categoria: { select: { id: true, dsCategoria: true } },
          empresa: { select: { id: true, dsEmpresa: true } },
          localidade: { select: { id: true, nmLocalidade: true } },
          funcionarioAtividadeAgendas: {
            where: { boInativo: false },
            include: { funcionario: { select: { id: true, nmFuncionario: true } } },
          },
          alunoAtividadeAgendas: {
            where: { boInativo: false },
            select: { id: true, idAluno: true },
          },
          alunoCheckIns: {
            where: { boInativo: false },
            select: { idAluno: true },
          },
        },
        orderBy: { dtInicial: 'asc' },
        take: clampLimit(request.query.limit),
      });

      return sessions.map((session) => ({
        id: session.id,
        idEmpresa: session.idEmpresa,
        dsEmpresa: session.empresa?.dsEmpresa ?? null,
        idAtividade: session.idAtividade,
        dsAtividade: session.atividade?.dsAtividade ?? null,
        idEsporte: session.atividade?.idEsporte ?? null,
        idCategoria: session.idCategoria,
        dsCategoria: session.categoria?.dsCategoria ?? null,
        idLocalidade: session.idLocalidade,
        dsLocalidade: session.localidade?.nmLocalidade ?? null,
        dtInicial: session.dtInicial,
        dtFinal: session.dtFinal,
        qtAlunos: session.qtAlunos,
        qtInscritos: session.alunoAtividadeAgendas.length,
        boInativo: session.boInativo,
        profissionais: session.funcionarioAtividadeAgendas.map((fe) => ({
          id: fe.idFuncionario,
          nome: fe.funcionario?.nmFuncionario ?? null,
        })),
        alunoIds: session.alunoAtividadeAgendas.map((e) => e.idAluno),
        presentAlunoIds: session.alunoCheckIns.map((ci) => ci.idAluno),
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar agendas.',
      });
    }
  });

  // GET /agenda-sessions/:id/enrolled-students — enrolled students + presence status
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/agenda-sessions/:id/enrolled-students', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    if (!limitQuerySchema.safeParse(request.query).success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    try {
      const idAgenda = Number(request.params.id);
      assertValidId(idAgenda, 'Agenda inválida.');

      const session = await prisma.atividadeAgenda.findFirst({
        where: { id: idAgenda, empresa: { idCliente } },
        select: { id: true },
      });
      if (!session) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      const [enrollments, checkIns] = await Promise.all([
        prisma.alunoAtividadeAgenda.findMany({
          where: { idAtividadeAgenda: idAgenda, boInativo: false },
          include: { aluno: { select: { id: true, nmAluno: true, caCPF: true } } },
          take: clampLimit(request.query.limit),
        }),
        prisma.alunoCheckIn.findMany({
          where: { idAtividadeAgenda: idAgenda, boInativo: false },
          select: { idAluno: true },
        }),
      ]);

      const presentIds = new Set(checkIns.map((ci) => ci.idAluno).filter(Boolean));

      return enrollments.map((enrollment) => ({
        id: enrollment.id,
        idAluno: enrollment.idAluno,
        nmAluno: enrollment.aluno?.nmAluno ?? '-',
        caCPF: decryptCpfValue(enrollment.aluno?.caCPF),
        dtCadastro: enrollment.dtCadastro,
        presente: presentIds.has(enrollment.idAluno),
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar alunos inscritos.',
      });
    }
  });

  // POST /agenda-sessions/:id/enroll — student self-enrollment in a session
  app.post<{
    Params: { id: string };
    Body: { idAluno: number | string; idEmpresa?: number | string | null };
  }>('/agenda-sessions/:id/enroll', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    if (!enrollBodySchema.safeParse(request.body).success) {
      return reply.code(400).send({ message: 'Dados invalidos.' });
    }
    try {
      const idAgenda = Number(request.params.id);
      const idAluno = Number(request.body.idAluno);
      assertValidId(idAgenda, 'Agenda inválida.');
      assertValidId(idAluno, 'Aluno inválido.');

      const session = await prisma.atividadeAgenda.findFirst({
        where: { id: idAgenda, boInativo: false, empresa: { idCliente } },
        include: {
          alunoAtividadeAgendas: { where: { boInativo: false }, select: { idAluno: true } },
        },
      });

      if (!session) return reply.code(404).send({ message: 'Agenda não encontrada ou inativa.' });

      const aluno = await prisma.aluno.findFirst({
        where: { id: idAluno, idCliente },
        select: { id: true },
      });
      if (!aluno) return reply.code(400).send({ message: 'Aluno nao pertence ao cliente.' });

      if (request.body.idEmpresa) await assertEmpresaInTenant(Number(request.body.idEmpresa), idCliente);

      if (session.dtInicial) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sessionDate = new Date(session.dtInicial);
        sessionDate.setHours(0, 0, 0, 0);
        if (sessionDate <= today) {
          return reply.code(409).send({ message: 'Não é possível se inscrever em atividades com data igual ou anterior a hoje.' });
        }
      }

      if (session.alunoAtividadeAgendas.some((e) => e.idAluno === idAluno)) {
        return reply.code(409).send({ message: 'Você já está inscrito nesta agenda.' });
      }

      if (session.qtAlunos !== null && session.alunoAtividadeAgendas.length >= session.qtAlunos) {
        return reply.code(409).send({ message: 'Não há vagas disponíveis nesta agenda.' });
      }

      const enrollment = await prisma.alunoAtividadeAgenda.create({
        data: {
          idAtividadeAgenda: idAgenda,
          idAluno,
          idEmpresa: request.body.idEmpresa ? Number(request.body.idEmpresa) : session.idEmpresa,
          boInativo: false,
        },
      });

      return reply.code(201).send(enrollment);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao realizar inscrição.',
      });
    }
  });

  // DELETE /agenda-sessions/:id/unenroll — cancel enrollment (up to 1h before start)
  app.delete<{
    Params: { id: string };
    Body: { idAluno: number | string };
  }>('/agenda-sessions/:id/unenroll', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    if (!unenrollBodySchema.safeParse(request.body).success) {
      return reply.code(400).send({ message: 'Dados invalidos.' });
    }
    try {
      const idAgenda = Number(request.params.id);
      const idAluno = Number(request.body.idAluno);
      assertValidId(idAgenda, 'Agenda inválida.');
      assertValidId(idAluno, 'Aluno inválido.');

      const session = await prisma.atividadeAgenda.findFirst({
        where: { id: idAgenda, empresa: { idCliente } },
        select: { id: true, dtInicial: true },
      });

      if (!session) return reply.code(404).send({ message: 'Agenda não encontrada.' });

      if (session.dtInicial) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sessionDate = new Date(session.dtInicial);
        sessionDate.setHours(0, 0, 0, 0);
        if (sessionDate <= today) {
          return reply.code(409).send({
            message: 'Não é possível cancelar a inscrição em atividades com data igual ou anterior a hoje.',
          });
        }
      }

      const enrollment = await prisma.alunoAtividadeAgenda.findFirst({
        where: { idAtividadeAgenda: idAgenda, idAluno, boInativo: false },
      });

      if (!enrollment) return reply.code(404).send({ message: 'Inscrição não encontrada.' });

      await prisma.alunoAtividadeAgenda.update({
        where: { id: enrollment.id },
        data: { boInativo: true },
      });

      return reply.code(200).send({ message: 'Inscrição cancelada com sucesso.' });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao cancelar inscrição.',
      });
    }
  });

  // POST /agenda-sessions/:id/students/:studentId/presence — mark student attendance
  app.post<{
    Params: { id: string; studentId: string };
    Body: { idEmpresa?: number | string | null };
  }>('/agenda-sessions/:id/students/:studentId/presence', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    if (!presenceBodySchema.safeParse(request.body).success) {
      return reply.code(400).send({ message: 'Dados invalidos.' });
    }
    try {
      const idAgenda = Number(request.params.id);
      const idAluno = Number(request.params.studentId);
      assertValidId(idAgenda, 'Agenda inválida.');
      assertValidId(idAluno, 'Aluno inválido.');

      const session = await prisma.atividadeAgenda.findFirst({
        where: { id: idAgenda, empresa: { idCliente } },
        select: { id: true, idEmpresa: true },
      });

      if (!session) return reply.code(404).send({ message: 'Agenda não encontrada.' });

      if (request.body.idEmpresa) await assertEmpresaInTenant(Number(request.body.idEmpresa), idCliente);

      const enrollment = await prisma.alunoAtividadeAgenda.findFirst({
        where: { idAtividadeAgenda: idAgenda, idAluno, boInativo: false },
      });

      if (!enrollment) return reply.code(404).send({ message: 'Aluno não está inscrito nesta agenda.' });

      const existing = await prisma.alunoCheckIn.findFirst({
        where: { idAtividadeAgenda: idAgenda, idAluno, boInativo: false },
      });

      if (existing) return reply.code(409).send({ message: 'Presença já registrada para este aluno.' });

      const checkIn = await prisma.alunoCheckIn.create({
        data: {
          idAtividadeAgenda: idAgenda,
          idAluno,
          idEmpresa: request.body.idEmpresa ? Number(request.body.idEmpresa) : session.idEmpresa,
          boInativo: false,
        },
      });

      return reply.code(201).send(checkIn);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao registrar presença.',
      });
    }
  });

  // PATCH /agenda-sessions/:id/status — suspend or reactivate a session
  app.patch<{
    Params: { id: string };
    Body: { boInativo: number };
  }>('/agenda-sessions/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    if (!statusBodySchema.safeParse(request.body).success) {
      return reply.code(400).send({ message: 'Dados invalidos.' });
    }
    try {
      const idAgenda = Number(request.params.id);
      assertValidId(idAgenda, 'Agenda inválida.');

      const session = await prisma.atividadeAgenda.findFirst({
        where: { id: idAgenda, empresa: { idCliente } },
        select: { id: true },
      });
      if (!session) return reply.code(404).send({ message: 'Registro nao encontrado.' });

      return await prisma.atividadeAgenda.update({
        where: { id: idAgenda },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status da agenda.',
      });
    }
  });
}
