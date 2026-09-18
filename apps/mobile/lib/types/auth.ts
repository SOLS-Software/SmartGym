// Sessão do usuário autenticado — mesmo shape retornado por POST /auth/login
// e GET /auth/verify na API (apps/api/src/modules/auth/routes.ts).

export type AuthUserType = 'student' | 'employee';

export interface AuthenticatedUser {
  id: number;
  idAluno: number | null;
  idFuncionario: number | null;
  name: string;
  type: AuthUserType;

  /** Academia da sessão. */
  idCliente?: number | null;

  /**
   * Filial do funcionário. Venda e treino são gravados em nome de uma unidade,
   * e esta é a unidade da própria pessoa — não uma escolha de tela. Aluno não
   * tem filial fixa e recebe null.
   */
  idEmpresa?: number | null;

  /**
   * Permissões efetivas do perfil, como a API as calcula.
   *
   * Servem para MONTAR A TELA: esconder a aba que a pessoa não pode usar é
   * melhor que deixá-la tocar e tomar 403. A autorização de verdade continua no
   * servidor, a cada request — o hook de auth relê o perfil do banco do cliente
   * e não confia nesta lista. Adiantar aqui é conveniência, nunca defesa.
   *
   * Aluno não tem perfil de acesso: vem vazia.
   */
  permissions?: string[];
}

/** Uma permissão do catálogo (apps/api/src/plugins/permissions.ts). */
export function podeFuncionario(user: AuthenticatedUser | null, permissao: string): boolean {
  return Boolean(user?.permissions?.includes(permissao));
}
