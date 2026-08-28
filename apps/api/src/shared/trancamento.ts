// A regra de quando uma matricula esta trancada.
//
// Modulo PURO (sem prisma, sem fastify), pelo mesmo motivo de studentRbac.ts e
// reports/janelas.ts: comparacao de intervalo com limite aberto e onde o erro
// passa despercebido. Um `>` no lugar de `>=` libera a catraca um dia cedo ou
// prende o aluno um dia a mais, e nenhum dos dois aparece em teste manual.
//
// As tres formas de uma pausa terminar:
//
//   1. `dtRetorno` preenchido  -> acabou naquele dia; o aluno volta A PARTIR
//                                 dele (o dia do retorno ja e dia de treino).
//   2. so `dtPrevisaoRetorno`  -> acaba sozinha na data combinada.
//   3. nenhum dos dois         -> segue trancada ate alguem registrar a volta.
//
// A previsao VALER e decisao de projeto, nao descuido. Uma pausa "ate 10/03"
// que ninguem fechou nao pode seguir suspendendo cobranca e bloqueando acesso
// para sempre: o aluno combinou uma data. Quem quer pausa sem prazo deixa a
// previsao em branco — o que e uma escolha explicita, e nao um esquecimento.

/** O minimo que a regra precisa de um registro de trancamento. */
export type TrancamentoLike = {
  dtInicio: Date;
  dtPrevisaoRetorno?: Date | null;
  dtRetorno?: Date | null;
  boInativo?: boolean;
};

// DOIS JEITOS DE LER UMA DATA, E ISSO NAO E DESCUIDO
//
// As colunas de trancamento sao `DATE` — dia de calendario, sem hora e sem
// fuso. O driver do Postgres as entrega como meia-noite UTC: um trancamento
// gravado em 28/08 chega como `2026-08-28T00:00:00Z`. Lido com os getters
// locais no Brasil, isso vira 27/08 as 21h — e a pausa passava a valer um dia
// antes e a liberar um dia antes do combinado.
//
// Entao: o que veio do banco e lido em UTC (e o dia de calendario que foi
// gravado); "agora" e lido em local (e o dia de calendario de quem opera). As
// duas leituras produzem a mesma escala, e so ai da para comparar.

/** Dia de calendario de uma coluna DATE vinda do banco. */
function diaArmazenado(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
}

/** Dia de calendario de um instante local ("hoje", para quem opera). */
function diaLocal(data: Date): number {
  return Date.UTC(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * A pausa cobre `referencia`?
 *
 * Comparacao por DIA, nao por instante: as colunas sao `DATE` e o operador
 * precisa concordar com isso. Sem truncar, um trancamento que comeca hoje so
 * valeria a partir da meia-noite seguinte, e o aluno que acabou de trancar
 * entraria na academia mais uma vez.
 *
 * Intervalo FECHADO no inicio e ABERTO no fim: o dia do retorno ja e dia de
 * treino. Quem volta dia 10 treina dia 10.
 */
export function trancamentoCobre(
  trancamento: TrancamentoLike,
  referencia: Date = new Date(),
): boolean {
  if (trancamento.boInativo) return false;

  const hoje = diaLocal(referencia);
  if (diaArmazenado(trancamento.dtInicio) > hoje) return false;

  if (trancamento.dtRetorno) return diaArmazenado(trancamento.dtRetorno) > hoje;
  if (trancamento.dtPrevisaoRetorno) return diaArmazenado(trancamento.dtPrevisaoRetorno) > hoje;
  return true;
}

/**
 * Converte um dia ARMAZENADO (meia-noite UTC) em uma referencia LOCAL do mesmo
 * dia de calendario.
 *
 * Existe porque as duas escalas nao se misturam impunemente. `trancamentoCobre`
 * espera a referencia em horario local ("agora"), mas quem pergunta "ja ha
 * trancamento no dia X?" costuma ter X vindo do banco ou construido como data
 * de calendario — em UTC. Passar um pelo outro faz a comparacao errar um dia,
 * que foi exatamente como uma matricula conseguiu ser trancada duas vezes.
 *
 * Meio-dia, e nao meia-noite: qualquer fuso entre -11 e +12 cai no mesmo dia.
 */
export function referenciaDoDia(dataArmazenada: Date): Date {
  return new Date(
    dataArmazenada.getUTCFullYear(),
    dataArmazenada.getUTCMonth(),
    dataArmazenada.getUTCDate(),
    12,
  );
}

/**
 * O trancamento vigente numa data, ou null.
 *
 * Devolve o registro (e nao um booleano) porque quem chama quase sempre precisa
 * do motivo e da data de volta para explicar a recusa ao aluno — "plano
 * trancado" sozinho na catraca so gera discussao na recepcao.
 */
export function trancamentoVigente<T extends TrancamentoLike>(
  trancamentos: T[],
  referencia: Date = new Date(),
): T | null {
  return trancamentos.find((t) => trancamentoCobre(t, referencia)) ?? null;
}

/**
 * A pausa ainda vai acontecer? Usado para avisar que existe trancamento
 * agendado — a matricula esta ativa hoje, mas nao estara na semana que vem.
 */
export function trancamentoFuturo(
  trancamento: TrancamentoLike,
  referencia: Date = new Date(),
): boolean {
  if (trancamento.boInativo) return false;
  return diaArmazenado(trancamento.dtInicio) > diaLocal(referencia);
}

/**
 * Quantos dias a pausa durou (ou dura ate hoje).
 *
 * Serve para a pergunta que vem logo depois de existir trancamento: "o contrato
 * deve esticar pelo tempo parado?". O sistema NAO estica nada — prorrogar
 * vigencia e regra comercial de cada academia e ninguem a definiu. Mas o dado
 * para calcular fica gravado, entao o dia em que essa regra existir nao vai
 * precisar de arqueologia.
 */
export function diasDeTrancamento(
  trancamento: TrancamentoLike,
  referencia: Date = new Date(),
): number {
  const temFimGravado = trancamento.dtRetorno ?? trancamento.dtPrevisaoRetorno;
  const fim = temFimGravado ? diaArmazenado(temFimGravado) : diaLocal(referencia);
  const dias = Math.round((fim - diaArmazenado(trancamento.dtInicio)) / 86_400_000);
  return dias > 0 ? dias : 0;
}

/**
 * Motivo legivel da recusa de acesso, com a data de volta quando ela existe.
 * Fica aqui junto da regra para a mensagem nao divergir do que a regra decide.
 */
export function motivoDoTrancamento(trancamento: TrancamentoLike): string {
  const volta = trancamento.dtRetorno ?? trancamento.dtPrevisaoRetorno;
  if (!volta) return 'Plano trancado.';
  // Getters UTC pelo mesmo motivo da regra acima: e uma coluna DATE.
  const dd = `${volta.getUTCDate()}`.padStart(2, '0');
  const mm = `${volta.getUTCMonth() + 1}`.padStart(2, '0');
  return `Plano trancado ate ${dd}/${mm}.`;
}
