import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaClient } from '@smartgym/db';

function loadEnvFile(path: URL) {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue = ''] = match;

    if (!key) {
      continue;
    }

    if (process.env[key]) {
      continue;
    }

    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadEnvFile(new URL('../../../.env', import.meta.url));
loadEnvFile(new URL('../../../packages/db/.env', import.meta.url));

const app = Fastify({
  logger: true,
});

const prisma = new PrismaClient();

await app.register(cors, {
  origin: true,
});

await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

type ProductPayload = {
  idEmpresa?: number | null;
  dsProduto?: string;
  qtEstoque?: number;
  boInativo?: number;
};

type ExercisePayload = {
  idEmpresa?: number | null;
  dsExercicio?: string;
  boInativo?: number;
};

type CompanyPayload = {
  dsEmpresa?: string;
  caCNPJ?: string;
  idTema?: number | null;
  cnTemaTP?: number;
  boInativo?: number;
};

type StudentPayload = {
  nmAluno?: string;
  caCPF?: string;
  dtNascimento?: string | null;
  nrDDD?: number | string;
  nrContato?: string | null;
  anEmail?: string;
  anCEP?: string;
  anLogradouro?: string;
  nrEndereco?: number | string | null;
  boInativo?: number;
};

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

let supabaseClient: SupabaseClient | null = null;

function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!url || !serviceRoleKey || !bucket) {
    throw new Error('Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET.');
  }

  return {
    url,
    serviceRoleKey,
    bucket,
  };
}

function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = getSupabaseConfig();

  supabaseClient = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
}

function normalizeFileName(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  const baseName = fileName
    .replace(extension, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${baseName || 'arquivo'}${extension}`;
}

function getStudentFilePath(studentId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `alunos/${studentId}/${timestamp}-${normalizeFileName(fileName)}`;
}

function getExerciseFilePath(exerciseId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `exercicios/${exerciseId}/${timestamp}-${normalizeFileName(fileName)}`;
}

function assertValidId(id: number, message: string) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(message);
  }
}

function normalizeCompanyPayload(payload: CompanyPayload) {
  const dsEmpresa = payload.dsEmpresa?.trim();
  const caCNPJ = payload.caCNPJ?.replace(/\D/g, '') ?? '';
  const rawThemeId =
    payload.idTema !== undefined && payload.idTema !== null
      ? Number(payload.idTema)
      : payload.cnTemaTP !== undefined
        ? Number(payload.cnTemaTP)
        : null;
  const idTema = rawThemeId && rawThemeId > 0 ? rawThemeId : null;

  if (!dsEmpresa) {
    throw new Error('Informe o nome da empresa.');
  }

  if (!caCNPJ) {
    throw new Error('Informe o CNPJ da empresa.');
  }

  return {
    dsEmpresa,
    caCNPJ,
    idTema,
    boInativo: Number(payload.boInativo ?? 0),
  };
}

function normalizeProductPayload(payload: ProductPayload) {
  const dsProduto = payload.dsProduto?.trim();

  if (!dsProduto) {
    throw new Error('Informe o nome do produto.');
  }

  return {
    idEmpresa: payload.idEmpresa ?? null,
    dsProduto,
    qtEstoque: Number(payload.qtEstoque ?? 0),
    boInativo: Number(payload.boInativo ?? 0),
  };
}

function normalizeExercisePayload(payload: ExercisePayload) {
  const dsExercicio = payload.dsExercicio?.trim();

  if (!dsExercicio) {
    throw new Error('Informe o nome do exercicio.');
  }

  return {
    idEmpresa: payload.idEmpresa ?? null,
    dsExercicio,
    boInativo: Number(payload.boInativo ?? 0),
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidCpf(value: string) {
  const cpf = value.replace(/\D/g, '');

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (size: number) => {
    let sum = 0;

    for (let index = 0; index < size; index += 1) {
      sum += Number(cpf[index]) * (size + 1 - index);
    }

    const rest = (sum * 10) % 11;

    return rest === 10 ? 0 : rest;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

function parseBirthDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const createDate = (year: number, month: number, day: number) => {
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return new Date(Number.NaN);
    }

    return date;
  };

  const trimmedValue = value.trim();
  const brDateMatch = trimmedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const isoDateMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (brDateMatch) {
    const [, day, month, year] = brDateMatch;
    return createDate(Number(year), Number(month), Number(day));
  }

  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return createDate(Number(year), Number(month), Number(day));
  }

  return new Date(Number.NaN);
}

function normalizeStudentPayload(payload: StudentPayload) {
  const nmAluno = payload.nmAluno?.trim();
  const caCPF = payload.caCPF?.replace(/\D/g, '') ?? '';
  const nrContato = payload.nrContato?.replace(/\D/g, '') ?? null;
  const anEmail = payload.anEmail?.trim() ?? '';
  const dtNascimento = parseBirthDate(payload.dtNascimento);

  if (!nmAluno) {
    throw new Error('Informe o nome do aluno.');
  }

  if (!caCPF) {
    throw new Error('Informe o CPF do aluno.');
  }

  if (!isValidCpf(caCPF)) {
    throw new Error('Informe um CPF valido.');
  }

  if (anEmail && !isValidEmail(anEmail)) {
    throw new Error('Informe um email valido.');
  }

  if (dtNascimento && Number.isNaN(dtNascimento.getTime())) {
    throw new Error('Informe uma data de nascimento valida.');
  }

  if (dtNascimento) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dtNascimento > today) {
      throw new Error('A data de nascimento nao pode ser futura.');
    }
  }

  return {
    nmAluno,
    caCPF,
    dtNascimento,
    nrDDD: Number(payload.nrDDD ?? 0),
    nrContato,
    anEmail,
    anCEP: payload.anCEP?.replace(/\D/g, '') ?? '',
    anLogradouro: payload.anLogradouro?.trim() ?? '',
    nrEndereco:
      payload.nrEndereco === null || payload.nrEndereco === ''
        ? null
        : Number(payload.nrEndereco ?? 0),
    boInativo: Number(payload.boInativo ?? 0),
  };
}

app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'smartgym-api',
  };
});

app.get('/members', async () => {
  return prisma.aluno.findMany({
    orderBy: {
      dtCadastro: 'desc',
    },
  });
});

app.get<{
  Querystring: {
    search?: string;
  };
}>('/students', async (request) => {
  const search = request.query.search?.trim();

  return prisma.aluno.findMany({
    where: search
      ? {
          OR: [
            {
              nmAluno: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              caCPF: {
                contains: search.replace(/\D/g, ''),
              },
            },
            {
              anEmail: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        }
      : undefined,
    orderBy: {
      nmAluno: 'asc',
    },
  });
});

app.post<{
  Body: StudentPayload;
}>('/students', async (request, reply) => {
  try {
    const data = normalizeStudentPayload(request.body);
    const student = await prisma.aluno.create({
      data,
    });

    return reply.code(201).send(student);
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao criar aluno.',
    });
  }
});

app.put<{
  Params: {
    id: string;
  };
  Body: StudentPayload;
}>('/students/:id', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const data = normalizeStudentPayload(request.body);

    return prisma.aluno.update({
      where: {
        id,
      },
      data,
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar aluno.',
    });
  }
});

app.patch<{
  Params: {
    id: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/students/:id/status', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const boInativo = Number(request.body.boInativo ?? 0);

    return prisma.aluno.update({
      where: {
        id,
      },
      data: {
        boInativo,
      },
    });
  } catch {
    return reply.code(400).send({
      message: 'Erro ao alterar status do aluno.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/students/:id/files', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    assertValidId(idAluno, 'Aluno invalido.');

    return prisma.alunoArquivo.findMany({
      where: {
        idAluno,
        boInativo: 0,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar arquivos do aluno.',
    });
  }
});

app.post<{
  Params: {
    id: string;
  };
}>('/students/:id/files', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    assertValidId(idAluno, 'Aluno invalido.');

    const student = await prisma.aluno.findUnique({
      where: {
        id: idAluno,
      },
      select: {
        id: true,
      },
    });

    if (!student) {
      return reply.code(404).send({
        message: 'Aluno nao encontrado.',
      });
    }

    const file = await request.file();

    if (!file) {
      return reply.code(400).send({
        message: 'Envie um arquivo.',
      });
    }

    const buffer = await file.toBuffer();
    const path = getStudentFilePath(idAluno, file.filename);
    const { bucket } = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

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
      message:
        error instanceof Error ? error.message : 'Erro ao enviar arquivo do aluno.',
    });
  }
});

app.get<{
  Params: {
    id: string;
    fileId: string;
  };
}>('/students/:id/files/:fileId/url', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    const fileId = Number(request.params.fileId);
    assertValidId(idAluno, 'Aluno invalido.');
    assertValidId(fileId, 'Arquivo invalido.');

    const studentFile = await prisma.alunoArquivo.findFirst({
      where: {
        id: fileId,
        idAluno,
        boInativo: 0,
      },
    });

    if (!studentFile) {
      return reply.code(404).send({
        message: 'Arquivo nao encontrado.',
      });
    }

    const { bucket } = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(studentFile.anCaminho, 60 * 5);

    if (error) {
      throw new Error(error.message);
    }

    return {
      url: data.signedUrl,
      expiresIn: 60 * 5,
    };
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.',
    });
  }
});

app.delete<{
  Params: {
    id: string;
    fileId: string;
  };
}>('/students/:id/files/:fileId', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    const fileId = Number(request.params.fileId);
    assertValidId(idAluno, 'Aluno invalido.');
    assertValidId(fileId, 'Arquivo invalido.');

    const existingStudentFile = await prisma.alunoArquivo.findFirst({
      where: {
        id: fileId,
        idAluno,
        boInativo: 0,
      },
    });

    if (!existingStudentFile) {
      return reply.code(404).send({
        message: 'Arquivo nao encontrado.',
      });
    }

    return prisma.alunoArquivo.update({
      where: {
        id: fileId,
      },
      data: {
        boInativo: 1,
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao remover arquivo do aluno.',
    });
  }
});

app.get('/themes', async () => {
  return prisma.tema.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsTema: 'asc',
    },
  });
});

app.get('/roles', async () => {
  return prisma.cargo.findMany({
    orderBy: {
      dsCargo: 'asc',
    },
  });
});

app.post<{
  Body: {
    dsCargo?: string;
    boInativo?: number;
  };
}>('/roles', async (request, reply) => {
  try {
    const dsCargo = request.body.dsCargo?.trim();

    if (!dsCargo) {
      throw new Error('Informe o nome do cargo.');
    }

    const role = await prisma.cargo.create({
      data: {
        dsCargo,
        boInativo: Number(request.body.boInativo ?? 0),
      },
    });

    return reply.code(201).send(role);
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao criar cargo.',
    });
  }
});

app.put<{
  Params: {
    id: string;
  };
  Body: {
    dsCargo?: string;
    boInativo?: number;
  };
}>('/roles/:id', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const dsCargo = request.body.dsCargo?.trim();

    if (!dsCargo) {
      throw new Error('Informe o nome do cargo.');
    }

    return prisma.cargo.update({
      where: {
        id,
      },
      data: {
        dsCargo,
        boInativo: Number(request.body.boInativo ?? 0),
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar cargo.',
    });
  }
});

app.patch<{
  Params: {
    id: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/roles/:id/status', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const boInativo = Number(request.body.boInativo ?? 0);

    return prisma.cargo.update({
      where: {
        id,
      },
      data: {
        boInativo,
      },
    });
  } catch {
    return reply.code(400).send({
      message: 'Erro ao alterar status do cargo.',
    });
  }
});

app.get('/frequencies', async () => {
  return prisma.frequencia.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsFrequencia: 'asc',
    },
  });
});

app.post<{
  Body: { dsFrequencia?: string; boInativo?: number };
}>('/frequencies', async (request, reply) => {
  try {
    const dsFrequencia = request.body.dsFrequencia?.trim();
    if (!dsFrequencia) throw new Error('Informe a frequencia.');
    return reply.code(201).send(
      await prisma.frequencia.create({
        data: { dsFrequencia, boInativo: Number(request.body.boInativo ?? 0) },
      }),
    );
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar frequencia.' });
  }
});

app.put<{ Params: { id: string }; Body: { dsFrequencia?: string; boInativo?: number } }>('/frequencies/:id', async (request, reply) => {
  try {
    const dsFrequencia = request.body.dsFrequencia?.trim();
    if (!dsFrequencia) throw new Error('Informe a frequencia.');
    return await prisma.frequencia.update({
      where: { id: Number(request.params.id) },
      data: { dsFrequencia, boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar frequencia.' });
  }
});

app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/frequencies/:id/status', async (request, reply) => {
  try {
    return await prisma.frequencia.update({
      where: { id: Number(request.params.id) },
      data: { boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch {
    return reply.code(400).send({ message: 'Erro ao alterar status da frequencia.' });
  }
});

app.get('/levels', async () => {
  return prisma.nivel.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsNivel: 'asc',
    },
  });
});

app.post<{ Body: { dsNivel?: string; boInativo?: number } }>('/levels', async (request, reply) => {
  try {
    const dsNivel = request.body.dsNivel?.trim();
    if (!dsNivel) throw new Error('Informe o nivel.');
    return reply.code(201).send(await prisma.nivel.create({ data: { dsNivel, boInativo: Number(request.body.boInativo ?? 0) } }));
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar nivel.' });
  }
});

app.put<{ Params: { id: string }; Body: { dsNivel?: string; boInativo?: number } }>('/levels/:id', async (request, reply) => {
  try {
    const dsNivel = request.body.dsNivel?.trim();
    if (!dsNivel) throw new Error('Informe o nivel.');
    return await prisma.nivel.update({
      where: { id: Number(request.params.id) },
      data: { dsNivel, boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar nivel.' });
  }
});

app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/levels/:id/status', async (request, reply) => {
  try {
    return await prisma.nivel.update({
      where: { id: Number(request.params.id) },
      data: { boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch {
    return reply.code(400).send({ message: 'Erro ao alterar status do nivel.' });
  }
});

app.get('/time-units', async () => {
  return prisma.unidadeTempo.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsUnidadeTempo: 'asc',
    },
  });
});

app.post<{ Body: { dsUnidadeTempo?: string; boInativo?: number } }>('/time-units', async (request, reply) => {
  try {
    const dsUnidadeTempo = request.body.dsUnidadeTempo?.trim();
    if (!dsUnidadeTempo) throw new Error('Informe a unidade de tempo.');
    return reply.code(201).send(await prisma.unidadeTempo.create({ data: { dsUnidadeTempo, boInativo: Number(request.body.boInativo ?? 0) } }));
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar unidade de tempo.' });
  }
});

app.put<{ Params: { id: string }; Body: { dsUnidadeTempo?: string; boInativo?: number } }>('/time-units/:id', async (request, reply) => {
  try {
    const dsUnidadeTempo = request.body.dsUnidadeTempo?.trim();
    if (!dsUnidadeTempo) throw new Error('Informe a unidade de tempo.');
    return await prisma.unidadeTempo.update({
      where: { id: Number(request.params.id) },
      data: { dsUnidadeTempo, boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar unidade de tempo.' });
  }
});

app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/time-units/:id/status', async (request, reply) => {
  try {
    return await prisma.unidadeTempo.update({
      where: { id: Number(request.params.id) },
      data: { boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch {
    return reply.code(400).send({ message: 'Erro ao alterar status da unidade de tempo.' });
  }
});

app.get('/payment-statuses', async () => {
  return prisma.statusPagamento.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsStatusPagamento: 'asc',
    },
  });
});

app.post<{ Body: { dsStatusPagamento?: string; boInativo?: number } }>('/payment-statuses', async (request, reply) => {
  try {
    const dsStatusPagamento = request.body.dsStatusPagamento?.trim();
    if (!dsStatusPagamento) throw new Error('Informe o status de pagamento.');
    return reply.code(201).send(await prisma.statusPagamento.create({ data: { dsStatusPagamento, boInativo: Number(request.body.boInativo ?? 0) } }));
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar status de pagamento.' });
  }
});

app.put<{ Params: { id: string }; Body: { dsStatusPagamento?: string; boInativo?: number } }>('/payment-statuses/:id', async (request, reply) => {
  try {
    const dsStatusPagamento = request.body.dsStatusPagamento?.trim();
    if (!dsStatusPagamento) throw new Error('Informe o status de pagamento.');
    return await prisma.statusPagamento.update({
      where: { id: Number(request.params.id) },
      data: { dsStatusPagamento, boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar status de pagamento.' });
  }
});

app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/payment-statuses/:id/status', async (request, reply) => {
  try {
    return await prisma.statusPagamento.update({
      where: { id: Number(request.params.id) },
      data: { boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch {
    return reply.code(400).send({ message: 'Erro ao alterar status de pagamento.' });
  }
});

app.get('/payment-methods', async () => {
  return prisma.formaPagamento.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsFormaPagamento: 'asc',
    },
  });
});

app.post<{ Body: { dsFormaPagamento?: string; boInativo?: number } }>('/payment-methods', async (request, reply) => {
  try {
    const dsFormaPagamento = request.body.dsFormaPagamento?.trim();
    if (!dsFormaPagamento) throw new Error('Informe a forma de pagamento.');
    return reply.code(201).send(await prisma.formaPagamento.create({ data: { dsFormaPagamento, boInativo: Number(request.body.boInativo ?? 0) } }));
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar forma de pagamento.' });
  }
});

app.put<{ Params: { id: string }; Body: { dsFormaPagamento?: string; boInativo?: number } }>('/payment-methods/:id', async (request, reply) => {
  try {
    const dsFormaPagamento = request.body.dsFormaPagamento?.trim();
    if (!dsFormaPagamento) throw new Error('Informe a forma de pagamento.');
    return await prisma.formaPagamento.update({
      where: { id: Number(request.params.id) },
      data: { dsFormaPagamento, boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar forma de pagamento.' });
  }
});

app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/payment-methods/:id/status', async (request, reply) => {
  try {
    return await prisma.formaPagamento.update({
      where: { id: Number(request.params.id) },
      data: { boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch {
    return reply.code(400).send({ message: 'Erro ao alterar status da forma de pagamento.' });
  }
});

app.get('/training-methods', async () => {
  return prisma.metodoTreino.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      nmMetodoTreino: 'asc',
    },
  });
});

app.post<{ Body: { nmMetodoTreino?: string; dsMetodoTreino?: string; boInativo?: number } }>('/training-methods', async (request, reply) => {
  try {
    const nmMetodoTreino = request.body.nmMetodoTreino?.trim();
    const dsMetodoTreino = request.body.dsMetodoTreino?.trim() ?? '';
    if (!nmMetodoTreino) throw new Error('Informe o nome do metodo de treino.');
    return reply.code(201).send(await prisma.metodoTreino.create({
      data: { nmMetodoTreino, dsMetodoTreino, boInativo: Number(request.body.boInativo ?? 0) },
    }));
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar metodo de treino.' });
  }
});

app.put<{ Params: { id: string }; Body: { nmMetodoTreino?: string; dsMetodoTreino?: string; boInativo?: number } }>('/training-methods/:id', async (request, reply) => {
  try {
    const nmMetodoTreino = request.body.nmMetodoTreino?.trim();
    const dsMetodoTreino = request.body.dsMetodoTreino?.trim() ?? '';
    if (!nmMetodoTreino) throw new Error('Informe o nome do metodo de treino.');
    return await prisma.metodoTreino.update({
      where: { id: Number(request.params.id) },
      data: { nmMetodoTreino, dsMetodoTreino, boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar metodo de treino.' });
  }
});

app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/training-methods/:id/status', async (request, reply) => {
  try {
    return await prisma.metodoTreino.update({
      where: { id: Number(request.params.id) },
      data: { boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch {
    return reply.code(400).send({ message: 'Erro ao alterar status do metodo de treino.' });
  }
});

app.get('/file-types', async () => {
  return prisma.tipoArquivo.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsTipo: 'asc',
    },
  });
});

app.post<{ Body: { dsTipo?: string; boInativo?: number } }>('/file-types', async (request, reply) => {
  try {
    const dsTipo = request.body.dsTipo?.trim();
    if (!dsTipo) throw new Error('Informe o tipo de arquivo.');
    return reply.code(201).send(await prisma.tipoArquivo.create({ data: { dsTipo, boInativo: Number(request.body.boInativo ?? 0) } }));
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao criar tipo de arquivo.' });
  }
});

app.put<{ Params: { id: string }; Body: { dsTipo?: string; boInativo?: number } }>('/file-types/:id', async (request, reply) => {
  try {
    const dsTipo = request.body.dsTipo?.trim();
    if (!dsTipo) throw new Error('Informe o tipo de arquivo.');
    return await prisma.tipoArquivo.update({
      where: { id: Number(request.params.id) },
      data: { dsTipo, boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : 'Erro ao atualizar tipo de arquivo.' });
  }
});

app.patch<{ Params: { id: string }; Body: { boInativo?: number } }>('/file-types/:id/status', async (request, reply) => {
  try {
    return await prisma.tipoArquivo.update({
      where: { id: Number(request.params.id) },
      data: { boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch {
    return reply.code(400).send({ message: 'Erro ao alterar status do tipo de arquivo.' });
  }
});

app.get<{
  Querystring: {
    search?: string;
  };
}>('/companies', async (request) => {
  const search = request.query.search?.trim();

  return prisma.empresa.findMany({
    where: search
      ? {
          OR: [
            {
              dsEmpresa: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              caCNPJ: {
                contains: search.replace(/\D/g, ''),
              },
            },
          ],
        }
      : undefined,
    orderBy: {
      dsEmpresa: 'asc',
    },
  });
});

app.post<{
  Body: CompanyPayload;
}>('/companies', async (request, reply) => {
  try {
    const data = normalizeCompanyPayload(request.body);
    const company = await prisma.empresa.create({
      data,
    });

    return reply.code(201).send(company);
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao criar empresa.',
    });
  }
});

app.put<{
  Params: {
    id: string;
  };
  Body: CompanyPayload;
}>('/companies/:id', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const data = normalizeCompanyPayload(request.body);

    return prisma.empresa.update({
      where: {
        id,
      },
      data,
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar empresa.',
    });
  }
});

app.patch<{
  Params: {
    id: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/companies/:id/status', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const boInativo = Number(request.body.boInativo ?? 0);

    return prisma.empresa.update({
      where: {
        id,
      },
      data: {
        boInativo,
      },
    });
  } catch {
    return reply.code(400).send({
      message: 'Erro ao alterar status da empresa.',
    });
  }
});

app.get<{
  Querystring: {
    search?: string;
  };
}>('/products', async (request) => {
  const search = request.query.search?.trim();

  return prisma.produto.findMany({
    where: search
      ? {
        dsProduto: {
          contains: search,
          mode: 'insensitive',
        },
      }
      : undefined,
    orderBy: {
      dsProduto: 'asc',
    },
  });
});

app.post<{
  Body: ProductPayload;
}>('/products', async (request, reply) => {
  try {
    const data = normalizeProductPayload(request.body);
    const product = await prisma.produto.create({
      data,
    });

    return reply.code(201).send(product);
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao criar produto.',
    });
  }
});

app.put<{
  Params: {
    id: string;
  };
  Body: ProductPayload;
}>('/products/:id', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const data = normalizeProductPayload(request.body);

    const product = await prisma.produto.update({
      where: {
        id,
      },
      data,
    });

    return product;
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar produto.',
    });
  }
});

app.patch<{
  Params: {
    id: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/products/:id/status', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const boInativo = Number(request.body.boInativo ?? 0);

    return prisma.produto.update({
      where: {
        id,
      },
      data: {
        boInativo,
      },
    });
  } catch {
    return reply.code(400).send({
      message: 'Erro ao alterar status do produto.',
    });
  }
});

app.get<{
  Querystring: {
    search?: string;
  };
}>('/exercises', async (request) => {
  const search = request.query.search?.trim();

  return prisma.exercicio.findMany({
    where: search
      ? {
          dsExercicio: {
            contains: search,
            mode: 'insensitive',
          },
        }
      : undefined,
    orderBy: {
      dsExercicio: 'asc',
    },
  });
});

app.post<{
  Body: ExercisePayload;
}>('/exercises', async (request, reply) => {
  try {
    const data = normalizeExercisePayload(request.body);
    const exercise = await prisma.exercicio.create({
      data,
    });

    return reply.code(201).send(exercise);
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao criar exercicio.',
    });
  }
});

app.put<{
  Params: {
    id: string;
  };
  Body: ExercisePayload;
}>('/exercises/:id', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const data = normalizeExercisePayload(request.body);

    return prisma.exercicio.update({
      where: {
        id,
      },
      data,
    });
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao atualizar exercicio.',
    });
  }
});

app.patch<{
  Params: {
    id: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/exercises/:id/status', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const boInativo = Number(request.body.boInativo ?? 0);

    return prisma.exercicio.update({
      where: {
        id,
      },
      data: {
        boInativo,
      },
    });
  } catch {
    return reply.code(400).send({
      message: 'Erro ao alterar status do exercicio.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/exercises/:id/files', async (request, reply) => {
  try {
    const idExercicio = Number(request.params.id);
    assertValidId(idExercicio, 'Exercicio invalido.');

    return prisma.exercicioArquivo.findMany({
      where: {
        idExercicio,
        boInativo: 0,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao listar arquivos do exercicio.',
    });
  }
});

app.post<{
  Params: {
    id: string;
  };
}>('/exercises/:id/files', async (request, reply) => {
  try {
    const idExercicio = Number(request.params.id);
    assertValidId(idExercicio, 'Exercicio invalido.');

    const exercise = await prisma.exercicio.findUnique({
      where: {
        id: idExercicio,
      },
      select: {
        id: true,
      },
    });

    if (!exercise) {
      return reply.code(404).send({
        message: 'Exercicio nao encontrado.',
      });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({
        message: 'Envie um arquivo.',
      });
    }

    const buffer = await file.toBuffer();
    const path = getExerciseFilePath(idExercicio, file.filename);
    const { bucket } = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

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
  Params: {
    id: string;
    fileId: string;
  };
}>('/exercises/:id/files/:fileId/url', async (request, reply) => {
  try {
    const idExercicio = Number(request.params.id);
    const fileId = Number(request.params.fileId);
    assertValidId(idExercicio, 'Exercicio invalido.');
    assertValidId(fileId, 'Arquivo invalido.');

    const exerciseFile = await prisma.exercicioArquivo.findFirst({
      where: {
        id: fileId,
        idExercicio,
        boInativo: 0,
      },
    });

    if (!exerciseFile) {
      return reply.code(404).send({
        message: 'Arquivo nao encontrado.',
      });
    }

    const { bucket } = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(exerciseFile.anCaminho, 60 * 5);

    if (error) {
      throw new Error(error.message);
    }

    return {
      url: data.signedUrl,
      expiresIn: 60 * 5,
    };
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao gerar link do arquivo.',
    });
  }
});

app.delete<{
  Params: {
    id: string;
    fileId: string;
  };
}>('/exercises/:id/files/:fileId', async (request, reply) => {
  try {
    const idExercicio = Number(request.params.id);
    const fileId = Number(request.params.fileId);
    assertValidId(idExercicio, 'Exercicio invalido.');
    assertValidId(fileId, 'Arquivo invalido.');

    const existingExerciseFile = await prisma.exercicioArquivo.findFirst({
      where: {
        id: fileId,
        idExercicio,
        boInativo: 0,
      },
    });

    if (!existingExerciseFile) {
      return reply.code(404).send({
        message: 'Arquivo nao encontrado.',
      });
    }

    return prisma.exercicioArquivo.update({
      where: {
        id: fileId,
      },
      data: {
        boInativo: 1,
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao remover arquivo do exercicio.',
    });
  }
});

const port = Number(process.env.API_PORT ?? 3333);

try {
  await app.listen({
    port,
    host: '0.0.0.0',
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
