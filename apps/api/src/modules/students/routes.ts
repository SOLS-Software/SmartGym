import { z } from 'zod';
import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import {
  normalizeStudentPayload,
  normalizeStudentFacialBiometricPayload,
  assertValidId,
  optionalNumber,
  optionalDate,
} from '../../shared/normalize.js';
import { getSupabaseConfig, getSupabaseClient } from '../../shared/supabase.js';
import {
  getComprefaceConfig,
  getStudentFacialSubject,
  addComprefaceSubjectExample,
} from '../../shared/compreface.js';
import { assertAllowedUploadType, getStudentFilePath } from '../../shared/files.js';
import {
  generateInitialPayments,
  generateNextRecurringPayment,
  isRecurringFrequency,
} from '../../shared/payments.js';
import { getStudentAccessStatus } from '../../shared/studentAccess.js';
import type {
  CompanyChildPayload,
  StudentFacialBiometricEnrollPayload,
  StudentFacialBiometricPayload,
  StudentPayload,
} from '../../shared/api-types.js';

function getStudentChildResourceConfig(resource: string) {
  if (
    resource !== 'plans' &&
    resource !== 'payments' &&
    resource !== 'check-ins' &&
    resource !== 'trainings'
  ) {
    throw new Error('Tabela relacionada invalida.');
  }
  return resource;
}

// Validacao minima de entrada: os valores continuam passando pelos helpers
// normalize* (optionalNumber/optionalDate/toBool) apos o safeParse.
const numberLike = z.union([z.number(), z.string()]).nullish();
const dateLike = z.union([z.string(), z.number(), z.date()]).nullish();
const boolLike = z.union([z.boolean(), z.number(), z.string()]).nullish();

const studentListQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

const listLimitQuerySchema = z.object({
  limit: z.coerce.number().int().optional(),
});

const calendarQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

const statusBodySchema = z.object({ boInativo: boolLike });

const facialBiometricEnrollBodySchema = z.object({
  idAlunoArquivo: numberLike,
  nrThreshold: numberLike,
});

const childResourceBodySchema = z.object({
  idPlano: numberLike,
  idPromocaoPlano: numberLike,
  nrDiaPagamento: numberLike,
  qtParcelas: numberLike,
  dtAdmissao: dateLike,
  idEmpresa: numberLike,
  idTreino: numberLike,
  idFuncionario: numberLike,
  nrOrdemSequencia: numberLike,
  idAlunoPlano: numberLike,
  idStatusPagamento: numberLike,
  idFormaPagamento: numberLike,
  idProdutoMovimentacao: numberLike,
  vlPrevisto: numberLike,
  vlPago: numberLike,
  dtVencimento: dateLike,
  dtCompetencia: dateLike,
  dtPagamento: dateLike,
  idAlunoTreinosSequencia: numberLike,
  idPontuacao: numberLike,
  idTipoCheckIn: numberLike,
  boInativo: boolLike,
});

// Paginacao das listagens top-level: clamp 1..1000, default 1000.
function clampLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) return 1000;
  return Math.min(1000, Math.max(1, Math.trunc(limit)));
}

type StudentActivityScheduleEnrollPayload = {
  scheduleIds?: Array<number | string>;
};

type EnrollmentSchedule = {
  id: number;
  idEmpresa: number | null;
  dtInicial: Date | null;
  dtFinal: Date | null;
  qtAlunos: number | null;
  atividade: { dsAtividade: string } | null;
  alunoAtividadeAgendas: Array<{ idAluno: number | null }>;
};

function formatScheduleLabel(schedule: EnrollmentSchedule) {
  const activityName = schedule.atividade?.dsAtividade ?? 'Atividade';
  const startsAt = schedule.dtInicial
    ? schedule.dtInicial.toLocaleString('pt-BR', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'sem data';
  return `${activityName} em ${startsAt}`;
}

function schedulesOverlap(first: EnrollmentSchedule, second: EnrollmentSchedule) {
  if (!first.dtInicial || !first.dtFinal || !second.dtInicial || !second.dtFinal) return false;
  return first.dtInicial < second.dtFinal && first.dtFinal > second.dtInicial;
}

function normalizeScheduleIds(payload: StudentActivityScheduleEnrollPayload) {
  if (!Array.isArray(payload.scheduleIds)) {
    throw new Error('Selecione ao menos uma aula para se inscrever.');
  }

  const ids = payload.scheduleIds ?? [];
  const normalized = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (normalized.length === 0) {
    throw new Error('Selecione ao menos uma aula para se inscrever.');
  }
  return normalized;
}

// Tenant isolation: o aluno so e visivel se pertencer ao cliente do usuario
// autenticado (Aluno.idCliente).
function findTenantStudent(idAluno: number, idCliente: number) {
  return prisma.aluno.findFirst({ where: { id: idAluno, idCliente }, select: { id: true } });
}

// Valida que a empresa informada pertence ao tenant do usuario autenticado.
async function assertTenantEmpresa(idEmpresa: number, idCliente: number) {
  const empresa = await prisma.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!empresa) throw new Error('Empresa invalida para este cliente.');
}

export async function registerStudentRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // Students CRUD
  // ---------------------------------------------------------------------------

  app.get<{
    Querystring: { search?: string };
  }>('/students', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = studentListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ message: 'Parametros invalidos.' });
    }
    const search = parsedQuery.data.search?.trim();
    return prisma.aluno.findMany({
      where: search
        ? {
            idCliente,
            OR: [
              { nmAluno: { contains: search, mode: 'insensitive' } },
              { caCPF: { contains: search.replace(/\D/g, '') } },
              { anEmail: { contains: search, mode: 'insensitive' } },
            ],
          }
        : { idCliente },
      orderBy: { nmAluno: 'asc' },
      take: clampLimit(parsedQuery.data.limit),
    });
  });

  app.post<{
    Body: StudentPayload;
  }>('/students', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      // Tenant sempre do token; idCliente vindo do body e ignorado.
      const data = normalizeStudentPayload({ ...request.body, idCliente });
      const student = await prisma.aluno.create({ data });
      return reply.code(201).send(student);
    } catch (error) {
      const isPrismaUnique =
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002';
      return reply.code(400).send({
        message: isPrismaUnique
          ? 'CPF já cadastrado para este cliente.'
          : 'Erro ao criar aluno.',
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Aluno invalido.');
      const student = await prisma.aluno.findFirst({ where: { id, idCliente } });

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      return student;
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao carregar aluno.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: StudentPayload;
  }>('/students/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Aluno invalido.');
      const current = await findTenantStudent(id, idCliente);
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      // Tenant sempre do token; idCliente vindo do body e ignorado.
      const data = normalizeStudentPayload({ ...request.body, idCliente });
      return prisma.aluno.update({ where: { id }, data });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar aluno.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/students/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Aluno invalido.');
      const current = await findTenantStudent(id, idCliente);
      if (!current) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const boInativo = toBool(request.body.boInativo);
      return prisma.aluno.update({ where: { id }, data: { boInativo } });
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status do aluno.' });
    }
  });

  // ---------------------------------------------------------------------------
  // Student files
  // ---------------------------------------------------------------------------

  app.get<{
    Params: { id: string };
  }>('/students/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.alunoArquivo.findMany({
        where: { idAluno, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar arquivos do aluno.',
      });
    }
  });

  app.post<{
    Params: { id: string };
  }>('/students/:id/files', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await findTenantStudent(idAluno, idCliente);

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }
      assertAllowedUploadType(file);

      const buffer = await file.toBuffer();
      const path = getStudentFilePath(idAluno, file.filename);
      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const studentFile = await prisma.alunoArquivo.create({
        data: {
          idAluno,
          dsArquivo: file.filename,
          anCaminho: path,
          idTiposArquivos: null,
          cnChaveAcesso: 0,
          cnDistribuidor: 0,
        },
      });

      return reply.code(201).send(studentFile);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao enviar arquivo do aluno.',
      });
    }
  });

  app.get<{
    Params: { id: string; fileId: string };
  }>('/students/:id/files/:fileId/url', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const studentFile = await prisma.alunoArquivo.findFirst({
        where: { id: fileId, idAluno, boInativo: false },
      });

      if (!studentFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(studentFile.anCaminho, 60 * 5);

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
  }>('/students/:id/files/:fileId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const existingFile = await prisma.alunoArquivo.findFirst({
        where: { id: fileId, idAluno, boInativo: false },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return prisma.alunoArquivo.update({ where: { id: fileId }, data: { boInativo: true } });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao remover arquivo do aluno.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Facial biometrics
  // ---------------------------------------------------------------------------

  app.get<{
    Params: { id: string };
  }>('/students/:id/facial-biometrics', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.alunoBiometriaFacial.findMany({
        where: { idAluno, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
        take: clampLimit(parsedQuery.data.limit),
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao listar biometrias faciais do aluno.',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: StudentFacialBiometricPayload;
  }>('/students/:id/facial-biometrics', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const data = normalizeStudentFacialBiometricPayload(request.body);
      const student = await findTenantStudent(idAluno, idCliente);

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      if (data.idAlunoArquivo) {
        const studentFile = await prisma.alunoArquivo.findFirst({
          where: { id: data.idAlunoArquivo, idAluno, boInativo: false },
          select: { id: true },
        });
        if (!studentFile) {
          throw new Error('Arquivo do aluno invalido para biometria facial.');
        }
      }

      const biometric = await prisma.$transaction(async (transaction) => {
        await transaction.alunoBiometriaFacial.updateMany({
          where: { idAluno, boInativo: false },
          data: { boInativo: true },
        });

        return transaction.alunoBiometriaFacial.create({
          data: {
            idAluno,
            idAlunoArquivo: data.idAlunoArquivo,
            dsModelo: data.dsModelo,
            dsProvider: data.dsProvider,
            dsSubject: data.dsSubject,
            dsExternalImageId: data.dsExternalImageId,
            anEmbedding: data.anEmbedding ?? undefined,
            nrDimensoes: data.nrDimensoes,
            nrThreshold: data.nrThreshold,
            boInativo: false,
          },
        });
      });

      return reply.code(201).send(biometric);
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao salvar biometria facial do aluno.',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: StudentFacialBiometricEnrollPayload;
  }>('/students/:id/facial-biometrics/enroll', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const parsedBody = facialBiometricEnrollBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }

      const idAlunoArquivo = optionalNumber(request.body.idAlunoArquivo);
      const nrThreshold = Number(
        request.body.nrThreshold ?? getComprefaceConfig().similarityThreshold,
      );

      if (!idAlunoArquivo) {
        throw new Error('Informe o arquivo do aluno para cadastrar a biometria facial.');
      }
      if (!Number.isFinite(nrThreshold) || nrThreshold <= 0 || nrThreshold > 1) {
        throw new Error('Informe um threshold entre 0 e 1.');
      }

      const student = await findTenantStudent(idAluno, idCliente);

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const studentFile = await prisma.alunoArquivo.findFirst({
        where: { id: idAlunoArquivo, idAluno, boInativo: false },
        select: { id: true, dsArquivo: true, anCaminho: true },
      });

      if (!studentFile) {
        throw new Error('Arquivo do aluno invalido para biometria facial.');
      }

      const { bucket } = getSupabaseConfig();
      const supabase = getSupabaseClient();
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(studentFile.anCaminho);

      if (downloadError) {
        throw new Error(downloadError.message);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const subject = getStudentFacialSubject(idAluno);
      const comprefaceFace = await addComprefaceSubjectExample(
        subject,
        buffer,
        studentFile.dsArquivo,
      );

      const biometric = await prisma.$transaction(async (transaction) => {
        await transaction.alunoBiometriaFacial.updateMany({
          where: { idAluno, boInativo: false },
          data: { boInativo: true },
        });

        return transaction.alunoBiometriaFacial.create({
          data: {
            idAluno,
            idAlunoArquivo,
            dsModelo: 'compreface',
            dsProvider: 'compreface',
            dsSubject: comprefaceFace.subject || subject,
            dsExternalImageId: comprefaceFace.image_id,
            nrThreshold,
            boInativo: false,
          },
        });
      });

      return reply.code(201).send(biometric);
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao cadastrar biometria facial no CompreFace.',
      });
    }
  });

  app.patch<{
    Params: { id: string; biometricId: string };
    Body: { boInativo?: number };
  }>('/students/:id/facial-biometrics/:biometricId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const id = Number(request.params.biometricId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(id, 'Biometria facial invalida.');

      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const current = await prisma.alunoBiometriaFacial.findFirst({
        where: { id, idAluno },
        select: { id: true },
      });

      if (!current) {
        return reply.code(404).send({ message: 'Biometria facial nao encontrada.' });
      }

      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }

      return prisma.alunoBiometriaFacial.update({
        where: { id },
        data: { boInativo: toBool(request.body.boInativo) },
      });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error ? error.message : 'Erro ao alterar status da biometria facial.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Student related records
  // ---------------------------------------------------------------------------

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/plans', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.alunoPlano.findMany({
        where: { idAluno },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          plano: {
            include: {
              frequencia: true,
              planoAtividades: {
                where: { boInativo: false },
                include: { atividade: true },
                orderBy: { id: 'asc' },
              },
              planoProdutos: {
                where: { boInativo: false },
                include: { produto: true },
                orderBy: { id: 'asc' },
              },
              planoEmpresas: {
                where: { boInativo: false },
                include: { empresa: true },
                orderBy: { id: 'asc' },
              },
              planoValores: {
                where: { boInativo: false },
                include: { empresa: true },
                orderBy: { dtCadastro: 'desc' },
              },
            },
          },
          promocaoPlano: { include: { promocao: true } },
        },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar planos do aluno.',
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/payments', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.pagamento.findMany({
        where: { alunoPlano: { idAluno } },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          statusPagamento: { select: { id: true, dsStatusPagamento: true } },
          formaPagamento: { select: { id: true, dsFormaPagamento: true } },
          alunoPlano: { select: { id: true, plano: { select: { id: true, dsPlano: true } } } },
        },
        orderBy: [{ dtVencimento: 'asc' }, { dtCadastro: 'asc' }],
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar pagamentos do aluno.',
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/notifications', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const notifications: { type: 'danger' | 'warning' | 'info'; title: string; message: string }[] = [];

      const access = await getStudentAccessStatus(prisma, idAluno);

      if (access.paymentOverdue) {
        notifications.push({
          type: 'danger',
          title: 'Pagamento em atraso',
          message: 'Você possui um pagamento vencido. Regularize para manter seu acesso.',
        });
      }

      if (access.paymentCancelled) {
        notifications.push({
          type: 'danger',
          title: 'Pagamento cancelado',
          message: 'O pagamento do seu plano foi cancelado. Entre em contato com a academia.',
        });
      }

      if (!access.hasPlan) {
        notifications.push({
          type: 'warning',
          title: 'Sem plano ativo',
          message: 'Você ainda não possui um plano. Consulte os planos disponíveis.',
        });
      } else if (!access.planActive) {
        notifications.push({
          type: 'warning',
          title: 'Plano encerrado',
          message: 'Seu plano expirou. Renove para continuar treinando.',
        });
      }

      if (access.hasPlan && access.idAlunoPlano) {
        const now = new Date();
        const inSevenDays = new Date(now);
        inSevenDays.setDate(inSevenDays.getDate() + 7);

        const { getStatusIdByName } = await import('../../shared/payments.js');
        const idPendente = await getStatusIdByName(prisma, 'Pendente');

        if (idPendente !== null) {
          const upcoming = await prisma.pagamento.findFirst({
            where: {
              idAlunoPlano: access.idAlunoPlano,
              boInativo: false,
              idStatusPagamento: idPendente,
              dtVencimento: { gte: now, lte: inSevenDays },
            },
            orderBy: { dtVencimento: 'asc' },
          });

          if (upcoming?.dtVencimento) {
            const diffDays = Math.ceil(
              (upcoming.dtVencimento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            );
            notifications.push({
              type: 'warning',
              title: 'Pagamento próximo',
              message:
                diffDays <= 1
                  ? 'Seu pagamento vence amanhã.'
                  : `Seu próximo pagamento vence em ${diffDays} dias.`,
            });
          }
        }
      }

      const lastCheckIn = await prisma.alunoCheckIn.findFirst({
        where: { alunoPlano: { idAluno, boInativo: false } },
        orderBy: { dtCadastro: 'desc' },
        select: { dtCadastro: true },
      });

      if (lastCheckIn) {
        const daysSince = Math.floor(
          (Date.now() - new Date(lastCheckIn.dtCadastro).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSince >= 7) {
          notifications.push({
            type: 'info',
            title: 'Sentimos sua falta!',
            message:
              daysSince >= 14
                ? `Faz ${daysSince} dias desde seu último treino. Que tal voltar hoje?`
                : `Faz ${daysSince} dias desde seu último treino. Bora manter o ritmo!`,
          });
        }
      } else if (access.hasPlan) {
        notifications.push({
          type: 'info',
          title: 'Primeiro treino',
          message: 'Você ainda não fez nenhum check-in. Comece hoje!',
        });
      }

      return notifications;
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao buscar notificações.',
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/check-ins', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.alunoCheckIn.findMany({
        where: { alunoPlano: { idAluno } },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          alunoPlano: { include: { plano: true } },
          alunoTreinoSequencia: {
            include: {
              alunoTreino: {
                include: {
                  treino: true,
                  funcionario: true,
                },
              },
            },
          },
        },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar check-ins do aluno.',
      });
    }
  });

  app.get<{
    Params: { id: string };
    Querystring: { month?: string };
  }>('/students/:id/calendar', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const parsedQuery = calendarQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const month = parsedQuery.data.month ?? new Date().toISOString().slice(0, 7);

      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5, 7));
      const startsAt = new Date(year, monthNumber - 1, 1);
      const endsAt = new Date(year, monthNumber, 1);

      const [checkIns, activitySchedules, activityPresences] = await Promise.all([
        prisma.alunoCheckIn.findMany({
          where: {
            alunoPlano: { idAluno },
            idAtividadeAgenda: null,
            dtCadastro: { gte: startsAt, lt: endsAt },
            boInativo: false,
          },
          include: {
            alunoPlano: { include: { plano: true } },
            alunoTreinoSequencia: {
              include: {
                alunoTreino: {
                  include: {
                    treino: true,
                    funcionario: true,
                  },
                },
              },
            },
          },
          orderBy: { dtCadastro: 'asc' },
        }),
        prisma.alunoAtividadeAgenda.findMany({
          where: {
            idAluno,
            boInativo: false,
            atividadeAgenda: {
              boInativo: false,
              dtInicial: { gte: startsAt, lt: endsAt },
            },
          },
          include: {
            empresa: true,
            atividadeAgenda: {
              include: {
                atividade: true,
                categoria: true,
                empresa: true,
                funcionarioAtividadeAgendas: {
                  where: { boInativo: false },
                  include: { funcionario: true },
                },
              },
            },
          },
          orderBy: { dtCadastro: 'asc' },
        }),
        prisma.alunoCheckIn.findMany({
          where: {
            idAluno,
            idAtividadeAgenda: { not: null },
            boInativo: false,
            atividadeAgenda: { dtInicial: { gte: startsAt, lt: endsAt } },
          },
          include: {
            atividadeAgenda: {
              include: {
                atividade: true,
                categoria: true,
                empresa: true,
                funcionarioAtividadeAgendas: {
                  where: { boInativo: false },
                  include: { funcionario: true },
                },
              },
            },
          },
          orderBy: { dtCadastro: 'asc' },
        }),
      ]);

      return { checkIns, activitySchedules, activityPresences };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao carregar calendario do aluno.',
      });
    }
  });

  app.post<{
    Params: { id: string };
    Body: StudentActivityScheduleEnrollPayload;
  }>('/students/:id/activity-schedules/enroll', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const scheduleIds = normalizeScheduleIds(request.body);

      const student = await findTenantStudent(idAluno, idCliente);

      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      const created = await prisma.$transaction(async (transaction) => {
        const schedules = await transaction.atividadeAgenda.findMany({
          // Somente agendas do tenant: ids de outros clientes caem no erro de nao encontradas.
          where: { id: { in: scheduleIds }, boInativo: false, empresa: { idCliente } },
          include: {
            atividade: { select: { dsAtividade: true } },
            alunoAtividadeAgendas: {
              where: { boInativo: false },
              select: { idAluno: true },
            },
          },
          orderBy: { dtInicial: 'asc' },
        });

        if (schedules.length !== scheduleIds.length) {
          throw new Error('Uma ou mais aulas selecionadas nao foram encontradas.');
        }

        for (const schedule of schedules) {
          if (!schedule.dtInicial || !schedule.dtFinal) {
            throw new Error(`A agenda ${formatScheduleLabel(schedule)} esta sem periodo completo.`);
          }

          if (schedule.dtFinal < new Date()) {
            throw new Error(`A agenda ${formatScheduleLabel(schedule)} ja foi encerrada.`);
          }

          if (schedule.alunoAtividadeAgendas.some((enrollment) => enrollment.idAluno === idAluno)) {
            throw new Error(`Voce ja esta inscrito na agenda ${formatScheduleLabel(schedule)}.`);
          }

          if (schedule.qtAlunos !== null && schedule.alunoAtividadeAgendas.length >= schedule.qtAlunos) {
            throw new Error(`Nao ha vagas disponiveis na agenda ${formatScheduleLabel(schedule)}.`);
          }
        }

        for (let index = 0; index < schedules.length; index += 1) {
          for (let nextIndex = index + 1; nextIndex < schedules.length; nextIndex += 1) {
            const first = schedules[index]!;
            const second = schedules[nextIndex]!;
            if (schedulesOverlap(first, second)) {
              throw new Error(
                `As agendas selecionadas possuem conflito de horario: ${formatScheduleLabel(first)} e ${formatScheduleLabel(second)}.`,
              );
            }
          }
        }

        const selectedStart = schedules.reduce<Date | null>((current, schedule) => {
          if (!schedule.dtInicial) return current;
          return !current || schedule.dtInicial < current ? schedule.dtInicial : current;
        }, null);
        const selectedEnd = schedules.reduce<Date | null>((current, schedule) => {
          if (!schedule.dtFinal) return current;
          return !current || schedule.dtFinal > current ? schedule.dtFinal : current;
        }, null);

        if (!selectedStart || !selectedEnd) {
          throw new Error('Nao foi possivel validar o periodo das aulas selecionadas.');
        }

        const existingEnrollments = await transaction.alunoAtividadeAgenda.findMany({
          where: {
            idAluno,
            boInativo: false,
            atividadeAgenda: {
              boInativo: false,
              dtInicial: { lt: selectedEnd },
              dtFinal: { gt: selectedStart },
            },
          },
          include: {
            atividadeAgenda: {
              include: {
                atividade: { select: { dsAtividade: true } },
                alunoAtividadeAgendas: {
                  where: { boInativo: false },
                  select: { idAluno: true },
                },
              },
            },
          },
        });

        for (const selectedSchedule of schedules) {
          const conflict = existingEnrollments.find((enrollment) => {
            const existingSchedule = enrollment.atividadeAgenda;
            return existingSchedule && schedulesOverlap(selectedSchedule, existingSchedule);
          });

          if (conflict?.atividadeAgenda) {
            throw new Error(
              `Voce ja possui outra agenda nesse periodo: ${formatScheduleLabel(conflict.atividadeAgenda)}.`,
            );
          }
        }

        return Promise.all(
          schedules.map((schedule) =>
            transaction.alunoAtividadeAgenda.create({
              data: {
                idAluno,
                idEmpresa: schedule.idEmpresa,
                idAtividadeAgenda: schedule.id,
                boInativo: false,
              },
            }),
          ),
        );
      });

      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao realizar inscricao na aula.',
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/trainings', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      const parsedQuery = listLimitQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ message: 'Parametros invalidos.' });
      }
      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }
      return prisma.alunoTreino.findMany({
        where: { idAluno },
        take: clampLimit(parsedQuery.data.limit),
        include: {
          funcionario: true,
          treino: true,
          alunoTreinosSequencias: { where: { boInativo: false }, orderBy: { nrOrdem: 'asc' } },
        },
        orderBy: { dtCadastro: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar treinos do aluno.',
      });
    }
  });

  app.post<{
    Params: { id: string; resource: string };
    Body: CompanyChildPayload;
  }>('/students/:id/related/:resource', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const resource = getStudentChildResourceConfig(request.params.resource);
      assertValidId(idAluno, 'Aluno invalido.');

      const parsedBody = childResourceBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }

      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      if (resource === 'plans') {
        const idPlano = optionalNumber(request.body.idPlano);
        if (!idPlano) throw new Error('Selecione o plano.');

        const plano = await prisma.plano.findUnique({
          where: { id: idPlano },
          include: {
            frequencia: true,
            planoValores: { where: { boInativo: false }, orderBy: { dtCadastro: 'desc' } },
          },
        });
        if (!plano) throw new Error('Plano invalido.');

        const nrDiaPagamento = Number(request.body.nrDiaPagamento ?? 1);
        const admissao = optionalDate(request.body.dtAdmissao) ?? new Date();
        const requestedEmpresa = optionalNumber(request.body.idEmpresa);
        const idEmpresa =
          requestedEmpresa ??
          plano.planoValores.find((value) => value.idEmpresa)?.idEmpresa ??
          null;
        if (!idEmpresa) throw new Error('Informe a empresa para gerar os pagamentos.');
        await assertTenantEmpresa(idEmpresa, idCliente);

        const empresaValue =
          plano.planoValores.find((value) => value.idEmpresa === idEmpresa) ??
          plano.planoValores[0] ??
          null;
        const vlParcela = Number(empresaValue?.vlVenda ?? 0);

        const recurring = isRecurringFrequency(plano.frequencia);
        const qtParcelas = recurring ? 1 : Math.max(1, optionalNumber(request.body.qtParcelas) ?? 1);

        const idPromocaoPlano = optionalNumber(request.body.idPromocaoPlano);
        const promocaoPlano = idPromocaoPlano
          ? await prisma.promocaoPlano.findFirst({
              where: {
                id: idPromocaoPlano,
                OR: [{ idEmpresa: null }, { empresa: { idCliente } }],
              },
              include: { promocao: true },
            })
          : null;
        if (idPromocaoPlano && !promocaoPlano) throw new Error('Promocao invalida para este cliente.');

        const record = await prisma.$transaction(async (transaction) => {
          const created = await transaction.alunoPlano.create({
            data: {
              idAluno,
              idPlano,
              idPromocaoPlano,
              nrDiaPagamento,
              qtParcelas,
              dtAdmissao: admissao,
              boInativo: toBool(request.body.boInativo),
            },
          });

          await generateInitialPayments({
            db: transaction,
            idAlunoPlano: created.id,
            idEmpresa,
            nrDiaPagamento,
            qtParcelas,
            vlParcela,
            admissao,
            freq: plano.frequencia,
            promo: promocaoPlano?.promocao ?? null,
          });

          return created;
        });

        return reply.code(201).send(record);
      }

      if (resource === 'trainings') {
        const idTreino = optionalNumber(request.body.idTreino);
        if (!idTreino) throw new Error('Selecione um treino.');

        const training = await prisma.treino.findFirst({
          where: {
            id: idTreino,
            OR: [
              { empresa: { idCliente } },
              { idEmpresa: null, idAluno: null },
              { idEmpresa: null, aluno: { idCliente } },
            ],
          },
          select: { id: true },
        });
        if (!training) throw new Error('Treino invalido.');

        const idFuncionario = optionalNumber(request.body.idFuncionario);
        if (!idFuncionario) throw new Error('Profissional logado invalido.');

        const employee = await prisma.funcionario.findFirst({
          where: { id: idFuncionario, empresa: { idCliente } },
          select: { id: true },
        });
        if (!employee) throw new Error('Profissional invalido.');

        const nrOrdemSequencia = optionalNumber(request.body.nrOrdemSequencia);
        const record = await prisma.$transaction(async (transaction) => {
          const studentTraining = await transaction.alunoTreino.create({
            data: { idAluno, idFuncionario, idTreino, boInativo: toBool(request.body.boInativo) },
          });

          if (nrOrdemSequencia) {
            await transaction.alunoTreinoSequencia.create({
              data: { idAlunoTreino: studentTraining.id, nrOrdem: nrOrdemSequencia, boInativo: false },
            });
          }

          return transaction.alunoTreino.findUniqueOrThrow({
            where: { id: studentTraining.id },
            include: {
              funcionario: true,
              treino: true,
              alunoTreinosSequencias: { where: { boInativo: false }, orderBy: { nrOrdem: 'asc' } },
            },
          });
        });

        return reply.code(201).send(record);
      }

      let idAlunoPlano = optionalNumber(request.body.idAlunoPlano);

      if (!idAlunoPlano && resource === 'check-ins') {
        const activePlan = await prisma.alunoPlano.findFirst({
          where: { idAluno, boInativo: false },
          orderBy: { dtCadastro: 'desc' },
          select: { id: true },
        });
        idAlunoPlano = activePlan?.id ?? null;
      }

      if (!idAlunoPlano) throw new Error('Selecione um plano do aluno.');

      const studentPlan = await prisma.alunoPlano.findFirst({
        where: { id: idAlunoPlano, idAluno },
        select: { id: true },
      });
      if (!studentPlan) throw new Error('Plano do aluno invalido.');

      if (resource === 'payments') {
        const idEmpresa = optionalNumber(request.body.idEmpresa);
        if (!idEmpresa) throw new Error('Informe a empresa do pagamento.');
        await assertTenantEmpresa(idEmpresa, idCliente);
        const idStatusPagamento = optionalNumber(request.body.idStatusPagamento);
        if (!idStatusPagamento) throw new Error('Informe o status do pagamento.');
        const idProdutoMovimentacao = optionalNumber(request.body.idProdutoMovimentacao);
        if (idProdutoMovimentacao) {
          const movimentacao = await prisma.produtoMovimentacao.findFirst({
            where: { id: idProdutoMovimentacao, empresa: { idCliente } },
            select: { id: true },
          });
          if (!movimentacao) throw new Error('Movimentacao de produto invalida para este cliente.');
        }
        const record = await prisma.pagamento.create({
          data: {
            idEmpresa,
            idAlunoPlano,
            idProdutoMovimentacao,
            vlPrevisto: Number(request.body.vlPrevisto ?? request.body.vlPago ?? 0),
            vlPago: optionalNumber(request.body.vlPago),
            idStatusPagamento,
            idFormaPagamento: optionalNumber(request.body.idFormaPagamento),
            dtVencimento: optionalDate(request.body.dtVencimento),
            dtCompetencia: optionalDate(request.body.dtCompetencia),
            dtPagamento: optionalDate(request.body.dtPagamento) ?? new Date(),
            boInativo: toBool(request.body.boInativo),
          },
        });
        return reply.code(201).send(record);
      }

      const idAlunoTreinosSequencia = optionalNumber(request.body.idAlunoTreinosSequencia);

      if (idAlunoTreinosSequencia) {
        const sequence = await prisma.alunoTreinoSequencia.findFirst({
          where: {
            id: idAlunoTreinosSequencia,
            alunoTreino: { idAluno },
          },
          select: { id: true },
        });

        if (!sequence) {
          throw new Error('Sequencia de treino invalida para o aluno.');
        }
      }

      let idEmpresaCheckIn = optionalNumber(request.body.idEmpresa);

      if (idEmpresaCheckIn) {
        await assertTenantEmpresa(idEmpresaCheckIn, idCliente);
      } else {
        const empresa = await prisma.empresa.findFirst({
          where: { idCliente },
          select: { id: true },
        });
        idEmpresaCheckIn = empresa?.id ?? null;
      }

      if (!idEmpresaCheckIn) throw new Error('Informe a empresa do check-in.');

      const access = await getStudentAccessStatus(prisma, idAluno);
      if (!access.canAccess) {
        throw new Error(access.reason ?? 'Aluno sem acesso liberado para check-in.');
      }

      const idPontuacao = optionalNumber(request.body.idPontuacao);
      if (idPontuacao) {
        const pontuacao = await prisma.pontuacao.findFirst({
          where: { id: idPontuacao, empresa: { idCliente } },
          select: { id: true },
        });
        if (!pontuacao) throw new Error('Pontuacao invalida para este cliente.');
      }

      const record = await prisma.alunoCheckIn.create({
        data: {
          idEmpresa: idEmpresaCheckIn,
          idAluno,
          idAlunoPlano,
          idAlunoTreinosSequencia,
          idPontuacao,
          idTipoCheckIn: optionalNumber(request.body.idTipoCheckIn),
          boInativo: toBool(request.body.boInativo),
        },
        include: {
          alunoPlano: { include: { plano: true } },
          alunoTreinoSequencia: {
            include: {
              alunoTreino: {
                include: {
                  treino: true,
                  funcionario: true,
                },
              },
            },
          },
        },
      });
      return reply.code(201).send(record);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar registro relacionado.',
      });
    }
  });

  app.put<{
    Params: { id: string; resource: string; childId: string };
    Body: CompanyChildPayload;
  }>('/students/:id/related/:resource/:childId', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const childId = Number(request.params.childId);
      const resource = getStudentChildResourceConfig(request.params.resource);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(childId, 'Registro invalido.');

      const parsedBody = childResourceBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }

      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      if (resource === 'plans') {
        const current = await prisma.alunoPlano.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Plano do aluno invalido.');

        const idPlano = optionalNumber(request.body.idPlano);
        if (!idPlano) throw new Error('Selecione o plano.');
        const idPromocaoPlano = optionalNumber(request.body.idPromocaoPlano);
        if (idPromocaoPlano) {
          const promocaoPlano = await prisma.promocaoPlano.findFirst({
            where: { id: idPromocaoPlano, OR: [{ idEmpresa: null }, { empresa: { idCliente } }] },
            select: { id: true },
          });
          if (!promocaoPlano) throw new Error('Promocao invalida para este cliente.');
        }
        const boInativoPlano = toBool(request.body.boInativo);
        return prisma.alunoPlano.update({
          where: { id: childId },
          data: {
            idPlano,
            idPromocaoPlano,
            nrDiaPagamento: Number(request.body.nrDiaPagamento ?? 1),
            dtAdmissao: optionalDate(request.body.dtAdmissao) ?? new Date(),
            boInativo: boInativoPlano,
            // Cancelling records the cancellation date; reactivating clears it.
            dtEncerramento: boInativoPlano ? new Date() : null,
          },
        });
      }

      if (resource === 'trainings') {
        const current = await prisma.alunoTreino.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Treino do aluno invalido.');

        const idTreino = optionalNumber(request.body.idTreino);
        if (!idTreino) throw new Error('Selecione um treino.');

        const training = await prisma.treino.findFirst({
          where: {
            id: idTreino,
            OR: [
              { empresa: { idCliente } },
              { idEmpresa: null, idAluno: null },
              { idEmpresa: null, aluno: { idCliente } },
            ],
          },
          select: { id: true },
        });
        if (!training) throw new Error('Treino invalido.');

        const idFuncionario = optionalNumber(request.body.idFuncionario);
        if (!idFuncionario) throw new Error('Profissional logado invalido.');

        const employee = await prisma.funcionario.findFirst({
          where: { id: idFuncionario, empresa: { idCliente } },
          select: { id: true },
        });
        if (!employee) throw new Error('Profissional invalido.');

        const nrOrdemSequencia = optionalNumber(request.body.nrOrdemSequencia);

        return prisma.$transaction(async (transaction) => {
          await transaction.alunoTreino.update({
            where: { id: childId },
            data: { idFuncionario, idTreino, boInativo: toBool(request.body.boInativo) },
          });

          if (nrOrdemSequencia) {
            const currentSequence = await transaction.alunoTreinoSequencia.findFirst({
              where: { idAlunoTreino: childId, boInativo: false },
              orderBy: { nrOrdem: 'asc' },
            });

            if (currentSequence) {
              await transaction.alunoTreinoSequencia.update({
                where: { id: currentSequence.id },
                data: { nrOrdem: nrOrdemSequencia },
              });
            } else {
              await transaction.alunoTreinoSequencia.create({
                data: { idAlunoTreino: childId, nrOrdem: nrOrdemSequencia, boInativo: false },
              });
            }
          }

          return transaction.alunoTreino.findUniqueOrThrow({
            where: { id: childId },
            include: {
              funcionario: true,
              treino: true,
              alunoTreinosSequencias: { where: { boInativo: false }, orderBy: { nrOrdem: 'asc' } },
            },
          });
        });
      }

      const idAlunoPlano = optionalNumber(request.body.idAlunoPlano);
      if (!idAlunoPlano) throw new Error('Selecione um plano do aluno.');

      const studentPlan = await prisma.alunoPlano.findFirst({
        where: { id: idAlunoPlano, idAluno },
        select: { id: true },
      });
      if (!studentPlan) throw new Error('Plano do aluno invalido.');

      if (resource === 'payments') {
        const current = await prisma.pagamento.findFirst({
          where: { id: childId, alunoPlano: { idAluno } },
          select: { id: true, idEmpresa: true },
        });
        if (!current) throw new Error('Pagamento invalido.');

        const idEmpresa = optionalNumber(request.body.idEmpresa) ?? current.idEmpresa;
        if (!idEmpresa) throw new Error('Informe a empresa do pagamento.');
        await assertTenantEmpresa(idEmpresa, idCliente);
        const idStatusPagamento = optionalNumber(request.body.idStatusPagamento);
        if (!idStatusPagamento) throw new Error('Informe o status do pagamento.');
        const idProdutoMovimentacao = optionalNumber(request.body.idProdutoMovimentacao);
        if (idProdutoMovimentacao) {
          const movimentacao = await prisma.produtoMovimentacao.findFirst({
            where: { id: idProdutoMovimentacao, empresa: { idCliente } },
            select: { id: true },
          });
          if (!movimentacao) throw new Error('Movimentacao de produto invalida para este cliente.');
        }

        const status = await prisma.statusPagamento.findUnique({
          where: { id: idStatusPagamento },
          select: { dsStatusPagamento: true },
        });
        const isPaid = status?.dsStatusPagamento?.toLowerCase() === 'pago';

        const updated = await prisma.$transaction(async (transaction) => {
          const payment = await transaction.pagamento.update({
            where: { id: childId },
            data: {
              idEmpresa,
              idAlunoPlano,
              idProdutoMovimentacao,
              vlPrevisto: Number(request.body.vlPrevisto ?? request.body.vlPago ?? 0),
              vlPago: optionalNumber(request.body.vlPago),
              idStatusPagamento,
              idFormaPagamento: optionalNumber(request.body.idFormaPagamento),
              dtVencimento: optionalDate(request.body.dtVencimento),
              dtCompetencia: optionalDate(request.body.dtCompetencia),
              dtPagamento: optionalDate(request.body.dtPagamento) ?? new Date(),
              boInativo: toBool(request.body.boInativo),
            },
          });

          if (isPaid) {
            await generateNextRecurringPayment(transaction, payment.id);
          }

          return payment;
        });

        return updated;
      }

      const current = await prisma.alunoCheckIn.findFirst({
        where: { id: childId, alunoPlano: { idAluno } },
        select: { id: true },
      });
      if (!current) throw new Error('Check-in invalido.');

      const idEmpresaCheckIn = optionalNumber(request.body.idEmpresa);
      if (!idEmpresaCheckIn) throw new Error('Informe a empresa do check-in.');
      await assertTenantEmpresa(idEmpresaCheckIn, idCliente);

      const idAlunoTreinosSequencia = optionalNumber(request.body.idAlunoTreinosSequencia);
      if (idAlunoTreinosSequencia) {
        const sequence = await prisma.alunoTreinoSequencia.findFirst({
          where: { id: idAlunoTreinosSequencia, alunoTreino: { idAluno } },
          select: { id: true },
        });
        if (!sequence) throw new Error('Sequencia de treino invalida para o aluno.');
      }

      const idPontuacao = optionalNumber(request.body.idPontuacao);
      if (idPontuacao) {
        const pontuacao = await prisma.pontuacao.findFirst({
          where: { id: idPontuacao, empresa: { idCliente } },
          select: { id: true },
        });
        if (!pontuacao) throw new Error('Pontuacao invalida para este cliente.');
      }

      return prisma.alunoCheckIn.update({
        where: { id: childId },
        data: {
          idEmpresa: idEmpresaCheckIn,
          idAlunoPlano,
          idAlunoTreinosSequencia,
          idPontuacao,
          idTipoCheckIn: optionalNumber(request.body.idTipoCheckIn),
          boInativo: toBool(request.body.boInativo),
        },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar registro relacionado.',
      });
    }
  });

  app.patch<{
    Params: { id: string; resource: string; childId: string };
    Body: { boInativo?: number };
  }>('/students/:id/related/:resource/:childId/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const idAluno = Number(request.params.id);
      const childId = Number(request.params.childId);
      const resource = getStudentChildResourceConfig(request.params.resource);
      const parsedBody = statusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ message: 'Dados invalidos.' });
      }
      const boInativo = toBool(request.body.boInativo);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(childId, 'Registro invalido.');

      const student = await findTenantStudent(idAluno, idCliente);
      if (!student) {
        return reply.code(404).send({ message: 'Registro nao encontrado.' });
      }

      if (resource === 'plans') {
        const current = await prisma.alunoPlano.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Plano do aluno invalido.');
        // Cancelling a plan records the cancellation date in dtEncerramento;
        // reactivating clears it.
        return prisma.alunoPlano.update({
          where: { id: childId },
          data: { boInativo, dtEncerramento: boInativo ? new Date() : null },
        });
      }

      if (resource === 'trainings') {
        const current = await prisma.alunoTreino.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Treino do aluno invalido.');
        return prisma.alunoTreino.update({
          where: { id: childId },
          data: { boInativo },
          include: {
            funcionario: true,
            treino: true,
            alunoTreinosSequencias: { where: { boInativo: false }, orderBy: { nrOrdem: 'asc' } },
          },
        });
      }

      if (resource === 'payments') {
        const current = await prisma.pagamento.findFirst({
          where: { id: childId, alunoPlano: { idAluno } },
          select: { id: true },
        });
        if (!current) throw new Error('Pagamento invalido.');
        return prisma.pagamento.update({ where: { id: childId }, data: { boInativo } });
      }

      const current = await prisma.alunoCheckIn.findFirst({
        where: { id: childId, alunoPlano: { idAluno } },
        select: { id: true },
      });
      if (!current) throw new Error('Check-in invalido.');
      return prisma.alunoCheckIn.update({ where: { id: childId }, data: { boInativo } });
    } catch (error) {
      return reply.code(400).send({
        message:
          error instanceof Error
            ? error.message
            : 'Erro ao alterar status do registro relacionado.',
      });
    }
  });
}
