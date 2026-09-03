// Saldo dos direitos que a matricula da: "1 camiseta na assinatura", "1
// avaliacao por mes", "2 passes de convidado por ano".
//
// Funcao pura, sem banco, porque e a conta que decide se a recepcao pode
// entregar. O erro que interessa evitar aqui e o silencioso: contar uso de
// outra janela e deixar entregar duas vezes, ou contar demais e recusar um
// direito que o aluno ainda tem.

export type JanelaDoBeneficio = 'matricula' | 'mes' | 'ano';

export type BeneficioDoPlano = {
  id: number;
  cnTipo: string;
  dsBeneficio: string;
  qtLimite: number;
  cnJanela: string;
  boInativo?: boolean;
  idEmpresa?: number | null;
  produto?: { id: number; dsProduto?: string | null } | null;
};

export type UsoDoBeneficio = {
  idPlanoBeneficio: number;
  qtUsada: number;
  dtUso: Date;
  boInativo?: boolean;
};

export type SaldoDoBeneficio = {
  idPlanoBeneficio: number;
  descricao: string;
  cnTipo: string;
  /**
   * Produto do direito, quando cnTipo = 'produto'. Vai no saldo porque e por
   * ele que o balcao casa a venda com o direito — sem isto a tela de vendas
   * nunca reconheceria que aquele produto ja e do aluno.
   */
  idProduto: number | null;
  limite: number;
  usadas: number;
  restantes: number;
  podeUsar: boolean;
  /** "por matricula", "neste mes", "neste ano" — para a tela dizer o porque. */
  janela: string;
};

const NOME_DA_JANELA: Record<JanelaDoBeneficio, string> = {
  matricula: 'por matrícula',
  mes: 'neste mês',
  ano: 'neste ano',
};

export function janelaDoBeneficio(valor: string | null | undefined): JanelaDoBeneficio | null {
  const texto = (valor ?? '').trim().toLowerCase();
  if (texto === 'matricula' || texto === 'mes' || texto === 'ano') return texto;
  return null;
}

/**
 * Inicio da janela corrente. Null = conta desde sempre (janela "matricula",
 * que dura o que a matricula durar).
 *
 * Mes e ano sao de CALENDARIO, nao janela movel: "uma avaliacao por mes" quer
 * dizer uma em setembro e outra em outubro. Janela movel de 30 dias faria o
 * aluno que avaliou dia 28 esperar ate o dia 28 seguinte — e ninguem entende
 * esse "nao" no balcao.
 */
export function inicioDaJanela(
  janela: JanelaDoBeneficio,
  agora: Date,
): Date | null {
  if (janela === 'matricula') return null;
  if (janela === 'mes') return new Date(agora.getFullYear(), agora.getMonth(), 1);
  return new Date(agora.getFullYear(), 0, 1);
}

/**
 * Quanto sobrou de UM beneficio.
 *
 * `usos` sao os usos DESTA matricula (a consulta ja filtra por idAlunoPlano) —
 * e o que faz a janela "matricula" significar "uma vez por contrato" em vez de
 * "uma vez na vida".
 */
export function saldoDoBeneficio(
  beneficio: BeneficioDoPlano,
  usos: UsoDoBeneficio[],
  agora: Date,
): SaldoDoBeneficio {
  const janela = janelaDoBeneficio(beneficio.cnJanela) ?? 'matricula';
  const inicio = inicioDaJanela(janela, agora);

  const limite = Number.isFinite(beneficio.qtLimite) && beneficio.qtLimite > 0
    ? beneficio.qtLimite
    : 0;

  const usadas = usos
    .filter(
      (uso) =>
        uso.boInativo !== true &&
        uso.idPlanoBeneficio === beneficio.id &&
        (inicio === null || uso.dtUso >= inicio),
    )
    .reduce((total, uso) => total + (Number.isFinite(uso.qtUsada) ? uso.qtUsada : 1), 0);

  const restantes = Math.max(limite - usadas, 0);

  return {
    idPlanoBeneficio: beneficio.id,
    idProduto: beneficio.produto?.id ?? null,
    descricao:
      beneficio.dsBeneficio?.trim() ||
      beneficio.produto?.dsProduto?.trim() ||
      'Benefício do plano',
    cnTipo: beneficio.cnTipo,
    limite,
    usadas,
    restantes,
    // Beneficio inativo nao entrega mais, mas continua aparecendo com o que ja
    // foi usado — apagar o historico e pior do que mostrar um direito extinto.
    podeUsar: beneficio.boInativo !== true && restantes > 0,
    janela: NOME_DA_JANELA[janela],
  };
}

/** O saldo de todos os beneficios do plano, na ordem em que foram cadastrados. */
export function saldosDoPlano(
  beneficios: BeneficioDoPlano[],
  usos: UsoDoBeneficio[],
  agora: Date,
): SaldoDoBeneficio[] {
  return beneficios.map((beneficio) => saldoDoBeneficio(beneficio, usos, agora));
}

/**
 * Qual direito cobre ESTE produto, e ele cobre a quantidade inteira?
 *
 * Devolve o beneficio elegivel ou o motivo de nao dar. Quantidade parcial e
 * recusada de proposito: metade cortesia, metade venda numa linha so exigiria
 * dividir a movimentacao e a cobranca, e ninguem pediu isso — melhor o balcao
 * fazer duas operacoes e o relatorio ficar legivel.
 */
export function escolherBeneficioDeProduto(
  saldos: SaldoDoBeneficio[],
  beneficios: BeneficioDoPlano[],
  idProduto: number,
  quantidade: number,
): { saldo: SaldoDoBeneficio } | { motivo: string } {
  const doProduto = beneficios.filter(
    (beneficio) =>
      beneficio.boInativo !== true &&
      beneficio.cnTipo === 'produto' &&
      beneficio.produto?.id === idProduto,
  );

  if (doProduto.length === 0) {
    return { motivo: 'O plano do aluno nao inclui este produto.' };
  }

  const candidatos = doProduto
    .map((beneficio) => saldos.find((saldo) => saldo.idPlanoBeneficio === beneficio.id))
    .filter((saldo): saldo is SaldoDoBeneficio => Boolean(saldo));

  const disponivel = candidatos.find((saldo) => saldo.podeUsar && saldo.restantes >= quantidade);
  if (disponivel) return { saldo: disponivel };

  const parcial = candidatos.find((saldo) => saldo.podeUsar);
  if (parcial) {
    return {
      motivo: `O plano cobre ${parcial.restantes} unidade(s) ${parcial.janela}. Ajuste a quantidade.`,
    };
  }

  const usado = candidatos[0];
  return {
    motivo: usado
      ? `${usado.descricao}: ja usou ${usado.usadas} de ${usado.limite} ${usado.janela}.`
      : 'O plano do aluno nao inclui este produto.',
  };
}
