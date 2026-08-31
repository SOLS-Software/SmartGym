// Codigo compartilhado entre api, web e mobile.
//
// O pacote existia, estava declarado como dependencia dos tres apps e ligado ao
// build do Next (`transpilePackages`), mas continha apenas dois schemas zod que
// NENHUM app importava — enquanto a validacao de CPF/CNPJ e as mascaras estavam
// copiadas entre eles. Os schemas mortos foram removidos e o pacote passou a
// abrigar o que de fato e comum.
//
// Tudo em um arquivo de proposito: o pacote e consumido por tres runtimes
// diferentes (tsx/Node ESM na API, webpack no Next, Metro no Expo) e cada um
// resolve extensao de import de um jeito. Sem imports relativos internos, nao
// ha o que resolver.

// Validacao de documentos brasileiros (CPF/CNPJ).
//
// Estas funcoes existiam em TRES copias divergentes — apps/api/src/shared/
// normalize.ts, apps/web/src/shared/registration/registrationHelpers.tsx e
// apps/web/src/features/companies/companyUtils.ts (+ apps/mobile/lib/utils/
// format.ts). Regra de negocio duplicada e regra que sai de sincronia: a
// validacao do servidor podia aceitar um CPF que a do cliente rejeitava (ou o
// contrario) sem que nada acusasse.

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Valida CPF pelo algoritmo dos digitos verificadores (modulo 11).
 * Rejeita tambem as sequencias repetidas (111.111.111-11), que passam no
 * calculo mas nao sao CPFs validos.
 */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);

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

/** Valida CNPJ pelo algoritmo dos digitos verificadores (modulo 11). */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);

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

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Mascaras de entrada compartilhadas entre web e mobile.
//
// `formatPhone` chegou a existir em QUATRO copias identicas (mobile/utils,
// mobile/admin.tsx, web/studentValidation.ts, web/EmployeeRegistration.tsx) e
// `formatCpf`/`formatCep` em duas cada. Como mascara define o formato que chega
// na API, divergencia aqui vira bug de dado.

export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function formatCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

/** Telefone sem DDD: 8 digitos (0000-0000) ou 9 (00000-0000). */
export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 9);

  if (digits.length <= 8) {
    return digits.replace(/^(\d{4})(\d)/, '$1-$2');
  }

  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

export function isImageFile(path: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
}

// Exercicio.dsInstrucao guarda descricao e passo a passo no MESMO campo, no
// formato "<descricao>\n\nComo executar:\n1. ...\n2. ...". O card mostra o texto
// cru cortado em poucas linhas; a tela de detalhe (web e mobile) precisa separar
// para render descricao como paragrafo e passos como lista numerada.
//
// Mora aqui porque web e mobile fazem a MESMA leitura do mesmo campo: uma copia
// em cada app sairia de sincronia na primeira mudanca de formato, e a tela que
// ficasse para tras despejaria "Como executar:" no meio da descricao sem que
// nada acusasse.
//
// Texto fora do formato cai inteiro em `descricao` e `passos` volta vazio, entao
// exercicio cadastrado a mao continua legivel.
export function parseExerciseInstruction(texto: string | null | undefined): {
  descricao: string;
  passos: string[];
} {
  if (!texto) return { descricao: '', passos: [] };

  const marcador = 'Como executar:';
  const corte = texto.indexOf(marcador);
  if (corte === -1) return { descricao: texto.trim(), passos: [] };

  return {
    descricao: texto.slice(0, corte).trim(),
    passos: texto
      .slice(corte + marcador.length)
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean)
      // Remove a numeracao do texto: quem numera e a lista (<ol> no web,
      // indice no mobile). Sem isso sai "1. 1. Deite no banco...".
      .map((linha) => linha.replace(/^\d+[.)]\s*/, '')),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Limites das colunas, em um lugar so.
//
// Ate aqui cada limite existia em duas ou tres copias: o `maxLength` do input,
// o `trimmedWithin(..., 150, ...)` do normalizador e o `@db.VarChar(150)` do
// Prisma. Quando as tres nao concordam o sintoma e sempre o mesmo: o front
// deixa digitar, o Postgres recusa (P2000) e o usuario le "Erro ao salvar" sem
// saber qual campo cortar. Com a tabela aqui, front e back leem o MESMO numero.
//
// O numero e o menor entre a coluna e o limite de negocio ja existente: onde o
// codigo era mais restrito que a coluna (dsEmpresa 100 numa VarChar(255)) isso
// era controle deliberado e continua valendo.
export const LIMITES = {
  aluno: {
    nmAluno: 255,
    anEmail: 100,
    anCEP: 8,
    anLogradouro: 150,
    anComplemento: 100,
    anBairro: 100,
    nrEndereco: 10,
    nrContato: 9,
  },
  funcionario: {
    nmFuncionario: 255,
    anEmail: 100,
    nrContato: 9,
  },
  empresa: {
    // Coluna e VarChar(255); 100 e o limite de negocio que ja vigorava no
    // front e no normalizador. Mantido.
    dsEmpresa: 100,
    anCEP: 8,
    anLogradouro: 150,
    nrEndereco: 10,
    anBairro: 100,
    anCidade: 100,
    nrContato: 11,
  },
  fornecedor: {
    dsFornecedor: 255,
    dsEmail: 255,
    anCEP: 8,
    anLogradouro: 150,
    nrEndereco: 10,
    anBairro: 100,
    anCidade: 100,
    nrContato: 11,
  },
  cliente: { dsCliente: 255 },
  produto: { dsProduto: 255 },
  promocao: { dsPromocao: 255 },
  plano: { dsPlano: 255 },
  exercicio: { dsExercicio: 255 },
  treino: { dsTreino: 255 },
  atividade: { dsAtividade: 255 },
  localidade: { nmLocalidade: 255, dsLocalidade: 255 },
  equipamento: { nmEquipamento: 100, dsEquipamento: 200 },
  pontuacao: { dsPontuacao: 255 },
  tema: { corHex: 7, fonte: 100, dsTema: 255 },
  dominio: { urlDominio: 255 },
  lead: { nmLead: 255, anEmail: 100, dsMensagem: 500, dsObservacao: 500, nrContato: 9 },
  avaliacao: { dsObservacao: 1000 },
  ponto: { dsObservacao: 255 },
  trancamento: { dsMotivo: 255 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Colunas numericas com precisao fixa.
//
// Decimal(5,2) guarda no maximo 999,99 — nao e "um decimal qualquer". Sem
// `max`, digitar 1000 no peso passava pelo front, passava pelo back e so o
// Postgres recusava, com erro que nao diz o campo. E sem `passo`, o input
// type=number usa step=1 por padrao e o browser recusa 72,4 antes mesmo do
// onSubmit — era por isso que a avaliacao fisica nao aceitava decimal.
export type FaixaNumerica = {
  /** Menor valor aceito. */
  min: number;
  /** Maior valor aceito; vem da precisao da coluna ou da regra de negocio. */
  max: number;
  /** Incremento do input: 0.01 para Decimal(x,2+), 1 para inteiro. */
  passo: number;
};

/** Maior valor que cabe em Decimal(precisao, escala). Decimal(5,2) -> 999.99 */
export function maximoDecimal(precisao: number, escala: number): number {
  return Number(`${'9'.repeat(precisao - escala)}.${'9'.repeat(escala)}`);
}

const MAX_INT4 = 2147483647;

export const FAIXAS: Record<string, FaixaNumerica> = {
  // --- Avaliacao fisica: Decimal(5,2), teto real 999,99 ----------------------
  // Altura em METROS (o rotulo da tela diz "(m)"): 175 seria 175 metros.
  vlAltura: { min: 0.5, max: 2.5, passo: 0.01 },
  vlPeso: { min: 0, max: 500, passo: 0.01 },
  vlPercentualGordura: { min: 0, max: 100, passo: 0.01 },
  vlMassaMagra: { min: 0, max: 500, passo: 0.01 },
  vlCircPeitoral: { min: 0, max: 300, passo: 0.01 },
  vlCircCintura: { min: 0, max: 300, passo: 0.01 },
  vlCircQuadril: { min: 0, max: 300, passo: 0.01 },
  vlCircBraco: { min: 0, max: 200, passo: 0.01 },
  vlCircCoxa: { min: 0, max: 200, passo: 0.01 },

  // --- Dinheiro: Decimal(12,4) ----------------------------------------------
  vlVenda: { min: 0, max: maximoDecimal(12, 4), passo: 0.01 },
  vlPrevisto: { min: 0, max: maximoDecimal(12, 4), passo: 0.01 },
  vlPago: { min: 0, max: maximoDecimal(12, 4), passo: 0.01 },
  vlUnitario: { min: 0, max: maximoDecimal(12, 4), passo: 0.01 },
  vlDesconto: { min: 0, max: maximoDecimal(12, 4), passo: 0.01 },
  vlCarga: { min: 0, max: maximoDecimal(8, 2), passo: 0.01 },
  pcDesconto: { min: 0, max: 100, passo: 0.01 },

  // --- Treino ---------------------------------------------------------------
  qtPeso: { min: 0, max: maximoDecimal(8, 2), passo: 0.01 },
  nrOrdem: { min: 0, max: 999, passo: 1 },
  nrSeries: { min: 0, max: 99, passo: 1 },
  nrRepeticoes: { min: 0, max: 999, passo: 1 },
  qtDescanso: { min: 0, max: 3600, passo: 1 },

  // --- Matricula e estoque --------------------------------------------------
  // Dia do mes: 31 e o teto do calendario, nao do int.
  nrDiaPagamento: { min: 1, max: 31, passo: 1 },
  qtParcelas: { min: 1, max: 120, passo: 1 },
  qtEstoque: { min: 0, max: MAX_INT4, passo: 1 },
  qtMovimentada: { min: 0, max: MAX_INT4, passo: 1 },
  qtDisponivel: { min: 0, max: MAX_INT4, passo: 1 },
  qtPontos: { min: -1000000, max: 1000000, passo: 1 },
  qtPontosResgate: { min: 1, max: MAX_INT4, passo: 1 },
  qtPeriodo: { min: 0, max: 9999, passo: 1 },
  qtAlunos: { min: 0, max: 9999, passo: 1 },
  nrEquipamento: { min: 0, max: 999999999, passo: 1 },
  nrDiasSemCheckIn: { min: 1, max: 365, passo: 1 },

  // --- Tema -----------------------------------------------------------------
  tamanhoBase: { min: 10, max: 24, passo: 1 },
  espacamentoPadrao: { min: 4, max: 64, passo: 1 },
  raioCardBorder: { min: 0, max: 32, passo: 1 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Cor hexadecimal.
//
// A coluna e VarChar(7) e o valor vira `--color-primary` no CSS do cliente.
// Sem esta checagem "azul" era gravado literalmente e derrubava o tema inteiro
// — nenhuma das tres camadas conferia o formato.
export function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Dominio corporativo.
//
// E a chave que resolve o TENANT no formulario publico (`POST /public/leads`
// compara com `window.location.hostname`). Um valor com "https://", barra ou
// espaco nunca casa, e a tela publica responde "Academia nao encontrada" sem
// pista de que o cadastro e que esta torto.
export function isValidHostname(value: string): boolean {
  const host = value.trim().toLowerCase();
  if (!host || host.length > 255) return false;

  // Sem lookbehind de proposito: o pacote roda tambem no Hermes (Expo), onde o
  // suporte a `(?<!-)` nao e garantido. A conferencia de hifen nas pontas fica
  // explicita, por rotulo.
  const rotulos = host.split('.');
  if (rotulos.length < 2) return false;

  return rotulos.every(
    (rotulo) =>
      rotulo.length >= 1 &&
      rotulo.length <= 63 &&
      /^[a-z0-9-]+$/.test(rotulo) &&
      !rotulo.startsWith('-') &&
      !rotulo.endsWith('-'),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Senha.
//
// As regras viviam so no servidor (normalizeRegisterPassword). A tela de
// cadastro reimplementava quatro das cinco numa checklist visual, o `pattern`
// do input cobria tres, e as telas de redefinir senha e de trocar senha nao
// cobriam nenhuma — quem redefinia a senha descobria a regra pelo erro do
// servidor, depois de submeter. Uma fonte so para as tres telas e para a API.
export const SENHA_MIN = 6;
export const SENHA_MAX = 20;

export type RegraSenha = { label: string; atende: (senha: string) => boolean };

export const REGRAS_SENHA: RegraSenha[] = [
  { label: 'Pelo menos 1 número', atende: (s) => /\d/.test(s) },
  { label: 'Pelo menos 3 letras', atende: (s) => (s.match(/[a-zA-Z]/g) ?? []).length >= 3 },
  { label: `Pelo menos ${SENHA_MIN} caracteres`, atende: (s) => s.length >= SENHA_MIN },
  {
    label: `No máximo ${SENHA_MAX} caracteres`,
    atende: (s) => s.length > 0 && s.length <= SENHA_MAX,
  },
  { label: 'Sem espaços', atende: (s) => s.length > 0 && !/\s/.test(s) },
];

/**
 * Primeira regra violada, em mensagem pronta para a tela. `null` = senha ok.
 * Mesma ordem e mesmo texto do servidor, para a mensagem nao mudar dependendo
 * de quem barrou.
 */
export function erroDaSenha(senha: string): string | null {
  if (senha.length < SENHA_MIN) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres.`;
  if (senha.length > SENHA_MAX) return `A senha deve ter no maximo ${SENHA_MAX} caracteres.`;
  if (/\s/.test(senha)) return 'A senha nao pode conter espacos.';
  if (!/\d/.test(senha)) return 'A senha deve conter pelo menos 1 numero.';
  if ((senha.match(/[a-zA-Z]/g) ?? []).length < 3) return 'A senha deve conter pelo menos 3 letras.';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Datas de um periodo.
//
// Promocao, promocao-plano, manutencao de equipamento, trancamento e agenda
// guardam um par inicio/fim e NENHUM deles conferia a ordem — nem no front nem
// no back. Uma promocao que encerra antes de comecar entra na base e some das
// listagens "vigentes" sem que nada acuse.
export function periodoInvalido(inicio: string | null | undefined, fim: string | null | undefined) {
  if (!inicio || !fim) return false;
  return fim < inicio;
}
