// Sessao de treino aberta pelo PROPRIO aluno, no app.
//
// A rota de check-in nasceu para a recepcao e para a catraca: ela aceita do
// corpo a regra de pontuacao, o tipo e a empresa, porque quem chama e alguem da
// academia. Liberar essa mesma rota para o aluno sem mais nada o deixaria
// escolher quanto vale o proprio check-in — e pontuar de casa, todo dia.
//
// Por isso a decisao do que vai para o banco nao mora no corpo do pedido: mora
// aqui, numa funcao pura que o teste consegue apontar uma arma para. O handler
// passa apenas o que ele mesmo apurou (aluno, plano, empresa, sequencia); tudo
// o mais e fixado.
export type SelfCheckInInput = {
  idAluno: number;
  idEmpresa: number;
  idAlunoPlano: number | null;
  /** Qual treino o aluno esta fazendo, quando ele escolheu um. */
  idAlunoTreinosSequencia: number | null;
};

export type SelfCheckInData = {
  idAluno: number;
  idEmpresa: number;
  idAlunoPlano: number | null;
  idAlunoTreinosSequencia: number | null;
  /** Nunca presenca: quem prova presenca e a porta, nao o botao. */
  boPresencial: false;
  /** Sem regra de pontuacao — sessao do app nao credita fidelidade. */
  idPontuacao: null;
  /** Tipo e classificacao da operacao; o app nao escolhe por ela. */
  idTipoCheckIn: null;
  boInativo: false;
};

export function buildSelfCheckInData(input: SelfCheckInInput): SelfCheckInData {
  if (!Number.isInteger(input.idAluno) || input.idAluno <= 0) {
    throw new Error('Aluno invalido para abrir a sessao.');
  }
  if (!Number.isInteger(input.idEmpresa) || input.idEmpresa <= 0) {
    throw new Error('Empresa invalida para abrir a sessao.');
  }

  return {
    idAluno: input.idAluno,
    idEmpresa: input.idEmpresa,
    idAlunoPlano: input.idAlunoPlano ?? null,
    idAlunoTreinosSequencia: input.idAlunoTreinosSequencia ?? null,
    boPresencial: false,
    idPontuacao: null,
    idTipoCheckIn: null,
    boInativo: false,
  };
}

/**
 * Comeco do dia LOCAL do servidor.
 *
 * A janela do "ja abriu hoje?" precisa ser o dia que a pessoa vive. Com UTC, o
 * treino das 21h30 no Brasil cairia no dia seguinte e o aluno abriria uma
 * segunda sessao sem querer — duas linhas para o mesmo treino, e a anotacao de
 * carga dividida entre elas.
 */
export function inicioDoDia(agora: Date): Date {
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}
