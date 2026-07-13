// Tipos de treino/exercício — espelham apps/web/src/shared/registration/registrationTypes.

export interface AreaCorporal {
  id: number;
  dsAreaCorporal: string;
  boInativo: number;
}

export interface Exercise {
  id: number;
  idEmpresa: number;
  dsExercicio: string;
  dsInstrucao: string | null;
  boInativo: number;
}

export interface ExerciseWithCover extends Exercise {
  coverImageUrl: string | null;
  areas: AreaCorporal[];
}

export interface Training {
  id: number;
  idEmpresa: number;
  idAluno: number | null;
  idNivel: number | null;
  dsTreino: string;
  boInativo: number;
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
  boInativo: number;
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
  boInativo: number;
}

export interface StudentTraining {
  id: number;
  idAluno: number;
  idFuncionario: number | null;
  idTreino: number;
  dtCadastro: string;
  dtAlteracao: string | null;
  boInativo: number;
  funcionario?: Employee | null;
  treino?: Training | null;
  alunoTreinosSequencias?: AlunoTreinoSequencia[];
}

export interface StudentCheckIn {
  id: number;
  dtCadastro: string;
  idAlunoTreinosSequencia: number | null;
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
