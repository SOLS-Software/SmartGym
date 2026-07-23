// RBAC v1 do papel aluno (deny-by-default), isolado da infra (sem prisma/jwt)
// para ser testavel unitariamente. O registro do hook fica em auth.ts.

// Allowlist EXPLICITA de leituras (GET) do app do aluno. Sao padroes de rota
// EXATOS — nunca prefixo cru. Um prefixo (startsWith) concede, por construcao,
// qualquer sub-recurso de gestao presente ou futuro sob ele (ex.: listas de
// inscritos/professores de uma aula), o que vazaria PII de outros alunos.
// Cada entrada abaixo e um endpoint de catalogo realmente consumido pelo app
// do aluno; nada de listagens de terceiros.
export const STUDENT_GET_ALLOW: RegExp[] = [
  /^\/activities$/,
  /^\/activities\/\d+$/,
  /^\/exercises$/,
  /^\/plans$/,
  /^\/promotions$/,
  /^\/trainings$/,
  /^\/trainings\/\d+\/related\/exercises$/,
  /^\/clients\/\d+$/,
  /^\/clients\/\d+\/theme$/,
];

// RBAC v1 para o papel aluno: deny-by-default.
// - Leituras de catalogo (allowlist acima).
// - Recursos proprios em /students/:id — somente o proprio idAluno, com
//   mutacoes restritas a matricula em aula e edicao do proprio cadastro.
export function isStudentAllowed(
  method: string,
  pathname: string,
  idAluno: number | null,
): boolean {
  if (pathname === '/auth/verify') return true;
  // Encerrar a propria sessao (revoga o token no servidor) e sempre permitido.
  if (pathname === '/auth/logout' && method === 'POST') return true;

  const studentMatch = pathname.match(/^\/students\/(\d+)(\/|$)/);
  if (studentMatch) {
    if (!idAluno || Number(studentMatch[1]) !== idAluno) return false;
    if (method === 'GET') return true;
    return (
      (method === 'POST' && /^\/students\/\d+\/activity-schedules\/enroll$/.test(pathname)) ||
      (method === 'PUT' && /^\/students\/\d+$/.test(pathname))
    );
  }

  if (method === 'GET') {
    return STUDENT_GET_ALLOW.some((re) => re.test(pathname));
  }

  return false;
}
