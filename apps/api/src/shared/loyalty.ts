// Fidelidade: ponto unico de verdade do saldo e dos lancamentos de pontos.
//
// Qualquer feature que precise creditar, debitar ou consultar pontos chama
// daqui — do mesmo jeito que "esse aluno pode treinar hoje?" so existe em
// shared/studentAccess.ts. Espalhar o calculo de saldo pelas rotas e como a
// fidelidade acabaria com dois numeros diferentes na mesma tela.
//
// MODELO: tb_AlunoPontuacoes e um EXTRATO, nao um saldo mutavel. Cada linha tem
// o movimento (`qtPontos`, negativo em resgate) e o saldo depois dele
// (`qtDisponivel`) — mesmo idioma de ProdutoMovimentacao/Produto.qtEstoque, que
// o projeto ja usa para estoque. O saldo corrente e o `qtDisponivel` do
// lancamento mais recente.
//
// ESCOPO DO SALDO: por (aluno, EMPRESA), nao por rede. A coluna idEmpresa e
// obrigatoria no modelo e o custo do brinde e da filial que o concedeu; ponto
// ganho na filial A nao resgata na B. Se algum dia a regra virar "vale na rede
// inteira", muda aqui e nas duas queries abaixo — nao em cada tela.
import type { PrismaLike } from './payments.js';

export type PointsEntry = {
  idAluno: number;
  idEmpresa: number;
  /** Movimento: positivo credita, negativo resgata. Zero e recusado. */
  qtPontos: number;
  /** Regra de ganho que originou o credito (nulo em resgate/baixa avulsa). */
  idPontuacao?: number | null;
  /** Check-in que gerou o credito automatico. Unico: nunca credita duas vezes. */
  idAlunoCheckIn?: number | null;
  /** Venda cujo pagamento foi em pontos. */
  idProdutoMovimentacao?: number | null;
  dsHistorico?: string | null;
};

/**
 * Saldo atual do aluno na empresa. Le o `qtDisponivel` do ultimo lancamento em
 * vez de somar a coluna de movimento: com o saldo gravado em cada linha, a
 * consulta e uma leitura indexada, e o extrato exibido bate exatamente com o
 * numero do topo da tela.
 */
export async function getPointsBalance(
  db: PrismaLike,
  idAluno: number,
  idEmpresa: number,
): Promise<number> {
  const last = await db.alunoPontuacao.findFirst({
    where: { idAluno, idEmpresa, boInativo: false },
    orderBy: [{ dtCadastro: 'desc' }, { id: 'desc' }],
    select: { qtDisponivel: true },
  });
  return last?.qtDisponivel ?? 0;
}

/**
 * Grava um lancamento e devolve o registro criado.
 *
 * Recusa debito maior que o saldo: sem isso o extrato aceitaria saldo negativo,
 * e "voce tem -30 pontos" nao e uma frase que a recepcao consiga explicar.
 *
 * CONCORRENCIA: le o saldo e grava em seguida. Duas gravacoes simultaneas para
 * o MESMO aluno poderiam partir do mesmo saldo — na pratica os lancamentos sao
 * serializados por uma pessoa no balcao, e o caso que realmente importa (o
 * mesmo check-in creditar duas vezes) e impedido pelo indice unico em
 * idAlunoCheckIn, no banco. Chame sempre dentro da transacao de quem originou
 * o lancamento, para o ponto e o fato que o gerou nascerem ou falharem juntos.
 */
export async function registerPointsEntry(db: PrismaLike, entry: PointsEntry) {
  if (!Number.isInteger(entry.qtPontos) || entry.qtPontos === 0) {
    throw new Error('Informe a quantidade de pontos do lancamento.');
  }

  const balance = await getPointsBalance(db, entry.idAluno, entry.idEmpresa);
  const next = balance + entry.qtPontos;

  if (next < 0) {
    throw new Error(
      `Saldo insuficiente: o aluno tem ${balance} ponto(s) e o resgate pede ${Math.abs(entry.qtPontos)}.`,
    );
  }

  return db.alunoPontuacao.create({
    data: {
      idAluno: entry.idAluno,
      idEmpresa: entry.idEmpresa,
      idPontuacao: entry.idPontuacao ?? null,
      idAlunoCheckIn: entry.idAlunoCheckIn ?? null,
      idProdutoMovimentacao: entry.idProdutoMovimentacao ?? null,
      dsHistorico: entry.dsHistorico?.trim() || null,
      qtPontos: entry.qtPontos,
      qtDisponivel: next,
      boInativo: false,
    },
  });
}

/**
 * Credita os pontos do check-in pela regra padrao da empresa.
 *
 * Best-effort de proposito: se a empresa nao configurou regra padrao, ou se
 * este check-in ja creditou, nao faz nada e NAO lanca. Ponto e recompensa, nao
 * pre-requisito — derrubar a entrada do aluno na academia porque a fidelidade
 * falhou seria trocar um problema pequeno por um grande.
 *
 * `idPontuacaoEscolhida` vem do check-in manual (o funcionario escolheu uma
 * regra na tela) e tem prioridade sobre a padrao.
 */
export async function creditCheckInPoints(
  db: PrismaLike,
  params: {
    idAluno: number;
    idEmpresa: number;
    idAlunoCheckIn: number;
    idPontuacaoEscolhida?: number | null;
  },
) {
  const rule = params.idPontuacaoEscolhida
    ? await db.pontuacao.findFirst({
        where: { id: params.idPontuacaoEscolhida, idEmpresa: params.idEmpresa, boInativo: false },
        select: { id: true, qtPontos: true },
      })
    : await db.pontuacao.findFirst({
        where: { idEmpresa: params.idEmpresa, boPadrao: true, boInativo: false },
        orderBy: { id: 'asc' },
        select: { id: true, qtPontos: true },
      });

  if (!rule || rule.qtPontos <= 0) return null;

  const already = await db.alunoPontuacao.findFirst({
    where: { idAlunoCheckIn: params.idAlunoCheckIn },
    select: { id: true },
  });
  if (already) return null;

  return registerPointsEntry(db, {
    idAluno: params.idAluno,
    idEmpresa: params.idEmpresa,
    idPontuacao: rule.id,
    idAlunoCheckIn: params.idAlunoCheckIn,
    qtPontos: rule.qtPontos,
  });
}

/**
 * Versao que nunca propaga erro, para os pontos de entrada onde o check-in nao
 * pode falhar por causa da fidelidade — a catraca liberando a passagem e a
 * chamada de presenca da aula. O erro vai para o log de quem chamou.
 */
export async function creditCheckInPointsSafe(
  db: PrismaLike,
  params: Parameters<typeof creditCheckInPoints>[1],
  onError?: (error: unknown) => void,
) {
  try {
    return await creditCheckInPoints(db, params);
  } catch (error) {
    onError?.(error);
    return null;
  }
}
