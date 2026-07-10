export type Company = {
  id: number;
  dsEmpresa: string;
  caCNPJ: string;
  boInativo: number;
};

export type Product = {
  id: number;
  idEmpresa: number | null;
  dsProduto: string;
  qtEstoque: number;
  boInativo: number;
};

export type Promotion = {
  id: number;
  idEmpresa: number | null;
  dsPromocao: string;
  qtPeriodo: number;
  idUnidadeTempo: number | null;
  vlDesconto: number | string | null;
  pcDesconto: number | string | null;
  dtInicio: string | null;
  dtEncerramento: string | null;
  boInativo: number;
};

export type Exercise = {
  id: number;
  idEmpresa: number | null;
  dsExercicio: string;
  dsInstrucao: string | null;
  boInativo: number;
};

export type AreaCorporal = {
  id: number;
  dsAreaCorporal: string;
  boInativo: number;
};

export type ExerciseWithCover = Exercise & { coverImageUrl: string | null; areas: AreaCorporal[] };

export type ExercicioAreaCorporal = {
  id: number;
  idExercicio: number | null;
  idAreaCorporal: number | null;
  boInativo: number;
  areaCorporal?: AreaCorporal | null;
};

export type Activity = {
  id: number;
  idEmpresa: number | null;
  idEsporte: number | null;
  dsAtividade: string;
  boInativo: number;
};

export type Sport = {
  id: number;
  idEmpresa: number | null;
  dsEsporte: string;
  boInativo: number;
};

export type Training = {
  id: number;
  idEmpresa: number | null;
  idAluno: number | null;
  idNivel: number | null;
  dsTreino: string;
  boInativo: number;
};

export type Level = {
  id: number;
  dsNivel: string;
  boInativo: number;
};

export type ExerciseFile = {
  id: number;
  idExercicio: number | null;
  dsArquivo?: string;
  anCaminho: string;
  dtCadastro: string;
  boInativo: number;
};

export type ExercicioEquipamento = {
  id: number;
  idExericio: number | null;
  idEquipamento: number | null;
  boInativo: number;
  equipamento?: Equipamento | null;
};

export type Student = {
  id: number;
  nmAluno: string;
  caCPF: string;
  dtNascimento: string | null;
  nrDDD: number;
  nrContato: string | null;
  anEmail: string;
  anCEP: string;
  anLogradouro: string;
  anCoplemento: string;
  anBairro: string;
  nrEndereco: number | null;
  boInativo: number;
};

export type StudentFile = {
  id: number;
  idAluno: number | null;
  dsArquivo?: string;
  anCaminho: string;
  dtCadastro: string;
  boInativo: number;
};

export type Plan = {
  id: number;
  dsPlano: string;
  idFrequencia: number | null;
  boInativo: number;
};

export type Employee = {
  id: number;
  idEmpresa: number | null;
  idCargo: number | null;
  nmFuncionario: string;
  caCPF: string;
  dtNascimento: string | null;
  nrDDD: number | null;
  nrContato: number;
  anEmail: string;
  dtAdmissao: string | null;
  boInativo: number;
};

export type StudentTraining = {
  id: number;
  idAluno: number | null;
  idFuncionario: number | null;
  idTreino: number | null;
  dtCadastro: string;
  dtAlteracao: string;
  boInativo: number;
  funcionario?: Employee | null;
  treino?: Training | null;
  alunoTreinosSequencias?: Array<{
    id: number;
    idAlunoTreino: number | null;
    nrOrdem: number;
    boInativo: number;
  }>;
};

export type TrainingExercise = {
  id: number;
  idEmpresa: number | null;
  idTreino: number | null;
  idExercicio: number | null;
  idMetodoTreino: number | null;
  nrOrdem: number;
  nrSeries: number;
  nrRepeticoes: number;
  qtDescanso: number;
  qtPeso: number;
  cnUnidadeMedida: string;
  boInativo: number;
};

export type TrainingExerciseWithCover = TrainingExercise & {
  exercicio: ExerciseWithCover | null;
};

export type TrainingMethod = {
  id: number;
  nmMetodoTreino: string;
  dsMetodoTreino: string;
  boInativo: number;
};

export type Equipamento = {
  id: number;
  nrEquipamento: number | null;
  dsEquipamento: string | null;
  nmEquipamento: string | null;
  dtAquisicao: string | null;
  boInativo: number;
};

export type EquipamentoArquivo = {
  id: number;
  idEquipamento: number;
  dsArquivo?: string;
  anCaminho: string;
  dtCadastro: string;
  boInativo: number;
};

export type EquipamentoManutencao = {
  id: number;
  idEquipamento: number | null;
  dtExecucao: string | null;
  dtValidade: string | null;
  boInativo: number;
};

export type Localidade = {
  id: number;
  idEmpresa: number | null;
  nmLocalidade: string;
  dsLocalidade: string;
  cnLocalidadeTP: number;
  latitude: number;
  longitude: number;
  boInativo: number;
};

export type Role = {
  id: number;
  dsCargo: string;
  boInativo: number;
};

export type Frequency = {
  id: number;
  dsFrequencia: string;
  boInativo: number;
};

export type DomainRecord = {
  id: number;
  name: string;
  boInativo: number;
  description?: string;
  relationId?: number | null;
  relationName?: string;
};

export type RegisterLookupRecord = {
  id: number;
  type: 'student' | 'employee';
  name: string;
  cpf: string;
  birthDate: string | null;
  ddd: number | string;
  phone: number | string | null;
  email: string;
  hasUser: boolean;
};

export type CompanyChildRecord = {
  id: number;
  boInativo: number;
  [key: string]: unknown;
};

export type CompanyChildField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
  required?: boolean;
  lookupEndpoint?: string;
  lookupLabelKey?: string;
  selectOptions?: Array<{ value: string; label: string }>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'full';
};

export type CompanyChildColumn = {
  key: string;
  label: string;
  type?: 'date' | 'datetime' | 'money' | 'status';
  lookupLabelKey?: string;
};

export type CompanyChildTable = {
  key: string;
  endpoint: string;
  label: string;
  title: string;
  columns: CompanyChildColumn[];
  fields: CompanyChildField[];
};

export type StudentRelatedTable = {
  key: string;
  endpoint: string;
  label: string;
  title: string;
  columns: CompanyChildColumn[];
};

export type LookupRecord = {
  id: number;
  [key: string]: unknown;
};

export type GridPaginationProps = {
  page: number;
  totalItems: number;
  onChange: (nextPage: number) => void;
  pageSize?: number;
};

export type DomainConfig = {
  endpoint: string;
  field: string;
  label: string;
  saveLabel: string;
  secondField?: string;
  secondFieldLabel?: string;
  relationField?: string;
  relationLabel?: string;
  relationEndpoint?: string;
  relationValueField?: string;
};

export type DomainConfigMap = Record<string, DomainConfig>;

export type StudentValidationField = 'name' | 'cpf' | 'birthDate' | 'email';
export type StudentValidationErrors = Partial<Record<StudentValidationField, string>>;

export type CompanyValidationField = 'name' | 'cnpj';
export type CompanyValidationErrors = Partial<Record<CompanyValidationField, string>>;

export type AgendaSession = {
  id: number;
  idEmpresa: number | null;
  dsEmpresa: string | null;
  idAtividade: number | null;
  dsAtividade: string | null;
  idEsporte: number | null;
  idCategoria: number | null;
  dsCategoria: string | null;
  idLocalidade: number | null;
  dsLocalidade: string | null;
  dtInicial: string;
  dtFinal: string;
  qtAlunos: number | null;
  qtInscritos: number;
  boInativo: number;
  profissionais: Array<{ id: number; nome: string | null }>;
  alunoIds: number[];
  presentAlunoIds: number[];
};

export type EnrolledStudent = {
  id: number;
  idAluno: number;
  nmAluno: string;
  caCPF: string;
  dtCadastro: string;
  presente: boolean;
};
