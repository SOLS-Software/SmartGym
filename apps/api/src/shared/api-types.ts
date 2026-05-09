export type ProductPayload = {
  idEmpresa?: number | null;
  dsProduto?: string;
  qtEstoque?: number;
  boInativo?: number;
};

export type ExercisePayload = {
  idEmpresa?: number | null;
  dsExercicio?: string;
  boInativo?: number;
};

export type TrainingPayload = {
  idEmpresa?: number | string | null;
  idNivel?: number | string | null;
  dsTreino?: string;
  boInativo?: number;
};

export type CompanyPayload = {
  dsEmpresa?: string;
  caCNPJ?: string;
  boInativo?: number;
};

export type StudentPayload = {
  nmAluno?: string;
  caCPF?: string;
  dtNascimento?: string | null;
  nrDDD?: number | string;
  nrContato?: string | null;
  anEmail?: string;
  anCEP?: string;
  anLogradouro?: string;
  anCoplemento?: string;
  anBairro?: string;
  nrEndereco?: number | string | null;
  boInativo?: number;
};

export type StudentFacialBiometricPayload = {
  idAlunoArquivo?: number | string | null;
  dsModelo?: string;
  dsProvider?: string;
  dsSubject?: string | null;
  dsExternalImageId?: string | null;
  anEmbedding?: unknown;
  nrThreshold?: number | string | null;
};

export type StudentFacialBiometricEnrollPayload = {
  idAlunoArquivo?: number | string | null;
  nrThreshold?: number | string | null;
};

export type StudentFacialVerificationPayload = {
  anEmbedding?: unknown;
};

export type FacialRecognitionResult = {
  result?: Array<{
    subjects?: Array<{
      subject?: string;
      similarity?: number;
    }>;
  }>;
};

export type PlanPayload = {
  dsPlano?: string;
  idFrequencia?: number | string | null;
  boInativo?: number;
};

export type EmployeePayload = {
  idEmpresa?: number | string | null;
  idCargo?: number | string | null;
  nmFuncionario?: string;
  caCPF?: string;
  dtNascimento?: string | null;
  nrDDD?: number | string;
  nrContato?: string | number | null;
  anEmail?: string;
  dtAdmissao?: string | null;
  boInativo?: number;
};

export type RegisterPayload = {
  type?: 'student' | 'employee';
  name?: string;
  cpf?: string;
  birthDate?: string | null;
  ddd?: number | string;
  phone?: string | number | null;
  email?: string;
  password?: string;
};

export type LoginPayload = {
  login?: string;
  password?: string;
};

export type ForgotPasswordPayload = {
  cpf?: string;
};

export type RegisterLookupQuery = {
  type?: 'student' | 'employee';
  cpf?: string;
};

export type CompanyChildResource =
  | 'promotions'
  | 'promotion-products'
  | 'promotion-files'
  | 'student-plans'
  | 'payments'
  | 'product-movements'
  | 'company-files'
  | 'student-check-ins'
  | 'themes';

export type StudentChildResource = 'plans' | 'payments' | 'check-ins' | 'trainings' | 'promotions';

export type PlanChildResource =
  | 'values'
  | 'products'
  | 'companies'
  | 'activities'
  | 'promotion-plans';

export type CompanyChildPayload = Record<string, string | number | null | undefined>;

export type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

export type ComprefaceConfig = {
  url: string;
  recognitionApiKey: string;
  detProbThreshold: number;
  similarityThreshold: number;
};

export interface EnviarEmailParams {
  para: string;
  assunto: string;
  texto?: string;
  html?: string;
}
