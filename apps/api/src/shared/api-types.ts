export type ProductPayload = {
  idEmpresa?: number | null;
  dsProduto?: string;
  qtEstoque?: number;
  boInativo?: boolean;
};

export type ExercisePayload = {
  idEmpresa?: number | null;
  dsExercicio?: string;
  dsInstrucao?: string | null;
  boInativo?: boolean;
};

export type ExercicioEquipamentoPayload = {
  idEquipamento?: number | string | null;
};

export type ExercicioAreaCorporalPayload = {
  idAreaCorporal?: number | string | null;
};

export type TrainingPayload = {
  idEmpresa?: number | string | null;
  idNivel?: number | string | null;
  dsTreino?: string;
  boInativo?: boolean;
};

export type CompanyPayload = {
  idCliente?: number | string | null;
  dsEmpresa?: string;
  caCNPJ?: string;
  boInativo?: boolean;
};

export type StudentPayload = {
  idCliente?: number | string | null;
  nmAluno?: string;
  caCPF?: string;
  dtNascimento?: string | null;
  nrDDD?: number | string;
  nrContato?: string | null;
  anEmail?: string;
  anCEP?: string;
  anLogradouro?: string;
  anComplemento?: string;
  anBairro?: string;
  nrEndereco?: number | string | null;
  boInativo?: boolean;
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
  boInativo?: boolean;
};

export type EquipamentoPayload = {
  nrEquipamento?: number | string | null;
  dsEquipamento?: string;
  nmEquipamento?: string;
  dtAquisicao?: string | null;
  boInativo?: boolean;
};

export type EquipamentoManutencaoPayload = {
  dtExecucao?: string | null;
  dtValidade?: string | null;
  boInativo?: boolean;
};

export type LocalidadePayload = {
  idEmpresa?: number | string | null;
  nmLocalidade?: string;
  dsLocalidade?: string;
  cnLocalidadeTP?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  boInativo?: boolean;
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
  boInativo?: boolean;
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

export type VerifySessionQuery = {
  id?: string;
};

export type ThemeQuery = {
  url?: string;
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

export type StudentChildResource = 'plans' | 'payments' | 'check-ins' | 'trainings';

export type PlanChildResource =
  | 'values'
  | 'products'
  | 'companies'
  | 'activities'
  | 'promotion-plans'
  | 'promotion-products';

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
