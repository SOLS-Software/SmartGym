import { Prisma } from '@solsfit/db';

// As rotas respondiam `error instanceof Error ? error.message : fallback`. Erros do
// Prisma sao Error, entao a excecao inteira chegava ao navegador — incluindo o
// caminho absoluto do arquivo no servidor e o trecho de codigo da query:
//
//   Invalid `tx.empresa.create()` invocation in
//   C:\Dev\SOLSFIT\apps\api\src\modules\companies\routes.ts:391:42
//   ...
//   Unique constraint failed on the fields: (`caCNPJ`)
//
// Alem do vazamento, a mensagem nao dizia nada ao usuario. Aqui os erros de
// negocio (os que a propria API lanca com `throw new Error('Informe o CNPJ.')`)
// seguem passando, os do Prisma viram mensagem de negocio quando dao, e o resto
// cai no fallback generico.

const FIELD_LABELS: Record<string, string> = {
  caCNPJ: 'CNPJ',
  caCPF: 'CPF',
  anEmail: 'e-mail',
  dsEmail: 'e-mail',
  dsLogin: 'login',
  cnUnidade: 'codigo da unidade',
};

function targetFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.map(String);
  }
  if (typeof target === 'string') {
    return [target];
  }

  return [];
}

function describeFields(fields: string[]): string {
  const labels = fields.map((field) => FIELD_LABELS[field] ?? field);

  if (labels.length === 0) {
    return 'valor informado';
  }
  if (labels.length === 1) {
    return labels[0]!;
  }

  return `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}`;
}

/**
 * Mensagem segura para devolver ao cliente. Nunca repassa texto de erro do
 * Prisma; o detalhe fica para o log do servidor (ver `logServerError`).
 */
export function clientErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      // Valor maior que a coluna. Cai aqui quando algum campo escapou dos
      // limites de @solsfit/shared/LIMITES — a rota generica dizia so "Erro ao
      // salvar", sem indicar o campo, e a pessoa reduzia texto no escuro.
      case 'P2000':
        return `O campo ${describeFields(targetFields(error))} excede o tamanho permitido.`;
      // Numero fora da precisao da coluna (ex.: 1000 num Decimal(5,2)).
      case 'P2020':
        return 'Valor numerico fora da faixa permitida para o campo.';
      case 'P2002':
        return `Ja existe um registro com este ${describeFields(targetFields(error))}.`;
      case 'P2003':
        return 'Registro vinculado a outro cadastro. Remova os vinculos antes de continuar.';
      case 'P2025':
        return 'Registro nao encontrado.';
      default:
        return fallback;
    }
  }

  // Qualquer outro erro do Prisma (validacao de schema, panico do engine,
  // inicializacao) carrega detalhe interno na mensagem.
  if (
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return fallback;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}
