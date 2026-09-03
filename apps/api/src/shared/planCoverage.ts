// O que o plano do aluno cobre: em quais unidades ele entra, quais atividades
// ele faz e quantas vezes por periodo ele pode vir.
//
// Tudo aqui e funcao pura, sem banco: sao regras de negocio que precisam valer
// IGUAL na catraca, na recepcao e na inscricao em aula. Espalhadas por tres
// handlers, elas divergiriam — e divergencia nessas regras aparece como
// "na catraca ele entra, mas o sistema diz que nao pode".
//
// CONVENCAO CENTRAL, valida para unidades e atividades: lista VAZIA quer dizer
// TUDO, nao NADA. Um plano sem filial marcada vale na rede inteira; um plano
// sem atividade marcada da acesso a todas. E como o cadastro sempre funcionou
// (ver modules/plans/routes.ts, que ja trata `planoEmpresas: none` como plano
// da rede), e inverter isso agora trancaria a porta de todo mundo que nunca
// preencheu essas listas.

export type UnidadeDoPlano = {
  idEmpresa: number;
  boInativo?: boolean;
  empresa?: { dsEmpresa?: string | null } | null;
};

export type AtividadeDoPlano = {
  idAtividade: number;
  /** Quando preenchido, o direito vale so nesta unidade. */
  idEmpresa?: number | null;
  boInativo?: boolean;
  atividade?: { dsAtividade?: string | null } | null;
};

const ativos = <T extends { boInativo?: boolean }>(itens: T[] | null | undefined): T[] =>
  (itens ?? []).filter((item) => item.boInativo !== true);

/** O plano cobre esta unidade? Sem unidade informada, nao ha o que negar. */
export function planoCobreUnidade(
  unidades: UnidadeDoPlano[] | null | undefined,
  idEmpresa: number | null | undefined,
): boolean {
  const lista = ativos(unidades);
  if (lista.length === 0) return true;
  if (!idEmpresa) return true;
  return lista.some((unidade) => unidade.idEmpresa === idEmpresa);
}

/** "Seu plano vale na Filial 1 e na Filial 2." — nomeia onde ele PODE entrar. */
export function motivoForaDaUnidade(unidades: UnidadeDoPlano[] | null | undefined): string {
  const nomes = ativos(unidades)
    .map((unidade) => unidade.empresa?.dsEmpresa?.trim())
    .filter((nome): nome is string => Boolean(nome));

  if (nomes.length === 0) return 'Plano nao cobre esta unidade.';
  if (nomes.length === 1) return `Plano valido apenas na unidade ${nomes[0]}.`;
  return `Plano valido apenas nas unidades: ${nomes.join(', ')}.`;
}

/**
 * O plano cobre esta atividade nesta unidade?
 *
 * A linha do plano pode ser geral (sem idEmpresa) ou presa a uma unidade —
 * "musculacao em qualquer filial, natacao so na Filial 2" e um plano que
 * existe de verdade.
 */
export function planoCobreAtividade(
  atividades: AtividadeDoPlano[] | null | undefined,
  idAtividade: number,
  idEmpresa?: number | null,
): boolean {
  const lista = ativos(atividades);
  if (lista.length === 0) return true;

  return lista.some(
    (item) =>
      item.idAtividade === idAtividade &&
      (item.idEmpresa === null || item.idEmpresa === undefined || item.idEmpresa === idEmpresa),
  );
}

/** Nomeia o que o plano inclui, para a recusa dizer o que fazer em seguida. */
export function motivoForaDoPlano(
  atividades: AtividadeDoPlano[] | null | undefined,
  nomeDaAtividade?: string | null,
): string {
  const nomes = ativos(atividades)
    .map((item) => item.atividade?.dsAtividade?.trim())
    .filter((nome): nome is string => Boolean(nome));

  const alvo = nomeDaAtividade?.trim();
  const inicio = alvo ? `Seu plano nao inclui ${alvo}.` : 'Seu plano nao inclui esta atividade.';
  if (nomes.length === 0) return inicio;

  // Sem repetir: o mesmo esporte costuma aparecer em varias linhas do plano
  // (uma por unidade), e listar "Musculacao, Musculacao, Musculacao" parece bug.
  const unicos = [...new Set(nomes)];
  return `${inicio} Ele da acesso a: ${unicos.join(', ')}.`;
}

// --- frequencia de ACESSO ---------------------------------------------------
//
// CUIDADO COM O NOME: o `Frequencia` do plano (Mensal, Trimestral, Semanal) e o
// CICLO DE COBRANCA — e o que shared/payments.ts usa para gerar parcelas.
// "Semanal" esta gravado la como qtPeriodo 7 / unidade Dia(s), e "Mensal" como
// qtPeriodo 1 / unidade Mes(es). Ler aquilo como "quantas vezes o aluno pode
// vir" acusaria todo mensalista de ter estourado o limite na primeira visita.
//
// Quantas entradas o plano permite e um campo PROPRIO (Plano.qtAcessosPeriodo
// + Plano.cnPeriodoAcesso), nulo por padrao = sem limite.
//
// INFORMATIVA, nao bloqueante (decisao de negocio): passar do limite sinaliza
// para a recepcao, e nao tranca a catraca. Um limite comercial virando porta
// travada poe a discussao no pior lugar possivel — a pessoa de mochila nas
// costas, na frente da fila.

export type PeriodoDeAcesso = 'dia' | 'semana' | 'mes';

export type LimiteDeAcesso = {
  /** Entradas permitidas no periodo. Null = plano sem limite. */
  qtAcessosPeriodo?: number | null;
  cnPeriodoAcesso?: string | null;
};

export type UsoDaFrequencia = {
  limite: number | null;
  /** Entradas ja registradas na janela corrente. */
  usadas: number;
  excedeu: boolean;
  /** Texto curto para a recepcao. Null quando nao ha o que dizer. */
  aviso: string | null;
};

const DIAS_DO_PERIODO: Record<PeriodoDeAcesso, number> = {
  dia: 1,
  semana: 7,
  mes: 30,
};

const NOME_DO_PERIODO: Record<PeriodoDeAcesso, string> = {
  dia: 'no dia',
  semana: 'nos ultimos 7 dias',
  mes: 'nos ultimos 30 dias',
};

export function periodoDeAcesso(valor: string | null | undefined): PeriodoDeAcesso | null {
  const texto = (valor ?? '').trim().toLowerCase();
  if (texto === 'dia' || texto === 'semana' || texto === 'mes') return texto;
  return null;
}

/**
 * Compara as entradas da janela com o limite do plano.
 *
 * `entradas` sao os check-ins PRESENCIAIS do aluno (sessao aberta pelo app nao
 * conta — ver AlunoCheckIn.boPresencial). A janela e MOVEL: "3x por semana"
 * olha os ultimos 7 dias, e nao a semana do calendario, senao quem treina
 * sexta e segunda estouraria sem ter vindo duas vezes em sete dias.
 */
export function avaliarFrequencia(
  limitePlano: LimiteDeAcesso | null | undefined,
  entradas: Date[],
  agora: Date,
): UsoDaFrequencia {
  const vazio: UsoDaFrequencia = { limite: null, usadas: 0, excedeu: false, aviso: null };

  const limite =
    limitePlano?.qtAcessosPeriodo && limitePlano.qtAcessosPeriodo > 0
      ? limitePlano.qtAcessosPeriodo
      : null;
  const periodo = periodoDeAcesso(limitePlano?.cnPeriodoAcesso);
  if (limite === null || periodo === null) return vazio;

  const inicio = new Date(agora.getTime() - DIAS_DO_PERIODO[periodo] * 24 * 60 * 60 * 1000);
  const usadas = entradas.filter((data) => data >= inicio && data <= agora).length;
  const excedeu = usadas >= limite;

  return {
    limite,
    usadas,
    excedeu,
    aviso: excedeu
      ? `Ja usou ${usadas} de ${limite} entradas do plano ${NOME_DO_PERIODO[periodo]}.`
      : null,
  };
}
