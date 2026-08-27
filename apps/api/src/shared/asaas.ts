// Leitura e verificacao de eventos do Asaas.
//
// A PARTE PURA fica aqui, e e proposital: o que este modulo decide e se um POST
// que chegou da internet pode marcar dinheiro como recebido. Isso precisa de
// teste rodando sem rede e sem banco, com payload montado a mao — inclusive os
// payloads maliciosos, que sao os que ninguem consegue produzir contra um
// sandbox.
//
// O QUE ESTE MODULO NAO FAZ: nao confia no corpo. Ele extrai o que o evento diz
// e classifica; QUEM confirma o valor e o status e uma consulta de volta ao
// provedor (`fetchAsaasPayment`), porque o corpo de um webhook e apenas o que
// alguem postou na nossa URL.
import { timingSafeEqual } from 'node:crypto';

/** Ambiente do Asaas. A URL muda; o resto do contrato, nao. */
const BASE_URL = {
  producao: 'https://api.asaas.com/v3',
  sandbox: 'https://api-sandbox.asaas.com/v3',
} as const;

export type AsaasEnvironment = keyof typeof BASE_URL;

/**
 * O que fazer com o evento.
 *
 * `ignorar` nao e erro: o Asaas avisa de coisas que nao mudam nada para nos
 * (cobranca criada, cobranca visualizada). Trata-las como falha encheria o log
 * de ruido e esconderia o que importa.
 */
export type EventAction = 'confirmar' | 'estornar' | 'ignorar';

export type AsaasEvent = {
  /** Id do evento, para deduplicar reenvio. */
  idEvento: string | null;
  tipo: string;
  /** Id da cobranca no Asaas — liga o evento ao nosso Pagamento. */
  idCobranca: string | null;
  /** O que mandamos como referencia ao emitir: o id do nosso Pagamento. */
  referenciaExterna: string | null;
  /** Valor que o evento DIZ ter sido pago. Nao e fonte de verdade. */
  vlInformado: number | null;
  acao: EventAction;
};

/**
 * Eventos que confirmam entrada de dinheiro.
 *
 * `PAYMENT_RECEIVED` e o dinheiro na conta; `PAYMENT_CONFIRMED` e a confirmacao
 * do cartao antes da liquidacao. Os dois valem como "pagou" para a academia —
 * o aluno nao deve ficar bloqueado esperando a liquidacao do cartao.
 */
const EVENTOS_CONFIRMAM = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);

/**
 * Eventos que desfazem: estorno, chargeback, exclusao da cobranca.
 *
 * Precisam existir desde o inicio. Uma integracao que so sabe confirmar deixa
 * como paga uma parcela que foi estornada, e o erro so aparece na conciliacao
 * do mes — quando o aluno ja treinou o mes inteiro de graca.
 */
const EVENTOS_ESTORNAM = new Set([
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_DELETED',
  'PAYMENT_RESTORED',
  'PAYMENT_REVERSED',
]);

/** Status do Asaas que significam dinheiro recebido. */
const STATUS_PAGOS = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

export function isPaidStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && STATUS_PAGOS.has(status.toUpperCase());
}

/**
 * Compara o token do webhook sem vazar tempo.
 *
 * Comparacao com `===` retorna mais rapido quanto mais cedo os textos divergem,
 * e isso permite descobrir o token caractere por caractere. O custo de fazer
 * certo e uma linha.
 */
export function tokensMatch(recebido: unknown, esperado: string | null | undefined): boolean {
  if (typeof recebido !== 'string' || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` exige o mesmo tamanho; tamanho diferente ja e diferente,
  // e o tamanho do token nao e segredo.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Le o corpo do webhook.
 *
 * Tolerante a formato: o Asaas ja mudou a forma do envelope entre versoes, e um
 * parser rigido transformaria uma mudanca deles numa fila de eventos perdidos.
 * O que nao e tolerante e o que vem DEPOIS — a confirmacao contra a API.
 */
export function parseAsaasEvent(payload: unknown): AsaasEvent {
  const corpo = (payload ?? {}) as Record<string, unknown>;
  const cobranca = (corpo.payment ?? {}) as Record<string, unknown>;

  const tipo = toText(corpo.event) ?? '';
  const tipoNormalizado = tipo.toUpperCase();

  return {
    idEvento: toText(corpo.id),
    tipo: tipoNormalizado,
    idCobranca: toText(cobranca.id),
    referenciaExterna: toText(cobranca.externalReference),
    vlInformado: toNumber(cobranca.value) ?? toNumber(cobranca.netValue),
    acao: EVENTOS_CONFIRMAM.has(tipoNormalizado)
      ? 'confirmar'
      : EVENTOS_ESTORNAM.has(tipoNormalizado)
        ? 'estornar'
        : 'ignorar',
  };
}

export type AsaasPayment = {
  id: string;
  status: string;
  value: number | null;
  /** Valor efetivamente recebido, quando o Asaas informa. */
  netValue: number | null;
  externalReference: string | null;
};

/**
 * Consulta a cobranca no Asaas.
 *
 * E ISTO que torna o webhook confiavel. O corpo do POST e so um aviso de que
 * algo mudou; o estado real vem daqui, autenticado com a credencial da conta.
 * Sem esta volta, forjar um POST na nossa URL seria suficiente para quitar
 * qualquer mensalidade.
 *
 * NAO TESTADO CONTRA A API REAL ate existir uma conta sandbox — e a unica parte
 * do fluxo que depende de credencial.
 */
export async function fetchAsaasPayment(
  credencial: string,
  idCobranca: string,
  ambiente: AsaasEnvironment,
): Promise<AsaasPayment | null> {
  const response = await fetch(`${BASE_URL[ambiente]}/payments/${encodeURIComponent(idCobranca)}`, {
    headers: { access_token: credencial, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  // 404 = cobranca que nao e desta conta (ou nao existe). Nao e erro de rede:
  // e a resposta que impede o evento forjado de virar baixa.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Asaas respondeu ${response.status}`);

  const corpo = (await response.json()) as Record<string, unknown>;
  return {
    id: String(corpo.id ?? ''),
    status: String(corpo.status ?? ''),
    value: toNumber(corpo.value),
    netValue: toNumber(corpo.netValue),
    externalReference: toText(corpo.externalReference),
  };
}

// ---------------------------------------------------------------------------
// EMISSAO
//
// A partir daqui e o lado que CRIA cobranca no provedor. As funcoes que montam
// o pedido sao puras e testadas; as que falam com a rede nao foram exercitadas
// contra a API real — nao existe conta ainda. Essa fronteira e proposital: o
// que da para provar sem credencial esta provado.
// ---------------------------------------------------------------------------

export type AsaasCustomerInput = {
  nome: string;
  /** CPF do aluno, so digitos. O provedor exige identificar quem paga. */
  cpf: string;
  email?: string | null;
  telefone?: string | null;
  /** Nosso id do aluno, para reconhece-lo no painel do provedor. */
  referencia: string;
};

/**
 * Corpo do cadastro de cliente no Asaas.
 *
 * ATENCAO AO QUE SAI DAQUI: nome, CPF e contato do aluno vao para um terceiro.
 * E inevitavel — cobranca no Brasil exige identificar o pagador — mas e uma
 * transferencia de dado pessoal, e quem opera a academia precisa saber disso.
 * Mandamos o MINIMO: nada de endereco, nascimento ou qualquer outro campo que
 * o provedor aceitaria mas nao precisa para cobrar.
 */
export function buildCustomerPayload(input: AsaasCustomerInput) {
  const cpf = (input.cpf ?? '').replace(/\D/g, '');
  if (cpf.length !== 11) throw new Error('CPF do aluno invalido para emitir cobranca.');

  const nome = (input.nome ?? '').trim();
  if (!nome) throw new Error('Aluno sem nome para emitir cobranca.');

  const telefone = (input.telefone ?? '').replace(/\D/g, '');
  const email = (input.email ?? '').trim().toLowerCase();

  return {
    name: nome,
    cpfCnpj: cpf,
    // Campos opcionais so entram quando ha valor: mandar string vazia faz o
    // Asaas recusar o cadastro inteiro por "formato invalido".
    ...(email ? { email } : {}),
    ...(telefone.length >= 10 ? { mobilePhone: telefone } : {}),
    externalReference: input.referencia,
    notificationDisabled: true,
  };
}

export type AsaasBillingType = 'PIX' | 'BOLETO' | 'UNDEFINED';

export type AsaasPaymentInput = {
  idClienteExterno: string;
  valor: number;
  vencimento: Date;
  /** Id do NOSSO Pagamento — volta no webhook e casa os dois lados. */
  referencia: string;
  descricao?: string | null;
  formaCobranca?: AsaasBillingType;
};

/** Data no formato que o Asaas espera (YYYY-MM-DD), em horario LOCAL.
 *  `toISOString` daria o dia em UTC e venceria a cobranca um dia antes. */
export function formatDueDate(date: Date): string {
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mes}-${dia}`;
}

/**
 * Corpo da cobranca.
 *
 * `externalReference` carrega o id do nosso Pagamento — e o que permite ao
 * webhook casar o evento mesmo se a gravacao do id do provedor tiver falhado
 * do nosso lado. Duas pontas de casamento, nao uma.
 */
export function buildPaymentPayload(input: AsaasPaymentInput) {
  const valor = Number(input.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Valor invalido para emitir cobranca.');
  }
  if (Number.isNaN(input.vencimento.getTime())) {
    throw new Error('Vencimento invalido para emitir cobranca.');
  }

  return {
    customer: input.idClienteExterno,
    billingType: input.formaCobranca ?? 'PIX',
    // Centavos: o Asaas recusa mais de duas casas, e float cru as produz.
    value: Math.round(valor * 100) / 100,
    dueDate: formatDueDate(input.vencimento),
    externalReference: input.referencia,
    ...(input.descricao ? { description: input.descricao.slice(0, 500) } : {}),
  };
}

/** Chamada autenticada ao Asaas. Centralizada para o tratamento de erro nao
 *  divergir entre os verbos. */
async function asaasRequest(
  credencial: string,
  ambiente: AsaasEnvironment,
  caminho: string,
  init?: { method?: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE_URL[ambiente]}${caminho}`, {
    method: init?.method ?? 'GET',
    headers: {
      access_token: credencial,
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(12_000),
  });

  const texto = await response.text();
  let corpo: Record<string, unknown> = {};
  try {
    corpo = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    corpo = {};
  }

  if (!response.ok) {
    // O Asaas devolve os motivos em `errors[].description`. Repassar o motivo
    // e o que evita "erro ao gerar cobranca" sem explicacao na tela.
    const erros = Array.isArray(corpo.errors) ? corpo.errors : [];
    const detalhe = erros
      .map((erro) => (erro as { description?: string })?.description)
      .filter(Boolean)
      .join('; ');
    throw new Error(detalhe || `Asaas respondeu ${response.status}`);
  }

  return corpo;
}

/**
 * Acha ou cria o cliente no Asaas.
 *
 * Busca por CPF ANTES de criar: a conta da academia pode ja ter o aluno de um
 * cadastro anterior, e criar de novo produziria dois clientes com o mesmo CPF —
 * o Asaas aceita, e o painel fica com a cobranca dividida entre os dois.
 */
export async function ensureAsaasCustomer(
  credencial: string,
  ambiente: AsaasEnvironment,
  input: AsaasCustomerInput,
): Promise<string> {
  const payload = buildCustomerPayload(input);

  const existente = await asaasRequest(
    credencial,
    ambiente,
    `/customers?cpfCnpj=${encodeURIComponent(payload.cpfCnpj)}`,
  );
  const lista = Array.isArray(existente.data) ? existente.data : [];
  const achado = lista[0] as { id?: string } | undefined;
  if (achado?.id) return achado.id;

  const criado = await asaasRequest(credencial, ambiente, '/customers', {
    method: 'POST',
    body: payload,
  });
  const id = typeof criado.id === 'string' ? criado.id : null;
  if (!id) throw new Error('O provedor nao devolveu o id do cliente.');
  return id;
}

export type AsaasCharge = {
  id: string;
  status: string;
  /** Pagina de pagamento do Asaas, para quem prefere abrir no navegador. */
  invoiceUrl: string | null;
};

export async function createAsaasPayment(
  credencial: string,
  ambiente: AsaasEnvironment,
  input: AsaasPaymentInput,
): Promise<AsaasCharge> {
  const corpo = await asaasRequest(credencial, ambiente, '/payments', {
    method: 'POST',
    body: buildPaymentPayload(input),
  });
  const id = typeof corpo.id === 'string' ? corpo.id : null;
  if (!id) throw new Error('O provedor nao devolveu o id da cobranca.');
  return {
    id,
    status: String(corpo.status ?? ''),
    invoiceUrl: typeof corpo.invoiceUrl === 'string' ? corpo.invoiceUrl : null,
  };
}

/** Codigo Pix copia e cola da cobranca, gerado pelo provedor. */
export async function fetchAsaasPixCode(
  credencial: string,
  ambiente: AsaasEnvironment,
  idCobranca: string,
): Promise<string | null> {
  const corpo = await asaasRequest(
    credencial,
    ambiente,
    `/payments/${encodeURIComponent(idCobranca)}/pixQrCode`,
  );
  return typeof corpo.payload === 'string' ? corpo.payload : null;
}
