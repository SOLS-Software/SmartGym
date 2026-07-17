import { createHash } from 'node:crypto';
import type {
  CompanyPayload,
  EmployeePayload,
  EquipamentoManutencaoPayload,
  EquipamentoPayload,
  ExercisePayload,
  LocalidadePayload,
  PlanPayload,
  ProductPayload,
  RegisterPayload,
  StudentFacialBiometricPayload,
  StudentPayload,
  TrainingPayload,
} from './api-types.js';

export function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return Number(value);
}

export function toBool(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1';
  }
  return false;
}

export function requiredText(value: unknown, message: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error(message);
  }
  return text;
}

export function optionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function optionalDate(value: unknown) {
  if (!value) {
    return undefined;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error('Informe uma data valida.');
  }
  return date;
}

export function assertValidId(id: number, message: string) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(message);
  }
}

export function getMultipartFieldValue(fields: Record<string, unknown>, fieldName: string) {
  const field = fields[fieldName];
  if (!field || typeof field !== 'object' || !('value' in field)) {
    return '';
  }
  const value = (field as { value?: unknown }).value;
  return value === undefined || value === null ? '' : String(value);
}

export function parseBirthDate(value?: string | null) {
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

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidCnpj(value: string) {
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

export function isValidCpf(value: string) {
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

export function normalizeCompanyPayload(payload: CompanyPayload) {
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
  const idCliente = optionalNumber(payload.idCliente);
  if (!idCliente) {
    throw new Error('Cliente nao identificado.');
  }

  const optionalDigits = (value: string | undefined, maxLength: number) => {
    const digits = value?.replace(/\D/g, '') ?? '';
    return digits ? digits.slice(0, maxLength) : null;
  };
  const optionalTrimmed = (value: string | undefined, maxLength: number) => {
    const text = value?.trim() ?? '';
    return text ? text.slice(0, maxLength) : null;
  };

  const anUF = payload.anUF?.trim().toUpperCase().slice(0, 2) || null;

  return {
    idCliente,
    dsEmpresa,
    caCNPJ,
    anCEP: optionalDigits(payload.anCEP, 8),
    anLogradouro: optionalTrimmed(payload.anLogradouro, 150),
    nrEndereco: optionalTrimmed(payload.nrEndereco, 10),
    anBairro: optionalTrimmed(payload.anBairro, 100),
    anCidade: optionalTrimmed(payload.anCidade, 100),
    anUF,
    nrDDD: optionalNumber(payload.nrDDD),
    nrContato: optionalDigits(payload.nrContato, 11),
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeProductPayload(payload: ProductPayload) {
  const dsProduto = payload.dsProduto?.trim();
  if (!dsProduto) {
    throw new Error('Informe o nome do produto.');
  }
  return {
    idEmpresa: payload.idEmpresa ?? null,
    dsProduto,
    qtEstoque: Number(payload.qtEstoque ?? 0),
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeExercisePayload(payload: ExercisePayload) {
  const dsExercicio = payload.dsExercicio?.trim();
  if (!dsExercicio) {
    throw new Error('Informe o nome do exercicio.');
  }
  return {
    idEmpresa: payload.idEmpresa ?? null,
    dsExercicio,
    dsInstrucao: payload.dsInstrucao?.trim() || null,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeTrainingPayload(payload: TrainingPayload) {
  const dsTreino = payload.dsTreino?.trim();
  if (!dsTreino) {
    throw new Error('Informe o nome do treino.');
  }
  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    idNivel: optionalNumber(payload.idNivel),
    dsTreino,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeStudentPayload(payload: StudentPayload) {
  const nmAluno = payload.nmAluno?.trim();
  const caCPF = payload.caCPF?.replace(/\D/g, '') ?? '';
  const nrContato = payload.nrContato?.replace(/\D/g, '') ?? null;
  const anEmail = payload.anEmail?.trim() ?? '';
  const dtNascimento = parseBirthDate(payload.dtNascimento);
  const idCliente = optionalNumber(payload.idCliente);

  if (!idCliente) {
    throw new Error('Cliente nao identificado.');
  }
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
    idCliente,
    nmAluno,
    caCPF,
    dtNascimento,
    nrDDD: Number(payload.nrDDD ?? 0),
    nrContato,
    anEmail,
    anCEP: payload.anCEP?.replace(/\D/g, '') ?? '',
    anLogradouro: payload.anLogradouro?.trim() ?? '',
    anComplemento: payload.anComplemento?.trim() ?? '',
    anBairro: payload.anBairro?.trim() ?? '',
    nrEndereco:
      payload.nrEndereco === null || payload.nrEndereco === undefined || payload.nrEndereco === ''
        ? null
        : String(payload.nrEndereco),
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeStudentFacialBiometricPayload(payload: StudentFacialBiometricPayload) {
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

  const anEmbedding = Array.isArray(embedding) ? embedding.map((value) => Number(value)) : null;

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

export function normalizePlanPayload(payload: PlanPayload) {
  const dsPlano = payload.dsPlano?.trim();
  if (!dsPlano) {
    throw new Error('Informe o nome do plano.');
  }
  return {
    dsPlano,
    idFrequencia: optionalNumber(payload.idFrequencia),
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeEmployeePayload(payload: EmployeePayload) {
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
    nrDDD: optionalNumber(payload.nrDDD),
    nrContato: nrContato || null,
    anEmail,
    dtAdmissao,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeEquipamentoPayload(payload: EquipamentoPayload) {
  const nmEquipamento = payload.nmEquipamento?.trim();
  if (!nmEquipamento) {
    throw new Error('Informe o nome do equipamento.');
  }
  const dtAquisicao = optionalDate(payload.dtAquisicao);

  return {
    nrEquipamento: optionalNumber(payload.nrEquipamento),
    dsEquipamento: payload.dsEquipamento?.trim() || null,
    nmEquipamento,
    dtAquisicao: dtAquisicao ?? null,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeEquipamentoManutencaoPayload(payload: EquipamentoManutencaoPayload) {
  const dtExecucao = optionalDate(payload.dtExecucao);
  const dtValidade = optionalDate(payload.dtValidade);

  if (!dtExecucao) {
    throw new Error('Informe a data de execucao da manutencao.');
  }

  return {
    dtExecucao,
    dtValidade: dtValidade ?? null,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeLocalidadePayload(payload: LocalidadePayload) {
  const nmLocalidade = payload.nmLocalidade?.trim();
  const idEmpresa = optionalNumber(payload.idEmpresa);
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);

  if (!nmLocalidade) {
    throw new Error('Informe o nome da localidade.');
  }
  if (!idEmpresa) {
    throw new Error('Informe a empresa.');
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Informe uma latitude valida.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Informe uma longitude valida.');
  }

  return {
    idEmpresa,
    nmLocalidade,
    dsLocalidade: payload.dsLocalidade?.trim() ?? '',
    cnLocalidadeTP: Number(payload.cnLocalidadeTP ?? 0),
    latitude,
    longitude,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeRegisterPassword(password: string | undefined) {
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

export function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

export function normalizeRegisterLogin(email: string | undefined) {
  const login = email?.trim() ?? '';
  if (!login) {
    throw new Error('Informe o email.');
  }
  if (!isValidEmail(login)) {
    throw new Error('Informe um email valido.');
  }
  return login;
}

export function normalizeRegisterCpf(cpf: string | undefined) {
  const value = cpf?.replace(/\D/g, '') ?? '';
  if (!value) {
    throw new Error('Informe o CPF.');
  }
  if (!isValidCpf(value)) {
    throw new Error('Informe um CPF valido.');
  }
  return value;
}

export function normalizeRegisterEmployeePayload(payload: RegisterPayload) {
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
    nrContato: String(payload.phone ?? '').replace(/\D/g, '') || null,
    anEmail,
    boInativo: false,
  };
}

export function normalizeRegisterStudentPayload(payload: RegisterPayload): StudentPayload {
  return {
    nmAluno: payload.name,
    caCPF: payload.cpf,
    dtNascimento: payload.birthDate,
    nrDDD: payload.ddd,
    nrContato: String(payload.phone ?? ''),
    anEmail: payload.email,
    anCEP: '',
    anLogradouro: '',
    anComplemento: '',
    anBairro: '',
    nrEndereco: null,
    boInativo: false,
  };
}
