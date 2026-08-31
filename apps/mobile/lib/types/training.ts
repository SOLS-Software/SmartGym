// Tipos de treino/exercício — espelham apps/web/src/shared/registration/registrationTypes.

export interface AreaCorporal {
  id: number;
  dsAreaCorporal: string;
  boInativo: boolean | number;
}

export interface Exercise {
  id: number;
  idEmpresa: number;
  dsExercicio: string;
  dsInstrucao: string | null;
  boInativo: boolean | number;
}

// Resumo do equipamento que vem junto do exercicio quando a listagem e pedida
// com includeCover=true — o suficiente para o card e a tela de detalhe.
export interface EquipamentoResumo {
  id: number;
  nmEquipamento: string | null;
  dsEquipamento: string | null;
}

export interface ExerciseWithCover extends Exercise {
  coverImageUrl: string | null;
  areas: AreaCorporal[];
  equipamentos: EquipamentoResumo[];
}

export interface Training {
  id: number;
  idEmpresa: number;
  idAluno: number | null;
  idNivel: number | null;
  dsTreino: string;
  boInativo: boolean | number;
}

export interface TrainingExercise {
  id: number;
  idEmpresa: number;
  idTreino: number;
  idExercicio: number;
  idMetodoTreino: number | null;
  nrOrdem: number;
  nrSeries: number;
  nrRepeticoes: number;
  qtDescanso: number;
  qtPeso: number;
  cnUnidadeMedida: string;
  boInativo: boolean | number;
}

export interface TrainingExerciseWithCover extends TrainingExercise {
  exercicio: ExerciseWithCover | null;
}

export interface Employee {
  id: number;
  nmFuncionario: string;
}

export interface AlunoTreinoSequencia {
  id: number;
  idAlunoTreino: number;
  nrOrdem: number;
  boInativo: boolean | number;
}

export interface StudentTraining {
  id: number;
  idAluno: number;
  idFuncionario: number | null;
  idTreino: number;
  dtCadastro: string;
  dtAlteracao: string | null;
  boInativo: boolean | number;
  funcionario?: Employee | null;
  treino?: Training | null;
  alunoTreinosSequencias?: AlunoTreinoSequencia[];
}

export interface StudentCheckIn {
  id: number;
  dtCadastro: string;
  idAlunoTreinosSequencia: number | null;
  /**
   * Presença de verdade (catraca ou recepção) x sessão aberta aqui no app.
   * Só a primeira conta em frequência, evasão e pontos — o app abre sessão
   * para o aluno ter onde anotar o treino, não para registrar que ele veio.
   */
  boPresencial?: boolean;
  alunoPlano?: {
    plano?: {
      dsPlano?: string;
    } | null;
  } | null;
  alunoTreinoSequencia?: {
    nrOrdem: number;
    alunoTreino?: StudentTraining | null;
  } | null;
}
