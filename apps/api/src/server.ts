import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaClient } from '@smartgym/db';
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";


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

type TrainingPayload = {
  idEmpresa?: number | string | null;
  idNivel?: number | string | null;
  dsTreino?: string;
  boInativo?: number;
};

type CompanyPayload = {
  dsEmpresa?: string;
  caCNPJ?: string;
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
  anCoplemento?: string;
  anBairro?: string;
  nrEndereco?: number | string | null;
  boInativo?: number;
};

type StudentFacialBiometricPayload = {
  idAlunoArquivo?: number | string | null;
  dsModelo?: string;
  dsProvider?: string;
  dsSubject?: string | null;
  dsExternalImageId?: string | null;
  anEmbedding?: unknown;
  nrThreshold?: number | string | null;
};

type StudentFacialBiometricEnrollPayload = {
  idAlunoArquivo?: number | string | null;
  nrThreshold?: number | string | null;
};

type StudentFacialVerificationPayload = {
  anEmbedding?: unknown;
};

type FacialRecognitionResult = {
  result?: Array<{
    subjects?: Array<{
      subject?: string;
      similarity?: number;
    }>;
  }>;
};

type PlanPayload = {
  dsPlano?: string;
  idFrequencia?: number | string | null;
  boInativo?: number;
};

type EmployeePayload = {
  idEmpresa?: number | string | null;
  idCargo?: number | string | null;
  nmFuncionario?: string;
  caCPF?: string;
  dtNascimento?: string | null;
  nrDDD?: number | string;
  nrContato?: string | number | null;
  anEmail?: string;
  dtAdmissao?: string | null;
  boInativo?: number;
};

type RegisterPayload = {
  type?: 'student' | 'employee';
  name?: string;
  cpf?: string;
  birthDate?: string | null;
  ddd?: number | string;
  phone?: string | number | null;
  email?: string;
  password?: string;
};

type LoginPayload = {
  login?: string;
  password?: string;
};

type ForgotPasswordPayload = {
  cpf?: string;
};

type RegisterLookupQuery = {
  type?: 'student' | 'employee';
  cpf?: string;
};

type CompanyChildResource =
  | 'promotions'
  | 'student-plans'
  | 'payments'
  | 'product-movements'
  | 'company-files'
  | 'student-check-ins'
  | 'themes';

type StudentChildResource = 'plans' | 'payments' | 'check-ins' | 'trainings';

type PlanChildResource =
  | 'values'
  | 'products'
  | 'companies'
  | 'activities'
  | 'promotion-plans';

type CompanyChildPayload = Record<string, string | number | null | undefined>;

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

type ComprefaceConfig = {
  url: string;
  recognitionApiKey: string;
  detProbThreshold: number;
  similarityThreshold: number;
};

interface EnviarEmailParams {
  para: string;
  assunto: string;
  texto?: string;
  html?: string;
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

function getComprefaceConfig(): ComprefaceConfig {
  const url = process.env.COMPREFACE_URL;
  const recognitionApiKey = process.env.COMPREFACE_RECOGNITION_API_KEY;
  const detProbThreshold = Number(process.env.COMPREFACE_DET_PROB_THRESHOLD ?? 0.8);
  const similarityThreshold = Number(process.env.COMPREFACE_SIMILARITY_THRESHOLD ?? 0.85);

  if (!url || !recognitionApiKey) {
    throw new Error('Configure COMPREFACE_URL e COMPREFACE_RECOGNITION_API_KEY.');
  }

  if (!Number.isFinite(detProbThreshold) || detProbThreshold <= 0 || detProbThreshold > 1) {
    throw new Error('Configure COMPREFACE_DET_PROB_THRESHOLD entre 0 e 1.');
  }

  if (!Number.isFinite(similarityThreshold) || similarityThreshold <= 0 || similarityThreshold > 1) {
    throw new Error('Configure COMPREFACE_SIMILARITY_THRESHOLD entre 0 e 1.');
  }

  return {
    url: url.replace(/\/+$/g, ''),
    recognitionApiKey,
    detProbThreshold,
    similarityThreshold,
  };
}

function getStudentFacialSubject(studentId: number) {
  return `aluno-${studentId}`;
}

function getImageContentType(fileName: string) {
  const extension = extname(fileName).toLowerCase();

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  if (extension === '.bmp') {
    return 'image/bmp';
  }

  return 'image/jpeg';
}

async function requestCompreface<T>(url: URL, formData: FormData): Promise<T> {
  console.log("Comecou a comprar")
  const config = getComprefaceConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': config.recognitionApiKey,
    },
    body: formData,
  });

  const responseText = await response.text();
  const responseBody = responseText ? JSON.parse(responseText) : {};

  if (!response.ok) {
    const message =
      typeof responseBody.message === 'string'
        ? responseBody.message
        : 'Erro ao comunicar com o CompreFace.';
    throw new Error(message);
  }

  return responseBody as T;
}

function createImageFormData(buffer: Buffer, fileName: string) {
  const contentType = getImageContentType(fileName);
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), fileName);
  return formData;
}

async function addComprefaceSubjectExample(subject: string, buffer: Buffer, fileName: string) {
  const config = getComprefaceConfig();
  const url = new URL('/api/v1/recognition/faces', config.url);
  url.searchParams.set('subject', subject);
  url.searchParams.set('det_prob_threshold', String(config.detProbThreshold));

  return requestCompreface<{ image_id: string; subject: string }>(
    url,
    createImageFormData(buffer, fileName),
  );
}

async function recognizeComprefaceFace(buffer: Buffer, fileName: string) {
  const config = getComprefaceConfig();
  const url = new URL('/api/v1/recognition/recognize', config.url);
  url.searchParams.set('limit', '1');
  url.searchParams.set('prediction_count', '1');
  url.searchParams.set('det_prob_threshold', String(config.detProbThreshold));

  return requestCompreface<FacialRecognitionResult>(url, createImageFormData(buffer, fileName));
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

function getCompanyFilePath(companyId: number, fileName: string) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `empresas/${companyId}/${timestamp}-${normalizeFileName(fileName)}`;
}

function assertValidId(id: number, message: string) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(message);
  }
}

function normalizeCompanyPayload(payload: CompanyPayload) {
  const dsEmpresa = payload.dsEmpresa?.trim();
  const caCNPJ = payload.caCNPJ?.replace(/\D/g, '') ?? '';

  if (!dsEmpresa) {
    throw new Error('Informe o nome da empresa.');
  }

  if (dsEmpresa.length > 100) {
    throw new Error('O nome da empresa deve ter no maximo 100 caracteres.');
  }

  if (!caCNPJ) {
    throw new Error('Informe o CNPJ da empresa.');
  }

  if (!isValidCnpj(caCNPJ)) {
    throw new Error('Informe um CNPJ valido.');
  }

  return {
    dsEmpresa,
    caCNPJ,
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

function normalizeTrainingPayload(payload: TrainingPayload) {
  const dsTreino = payload.dsTreino?.trim();

  if (!dsTreino) {
    throw new Error('Informe o nome do treino.');
  }

  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    idNivel: optionalNumber(payload.idNivel),
    dsTreino,
    boInativo: Number(payload.boInativo ?? 0),
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidCnpj(value: string) {
  const cnpj = value.replace(/\D/g, '');

  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
    return false;
  }

  const calculateDigit = (size: number) => {
    const weights =
      size === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;

    for (let index = 0; index < size; index += 1) {
      sum += Number(cnpj[index]) * Number(weights[index]);
    }

    const rest = sum % 11;

    return rest < 2 ? 0 : 11 - rest;
  };

  return calculateDigit(12) === Number(cnpj[12]) && calculateDigit(13) === Number(cnpj[13]);
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
    anCoplemento: payload.anCoplemento?.trim() ?? '',
    anBairro: payload.anBairro?.trim() ?? '',
    nrEndereco:
      payload.nrEndereco === null || payload.nrEndereco === ''
        ? null
        : Number(payload.nrEndereco ?? 0),
    boInativo: Number(payload.boInativo ?? 0),
  };
}

function normalizeStudentFacialBiometricPayload(payload: StudentFacialBiometricPayload) {
  const idAlunoArquivo = optionalNumber(payload.idAlunoArquivo);
  const dsModelo = payload.dsModelo?.trim();
  const dsProvider = payload.dsProvider?.trim();
  const dsSubject = payload.dsSubject?.trim() || null;
  const dsExternalImageId = payload.dsExternalImageId?.trim() || null;
  const nrThreshold = Number(payload.nrThreshold ?? 0.85);
  const embedding = payload.anEmbedding;

  if (!dsModelo) {
    throw new Error('Informe o modelo da biometria facial.');
  }

  if (dsModelo.length > 100) {
    throw new Error('O modelo da biometria facial deve ter no maximo 100 caracteres.');
  }

  if (!dsProvider) {
    throw new Error('Informe o provider da biometria facial.');
  }

  if (dsProvider.length > 100) {
    throw new Error('O provider da biometria facial deve ter no maximo 100 caracteres.');
  }

  const anEmbedding = Array.isArray(embedding)
    ? embedding.map((value) => Number(value))
    : null;

  if (anEmbedding && anEmbedding.length === 0) {
    throw new Error('Informe o embedding facial.');
  }

  if (anEmbedding?.some((value) => !Number.isFinite(value))) {
    throw new Error('O embedding facial deve conter apenas numeros.');
  }

  if (!anEmbedding && !dsSubject && !dsExternalImageId) {
    throw new Error('Informe o embedding facial ou a referencia externa da biometria.');
  }

  if (!Number.isFinite(nrThreshold) || nrThreshold <= 0 || nrThreshold > 1) {
    throw new Error('Informe um threshold entre 0 e 1.');
  }

  return {
    idAlunoArquivo,
    dsModelo,
    dsProvider,
    dsSubject,
    dsExternalImageId,
    anEmbedding,
    nrDimensoes: anEmbedding?.length ?? null,
    nrThreshold,
  };
}

function normalizePlanPayload(payload: PlanPayload) {
  const dsPlano = payload.dsPlano?.trim();

  if (!dsPlano) {
    throw new Error('Informe o nome do plano.');
  }

  return {
    dsPlano,
    idFrequencia: optionalNumber(payload.idFrequencia),
    boInativo: Number(payload.boInativo ?? 0),
  };
}

function normalizeEmployeePayload(payload: EmployeePayload) {
  const nmFuncionario = payload.nmFuncionario?.trim();
  const caCPF = payload.caCPF?.replace(/\D/g, '') ?? '';
  const nrContato = String(payload.nrContato ?? '').replace(/\D/g, '');
  const anEmail = payload.anEmail?.trim() ?? '';
  const dtNascimento = parseBirthDate(payload.dtNascimento);
  const dtAdmissao = parseBirthDate(payload.dtAdmissao);

  if (!nmFuncionario) {
    throw new Error('Informe o nome do funcionario.');
  }

  if (!caCPF) {
    throw new Error('Informe o CPF do funcionario.');
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

  if (dtAdmissao && Number.isNaN(dtAdmissao.getTime())) {
    throw new Error('Informe uma data de admissao valida.');
  }

  if (dtNascimento) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dtNascimento > today) {
      throw new Error('A data de nascimento nao pode ser futura.');
    }
  }

  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    idCargo: optionalNumber(payload.idCargo),
    nmFuncionario,
    caCPF,
    dtNascimento,
    nrDDD: String(payload.nrDDD ?? '').replace(/\D/g, '') || null,
    nrContato: Number(nrContato || 0),
    anEmail,
    dtAdmissao,
    boInativo: Number(payload.boInativo ?? 0),
  };
}

function normalizeRegisterPassword(password: string | undefined) {
  const value = password ?? '';

  if (value.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }

  if (value.length > 20) {
    throw new Error('A senha deve ter no maximo 20 caracteres.');
  }

  if (/\s/.test(value)) {
    throw new Error('A senha nao pode conter espacos.');
  }

  if (!/\d/.test(value)) {
    throw new Error('A senha deve conter pelo menos 1 numero.');
  }

  if ((value.match(/[a-zA-Z]/g) ?? []).length < 3) {
    throw new Error('A senha deve conter pelo menos 3 letras.');
  }

  return value;
}

function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

function normalizeRegisterLogin(email: string | undefined) {
  const login = email?.trim() ?? '';

  if (!login) {
    throw new Error('Informe o email.');
  }

  if (!isValidEmail(login)) {
    throw new Error('Informe um email valido.');
  }

  return login;
}

function normalizeRegisterCpf(cpf: string | undefined) {
  const value = cpf?.replace(/\D/g, '') ?? '';

  if (!value) {
    throw new Error('Informe o CPF.');
  }

  if (!isValidCpf(value)) {
    throw new Error('Informe um CPF valido.');
  }

  return value;
}

function normalizeRegisterEmployeePayload(payload: RegisterPayload) {
  const nmFuncionario = payload.name?.trim();
  const caCPF = payload.cpf?.replace(/\D/g, '') ?? '';
  const anEmail = normalizeRegisterLogin(payload.email);
  const dtNascimento = parseBirthDate(payload.birthDate);

  if (!nmFuncionario) {
    throw new Error('Informe o nome do funcionario.');
  }

  if (!caCPF) {
    throw new Error('Informe o CPF do funcionario.');
  }

  if (!isValidCpf(caCPF)) {
    throw new Error('Informe um CPF valido.');
  }

  if (dtNascimento && Number.isNaN(dtNascimento.getTime())) {
    throw new Error('Informe uma data de nascimento valida.');
  }

  return {
    nmFuncionario,
    caCPF,
    dtNascimento,
    nrDDD: String(payload.ddd ?? '').replace(/\D/g, '') || null,
    nrContato: Number(String(payload.phone ?? '').replace(/\D/g, '') || 0),
    anEmail,
    boInativo: 0,
  };
}

function normalizeRegisterStudentPayload(payload: RegisterPayload): StudentPayload {
  return {
    nmAluno: payload.name,
    caCPF: payload.cpf,
    dtNascimento: payload.birthDate,
    nrDDD: payload.ddd,
    nrContato: String(payload.phone ?? ''),
    anEmail: payload.email,
    anCEP: '',
    anLogradouro: '',
    anCoplemento: '',
    anBairro: '',
    nrEndereco: null,
    boInativo: 0,
  };
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return Number(value);
}

function requiredText(value: unknown, message: string) {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!text) {
    throw new Error(message);
  }

  return text;
}

function optionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalDate(value: unknown) {
  if (!value) {
    return undefined;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error('Informe uma data valida.');
  }

  return date;
}

function getMultipartFieldValue(fields: Record<string, unknown>, fieldName: string) {
  const field = fields[fieldName];

  if (!field || typeof field !== 'object' || !('value' in field)) {
    return '';
  }

  const value = (field as { value?: unknown }).value;

  return value === undefined || value === null ? '' : String(value);
}

type CrudDelegate = {
  findMany(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
};

function asCrudDelegate(delegate: unknown) {
  return delegate as CrudDelegate;
}

const childResourceConfig = {
  promotions: {
    delegate: asCrudDelegate(prisma.promocao),
    orderBy: { dsPromocao: 'asc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        dsPromocao: requiredText(payload.dsPromocao, 'Informe a promocao.'),
        qtPeriodo: Number(payload.qtPeriodo ?? 0),
        idUnidadeTempo: optionalNumber(payload.idUnidadeTempo),
        vlDesconto: Number(payload.vlDesconto ?? 0),
        pcDesconto: Number(payload.pcDesconto ?? 0),
        dtInicio: optionalDate(payload.dtInicio) ?? new Date(),
        dtEncerramento: optionalDate(payload.dtEncerramento) ?? null,
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  'student-plans': {
    delegate: asCrudDelegate(prisma.alunoPlano),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idAluno: optionalNumber(payload.idAluno),
        idPlano: optionalNumber(payload.idPlano),
        idPromocaoPlano: optionalNumber(payload.idPromocaoPlano),
        nrDiaPagamento: Number(payload.nrDiaPagamento ?? 1),
        dtAdmissao: optionalDate(payload.dtAdmissao) ?? new Date(),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  payments: {
    delegate: asCrudDelegate(prisma.pagamento),
    orderBy: { dtPagamento: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idAlunoPlano: optionalNumber(payload.idAlunoPlano),
        idProdutoMovimentacao: optionalNumber(payload.idProdutoMovimentacao),
        vlPagamento: Number(payload.vlPagamento ?? 0),
        idStatusPagamento: optionalNumber(payload.idStatusPagamento),
        idFormaPagamento: optionalNumber(payload.idFormaPagamento),
        dtPagamento: optionalDate(payload.dtPagamento) ?? new Date(),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  'product-movements': {
    delegate: asCrudDelegate(prisma.produtoMovimentacao),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idProduto: optionalNumber(payload.idProduto),
        idAluno: optionalNumber(payload.idAluno),
        qtMovimentada: Number(payload.qtMovimentada ?? 0),
        vlUnitario: Number(payload.vlUnitario ?? 0),
        qtDisponivel: Number(payload.qtDisponivel ?? 0),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  'company-files': {
    delegate: asCrudDelegate(prisma.empresaArquivo),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idTiposArquivos: optionalNumber(payload.idTiposArquivos),
        dsArquivo: requiredText(payload.dsArquivo, 'Informe o arquivo.'),
        anCaminho: optionalText(payload.anCaminho),
        cnChaveAcesso: optionalNumber(payload.cnChaveAcesso),
        cnDistribuidor: optionalNumber(payload.cnDistribuidor),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  'student-check-ins': {
    delegate: asCrudDelegate(prisma.alunoCheckIn),
    orderBy: { dtCadastro: 'desc' },
    companyField: 'idEmpresa',
    normalize(companyId: number, payload: CompanyChildPayload) {
      return {
        idEmpresa: companyId,
        idAlunoPlano: optionalNumber(payload.idAlunoPlano),
        idAlunoTreinosSequencia: optionalNumber(payload.idAlunoTreinosSequencia),
        idPontos: optionalNumber(payload.idPontos),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  themes: {
    delegate: asCrudDelegate(prisma.tema),
    orderBy: { dsTema: 'asc' },
    companyField: null,
    normalize(_companyId: number, payload: CompanyChildPayload) {
      return {
        dsTema: requiredText(payload.dsTema, 'Informe o tema.'),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
} satisfies Record<
  CompanyChildResource,
  {
    delegate: {
      findMany(args: unknown): Promise<unknown>;
      create(args: unknown): Promise<unknown>;
      update(args: unknown): Promise<unknown>;
    };
    orderBy: Record<string, string>;
    companyField: string | null;
    normalize(companyId: number, payload: CompanyChildPayload): Record<string, unknown>;
  }
>;

const planChildResourceConfig = {
  values: {
    delegate: asCrudDelegate(prisma.planoValor),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        vlVenda: Number(payload.vlVenda ?? 0),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  products: {
    delegate: asCrudDelegate(prisma.planoProduto),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idProduto: optionalNumber(payload.idProduto),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  companies: {
    delegate: asCrudDelegate(prisma.planoEmpresa),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  activities: {
    delegate: asCrudDelegate(prisma.planoAtividade),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idAtividade: optionalNumber(payload.idAtividade),
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
  'promotion-plans': {
    delegate: asCrudDelegate(prisma.promocaoPlano),
    normalize(planId: number, payload: CompanyChildPayload) {
      return {
        idPlano: planId,
        idEmpresa: optionalNumber(payload.idEmpresa),
        idPromocao: optionalNumber(payload.idPromocao),
        qtDisponivel: Number(payload.qtDisponivel ?? 0),
        dtInicio: optionalDate(payload.dtInicio) ?? new Date(),
        dtEncerramento: optionalDate(payload.dtEncerramento) ?? null,
        boInativo: Number(payload.boInativo ?? 0),
      };
    },
  },
} satisfies Record<
  PlanChildResource,
  {
    delegate: {
      create(args: unknown): Promise<unknown>;
      update(args: unknown): Promise<unknown>;
    };
    normalize(planId: number, payload: CompanyChildPayload): Record<string, unknown>;
  }
>;

function getChildResourceConfig(resource: string) {
  const config = childResourceConfig[resource as CompanyChildResource];

  if (!config) {
    throw new Error('Tabela filha invalida.');
  }

  return config;
}

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

function getPlanChildResourceConfig(resource: string) {
  const config = planChildResourceConfig[resource as PlanChildResource];

  if (!config) {
    throw new Error('Tabela relacionada invalida.');
  }

  return config;
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

app.post<{
  Body: LoginPayload;
}>('/auth/login', async (request, reply) => {
  try {
    const cpf = normalizeRegisterCpf(request.body.login);
    const password = request.body.password ?? '';

    const user = await prisma.usuario.findFirst({
      where: {
        boInativo: 0,
        OR: [
          {
            aluno: {
              caCPF: cpf,
              boInativo: 0,
            },
          },
          {
            funcionario: {
              caCPF: cpf,
              boInativo: 0,
            },
          },
        ],
      },
      include: {
        aluno: true,
        funcionario: true,
      },
    });

    if (!user) {
      throw new Error('Usuario ou senha invalidos.');
    }

    const currentPassword = await prisma.senha.findFirst({
      where: {
        idUsuario: user.id,
        boInativo: 0,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });

    const isPasswordValid =
      currentPassword?.cnTipoHash === 1
        ? currentPassword.dsSenha === hashPassword(password)
        : currentPassword?.dsSenha === password;

    if (!isPasswordValid) {
      throw new Error('Usuario ou senha invalidos.');
    }

    return {
      id: user.id,
      idAluno: user.idAluno,
      idFuncionario: user.idFuncionario,
      login: user.dsLogin,
      name: user.aluno?.nmAluno ?? user.funcionario?.nmFuncionario ?? user.dsLogin,
      type: user.idAluno ? 'student' : 'employee',
    };
  } catch (error) {
    return reply.code(401).send({
      message: error instanceof Error ? error.message : 'Erro ao entrar.',
    });
  }
});

app.post<{
  Body: ForgotPasswordPayload;
}>('/auth/forgot-password', async (request, reply) => {
  try {
    const cpf = normalizeRegisterCpf(request.body.cpf);
    const user = await prisma.usuario.findFirst({
      where: {
        boInativo: 0,
        OR: [
          {
            aluno: {
              caCPF: cpf,
              boInativo: 0,
            },
          },
          {
            funcionario: {
              caCPF: cpf,
              boInativo: 0,
            },
          },
        ],
      },
      include: {
        aluno: true,
        funcionario: true,
      },
    });

    if (!user) {
      return reply.code(404).send({
        message: 'CPF nao encontrado para redefinicao de senha.',
      });
    }

    const email = user.dsLogin || user.aluno?.anEmail || user.funcionario?.anEmail || '';

    if (!email) {
      return reply.code(400).send({
        message: 'Usuario sem email cadastrado.',
      });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    } as SMTPTransport.Options);

    return await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Redefinicao de senha - SmartGym",
      text: "Este e um email de teste para a funcionalidade de redefinicao de senha. Nenhuma acao foi tomada em sua conta.",
      html: `<p>Este e um email de teste para a funcionalidade de redefinicao de senha. Nenhuma acao foi tomada em sua conta.</p><p>Se voce solicitou uma redefinicao de senha, por favor ignore este email ou entre em contato com o suporte.</p>`,
    }).then((pResult) => {
      return {
        email,
        message: `Email de teste enviado para ${email}.`,
        testEmailSent: true,
        emailResult: pResult.messageId,
      };
    })
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao enviar email de redefinicao.',
    });
  }
});

app.get<{
  Querystring: RegisterLookupQuery;
}>('/auth/register-lookup', async (request, reply) => {
  try {
    const type = request.query.type;
    const cpf = normalizeRegisterCpf(request.query.cpf);

    if (type !== 'student' && type !== 'employee') {
      throw new Error('Selecione aluno ou funcionario.');
    }

    if (type === 'student') {
      const student = await prisma.aluno.findFirst({
        where: {
          caCPF: cpf,
          boInativo: 0,
        },
        include: {
          usuarios: {
            where: {
              boInativo: 0,
            },
            select: {
              id: true,
            },
          },
        },
      });

      if (!student) {
        return reply.code(404).send({
          message: 'CPF nao encontrado no cadastro de alunos.',
        });
      }

      return {
        id: student.id,
        type,
        name: student.nmAluno,
        cpf: student.caCPF,
        birthDate: student.dtNascimento,
        ddd: student.nrDDD,
        phone: student.nrContato ?? '',
        email: student.anEmail,
        hasUser: student.usuarios.length > 0,
      };
    }

    const employee = await prisma.funcionario.findFirst({
      where: {
        caCPF: cpf,
        boInativo: 0,
      },
      include: {
        usuarios: {
          where: {
            boInativo: 0,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!employee) {
      return reply.code(404).send({
        message: 'CPF nao encontrado no cadastro de funcionarios.',
      });
    }

    return {
      id: employee.id,
      type,
      name: employee.nmFuncionario,
      cpf: employee.caCPF,
      birthDate: employee.dtNascimento,
      ddd: employee.nrDDD,
      phone: employee.nrContato,
      email: employee.anEmail,
      hasUser: employee.usuarios.length > 0,
    };
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao buscar cadastro.',
    });
  }
});

app.post<{
  Body: RegisterPayload;
}>('/auth/register', async (request, reply) => {
  try {
    const type = request.body.type;
    const cpf = normalizeRegisterCpf(request.body.cpf);
    const dsLogin = normalizeRegisterLogin(request.body.email);
    const password = normalizeRegisterPassword(request.body.password);

    if (type !== 'student' && type !== 'employee') {
      throw new Error('Selecione aluno ou funcionario.');
    }

    const createdUser = await prisma.$transaction(async (transaction) => {
      if (type === 'student') {
        const student = await transaction.aluno.findFirst({
          where: {
            caCPF: cpf,
            boInativo: 0,
          },
          include: {
            usuarios: {
              where: {
                boInativo: 0,
              },
              select: {
                id: true,
              },
            },
          },
        });

        if (!student) {
          throw new Error('CPF nao encontrado no cadastro de alunos.');
        }

        if (student.usuarios.length > 0) {
          throw new Error('Este aluno ja possui usuario cadastrado.');
        }

        const user = await transaction.usuario.create({
          data: {
            idAluno: student.id,
            dsLogin,
            boInativo: 0,
          },
        });
        await transaction.senha.create({
          data: {
            idUsuario: user.id,
            dsSenha: hashPassword(password),
            cnTipoHash: 1,
            boTrocaObrigatoria: 0,
          },
        });

        return {
          id: user.id,
          type,
          name: student.nmAluno,
          login: user.dsLogin,
        };
      }

      const employee = await transaction.funcionario.findFirst({
        where: {
          caCPF: cpf,
          boInativo: 0,
        },
        include: {
          usuarios: {
            where: {
              boInativo: 0,
            },
            select: {
              id: true,
            },
          },
        },
      });

      if (!employee) {
        throw new Error('CPF nao encontrado no cadastro de funcionarios.');
      }

      if (employee.usuarios.length > 0) {
        throw new Error('Este funcionario ja possui usuario cadastrado.');
      }

      const user = await transaction.usuario.create({
        data: {
          idFuncionario: employee.id,
          dsLogin,
          boInativo: 0,
        },
      });
      await transaction.senha.create({
        data: {
          idUsuario: user.id,
          dsSenha: hashPassword(password),
          cnTipoHash: 1,
          boTrocaObrigatoria: 0,
        },
      });

      return {
        id: user.id,
        type,
        name: employee.nmFuncionario,
        login: user.dsLogin,
      };
    });

    return reply.code(201).send(createdUser);
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao criar cadastro.',
    });
  }
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
}>('/students/:id/facial-biometrics', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    assertValidId(idAluno, 'Aluno invalido.');

    return prisma.alunoBiometriaFacial.findMany({
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
        error instanceof Error ? error.message : 'Erro ao listar biometrias faciais do aluno.',
    });
  }
});

app.post<{
  Params: {
    id: string;
  };
  Body: StudentFacialBiometricPayload;
}>('/students/:id/facial-biometrics', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    assertValidId(idAluno, 'Aluno invalido.');

    const data = normalizeStudentFacialBiometricPayload(request.body);
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

    if (data.idAlunoArquivo) {
      const studentFile = await prisma.alunoArquivo.findFirst({
        where: {
          id: data.idAlunoArquivo,
          idAluno,
          boInativo: 0,
        },
        select: {
          id: true,
        },
      });

      if (!studentFile) {
        throw new Error('Arquivo do aluno invalido para biometria facial.');
      }
    }

    const biometric = await prisma.$transaction(async (transaction) => {
      await transaction.alunoBiometriaFacial.updateMany({
        where: {
          idAluno,
          boInativo: 0,
        },
        data: {
          boInativo: 1,
        },
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
  Params: {
    id: string;
  };
  Body: StudentFacialBiometricEnrollPayload;
}>('/students/:id/facial-biometrics/enroll', async (request, reply) => {
  try {
    console.log("Comecou o Processo de Enroll da Biometria Facial");
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

    const studentFile = await prisma.alunoArquivo.findFirst({
      where: {
        id: idAlunoArquivo,
        idAluno,
        boInativo: 0,
      },
      select: {
        id: true,
        dsArquivo: true,
        anCaminho: true,
      },
    });

    if (!studentFile) {
      throw new Error('Arquivo do aluno invalido para biometria facial.');
    }
    console.log("Achou o Aluno e o Arquivo, iniciando download do arquivo para cadastro da biometria facial no CompreFace");
    const { bucket } = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(studentFile.anCaminho);

    if (downloadError) {
      throw new Error(downloadError.message);
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    console.log("Arquivo baixado, cadastrando biometria facial no CompreFace");
    const subject = getStudentFacialSubject(idAluno);
    console.log("Setou o subjeto");
    const comprefaceFace = await addComprefaceSubjectExample(
      subject,
      buffer,
      studentFile.dsArquivo,
    );
    console.log("Terminou o cadastro da biometria facial no CompreFace, salvando no banco de dados");
    const biometric = await prisma.$transaction(async (transaction) => {
      await transaction.alunoBiometriaFacial.updateMany({
        where: {
          idAluno,
          boInativo: 0,
        },
        data: {
          boInativo: 1,
        },
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
        error instanceof Error ? error.message : 'Erro ao cadastrar biometria facial no CompreFace.',
    });
  }
});

app.patch<{
  Params: {
    id: string;
    biometricId: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/students/:id/facial-biometrics/:biometricId/status', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    const id = Number(request.params.biometricId);
    assertValidId(idAluno, 'Aluno invalido.');
    assertValidId(id, 'Biometria facial invalida.');

    const current = await prisma.alunoBiometriaFacial.findFirst({
      where: {
        id,
        idAluno,
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      return reply.code(404).send({
        message: 'Biometria facial nao encontrada.',
      });
    }

    return prisma.alunoBiometriaFacial.update({
      where: {
        id,
      },
      data: {
        boInativo: Number(request.body.boInativo ?? 0),
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao alterar status da biometria facial.',
    });
  }
});

app.post('/access/facial/recognize', async (request, reply) => {
  try {
    const file = await request.file();

    if (!file) {
      return reply.code(400).send({
        message: 'Envie uma imagem para reconhecimento facial.',
      });
    }

    const buffer = await file.toBuffer();
    const recognition = await recognizeComprefaceFace(buffer, file.filename);
    const prediction = recognition.result?.[0]?.subjects?.[0];
    const subject = prediction?.subject;
    const similarity = Number(prediction?.similarity ?? 0);

    if (!subject) {
      return {
        match: false,
        access: 'denied',
        similarity,
        message: 'Nenhum aluno reconhecido.',
      };
    }

    const biometric = await prisma.alunoBiometriaFacial.findFirst({
      where: {
        dsProvider: 'compreface',
        dsSubject: subject,
        boInativo: 0,
      },
      select: {
        idAluno: true,
        nrThreshold: true,
        aluno: {
          select: {
            id: true,
            nmAluno: true,
          },
        },
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });

    if (!biometric) {
      return {
        match: false,
        access: 'denied',
        subject,
        similarity,
        message: 'Biometria facial nao vinculada a um aluno ativo.',
      };
    }

    const threshold = Math.max(
      Number(biometric.nrThreshold),
      getComprefaceConfig().similarityThreshold,
    );
    const match = similarity >= threshold;

    return {
      match,
      access: match ? 'granted' : 'denied',
      idAluno: match ? biometric.idAluno : null,
      aluno: match ? biometric.aluno : null,
      subject,
      similarity,
      threshold,
    };
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao reconhecer biometria facial.',
    });
  }
});

app.get<{
  Querystring: {
    search?: string;
  };
}>('/employees', async (request) => {
  const search = request.query.search?.trim();

  return prisma.funcionario.findMany({
    where: search
      ? {
        OR: [
          {
            nmFuncionario: {
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
      nmFuncionario: 'asc',
    },
  });
});

app.post<{
  Body: EmployeePayload;
}>('/employees', async (request, reply) => {
  try {
    const data = normalizeEmployeePayload(request.body);
    const employee = await prisma.funcionario.create({
      data: data as unknown as Parameters<typeof prisma.funcionario.create>[0]['data'],
    });

    return reply.code(201).send(employee);
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao criar funcionario.',
    });
  }
});

app.put<{
  Params: {
    id: string;
  };
  Body: EmployeePayload;
}>('/employees/:id', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const data = normalizeEmployeePayload(request.body);

    return prisma.funcionario.update({
      where: {
        id,
      },
      data: data as unknown as Parameters<typeof prisma.funcionario.update>[0]['data'],
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar funcionario.',
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
}>('/employees/:id/status', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const boInativo = Number(request.body.boInativo ?? 0);

    return prisma.funcionario.update({
      where: {
        id,
      },
      data: {
        boInativo,
      },
    });
  } catch {
    return reply.code(400).send({
      message: 'Erro ao alterar status do funcionario.',
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

app.get<{
  Params: {
    id: string;
  };
}>('/students/:id/related/plans', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    assertValidId(idAluno, 'Aluno invalido.');

    return prisma.alunoPlano.findMany({
      where: {
        idAluno,
      },
      include: {
        plano: true,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar planos do aluno.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/students/:id/related/payments', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    assertValidId(idAluno, 'Aluno invalido.');

    return prisma.pagamento.findMany({
      where: {
        alunoPlano: {
          idAluno,
        },
      },
      orderBy: {
        dtPagamento: 'desc',
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar pagamentos do aluno.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/students/:id/related/check-ins', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    assertValidId(idAluno, 'Aluno invalido.');

    return prisma.alunoCheckIn.findMany({
      where: {
        alunoPlano: {
          idAluno,
        },
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar check-ins do aluno.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/students/:id/related/trainings', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    assertValidId(idAluno, 'Aluno invalido.');

    return prisma.alunoTreino.findMany({
      where: {
        idAluno,
      },
      include: {
        funcionario: true,
        treino: true,
        alunoTreinosSequencias: {
          where: {
            boInativo: 0,
          },
          orderBy: {
            nrOrdem: 'asc',
          },
        },
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar treinos do aluno.',
    });
  }
});

app.post<{
  Params: {
    id: string;
    resource: string;
  };
  Body: CompanyChildPayload;
}>('/students/:id/related/:resource', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    const resource = getStudentChildResourceConfig(request.params.resource);
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

      if (!idTreino) {
        throw new Error('Selecione um treino.');
      }

      const training = await prisma.treino.findUnique({
        where: {
          id: idTreino,
        },
        select: {
          id: true,
        },
      });

      if (!training) {
        throw new Error('Treino invalido.');
      }

      const idFuncionario = optionalNumber(request.body.idFuncionario);

      if (!idFuncionario) {
        throw new Error('Profissional logado invalido.');
      }

      const employee = await prisma.funcionario.findUnique({
        where: {
          id: idFuncionario,
        },
        select: {
          id: true,
        },
      });

      if (!employee) {
        throw new Error('Profissional invalido.');
      }

      const nrOrdemSequencia = optionalNumber(request.body.nrOrdemSequencia);
      const record = await prisma.$transaction(async (transaction) => {
        const studentTraining = await transaction.alunoTreino.create({
          data: {
            idAluno,
            idFuncionario,
            idTreino,
            boInativo: Number(request.body.boInativo ?? 0),
          },
        });

        if (nrOrdemSequencia) {
          await transaction.alunoTreinoSequencia.create({
            data: {
              idAlunoTreino: studentTraining.id,
              nrOrdem: nrOrdemSequencia,
              boInativo: 0,
            },
          });
        }

        return transaction.alunoTreino.findUniqueOrThrow({
          where: {
            id: studentTraining.id,
          },
          include: {
            funcionario: true,
            treino: true,
            alunoTreinosSequencias: {
              where: {
                boInativo: 0,
              },
              orderBy: {
                nrOrdem: 'asc',
              },
            },
          },
        });
      });

      return reply.code(201).send(record);
    }

    const idAlunoPlano = optionalNumber(request.body.idAlunoPlano);

    if (!idAlunoPlano) {
      throw new Error('Selecione um plano do aluno.');
    }

    const studentPlan = await prisma.alunoPlano.findFirst({
      where: {
        id: idAlunoPlano,
        idAluno,
      },
      select: {
        id: true,
        idEmpresa: true,
      },
    });

    if (!studentPlan) {
      throw new Error('Plano do aluno invalido.');
    }

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

    const record = await prisma.alunoCheckIn.create({
      data: {
        idEmpresa: optionalNumber(request.body.idEmpresa) ?? studentPlan.idEmpresa,
        idAlunoPlano,
        idAlunoTreinosSequencia: optionalNumber(request.body.idAlunoTreinosSequencia),
        idPontos: optionalNumber(request.body.idPontos),
        boInativo: Number(request.body.boInativo ?? 0),
      },
    });

    return reply.code(201).send(record);
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao criar registro relacionado.',
    });
  }
});

app.put<{
  Params: {
    id: string;
    resource: string;
    childId: string;
  };
  Body: CompanyChildPayload;
}>('/students/:id/related/:resource/:childId', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    const childId = Number(request.params.childId);
    const resource = getStudentChildResourceConfig(request.params.resource);
    assertValidId(idAluno, 'Aluno invalido.');
    assertValidId(childId, 'Registro invalido.');

    if (resource === 'plans') {
      const current = await prisma.alunoPlano.findFirst({
        where: {
          id: childId,
          idAluno,
        },
        select: {
          id: true,
        },
      });

      if (!current) {
        throw new Error('Plano do aluno invalido.');
      }

      return prisma.alunoPlano.update({
        where: {
          id: childId,
        },
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
      const current = await prisma.alunoTreino.findFirst({
        where: {
          id: childId,
          idAluno,
        },
        select: {
          id: true,
        },
      });

      if (!current) {
        throw new Error('Treino do aluno invalido.');
      }

      const idTreino = optionalNumber(request.body.idTreino);

      if (!idTreino) {
        throw new Error('Selecione um treino.');
      }

      const training = await prisma.treino.findUnique({
        where: {
          id: idTreino,
        },
        select: {
          id: true,
        },
      });

      if (!training) {
        throw new Error('Treino invalido.');
      }

      const idFuncionario = optionalNumber(request.body.idFuncionario);

      if (!idFuncionario) {
        throw new Error('Profissional logado invalido.');
      }

      const employee = await prisma.funcionario.findUnique({
        where: {
          id: idFuncionario,
        },
        select: {
          id: true,
        },
      });

      if (!employee) {
        throw new Error('Profissional invalido.');
      }

      const nrOrdemSequencia = optionalNumber(request.body.nrOrdemSequencia);

      return prisma.$transaction(async (transaction) => {
        await transaction.alunoTreino.update({
          where: {
            id: childId,
          },
          data: {
            idFuncionario,
            idTreino,
            boInativo: Number(request.body.boInativo ?? 0),
          },
        });

        if (nrOrdemSequencia) {
          const currentSequence = await transaction.alunoTreinoSequencia.findFirst({
            where: {
              idAlunoTreino: childId,
              boInativo: 0,
            },
            orderBy: {
              nrOrdem: 'asc',
            },
          });

          if (currentSequence) {
            await transaction.alunoTreinoSequencia.update({
              where: {
                id: currentSequence.id,
              },
              data: {
                nrOrdem: nrOrdemSequencia,
              },
            });
          } else {
            await transaction.alunoTreinoSequencia.create({
              data: {
                idAlunoTreino: childId,
                nrOrdem: nrOrdemSequencia,
                boInativo: 0,
              },
            });
          }
        }

        return transaction.alunoTreino.findUniqueOrThrow({
          where: {
            id: childId,
          },
          include: {
            funcionario: true,
            treino: true,
            alunoTreinosSequencias: {
              where: {
                boInativo: 0,
              },
              orderBy: {
                nrOrdem: 'asc',
              },
            },
          },
        });
      });
    }

    const idAlunoPlano = optionalNumber(request.body.idAlunoPlano);

    if (!idAlunoPlano) {
      throw new Error('Selecione um plano do aluno.');
    }

    const studentPlan = await prisma.alunoPlano.findFirst({
      where: {
        id: idAlunoPlano,
        idAluno,
      },
      select: {
        id: true,
        idEmpresa: true,
      },
    });

    if (!studentPlan) {
      throw new Error('Plano do aluno invalido.');
    }

    if (resource === 'payments') {
      const current = await prisma.pagamento.findFirst({
        where: {
          id: childId,
          alunoPlano: {
            idAluno,
          },
        },
        select: {
          id: true,
        },
      });

      if (!current) {
        throw new Error('Pagamento invalido.');
      }

      return prisma.pagamento.update({
        where: {
          id: childId,
        },
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
      where: {
        id: childId,
        alunoPlano: {
          idAluno,
        },
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      throw new Error('Check-in invalido.');
    }

    return prisma.alunoCheckIn.update({
      where: {
        id: childId,
      },
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
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar registro relacionado.',
    });
  }
});

app.patch<{
  Params: {
    id: string;
    resource: string;
    childId: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/students/:id/related/:resource/:childId/status', async (request, reply) => {
  try {
    const idAluno = Number(request.params.id);
    const childId = Number(request.params.childId);
    const resource = getStudentChildResourceConfig(request.params.resource);
    const boInativo = Number(request.body.boInativo ?? 0);
    assertValidId(idAluno, 'Aluno invalido.');
    assertValidId(childId, 'Registro invalido.');

    if (resource === 'plans') {
      const current = await prisma.alunoPlano.findFirst({
        where: {
          id: childId,
          idAluno,
        },
        select: {
          id: true,
        },
      });

      if (!current) {
        throw new Error('Plano do aluno invalido.');
      }

      return prisma.alunoPlano.update({
        where: {
          id: childId,
        },
        data: {
          boInativo,
        },
      });
    }

    if (resource === 'trainings') {
      const current = await prisma.alunoTreino.findFirst({
        where: {
          id: childId,
          idAluno,
        },
        select: {
          id: true,
        },
      });

      if (!current) {
        throw new Error('Treino do aluno invalido.');
      }

      return prisma.alunoTreino.update({
        where: {
          id: childId,
        },
        data: {
          boInativo,
        },
        include: {
          funcionario: true,
          treino: true,
          alunoTreinosSequencias: {
            where: {
              boInativo: 0,
            },
            orderBy: {
              nrOrdem: 'asc',
            },
          },
        },
      });
    }

    if (resource === 'payments') {
      const current = await prisma.pagamento.findFirst({
        where: {
          id: childId,
          alunoPlano: {
            idAluno,
          },
        },
        select: {
          id: true,
        },
      });

      if (!current) {
        throw new Error('Pagamento invalido.');
      }

      return prisma.pagamento.update({
        where: {
          id: childId,
        },
        data: {
          boInativo,
        },
      });
    }

    const current = await prisma.alunoCheckIn.findFirst({
      where: {
        id: childId,
        alunoPlano: {
          idAluno,
        },
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      throw new Error('Check-in invalido.');
    }

    return prisma.alunoCheckIn.update({
      where: {
        id: childId,
      },
      data: {
        boInativo,
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao alterar status do registro relacionado.',
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

app.get<{
  Querystring: {
    includeInactive?: string;
    search?: string;
  };
}>('/plans', async (request) => {
  const includeInactive = request.query.includeInactive === 'true';
  const search = request.query.search?.trim();

  return prisma.plano.findMany({
    where: {
      ...(includeInactive ? {} : { boInativo: 0 }),
      ...(search
        ? {
          dsPlano: {
            contains: search,
            mode: 'insensitive',
          },
        }
        : {}),
    },
    orderBy: {
      dsPlano: 'asc',
    },
  });
});

app.post<{
  Body: PlanPayload;
}>('/plans', async (request, reply) => {
  try {
    const data = normalizePlanPayload(request.body);
    const plan = await prisma.plano.create({
      data,
    });

    return reply.code(201).send(plan);
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao criar plano.',
    });
  }
});

app.put<{
  Params: {
    id: string;
  };
  Body: PlanPayload;
}>('/plans/:id', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const data = normalizePlanPayload(request.body);

    return prisma.plano.update({
      where: {
        id,
      },
      data,
    });
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao atualizar plano.',
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
}>('/plans/:id/status', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const boInativo = Number(request.body.boInativo ?? 0);

    return prisma.plano.update({
      where: {
        id,
      },
      data: {
        boInativo,
      },
    });
  } catch {
    return reply.code(400).send({
      message: 'Erro ao alterar status do plano.',
    });
  }
});

app.get('/promotion-plans', async () => {
  return prisma.promocaoPlano.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dtCadastro: 'desc',
    },
  });
});

app.get('/points', async () => {
  return prisma.ponto.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsPontos: 'asc',
    },
  });
});

app.get('/student-training-sequences', async () => {
  return prisma.alunoTreinoSequencia.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dtCadastro: 'desc',
    },
  });
});

app.get('/activities', async () => {
  return prisma.atividade.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsAtividade: 'asc',
    },
  });
});

app.get('/promotions', async () => {
  return prisma.promocao.findMany({
    where: {
      boInativo: 0,
    },
    orderBy: {
      dsPromocao: 'asc',
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

app.get<{
  Querystring: {
    includeInactive?: string;
    search?: string;
  };
}>('/trainings', async (request) => {
  const includeInactive = request.query.includeInactive === 'true';
  const search = request.query.search?.trim();

  return prisma.treino.findMany({
    where: {
      ...(includeInactive ? {} : { boInativo: 0 }),
      ...(search
        ? {
          dsTreino: {
            contains: search,
            mode: 'insensitive',
          },
        }
        : {}),
    },
    orderBy: {
      dsTreino: 'asc',
    },
  });
});

app.post<{
  Body: TrainingPayload;
}>('/trainings', async (request, reply) => {
  try {
    const data = normalizeTrainingPayload(request.body);
    const training = await prisma.treino.create({
      data,
    });

    return reply.code(201).send(training);
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao criar treino.',
    });
  }
});

app.put<{
  Params: {
    id: string;
  };
  Body: TrainingPayload;
}>('/trainings/:id', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const data = normalizeTrainingPayload(request.body);

    return prisma.treino.update({
      where: {
        id,
      },
      data,
    });
  } catch (error) {
    return reply.code(400).send({
      message: error instanceof Error ? error.message : 'Erro ao atualizar treino.',
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
}>('/trainings/:id/status', async (request, reply) => {
  try {
    const id = Number(request.params.id);
    const boInativo = Number(request.body.boInativo ?? 0);

    return prisma.treino.update({
      where: {
        id,
      },
      data: {
        boInativo,
      },
    });
  } catch {
    return reply.code(400).send({
      message: 'Erro ao alterar status do treino.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/trainings/:id/related/exercises', async (request, reply) => {
  try {
    const idTreino = Number(request.params.id);
    assertValidId(idTreino, 'Treino invalido.');

    return prisma.treinoExercicio.findMany({
      where: {
        idTreino,
      },
      orderBy: {
        nrOrdem: 'asc',
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar exercicios do treino.',
    });
  }
});

app.post<{
  Params: {
    id: string;
  };
  Body: CompanyChildPayload;
}>('/trainings/:id/related/exercises', async (request, reply) => {
  try {
    const idTreino = Number(request.params.id);
    assertValidId(idTreino, 'Treino invalido.');

    const training = await prisma.treino.findUnique({
      where: {
        id: idTreino,
      },
      select: {
        id: true,
        idEmpresa: true,
      },
    });

    if (!training) {
      return reply.code(404).send({
        message: 'Treino nao encontrado.',
      });
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
        boInativo: Number(request.body.boInativo ?? 0),
      },
    });

    return reply.code(201).send(record);
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao criar exercicio do treino.',
    });
  }
});

app.put<{
  Params: {
    id: string;
    childId: string;
  };
  Body: CompanyChildPayload;
}>('/trainings/:id/related/exercises/:childId', async (request, reply) => {
  try {
    const idTreino = Number(request.params.id);
    const childId = Number(request.params.childId);
    assertValidId(idTreino, 'Treino invalido.');
    assertValidId(childId, 'Exercicio do treino invalido.');

    const current = await prisma.treinoExercicio.findFirst({
      where: {
        id: childId,
        idTreino,
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      throw new Error('Exercicio do treino invalido.');
    }

    const training = await prisma.treino.findUnique({
      where: {
        id: idTreino,
      },
      select: {
        idEmpresa: true,
      },
    });

    return prisma.treinoExercicio.update({
      where: {
        id: childId,
      },
      data: {
        idEmpresa: optionalNumber(request.body.idEmpresa) ?? training?.idEmpresa ?? null,
        idExercicio: optionalNumber(request.body.idExercicio),
        idMetodoTreino: optionalNumber(request.body.idMetodoTreino),
        nrOrdem: Number(request.body.nrOrdem ?? 0),
        nrSeries: Number(request.body.nrSeries ?? 0),
        nrRepeticoes: Number(request.body.nrRepeticoes ?? 0),
        qtDescanso: Number(request.body.qtDescanso ?? 0),
        boInativo: Number(request.body.boInativo ?? 0),
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar exercicio do treino.',
    });
  }
});

app.patch<{
  Params: {
    id: string;
    childId: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/trainings/:id/related/exercises/:childId/status', async (request, reply) => {
  try {
    const idTreino = Number(request.params.id);
    const childId = Number(request.params.childId);
    assertValidId(idTreino, 'Treino invalido.');
    assertValidId(childId, 'Exercicio do treino invalido.');

    const current = await prisma.treinoExercicio.findFirst({
      where: {
        id: childId,
        idTreino,
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      throw new Error('Exercicio do treino invalido.');
    }

    return prisma.treinoExercicio.update({
      where: {
        id: childId,
      },
      data: {
        boInativo: Number(request.body.boInativo ?? 0),
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao alterar status do exercicio do treino.',
    });
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
  Params: {
    id: string;
  };
}>('/plans/:id/related/values', async (request, reply) => {
  try {
    const idPlano = Number(request.params.id);
    assertValidId(idPlano, 'Plano invalido.');

    return prisma.planoValor.findMany({
      where: { idPlano },
      orderBy: { dtCadastro: 'desc' },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar valores do plano.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/plans/:id/related/products', async (request, reply) => {
  try {
    const idPlano = Number(request.params.id);
    assertValidId(idPlano, 'Plano invalido.');

    return prisma.planoProduto.findMany({
      where: { idPlano },
      orderBy: { dtCadastro: 'desc' },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar produtos do plano.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/plans/:id/related/companies', async (request, reply) => {
  try {
    const idPlano = Number(request.params.id);
    assertValidId(idPlano, 'Plano invalido.');

    return prisma.planoEmpresa.findMany({
      where: { idPlano },
      orderBy: { dtCadastro: 'desc' },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar empresas do plano.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/plans/:id/related/activities', async (request, reply) => {
  try {
    const idPlano = Number(request.params.id);
    assertValidId(idPlano, 'Plano invalido.');

    return prisma.planoAtividade.findMany({
      where: { idPlano },
      orderBy: { dtCadastro: 'desc' },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar atividades do plano.',
    });
  }
});

app.get<{
  Params: {
    id: string;
  };
}>('/plans/:id/related/promotion-plans', async (request, reply) => {
  try {
    const idPlano = Number(request.params.id);
    assertValidId(idPlano, 'Plano invalido.');

    return prisma.promocaoPlano.findMany({
      where: { idPlano },
      orderBy: { dtCadastro: 'desc' },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar promocoes do plano.',
    });
  }
});

app.post<{
  Params: {
    id: string;
    resource: string;
  };
  Body: CompanyChildPayload;
}>('/plans/:id/related/:resource', async (request, reply) => {
  try {
    const idPlano = Number(request.params.id);
    assertValidId(idPlano, 'Plano invalido.');
    const config = getPlanChildResourceConfig(request.params.resource);

    const record = await config.delegate.create({
      data: config.normalize(idPlano, request.body),
    });

    return reply.code(201).send(record);
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao criar registro relacionado.',
    });
  }
});

app.put<{
  Params: {
    id: string;
    resource: string;
    childId: string;
  };
  Body: CompanyChildPayload;
}>('/plans/:id/related/:resource/:childId', async (request, reply) => {
  try {
    const idPlano = Number(request.params.id);
    const childId = Number(request.params.childId);
    assertValidId(idPlano, 'Plano invalido.');
    assertValidId(childId, 'Registro invalido.');
    const config = getPlanChildResourceConfig(request.params.resource);

    return config.delegate.update({
      where: { id: childId },
      data: config.normalize(idPlano, request.body),
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar registro relacionado.',
    });
  }
});

app.patch<{
  Params: {
    resource: string;
    childId: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/plans/:id/related/:resource/:childId/status', async (request, reply) => {
  try {
    const childId = Number(request.params.childId);
    assertValidId(childId, 'Registro invalido.');
    const config = getPlanChildResourceConfig(request.params.resource);

    return config.delegate.update({
      where: { id: childId },
      data: { boInativo: Number(request.body.boInativo ?? 0) },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao alterar status do registro relacionado.',
    });
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
  Params: {
    id: string;
  };
}>('/companies/:id/files', async (request, reply) => {
  try {
    const idEmpresa = Number(request.params.id);
    assertValidId(idEmpresa, 'Empresa invalida.');

    return prisma.empresaArquivo.findMany({
      where: {
        idEmpresa,
        boInativo: 0,
      },
      orderBy: {
        dtCadastro: 'desc',
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar arquivos da empresa.',
    });
  }
});

app.post<{
  Params: {
    id: string;
  };
}>('/companies/:id/files', async (request, reply) => {
  try {
    const idEmpresa = Number(request.params.id);
    assertValidId(idEmpresa, 'Empresa invalida.');

    const company = await prisma.empresa.findUnique({
      where: {
        id: idEmpresa,
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      return reply.code(404).send({
        message: 'Empresa nao encontrada.',
      });
    }

    const file = await request.file();

    if (!file) {
      return reply.code(400).send({
        message: 'Envie um arquivo.',
      });
    }

    const fields = file.fields as Record<string, unknown>;
    const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
    const dsArquivo = file.filename;
    const idTiposArquivos = rawFileTypeId ? Number(rawFileTypeId) : null;

    const buffer = await file.toBuffer();
    const path = getCompanyFilePath(idEmpresa, file.filename);
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

    const companyFile = await prisma.empresaArquivo.create({
      data: {
        idEmpresa,
        idTiposArquivos,
        dsArquivo,
        anCaminho: path,
        cnChaveAcesso: 0,
        cnDistribuidor: 0,
      },
    });

    return reply.code(201).send(companyFile);
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao enviar arquivo da empresa.',
    });
  }
});

app.put<{
  Params: {
    id: string;
    fileId: string;
  };
}>('/companies/:id/files/:fileId', async (request, reply) => {
  try {
    const idEmpresa = Number(request.params.id);
    const fileId = Number(request.params.fileId);
    assertValidId(idEmpresa, 'Empresa invalida.');
    assertValidId(fileId, 'Arquivo invalido.');

    const existingCompanyFile = await prisma.empresaArquivo.findFirst({
      where: {
        id: fileId,
        idEmpresa,
        boInativo: 0,
      },
    });

    if (!existingCompanyFile) {
      return reply.code(404).send({
        message: 'Arquivo nao encontrado.',
      });
    }

    const file = await request.file();

    if (!file) {
      return reply.code(400).send({
        message: 'Envie um arquivo.',
      });
    }

    const fields = file.fields as Record<string, unknown>;
    const rawFileTypeId = getMultipartFieldValue(fields, 'idTiposArquivos');
    const dsArquivo = file.filename;
    const idTiposArquivos = rawFileTypeId
      ? Number(rawFileTypeId)
      : existingCompanyFile.idTiposArquivos;

    const buffer = await file.toBuffer();
    const path = getCompanyFilePath(idEmpresa, file.filename);
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

    return prisma.empresaArquivo.update({
      where: {
        id: fileId,
      },
      data: {
        idTiposArquivos,
        dsArquivo,
        anCaminho: path,
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao alterar arquivo da empresa.',
    });
  }
});

app.get<{
  Params: {
    id: string;
    fileId: string;
  };
}>('/companies/:id/files/:fileId/url', async (request, reply) => {
  try {
    const idEmpresa = Number(request.params.id);
    const fileId = Number(request.params.fileId);
    assertValidId(idEmpresa, 'Empresa invalida.');
    assertValidId(fileId, 'Arquivo invalido.');

    const companyFile = await prisma.empresaArquivo.findFirst({
      where: {
        id: fileId,
        idEmpresa,
        boInativo: 0,
      },
    });

    if (!companyFile) {
      return reply.code(404).send({
        message: 'Arquivo nao encontrado.',
      });
    }

    const { bucket } = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(companyFile.anCaminho, 60 * 5);

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
}>('/companies/:id/files/:fileId', async (request, reply) => {
  try {
    const idEmpresa = Number(request.params.id);
    const fileId = Number(request.params.fileId);
    assertValidId(idEmpresa, 'Empresa invalida.');
    assertValidId(fileId, 'Arquivo invalido.');

    const existingCompanyFile = await prisma.empresaArquivo.findFirst({
      where: {
        id: fileId,
        idEmpresa,
        boInativo: 0,
      },
    });

    if (!existingCompanyFile) {
      return reply.code(404).send({
        message: 'Arquivo nao encontrado.',
      });
    }

    return prisma.empresaArquivo.update({
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
        error instanceof Error ? error.message : 'Erro ao remover arquivo da empresa.',
    });
  }
});

app.get<{
  Params: {
    companyId: string;
    resource: string;
  };
}>('/companies/:companyId/children/:resource', async (request, reply) => {
  try {
    const companyId = Number(request.params.companyId);
    assertValidId(companyId, 'Empresa invalida.');

    const config = getChildResourceConfig(request.params.resource);
    const where = config.companyField ? { [config.companyField]: companyId } : undefined;

    return await config.delegate.findMany({
      where,
      orderBy: config.orderBy,
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao listar registros filhos.',
    });
  }
});

app.post<{
  Params: {
    companyId: string;
    resource: string;
  };
  Body: CompanyChildPayload;
}>('/companies/:companyId/children/:resource', async (request, reply) => {
  try {
    const companyId = Number(request.params.companyId);
    assertValidId(companyId, 'Empresa invalida.');

    const config = getChildResourceConfig(request.params.resource);
    const data = config.normalize(companyId, request.body);

    return reply.code(201).send(
      await config.delegate.create({
        data,
      }),
    );
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao criar registro filho.',
    });
  }
});

app.put<{
  Params: {
    companyId: string;
    resource: string;
    childId: string;
  };
  Body: CompanyChildPayload;
}>('/companies/:companyId/children/:resource/:childId', async (request, reply) => {
  try {
    const companyId = Number(request.params.companyId);
    const childId = Number(request.params.childId);
    assertValidId(companyId, 'Empresa invalida.');
    assertValidId(childId, 'Registro invalido.');

    const config = getChildResourceConfig(request.params.resource);
    const data = config.normalize(companyId, request.body);

    return await config.delegate.update({
      where: {
        id: childId,
      },
      data,
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao atualizar registro filho.',
    });
  }
});

app.patch<{
  Params: {
    companyId: string;
    resource: string;
    childId: string;
  };
  Body: {
    boInativo?: number;
  };
}>('/companies/:companyId/children/:resource/:childId/status', async (request, reply) => {
  try {
    const companyId = Number(request.params.companyId);
    const childId = Number(request.params.childId);
    assertValidId(companyId, 'Empresa invalida.');
    assertValidId(childId, 'Registro invalido.');

    const config = getChildResourceConfig(request.params.resource);

    return await config.delegate.update({
      where: {
        id: childId,
      },
      data: {
        boInativo: Number(request.body.boInativo ?? 0),
      },
    });
  } catch (error) {
    return reply.code(400).send({
      message:
        error instanceof Error ? error.message : 'Erro ao alterar status do registro filho.',
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
