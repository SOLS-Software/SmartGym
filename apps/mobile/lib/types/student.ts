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
