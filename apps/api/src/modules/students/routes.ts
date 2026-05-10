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
import { getStudentFilePath } from '../../shared/files.js';
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

export async function registerStudentRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // Students CRUD
  // ---------------------------------------------------------------------------

  app.get<{
    Querystring: { search?: string };
  }>('/students', async (request) => {
    const search = request.query.search?.trim();
    return prisma.aluno.findMany({
      where: search
        ? {
            OR: [
              { nmAluno: { contains: search, mode: 'insensitive' } },
              { caCPF: { contains: search.replace(/\D/g, '') } },
              { anEmail: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { nmAluno: 'asc' },
    });
  });

  app.post<{
    Body: StudentPayload;
  }>('/students', async (request, reply) => {
    try {
      const data = normalizeStudentPayload(request.body);
      const student = await prisma.aluno.create({ data });
      return reply.code(201).send(student);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar aluno.',
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id', async (request, reply) => {
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Aluno invalido.');
      const student = await prisma.aluno.findUnique({ where: { id } });

      if (!student) {
        return reply.code(404).send({ message: 'Aluno nao encontrado.' });
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
    try {
      const id = Number(request.params.id);
      const data = normalizeStudentPayload(request.body);
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
    try {
      const id = Number(request.params.id);
      const boInativo = Number(request.body.boInativo ?? 0);
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
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      return prisma.alunoArquivo.findMany({
        where: { idAluno, boInativo: 0 },
        orderBy: { dtCadastro: 'desc' },
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
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await prisma.aluno.findUnique({
        where: { id: idAluno },
        select: { id: true },
      });

      if (!student) {
        return reply.code(404).send({ message: 'Aluno nao encontrado.' });
      }

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ message: 'Envie um arquivo.' });
      }

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
    try {
      const idAluno = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const studentFile = await prisma.alunoArquivo.findFirst({
        where: { id: fileId, idAluno, boInativo: 0 },
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
    try {
      const idAluno = Number(request.params.id);
      const fileId = Number(request.params.fileId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(fileId, 'Arquivo invalido.');

      const existingFile = await prisma.alunoArquivo.findFirst({
        where: { id: fileId, idAluno, boInativo: 0 },
      });

      if (!existingFile) {
        return reply.code(404).send({ message: 'Arquivo nao encontrado.' });
      }

      return prisma.alunoArquivo.update({ where: { id: fileId }, data: { boInativo: 1 } });
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
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      return prisma.alunoBiometriaFacial.findMany({
        where: { idAluno, boInativo: 0 },
        orderBy: { dtCadastro: 'desc' },
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
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const data = normalizeStudentFacialBiometricPayload(request.body);
      const student = await prisma.aluno.findUnique({
        where: { id: idAluno },
        select: { id: true },
      });

      if (!student) {
        return reply.code(404).send({ message: 'Aluno nao encontrado.' });
      }

      if (data.idAlunoArquivo) {
        const studentFile = await prisma.alunoArquivo.findFirst({
          where: { id: data.idAlunoArquivo, idAluno, boInativo: 0 },
          select: { id: true },
        });
        if (!studentFile) {
          throw new Error('Arquivo do aluno invalido para biometria facial.');
        }
      }

      const biometric = await prisma.$transaction(async (transaction) => {
        await transaction.alunoBiometriaFacial.updateMany({
          where: { idAluno, boInativo: 0 },
          data: { boInativo: 1 },
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
            boInativo: 0,
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
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

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

      const student = await prisma.aluno.findUnique({
        where: { id: idAluno },
        select: { id: true },
      });

      if (!student) {
        return reply.code(404).send({ message: 'Aluno nao encontrado.' });
      }

      const studentFile = await prisma.alunoArquivo.findFirst({
        where: { id: idAlunoArquivo, idAluno, boInativo: 0 },
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
          where: { idAluno, boInativo: 0 },
          data: { boInativo: 1 },
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
            boInativo: 0,
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
    try {
      const idAluno = Number(request.params.id);
      const id = Number(request.params.biometricId);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(id, 'Biometria facial invalida.');

      const current = await prisma.alunoBiometriaFacial.findFirst({
        where: { id, idAluno },
        select: { id: true },
      });

      if (!current) {
        return reply.code(404).send({ message: 'Biometria facial nao encontrada.' });
      }

      return prisma.alunoBiometriaFacial.update({
        where: { id },
        data: { boInativo: Number(request.body.boInativo ?? 0) },
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
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      return prisma.alunoPlano.findMany({
        where: { idAluno },
        include: {
          empresa: true,
          plano: {
            include: {
              frequencia: true,
              planoAtividades: {
                where: { boInativo: 0 },
                include: { atividade: true },
                orderBy: { id: 'asc' },
              },
              planoProdutos: {
                where: { boInativo: 0 },
                include: { produto: true },
                orderBy: { id: 'asc' },
              },
              planoEmpresas: {
                where: { boInativo: 0 },
                include: { empresa: true },
                orderBy: { id: 'asc' },
              },
              planoValores: {
                where: { boInativo: 0 },
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
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      return prisma.pagamento.findMany({
        where: { alunoPlano: { idAluno } },
        orderBy: { dtPagamento: 'desc' },
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao listar pagamentos do aluno.',
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/check-ins', async (request, reply) => {
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      return prisma.alunoCheckIn.findMany({
        where: { alunoPlano: { idAluno } },
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
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');

      const month = request.query.month ?? new Date().toISOString().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new Error('Informe o mes no formato YYYY-MM.');
      }

      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5, 7));
      const startsAt = new Date(year, monthNumber - 1, 1);
      const endsAt = new Date(year, monthNumber, 1);

      const [checkIns, activitySchedules] = await Promise.all([
        prisma.alunoCheckIn.findMany({
          where: {
            alunoPlano: { idAluno },
            dtCadastro: { gte: startsAt, lt: endsAt },
            boInativo: 0,
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
            atividadeAgenda: {
              include: {
                atividade: true,
                categoria: true,
                empresa: true,
              },
            },
          },
          orderBy: { dtCadastro: 'asc' },
        }),
        prisma.alunoAtividadeAgenda.findMany({
          where: {
            idAluno,
            boInativo: 0,
            atividadeAgenda: {
              boInativo: 0,
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
                  where: { boInativo: 0 },
                  include: { funcionario: true },
                },
              },
            },
          },
          orderBy: { dtCadastro: 'asc' },
        }),
      ]);

      return { checkIns, activitySchedules };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao carregar calendario do aluno.',
      });
    }
  });

  app.get<{
    Params: { id: string };
  }>('/students/:id/related/trainings', async (request, reply) => {
    try {
      const idAluno = Number(request.params.id);
      assertValidId(idAluno, 'Aluno invalido.');
      return prisma.alunoTreino.findMany({
        where: { idAluno },
        include: {
          funcionario: true,
          treino: true,
          alunoTreinosSequencias: { where: { boInativo: 0 }, orderBy: { nrOrdem: 'asc' } },
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
    try {
      const idAluno = Number(request.params.id);
      const resource = getStudentChildResourceConfig(request.params.resource);
      assertValidId(idAluno, 'Aluno invalido.');

      const student = await prisma.aluno.findUnique({ where: { id: idAluno }, select: { id: true } });
      if (!student) {
        return reply.code(404).send({ message: 'Aluno nao encontrado.' });
      }

      if (resource === 'plans') {
        const record = await prisma.alunoPlano.create({
          data: {
            idAluno,
            idEmpresa: optionalNumber(request.body.idEmpresa),
            idPlano: optionalNumber(request.body.idPlano),
            idPromocaoPlano: optionalNumber(request.body.idPromocaoPlano),
            nrDiaPagamento: Number(request.body.nrDiaPagamento ?? 1),
            dtAdmissao: optionalDate(request.body.dtAdmissao) ?? new Date(),
            boInativo: Number(request.body.boInativo ?? 0),
          },
        });
        return reply.code(201).send(record);
      }

      if (resource === 'trainings') {
        const idTreino = optionalNumber(request.body.idTreino);
        if (!idTreino) throw new Error('Selecione um treino.');

        const training = await prisma.treino.findUnique({ where: { id: idTreino }, select: { id: true } });
        if (!training) throw new Error('Treino invalido.');

        const idFuncionario = optionalNumber(request.body.idFuncionario);
        if (!idFuncionario) throw new Error('Profissional logado invalido.');

        const employee = await prisma.funcionario.findUnique({ where: { id: idFuncionario }, select: { id: true } });
        if (!employee) throw new Error('Profissional invalido.');

        const nrOrdemSequencia = optionalNumber(request.body.nrOrdemSequencia);
        const record = await prisma.$transaction(async (transaction) => {
          const studentTraining = await transaction.alunoTreino.create({
            data: { idAluno, idFuncionario, idTreino, boInativo: Number(request.body.boInativo ?? 0) },
          });

          if (nrOrdemSequencia) {
            await transaction.alunoTreinoSequencia.create({
              data: { idAlunoTreino: studentTraining.id, nrOrdem: nrOrdemSequencia, boInativo: 0 },
            });
          }

          return transaction.alunoTreino.findUniqueOrThrow({
            where: { id: studentTraining.id },
            include: {
              funcionario: true,
              treino: true,
              alunoTreinosSequencias: { where: { boInativo: 0 }, orderBy: { nrOrdem: 'asc' } },
            },
          });
        });

        return reply.code(201).send(record);
      }

      let idAlunoPlano = optionalNumber(request.body.idAlunoPlano);

      if (!idAlunoPlano && resource === 'check-ins') {
        const activePlan = await prisma.alunoPlano.findFirst({
          where: { idAluno, boInativo: 0 },
          orderBy: { dtCadastro: 'desc' },
          select: { id: true },
        });
        idAlunoPlano = activePlan?.id ?? null;
      }

      if (!idAlunoPlano) throw new Error('Selecione um plano do aluno.');

      const studentPlan = await prisma.alunoPlano.findFirst({
        where: { id: idAlunoPlano, idAluno },
        select: { id: true, idEmpresa: true },
      });
      if (!studentPlan) throw new Error('Plano do aluno invalido.');

      if (resource === 'payments') {
        const record = await prisma.pagamento.create({
          data: {
            idEmpresa: optionalNumber(request.body.idEmpresa) ?? studentPlan.idEmpresa,
            idAlunoPlano,
            idProdutoMovimentacao: optionalNumber(request.body.idProdutoMovimentacao),
            vlPagamento: Number(request.body.vlPagamento ?? 0),
            idStatusPagamento: optionalNumber(request.body.idStatusPagamento),
            idFormaPagamento: optionalNumber(request.body.idFormaPagamento),
            dtPagamento: optionalDate(request.body.dtPagamento) ?? new Date(),
            boInativo: Number(request.body.boInativo ?? 0),
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

      const record = await prisma.alunoCheckIn.create({
        data: {
          idEmpresa: optionalNumber(request.body.idEmpresa) ?? studentPlan.idEmpresa,
          idAlunoPlano,
          idAlunoTreinosSequencia,
          idPontos: optionalNumber(request.body.idPontos),
          boInativo: Number(request.body.boInativo ?? 0),
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
    try {
      const idAluno = Number(request.params.id);
      const childId = Number(request.params.childId);
      const resource = getStudentChildResourceConfig(request.params.resource);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(childId, 'Registro invalido.');

      if (resource === 'plans') {
        const current = await prisma.alunoPlano.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Plano do aluno invalido.');

        return prisma.alunoPlano.update({
          where: { id: childId },
          data: {
            idEmpresa: optionalNumber(request.body.idEmpresa),
            idPlano: optionalNumber(request.body.idPlano),
            idPromocaoPlano: optionalNumber(request.body.idPromocaoPlano),
            nrDiaPagamento: Number(request.body.nrDiaPagamento ?? 1),
            dtAdmissao: optionalDate(request.body.dtAdmissao) ?? new Date(),
            boInativo: Number(request.body.boInativo ?? 0),
          },
        });
      }

      if (resource === 'trainings') {
        const current = await prisma.alunoTreino.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Treino do aluno invalido.');

        const idTreino = optionalNumber(request.body.idTreino);
        if (!idTreino) throw new Error('Selecione um treino.');

        const training = await prisma.treino.findUnique({ where: { id: idTreino }, select: { id: true } });
        if (!training) throw new Error('Treino invalido.');

        const idFuncionario = optionalNumber(request.body.idFuncionario);
        if (!idFuncionario) throw new Error('Profissional logado invalido.');

        const employee = await prisma.funcionario.findUnique({ where: { id: idFuncionario }, select: { id: true } });
        if (!employee) throw new Error('Profissional invalido.');

        const nrOrdemSequencia = optionalNumber(request.body.nrOrdemSequencia);

        return prisma.$transaction(async (transaction) => {
          await transaction.alunoTreino.update({
            where: { id: childId },
            data: { idFuncionario, idTreino, boInativo: Number(request.body.boInativo ?? 0) },
          });

          if (nrOrdemSequencia) {
            const currentSequence = await transaction.alunoTreinoSequencia.findFirst({
              where: { idAlunoTreino: childId, boInativo: 0 },
              orderBy: { nrOrdem: 'asc' },
            });

            if (currentSequence) {
              await transaction.alunoTreinoSequencia.update({
                where: { id: currentSequence.id },
                data: { nrOrdem: nrOrdemSequencia },
              });
            } else {
              await transaction.alunoTreinoSequencia.create({
                data: { idAlunoTreino: childId, nrOrdem: nrOrdemSequencia, boInativo: 0 },
              });
            }
          }

          return transaction.alunoTreino.findUniqueOrThrow({
            where: { id: childId },
            include: {
              funcionario: true,
              treino: true,
              alunoTreinosSequencias: { where: { boInativo: 0 }, orderBy: { nrOrdem: 'asc' } },
            },
          });
        });
      }

      const idAlunoPlano = optionalNumber(request.body.idAlunoPlano);
      if (!idAlunoPlano) throw new Error('Selecione um plano do aluno.');

      const studentPlan = await prisma.alunoPlano.findFirst({
        where: { id: idAlunoPlano, idAluno },
        select: { id: true, idEmpresa: true },
      });
      if (!studentPlan) throw new Error('Plano do aluno invalido.');

      if (resource === 'payments') {
        const current = await prisma.pagamento.findFirst({
          where: { id: childId, alunoPlano: { idAluno } },
          select: { id: true },
        });
        if (!current) throw new Error('Pagamento invalido.');

        return prisma.pagamento.update({
          where: { id: childId },
          data: {
            idEmpresa: optionalNumber(request.body.idEmpresa) ?? studentPlan.idEmpresa,
            idAlunoPlano,
            idProdutoMovimentacao: optionalNumber(request.body.idProdutoMovimentacao),
            vlPagamento: Number(request.body.vlPagamento ?? 0),
            idStatusPagamento: optionalNumber(request.body.idStatusPagamento),
            idFormaPagamento: optionalNumber(request.body.idFormaPagamento),
            dtPagamento: optionalDate(request.body.dtPagamento) ?? new Date(),
            boInativo: Number(request.body.boInativo ?? 0),
          },
        });
      }

      const current = await prisma.alunoCheckIn.findFirst({
        where: { id: childId, alunoPlano: { idAluno } },
        select: { id: true },
      });
      if (!current) throw new Error('Check-in invalido.');

      return prisma.alunoCheckIn.update({
        where: { id: childId },
        data: {
          idEmpresa: optionalNumber(request.body.idEmpresa) ?? studentPlan.idEmpresa,
          idAlunoPlano,
          idAlunoTreinosSequencia: optionalNumber(request.body.idAlunoTreinosSequencia),
          idPontos: optionalNumber(request.body.idPontos),
          boInativo: Number(request.body.boInativo ?? 0),
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
    try {
      const idAluno = Number(request.params.id);
      const childId = Number(request.params.childId);
      const resource = getStudentChildResourceConfig(request.params.resource);
      const boInativo = Number(request.body.boInativo ?? 0);
      assertValidId(idAluno, 'Aluno invalido.');
      assertValidId(childId, 'Registro invalido.');

      if (resource === 'plans') {
        const current = await prisma.alunoPlano.findFirst({ where: { id: childId, idAluno }, select: { id: true } });
        if (!current) throw new Error('Plano do aluno invalido.');
        return prisma.alunoPlano.update({ where: { id: childId }, data: { boInativo } });
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
            alunoTreinosSequencias: { where: { boInativo: 0 }, orderBy: { nrOrdem: 'asc' } },
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
