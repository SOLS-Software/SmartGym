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

export type Exercise = {
  id: number;
  idEmpresa: number | null;
  dsExercicio: string;
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
  boInativo: number;
};

export type TrainingMethod = {
  id: number;
  nmMetodoTreino: string;
  dsMetodoTreino: string;
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
};

export type CompanyChildColumn = {
  key: string;
  label: string;
  type?: 'date' | 'money' | 'status';
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
};

export type DomainConfigMap = Record<string, DomainConfig>;

export type StudentValidationField = 'name' | 'cpf' | 'birthDate' | 'email';
export type StudentValidationErrors = Partial<Record<StudentValidationField, string>>;

export type CompanyValidationField = 'name' | 'cnpj';
export type CompanyValidationErrors = Partial<Record<CompanyValidationField, string>>;
