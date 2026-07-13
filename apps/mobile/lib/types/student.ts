// Perfil do aluno e arquivos — mesmos campos de app/admin.tsx:155-175.

export type StudentProfile = {
  id: number;
  nmAluno: string;
  caCPF: string;
  dtNascimento: string | null;
  nrDDD: number;
  nrContato: string | null;
  anEmail: string;
  anCEP: string;
  anLogradouro: string;
  nrEndereco: number | null;
  boInativo: number;
};

export type StudentFile = {
  id: number;
  idAluno: number | null;
  anCaminho: string;
  dtCadastro: string;
  boInativo: number;
};

// Matrícula do aluno (GET /students/:id/related/plans) — subconjunto usado nas telas.
export type StudentPlan = {
  id: number;
  idAluno: number;
  boInativo: number;
  dtCadastro: string | null;
  empresa?: { id: number; dsEmpresa?: string } | null;
  plano?: {
    id: number;
    dsPlano: string;
    frequencia?: { dsFrequencia?: string } | null;
    planoAtividades?: Array<{ id: number; atividade?: { dsAtividade?: string } | null }>;
    planoValores?: Array<{ id: number; vlVenda?: number | string | null }>;
  } | null;
};
