// Espelho de ponto: transforma batidas soltas em dias com pares e total.
//
// Modulo puro (sem prisma), pelo mesmo motivo de loyalty.ts e permissions.ts:
// e conta de hora trabalhada, e conta de hora errada nao aparece em teste de
// integracao — aparece no contracheque.
//
// O QUE ESTE MODULO NAO FAZ: nao calcula atraso, hora extra, falta nem banco
// de horas. Isso exige escala prevista e tolerancia, que sao regras do
// contrato de cada academia e nao existem no sistema. Aqui se emparelha o que
// foi batido e se soma o intervalo; o julgamento e do gerente.

export type PunchType = 'entrada' | 'saida';

export type Punch = {
  id: number;
  cnTipo: string;
  dtRegistro: Date | string;
  boManual?: boolean;
  dsObservacao?: string | null;
};

export type PunchPair = {
  entrada: Punch | null;
  saida: Punch | null;
  minutos: number;
};

export type DaySheet = {
  /** Dia local no formato YYYY-MM-DD — chave estavel para agrupar e ordenar. */
  dia: string;
  batidas: Punch[];
  pares: PunchPair[];
  minutos: number;
  /** Ha uma entrada sem saida: o dia ainda esta correndo ou faltou bater. */
  aberto: boolean;
  /** Uma saida sem entrada antes dela — batida esquecida, precisa de correcao. */
  inconsistente: boolean;
};

export type TimeSheet = {
  dias: DaySheet[];
  totalMinutos: number;
  diasTrabalhados: number;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Chave do dia LOCAL. `toISOString` daria o dia em UTC e jogaria a batida
 *  das 22h de um dia para o dia seguinte no fuso do Brasil. */
export function dayKey(value: Date | string): string {
  const date = toDate(value);
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mes}-${dia}`;
}

/**
 * Qual e a proxima batida, dada a ultima do dia.
 *
 * O SERVIDOR decide, e nao o botao da tela: se o cliente escolhesse, um clique
 * duplo gravaria duas entradas seguidas e o dia inteiro sairia errado.
 */
export function nextPunchType(ultima: Punch | null | undefined): PunchType {
  return ultima?.cnTipo === 'entrada' ? 'saida' : 'entrada';
}

/**
 * Agrupa as batidas por dia e emparelha entrada com saida.
 *
 * Uma saida sem entrada NAO e descartada: vira um par com entrada nula e
 * marca o dia como inconsistente. Sumir com a batida esconderia justamente o
 * caso que precisa da correcao do gerente.
 *
 * TURNO QUE VIRA O DIA (entra 22h, sai 6h) aparece como dois dias — um aberto
 * e um inconsistente. E deliberado: fechar o par por cima da meia-noite
 * exigiria supor a duracao maxima de um turno, que e regra de contrato.
 */
export function buildTimeSheet(punches: Punch[]): TimeSheet {
  const ordenadas = [...punches].sort(
    (a, b) => toDate(a.dtRegistro).getTime() - toDate(b.dtRegistro).getTime(),
  );

  const porDia = new Map<string, Punch[]>();
  for (const batida of ordenadas) {
    const chave = dayKey(batida.dtRegistro);
    const lista = porDia.get(chave);
    if (lista) lista.push(batida);
    else porDia.set(chave, [batida]);
  }

  const dias: DaySheet[] = [];

  for (const [dia, batidas] of porDia) {
    const pares: PunchPair[] = [];
    let aberta: Punch | null = null;
    let inconsistente = false;

    for (const batida of batidas) {
      if (batida.cnTipo === 'entrada') {
        // Entrada com outra entrada ja aberta: a anterior ficou sem saida.
        if (aberta) {
          pares.push({ entrada: aberta, saida: null, minutos: 0 });
          inconsistente = true;
        }
        aberta = batida;
        continue;
      }

      if (aberta) {
        const minutos = Math.max(
          0,
          Math.round(
            (toDate(batida.dtRegistro).getTime() - toDate(aberta.dtRegistro).getTime()) / 60000,
          ),
        );
        pares.push({ entrada: aberta, saida: batida, minutos });
        aberta = null;
      } else {
        pares.push({ entrada: null, saida: batida, minutos: 0 });
        inconsistente = true;
      }
    }

    if (aberta) pares.push({ entrada: aberta, saida: null, minutos: 0 });

    dias.push({
      dia,
      batidas,
      pares,
      minutos: pares.reduce((total, par) => total + par.minutos, 0),
      aberto: aberta !== null,
      inconsistente,
    });
  }

  // Mais recente primeiro: quem abre o espelho quer ver hoje, nao o dia 1.
  dias.sort((a, b) => b.dia.localeCompare(a.dia));

  return {
    dias,
    totalMinutos: dias.reduce((total, dia) => total + dia.minutos, 0),
    // So conta o dia que rendeu tempo fechado — dia com uma batida solta ainda
    // nao e dia trabalhado, e um dia.
    diasTrabalhados: dias.filter((dia) => dia.minutos > 0).length,
  };
}

/** "7h35" a partir de minutos. Formatar no servidor mantem o espelho, o
 *  relatorio e um eventual export dizendo a mesma coisa. */
export function formatMinutes(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas}h${String(resto).padStart(2, '0')}`;
}
