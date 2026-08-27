// Codigo Pix "copia e cola" (BR Code), padrao EMV QRCPS-MPM do Banco Central.
//
// Modulo puro, sem prisma e sem rede — e o unico jeito de testar isto de
// verdade. O formato se confere sozinho: os quatro ultimos caracteres sao um
// CRC-16 sobre todo o resto, entao um payload montado errado NAO fecha a conta.
// E o oposto de uma integracao com gateway, que so se prova contra o servico.
//
// COMO O FORMATO FUNCIONA: e uma sequencia de campos TLV — dois digitos de ID,
// dois digitos de TAMANHO, e o valor. Campos podem conter outros campos (o 26 e
// o 62 sao "templates"). O tamanho e do VALOR, sempre com dois digitos.
//
// LIMITE QUE MORDE: os bancos leem isto como ASCII. Nome com acento ou string
// maior que o limite fazem o app do banco recusar o codigo — nao com erro
// explicativo, mas com um "QR invalido" generico. Por isso sanitizamos aqui e
// nao na tela: quem monta o payload e quem sabe as regras.

/** Identificador do arranjo Pix dentro do campo 26. */
const GUI_PIX = 'br.gov.bcb.pix';

/** Real brasileiro (ISO 4217). */
const MOEDA_BRL = '986';

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export type PixPayloadInput = {
  chave: string;
  /** Nome de quem recebe. Ate 25 caracteres, sem acento (limite do padrao). */
  nomeBeneficiario: string;
  /** Cidade de quem recebe. Ate 15 caracteres, sem acento. */
  cidade: string;
  /** Valor em reais. Omitido = o pagador digita quanto quer pagar. */
  valor?: number | null;
  /** Referencia da cobranca; vira `***` quando ausente. Ate 25 alfanumericos. */
  txid?: string | null;
};

/**
 * Um campo TLV: id + tamanho (2 digitos) + valor.
 *
 * O tamanho conta CARACTERES do valor. Como tudo aqui e ASCII depois da
 * sanitizacao, caractere e byte — se algum dia entrar UTF-8 de verdade, esta
 * conta passa a mentir e o CRC de quem le nao vai fechar.
 */
function field(id: string, value: string): string {
  const tamanho = String(value.length).padStart(2, '0');
  return `${id}${tamanho}${value}`;
}

/**
 * Remove acento, controla o alfabeto e corta no limite.
 *
 * Sem isto, "José da Silva Academia" vira codigo que o app do banco recusa —
 * e a recusa nao diz o motivo, entao o problema chega como "o Pix nao
 * funciona".
 */
export function sanitizeText(value: string, max: number): string {
  return value
    .normalize('NFD')
    // Tira os diacriticos separados pelo NFD (á -> a + acento).
    .replace(/\p{Diacritic}/gu, '')
    // O que sobrar fora do ASCII imprimivel nao tem representacao segura.
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

/**
 * Referencia da cobranca (txid).
 *
 * So alfanumerico, ate 25. `***` e o valor que o padrao reserva para "sem
 * referencia" — string vazia nao vale, o campo tem que existir.
 */
export function sanitizeTxid(value: string | null | undefined): string {
  const limpo = (value ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
  return limpo || '***';
}

/**
 * Valor no formato do padrao: ponto decimal, duas casas, sem separador de
 * milhar. `1234.5` vira `1234.50`.
 */
export function formatAmount(valor: number): string {
  return valor.toFixed(2);
}

/**
 * CRC-16/CCITT-FALSE — polinomio 0x1021, inicial 0xFFFF, sem XOR final.
 *
 * E o que valida o codigo inteiro. Calculado sobre todo o payload JA COM
 * `6304` no fim (o proprio cabecalho do campo entra na conta), e o resultado
 * sao 4 hexadecimais MAIUSCULOS.
 */
export function crc16(payload: string): string {
  let crc = 0xffff;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Normaliza a chave para o formato que o Pix espera dentro do codigo.
 *
 * Telefone vai em formato internacional e CPF/CNPJ so com digitos. A chave e
 * gravada ja normalizada (ver modules/paymentAccounts), mas normalizar de novo
 * aqui torna a funcao usavel sozinha e cobre dado antigo.
 */
export function normalizePixKey(chave: string, tipo: PixKeyType): string {
  const valor = chave.trim();

  if (tipo === 'cpf' || tipo === 'cnpj') return valor.replace(/\D/g, '');
  if (tipo === 'telefone') {
    const digitos = valor.replace(/\D/g, '');
    if (valor.startsWith('+')) return `+${digitos}`;
    // Sem DDI: assume Brasil, que e o unico pais do arranjo.
    return `+55${digitos.replace(/^55/, '')}`;
  }
  if (tipo === 'email') return valor.toLowerCase();
  return valor.toLowerCase();
}

/**
 * Monta o codigo Pix copia e cola.
 *
 * NAO inclui o campo 01 (Point of Initiation Method) de proposito: ausente, o
 * padrao trata o codigo como estatico, que e a leitura mais compativel entre os
 * bancos. Marcar "uso unico" ali nao impede o pagamento em dobro de verdade —
 * quem controla isso e a baixa da parcela.
 */
export function buildPixPayload(input: PixPayloadInput): string {
  const chave = input.chave.trim();
  if (!chave) throw new Error('Chave Pix ausente.');

  const nome = sanitizeText(input.nomeBeneficiario, 25);
  if (!nome) throw new Error('Nome do beneficiario ausente.');

  const cidade = sanitizeText(input.cidade, 15);
  if (!cidade) throw new Error('Cidade do beneficiario ausente.');

  // Campo 26: as informacoes do arranjo Pix, aninhadas.
  const contaPix = field('00', GUI_PIX) + field('01', chave);

  let payload =
    field('00', '01') +
    field('26', contaPix) +
    // 0000 = "sem categoria". Academia nao tem MCC exigido pelo arranjo.
    field('52', '0000') +
    field('53', MOEDA_BRL);

  // Valor e OPCIONAL. Ausente, o app do banco pede o valor ao pagador — e o que
  // se quer quando a cobranca ainda nao tem numero fechado.
  if (input.valor !== null && input.valor !== undefined) {
    if (!Number.isFinite(input.valor) || input.valor <= 0) {
      throw new Error('Valor do Pix deve ser maior que zero.');
    }
    payload += field('54', formatAmount(input.valor));
  }

  payload +=
    field('58', 'BR') +
    field('59', nome) +
    field('60', cidade) +
    // Campo 62: dados adicionais. O 05 e a referencia da cobranca.
    field('62', field('05', sanitizeTxid(input.txid)));

  // O CRC entra por ultimo e cobre inclusive o proprio "6304".
  const comCabecalhoDoCrc = `${payload}6304`;
  return comCabecalhoDoCrc + crc16(comCabecalhoDoCrc);
}

/**
 * Confere um codigo pronto: o CRC declarado bate com o calculado?
 *
 * Serve de auto-teste — a rota chama antes de devolver, para nunca entregar ao
 * aluno um codigo que o banco vai recusar.
 */
export function isValidPixPayload(codigo: string): boolean {
  if (codigo.length < 8) return false;
  const corpo = codigo.slice(0, -4);
  const declarado = codigo.slice(-4).toUpperCase();
  if (!corpo.endsWith('6304')) return false;
  return crc16(corpo) === declarado;
}
