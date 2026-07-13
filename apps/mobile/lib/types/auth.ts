// Sessão do usuário autenticado — mesmo shape retornado por POST /auth/login
// e GET /auth/verify na API (apps/api/src/modules/auth/routes.ts).

export type AuthUserType = 'student' | 'employee';

export interface AuthenticatedUser {
  id: number;
  idAluno: number | null;
  idFuncionario: number | null;
  name: string;
  type: AuthUserType;
}
