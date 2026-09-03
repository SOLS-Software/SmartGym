// CPF/CNPJ/email vinham reimplementados aqui e tambem no web (duas copias) —
// regra de negocio duplicada sai de sincronia sem ninguem perceber. Agora vem de
// @smartgym/shared; o re-export mantem os imports internos do modulo intactos.
import {
  FAIXAS,
  LIMITES,
  erroDaSenha,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  isValidHexColor,
  isValidHostname,
  isValidPersonName,
  normalizePersonName,
} from '@smartgym/shared';

export { isValidCnpj, isValidCpf, isValidEmail, isValidHexColor, isValidHostname };

import type {
  CompanyPayload,
  EmployeePayload,
  EquipamentoManutencaoPayload,
  EquipamentoPayload,
  ExercisePayload,
  FornecedorPayload,
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

// Estes tres helpers substituem versoes que faziam `.slice(0, maxLength)`. O corte
// era silencioso: quem digitasse 261 caracteres de logradouro recebia sucesso e
// so 150 iam para o banco, truncados no meio da palavra. Agora o que nao cabe
// vira erro de validacao com o nome do campo.
const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

// `unknown` e nao `string | undefined`: os payloads das rotas filhas tipam
// varios campos como `string | number | null`, e forcar o cast em cada chamada
// era mais ruido do que a coercao aqui dentro.
export function trimmedWithin(value: unknown, maxLength: number, label: string) {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!text) {
    return null;
  }
  if (text.length > maxLength) {
    throw new Error(`${label} deve ter no maximo ${maxLength} caracteres.`);
  }

  return text;
}

function digitsWithin(value: string | undefined, maxLength: number, label: string) {
  const digits = value?.replace(/\D/g, '') ?? '';

  if (!digits) {
    return null;
  }
  if (digits.length > maxLength) {
    throw new Error(`${label} deve ter no maximo ${maxLength} digitos.`);
  }

  return digits;
}

/**
 * Texto obrigatorio dentro do limite da coluna. `requiredText` sozinho garantia
 * so o "nao vazio": o texto longo demais passava por aqui e ia estourar no
 * Postgres, que devolve P2000 e vira "Erro ao salvar" sem dizer o campo.
 */
export function requiredWithin(value: unknown, maxLength: number, message: string, label: string) {
  const text = requiredText(value, message);

  if (text.length > maxLength) {
    throw new Error(`${label} deve ter no maximo ${maxLength} caracteres.`);
  }

  return text;
}

/**
 * Numero dentro da faixa declarada em FAIXAS (@smartgym/shared).
 *
 * `optionalNumber` devolve NaN para lixo ("abc") e nao conhece a precisao da
 * coluna: 1000 num Decimal(5,2) so falhava no banco. Aqui o valor e conferido
 * contra a MESMA faixa que o input do front usa em min/max/step.
 */
export function numeroNaFaixa(value: unknown, campo: string, label: string) {
  const numero = optionalNumber(value);

  if (numero === null) {
    return null;
  }
  if (!Number.isFinite(numero)) {
    throw new Error(`${label} deve ser um numero.`);
  }

  const faixa = FAIXAS[campo];
  if (faixa && (numero < faixa.min || numero > faixa.max)) {
    throw new Error(`${label} deve estar entre ${faixa.min} e ${faixa.max}.`);
  }

  return numero;
}

/**
 * Cor do tema.
 *
 * O valor vira `--color-primary` no CSS do cliente e a coluna e VarChar(7).
 * Existiam DUAS copias deste normalizador — uma para o tema do cliente
 * (clients/routes.ts) e outra para o tema da empresa (companies/routes.ts) — e
 * elas ja tinham divergido: nenhuma conferia o formato ("azul" era gravado
 * literal e derrubava o tema), e a da empresa usava `?? padrao` sobre um
 * `optionalText` que devolve STRING VAZIA, entao o padrao nunca era aplicado.
 * Uma copia so, para as duas rotas.
 */
export function corDoTema(value: unknown, padrao: string, label: string) {
  const cor = optionalText(value);
  if (!cor) return padrao;
  if (!isValidHexColor(cor)) {
    throw new Error(`${label} deve estar no formato #RRGGBB.`);
  }
  return cor.toUpperCase();
}

export function fonteDoTema(value: unknown, padrao: string, label: string) {
  const fonte = optionalText(value);
  if (!fonte) return padrao;
  if (fonte.length > LIMITES.tema.fonte) {
    throw new Error(`${label} deve ter no maximo ${LIMITES.tema.fonte} caracteres.`);
  }
  return fonte;
}

/** Data final nao pode ser anterior a inicial. Nenhum par do sistema conferia. */
export function assertOrdemDasDatas(
  inicio: Date | null | undefined,
  fim: Date | null | undefined,
  message: string,
) {
  if (inicio && fim && fim.getTime() < inicio.getTime()) {
    throw new Error(message);
  }
}

function validUf(value: string | undefined) {
  const uf = value?.trim().toUpperCase() ?? '';

  if (!uf) {
    return null;
  }
  if (!UFS.includes(uf)) {
    throw new Error('Informe uma UF valida.');
  }

  return uf;
}

export function normalizeCompanyPayload(payload: CompanyPayload) {
  const dsEmpresa = payload.dsEmpresa?.trim();
  const caCNPJ = payload.caCNPJ?.replace(/\D/g, '') ?? '';

  if (!dsEmpresa) {
    throw new Error('Informe o nome da empresa.');
  }
  if (dsEmpresa.length > LIMITES.empresa.dsEmpresa) {
    throw new Error(
      `O nome da empresa deve ter no maximo ${LIMITES.empresa.dsEmpresa} caracteres.`,
    );
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

  return {
    idCliente,
    dsEmpresa,
    caCNPJ,
    anCEP: digitsWithin(payload.anCEP, 8, 'O CEP'),
    anLogradouro: trimmedWithin(payload.anLogradouro, 150, 'O logradouro'),
    nrEndereco: trimmedWithin(payload.nrEndereco, 10, 'O numero do endereco'),
    anBairro: trimmedWithin(payload.anBairro, 100, 'O bairro'),
    anCidade: trimmedWithin(payload.anCidade, 100, 'A cidade'),
    anUF: validUf(payload.anUF),
    nrDDD: optionalNumber(payload.nrDDD),
    nrContato: digitsWithin(payload.nrContato, 11, 'O contato'),
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeProductPayload(payload: ProductPayload) {
  const dsProduto = requiredWithin(
    payload.dsProduto,
    LIMITES.produto.dsProduto,
    'Informe o nome do produto.',
    'O nome do produto',
  );
  // A checagem era so `< 0`: a coluna e Decimal(12,4) e um preco de 13 digitos
  // passava aqui para estourar no Postgres. numeroNaFaixa le a mesma faixa que
  // o input usa em min/max.
  const vlVenda = numeroNaFaixa(payload.vlVenda, 'vlVenda', 'O preco de venda');
  const qtPontosResgate = numeroNaFaixa(
    payload.qtPontosResgate,
    'qtPontosResgate',
    'O preco em pontos',
  );

  return {
    idEmpresa: payload.idEmpresa ?? null,
    dsProduto,
    qtEstoque: numeroNaFaixa(payload.qtEstoque ?? 0, 'qtEstoque', 'O estoque') ?? 0,
    vlVenda,
    // Nulo = produto nao resgatavel por pontos.
    qtPontosResgate,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeFornecedorPayload(payload: FornecedorPayload) {
  const dsFornecedor = payload.dsFornecedor?.trim();
  if (!dsFornecedor) {
    throw new Error('Informe o nome do fornecedor.');
  }
  if (dsFornecedor.length > 255) {
    throw new Error('O nome do fornecedor deve ter no maximo 255 caracteres.');
  }

  const caCNPJ = digitsWithin(payload.caCNPJ, 14, 'O CNPJ');
  if (caCNPJ && !isValidCnpj(caCNPJ)) {
    throw new Error('Informe um CNPJ valido.');
  }

  // Sem idEmpresa: fornecedor pertence ao CLIENTE (setado pela rota a partir
  // do token), disponivel para todas as filiais.
  return {
    dsFornecedor,
    caCNPJ,
    anCEP: digitsWithin(payload.anCEP, 8, 'O CEP'),
    anLogradouro: trimmedWithin(payload.anLogradouro, 150, 'O logradouro'),
    nrEndereco: trimmedWithin(payload.nrEndereco, 10, 'O numero do endereco'),
    anBairro: trimmedWithin(payload.anBairro, 100, 'O bairro'),
    anCidade: trimmedWithin(payload.anCidade, 100, 'A cidade'),
    anUF: validUf(payload.anUF),
    nrDDD: optionalNumber(payload.nrDDD),
    nrContato: digitsWithin(payload.nrContato, 11, 'O contato'),
    dsEmail: trimmedWithin(payload.dsEmail, 255, 'O e-mail'),
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeExercisePayload(payload: ExercisePayload) {
  const dsExercicio = requiredWithin(
    payload.dsExercicio,
    LIMITES.exercicio.dsExercicio,
    'Informe o nome do exercicio.',
    'O nome do exercicio',
  );
  return {
    idEmpresa: payload.idEmpresa ?? null,
    dsExercicio,
    dsInstrucao: payload.dsInstrucao?.trim() || null,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeTrainingPayload(payload: TrainingPayload) {
  const dsTreino = requiredWithin(
    payload.dsTreino,
    LIMITES.treino.dsTreino,
    'Informe o nome do treino.',
    'O nome do treino',
  );
  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    idNivel: optionalNumber(payload.idNivel),
    dsTreino,
    boInativo: toBool(payload.boInativo),
  };
}

// `validateNameFormat: false` existe para o PUT self-service: naquele caminho o
// nmAluno nao vem do cliente, e reinjetado do registro gravado (o aluno nao pode
// trocar o proprio nome). Validar ali travaria a edicao de contato/endereco de
// quem ja tem um nome fora do padrao na base, sem que a pessoa pudesse corrigir.
export function normalizeStudentPayload(
  payload: StudentPayload,
  options: { validateNameFormat?: boolean } = {},
) {
  const nmAluno = normalizePersonName(payload.nmAluno);
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
  if ((options.validateNameFormat ?? true) && !isValidPersonName(nmAluno)) {
    throw new Error(
      'Informe um nome de aluno valido: de 2 a 255 caracteres, apenas letras, espacos, apostrofos, hifens e pontos.',
    );
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

  // O normalizador do aluno era o unico que nao usava trimmedWithin/digitsWithin
  // — os helpers estavam neste mesmo arquivo, so Empresa e Fornecedor os
  // chamavam. Sem eles, um nome de 300 caracteres vindo do mobile ou de um
  // curl chegava intacto no `nmAluno VarChar(255)` e o erro era P2000, que o
  // clientErrorMessage traduz para o fallback generico "Erro ao salvar aluno.".
  //
  // O teto sobrevive ao `isValidPersonName` acima de proposito: aquele so roda
  // quando `validateNameFormat` esta ligado, e no PUT self-service ele fica
  // desligado. Aqui e o unico limite naquele caminho.
  if (nmAluno.length > LIMITES.aluno.nmAluno) {
    throw new Error(`O nome do aluno deve ter no maximo ${LIMITES.aluno.nmAluno} caracteres.`);
  }
  if (anEmail.length > LIMITES.aluno.anEmail) {
    throw new Error(`O email deve ter no maximo ${LIMITES.aluno.anEmail} caracteres.`);
  }

  const nrDDD = optionalNumber(payload.nrDDD) ?? 0;
  if (!Number.isInteger(nrDDD) || nrDDD < 0 || nrDDD > 99) {
    throw new Error('Informe um DDD valido.');
  }

  return {
    idCliente,
    nmAluno,
    caCPF,
    dtNascimento,
    nrDDD,
    nrContato: digitsWithin(nrContato ?? undefined, LIMITES.aluno.nrContato, 'O contato'),
    anEmail,
    // As colunas de endereco sao NOT NULL com default "": null aqui viraria
    // erro do Prisma, entao o vazio continua sendo string vazia.
    anCEP: digitsWithin(payload.anCEP, LIMITES.aluno.anCEP, 'O CEP') ?? '',
    anLogradouro: trimmedWithin(payload.anLogradouro, LIMITES.aluno.anLogradouro, 'O logradouro') ?? '',
    anComplemento: trimmedWithin(payload.anComplemento, LIMITES.aluno.anComplemento, 'O complemento') ?? '',
    anBairro: trimmedWithin(payload.anBairro, LIMITES.aluno.anBairro, 'O bairro') ?? '',
    nrEndereco: trimmedWithin(
      payload.nrEndereco === null || payload.nrEndereco === undefined
        ? undefined
        : String(payload.nrEndereco),
      LIMITES.aluno.nrEndereco,
      'O numero do endereco',
    ),
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
  const dsPlano = requiredWithin(
    payload.dsPlano,
    LIMITES.plano.dsPlano,
    'Informe o nome do plano.',
    'O nome do plano',
  );
  // Limite de ENTRADAS ("3x por semana"). Nao confundir com idFrequencia, que
  // e o ciclo de cobranca. Vale so aos pares: quantidade sem periodo (ou o
  // contrario) nao limita nada, e meio cadastro nao pode virar acusacao na
  // recepcao.
  const qtAcessosPeriodo = optionalNumber(payload.qtAcessosPeriodo);
  const cnPeriodoAcesso =
    typeof payload.cnPeriodoAcesso === 'string' ? payload.cnPeriodoAcesso.trim().toLowerCase() : '';

  if (qtAcessosPeriodo !== null && qtAcessosPeriodo <= 0) {
    throw new Error('O limite de entradas deve ser maior que zero.');
  }
  if (cnPeriodoAcesso && !['dia', 'semana', 'mes'].includes(cnPeriodoAcesso)) {
    throw new Error('Periodo do limite invalido.');
  }

  const temLimite = qtAcessosPeriodo !== null && Boolean(cnPeriodoAcesso);

  return {
    dsPlano,
    idFrequencia: optionalNumber(payload.idFrequencia),
    qtAcessosPeriodo: temLimite ? qtAcessosPeriodo : null,
    cnPeriodoAcesso: temLimite ? cnPeriodoAcesso : null,
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

  if (nmFuncionario.length > LIMITES.funcionario.nmFuncionario) {
    throw new Error(
      `O nome do funcionario deve ter no maximo ${LIMITES.funcionario.nmFuncionario} caracteres.`,
    );
  }
  if (anEmail.length > LIMITES.funcionario.anEmail) {
    throw new Error(`O email deve ter no maximo ${LIMITES.funcionario.anEmail} caracteres.`);
  }

  const nrDDD = optionalNumber(payload.nrDDD);
  if (nrDDD !== null && (!Number.isInteger(nrDDD) || nrDDD < 0 || nrDDD > 99)) {
    throw new Error('Informe um DDD valido.');
  }

  return {
    idEmpresa: optionalNumber(payload.idEmpresa),
    idCargo: optionalNumber(payload.idCargo),
    // Perfil de ACESSO (permissoes), distinto de idCargo (cargo de RH). Nulo e
    // aceito: funcionario sem perfil existe no cadastro e nao alcanca nada
    // alem da propria sessao — deny-by-default do RBAC.
    idPerfilAcesso: optionalNumber(payload.idPerfilAcesso),
    nmFuncionario,
    caCPF,
    dtNascimento,
    nrDDD,
    nrContato: digitsWithin(nrContato, LIMITES.funcionario.nrContato, 'O contato'),
    anEmail,
    dtAdmissao,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeEquipamentoPayload(payload: EquipamentoPayload) {
  const nmEquipamento = requiredWithin(
    payload.nmEquipamento,
    LIMITES.equipamento.nmEquipamento,
    'Informe o nome do equipamento.',
    'O nome do equipamento',
  );
  const dtAquisicao = optionalDate(payload.dtAquisicao);

  return {
    nrEquipamento: numeroNaFaixa(payload.nrEquipamento, 'nrEquipamento', 'O numero do equipamento'),
    dsEquipamento: trimmedWithin(
      payload.dsEquipamento,
      LIMITES.equipamento.dsEquipamento,
      'A descricao do equipamento',
    ),
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
  assertOrdemDasDatas(
    dtExecucao,
    dtValidade,
    'A validade da manutencao nao pode ser anterior a execucao.',
  );

  return {
    dtExecucao,
    dtValidade: dtValidade ?? null,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeLocalidadePayload(payload: LocalidadePayload) {
  const nmLocalidade = requiredWithin(
    payload.nmLocalidade,
    LIMITES.localidade.nmLocalidade,
    'Informe o nome da localidade.',
    'O nome da localidade',
  );
  const idEmpresa = optionalNumber(payload.idEmpresa);
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);

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
    dsLocalidade:
      trimmedWithin(payload.dsLocalidade, LIMITES.localidade.dsLocalidade, 'A descricao') ?? '',
    cnLocalidadeTP: Number(payload.cnLocalidadeTP ?? 0),
    latitude,
    longitude,
    boInativo: toBool(payload.boInativo),
  };
}

export function normalizeRegisterPassword(password: string | undefined) {
  const value = password ?? '';
  // As cinco regras sairam daqui para @smartgym/shared: a tela de cadastro
  // reimplementava quatro delas numa checklist, o `pattern` do input cobria
  // tres, e as telas de redefinir e de trocar senha nao cobriam nenhuma. Agora
  // servidor e as tres telas leem a mesma funcao e devolvem o mesmo texto.
  const erro = erroDaSenha(value);
  if (erro) {
    throw new Error(erro);
  }
  return value;
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
