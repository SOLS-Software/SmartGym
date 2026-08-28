// Janelas de tempo dos graficos e o encaixe das linhas agregadas nelas.
//
// Modulo PURO (sem prisma, sem fastify), pelo mesmo motivo de studentRbac.ts:
// aritmetica de semana e de mes e onde o erro passa despercebido — um mes a
// mais no laco desloca a serie inteira e o grafico continua parecendo certo.
// Isolado assim, da para testar sem banco.
//
// Convencao de fuso: tudo aqui e HORARIO LOCAL DO SERVIDOR, a mesma que o
// resto do modulo ja usava ao montar o mes corrente com `new Date(ano, mes, 1)`.
// Quem agrupa no Postgres precisa converter para o mesmo fuso antes de truncar
// (ver `fusoDoServidor` em overview.ts), senao os baldes nao batem com estes.

export type Janela = {
  /** Rotulo curto do eixo X ("04/08", "ago"). */
  label: string;
  /** Primeiro instante da janela (00:00:00.000 local). */
  inicio: Date;
  /** Ultimo instante da janela (23:59:59.999 local). */
  fim: Date;
};

/**
 * Linha agregada vinda do banco: inicio do balde + quantidade.
 *
 * `bucket` e STRING (YYYY-MM-DD), formatada no proprio Postgres, e nao um
 * Date — de proposito, e o motivo merece registro porque o bug era invisivel:
 *
 * `date_trunc(... AT TIME ZONE 'America/Sao_Paulo')` devolve `timestamp without
 * time zone` valendo a meia-noite LOCAL. O driver entrega esse valor como se
 * fosse UTC, entao a segunda-feira 13/07 chegava ao Node como
 * `2026-07-13T00:00:00Z` e, lida em horario de Brasilia, virava domingo 12/07
 * as 21h. A chave do balde andava um dia para tras, nunca casava com nenhuma
 * janela, e a serie inteira saia zerada — ao lado de um contador dizendo que
 * havia 8 check-ins no periodo. Grafico vazio nao parece defeito: parece
 * academia parada.
 *
 * Formatar no banco elimina a viagem de ida e volta: o que chega ja e a chave.
 */
export type LinhaAgregada = { bucket: string; total: number };

export const MESES_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/**
 * Chave YYYY-MM-DD em horario LOCAL.
 *
 * Nao use `toISOString()` aqui: ele converte para UTC e, a oeste de Greenwich,
 * a meia-noite local de 1o de agosto vira "2026-07-31" — o balde do mes inteiro
 * cairia no mes anterior.
 */
export function chaveDoDia(data: Date): string {
  const ano = data.getFullYear();
  const mes = `${data.getMonth() + 1}`.padStart(2, '0');
  const dia = `${data.getDate()}`.padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Segunda-feira da semana que contem `data`, a meia-noite. */
function segundaFeiraDe(data: Date): Date {
  const dia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  // getDay(): 0 = domingo. Domingo pertence a semana que comecou 6 dias antes.
  const recuo = dia.getDay() === 0 ? 6 : dia.getDay() - 1;
  dia.setDate(dia.getDate() - recuo);
  return dia;
}

/**
 * As ultimas `quantidade` semanas de CALENDARIO (segunda a domingo), terminando
 * na semana de `referencia`.
 *
 * O codigo do browser usava janelas moveis de 7 dias contadas para tras a partir
 * de hoje, mas rotulava cada uma com a segunda-feira da semana do inicio — o
 * rotulo dizia "semana de 04/08" para um intervalo que comecava numa quarta.
 * Semana de calendario e o que o rotulo ja prometia, e e o que o `date_trunc`
 * do Postgres produz.
 */
export function ultimasSemanas(quantidade: number, referencia: Date = new Date()): Janela[] {
  const janelas: Janela[] = [];
  const semanaAtual = segundaFeiraDe(referencia);

  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const inicio = new Date(semanaAtual);
    inicio.setDate(inicio.getDate() - i * 7);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 6);
    fim.setHours(23, 59, 59, 999);

    const dia = `${inicio.getDate()}`.padStart(2, '0');
    const mes = `${inicio.getMonth() + 1}`.padStart(2, '0');
    janelas.push({ label: `${dia}/${mes}`, inicio, fim });
  }

  return janelas;
}

/**
 * Os ultimos `quantidade` meses de calendario, terminando no mes de
 * `referencia`.
 *
 * Rotulo vem de uma tabela fixa e nao de `toLocaleDateString('pt-BR')`: o
 * servidor pode rodar sem ICU completo e devolver "Aug" no meio de um grafico
 * em portugues.
 */
export function ultimosMeses(quantidade: number, referencia: Date = new Date()): Janela[] {
  const janelas: Janela[] = [];

  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const inicio = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1);
    // Dia 0 do mes seguinte = ultimo dia deste mes, sem tabela de 28/30/31.
    const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0, 23, 59, 59, 999);
    janelas.push({ label: MESES_PT[inicio.getMonth()] ?? '', inicio, fim });
  }

  return janelas;
}

/** Primeiro e ultimo instante cobertos por uma lista de janelas ordenada. */
export function limitesDe(janelas: Janela[]): { inicio: Date; fim: Date } | null {
  const primeira = janelas[0];
  const ultima = janelas[janelas.length - 1];
  if (!primeira || !ultima) return null;
  return { inicio: primeira.inicio, fim: ultima.fim };
}

/**
 * Encaixa as linhas agregadas do banco nas janelas, preservando a ordem e
 * preenchendo com zero o que nao veio.
 *
 * O casamento e por chave YYYY-MM-DD dos dois lados: a do banco vem formatada
 * na consulta (ver LinhaAgregada) e a da janela sai de `chaveDoDia`. Nenhum
 * `Date` cruza a fronteira, entao nao ha fuso para errar. Baldes fora das
 * janelas sao ignorados em silencio — a consulta ja limita o periodo, entao
 * sobra e ruido.
 */
export function encaixar(janelas: Janela[], linhas: LinhaAgregada[]) {
  const porChave = new Map<string, number>();
  for (const linha of linhas) {
    porChave.set(linha.bucket, (porChave.get(linha.bucket) ?? 0) + Number(linha.total ?? 0));
  }

  return janelas.map((janela) => ({
    label: janela.label,
    value: porChave.get(chaveDoDia(janela.inicio)) ?? 0,
  }));
}
