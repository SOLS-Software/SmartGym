import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { assertValidId } from '../../shared/normalize.js';

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
    };
  }>('/agenda-sessions', async (request, reply) => {
    try {
      const { dtInicial, dtFinal, idAtividade, idEsporte, idFuncionario, idEmpresa } = request.query;

      const sessions = await prisma.atividadeAgenda.findMany({
        where: {
          ...(idEmpresa ? { idEmpresa: Number(idEmpresa) } : {}),
          ...(idAtividade ? { idAtividade: Number(idAtividade) } : {}),
          ...(dtInicial ? { dtInicial: { gte: new Date(dtInicial) } } : {}),
          ...(dtFinal ? { dtFinal: { lte: new Date(`${dtFinal}T23:59:59`) } } : {}),
          ...(idEsporte ? { atividade: { idEsporte: Number(idEsporte) } } : {}),
          ...(idFuncionario
            ? { funcionarioAtividadeAgendas: { some: { idFuncionario: Number(idFuncionario), boInativo: 0 } } }
            : {}),
        },
        include: {
          atividade: { select: { id: true, dsAtividade: true, idEsporte: true } },
          categoria: { select: { id: true, dsCategoria: true } },
          empresa: { select: { id: true, dsEmpresa: true } },
          funcionarioAtividadeAgendas: {
            where: { boInativo: 0 },
            include: { funcionario: { select: { id: true, nmFuncionario: true } } },
          },
          alunoAtividadeAgendas: {
            where: { boInativo: 0 },
            select: { id: true, idAluno: true },
          },
        },
        orderBy: { dtInicial: 'asc' },
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
      }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar agendas.',
      });
    }
  });

  // GET /agenda-sessions/:id/enrolled-students — enrolled students + presence status
  app.get<{ Params: { id: string } }>('/agenda-sessions/:id/enrolled-students', async (request, reply) => {
    try {
      const idAgenda = Number(request.params.id);
      assertValidId(idAgenda, 'Agenda inválida.');

      const [enrollments, checkIns] = await Promise.all([
        prisma.alunoAtividadeAgenda.findMany({
          where: { idAtividadeAgenda: idAgenda, boInativo: 0 },
          include: { aluno: { select: { id: true, nmAluno: true, caCPF: true } } },
        }),
        prisma.alunoCheckIn.findMany({
          where: { idAtividadeAgenda: idAgenda, boInativo: 0 },
          select: { idAluno: true },
        }),
      ]);

      const presentIds = new Set(checkIns.map((ci) => ci.idAluno).filter(Boolean));

      return enrollments.map((enrollment) => ({
        id: enrollment.id,
        idAluno: enrollment.idAluno,
        nmAluno: enrollment.aluno?.nmAluno ?? '-',
        caCPF: enrollment.aluno?.caCPF ?? '',
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
    try {
      const idAgenda = Number(request.params.id);
      const idAluno = Number(request.body.idAluno);
      assertValidId(idAgenda, 'Agenda inválida.');
      assertValidId(idAluno, 'Aluno inválido.');

      const session = await prisma.atividadeAgenda.findFirst({
        where: { id: idAgenda, boInativo: 0 },
        include: {
          alunoAtividadeAgendas: { where: { boInativo: 0 }, select: { idAluno: true } },
        },
      });

      if (!session) return reply.code(404).send({ message: 'Agenda não encontrada ou inativa.' });

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
          boInativo: 0,
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
    try {
      const idAgenda = Number(request.params.id);
      const idAluno = Number(request.body.idAluno);
      assertValidId(idAgenda, 'Agenda inválida.');
      assertValidId(idAluno, 'Aluno inválido.');

      const session = await prisma.atividadeAgenda.findFirst({
        where: { id: idAgenda },
        select: { id: true, dtInicial: true },
      });

      if (!session) return reply.code(404).send({ message: 'Agenda não encontrada.' });

      if (session.dtInicial) {
        const oneHourBefore = new Date(session.dtInicial.getTime() - 60 * 60 * 1000);
        if (new Date() > oneHourBefore) {
          return reply.code(409).send({
            message: 'Não é possível cancelar a inscrição com menos de 1 hora de antecedência.',
          });
        }
      }

      const enrollment = await prisma.alunoAtividadeAgenda.findFirst({
        where: { idAtividadeAgenda: idAgenda, idAluno, boInativo: 0 },
      });

      if (!enrollment) return reply.code(404).send({ message: 'Inscrição não encontrada.' });

      await prisma.alunoAtividadeAgenda.update({
        where: { id: enrollment.id },
        data: { boInativo: 1 },
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
    try {
      const idAgenda = Number(request.params.id);
      const idAluno = Number(request.params.studentId);
      assertValidId(idAgenda, 'Agenda inválida.');
      assertValidId(idAluno, 'Aluno inválido.');

      const session = await prisma.atividadeAgenda.findFirst({
        where: { id: idAgenda },
        select: { id: true, idEmpresa: true },
      });

      if (!session) return reply.code(404).send({ message: 'Agenda não encontrada.' });

      const enrollment = await prisma.alunoAtividadeAgenda.findFirst({
        where: { idAtividadeAgenda: idAgenda, idAluno, boInativo: 0 },
      });

      if (!enrollment) return reply.code(404).send({ message: 'Aluno não está inscrito nesta agenda.' });

      const existing = await prisma.alunoCheckIn.findFirst({
        where: { idAtividadeAgenda: idAgenda, idAluno, boInativo: 0 },
      });

      if (existing) return reply.code(409).send({ message: 'Presença já registrada para este aluno.' });

      const checkIn = await prisma.alunoCheckIn.create({
        data: {
          idAtividadeAgenda: idAgenda,
          idAluno,
          idEmpresa: request.body.idEmpresa ? Number(request.body.idEmpresa) : session.idEmpresa,
          boInativo: 0,
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
    try {
      const idAgenda = Number(request.params.id);
      assertValidId(idAgenda, 'Agenda inválida.');

      return await prisma.atividadeAgenda.update({
        where: { id: idAgenda },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao alterar status da agenda.',
      });
    }
  });
}
