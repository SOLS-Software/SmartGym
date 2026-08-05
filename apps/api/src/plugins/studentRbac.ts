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

  // Inscricao/cancelamento pela tela de Calendario e pela Agenda. Sao a mesma
  // acao das rotas /students/:id/activity-schedules/*, so que enderecadas pela
  // agenda; ficaram de fora da allowlist e o aluno conseguia se inscrever mas
  // nunca cancelar (403 no botao "Cancelar inscricao").
  //
  // O dono da inscricao vem no CORPO (idAluno), que este modulo nao enxerga —
  // liberar so a rota permitiria mexer na inscricao de outro aluno. A posse e
  // conferida no handler (modules/agendas/routes.ts), que ignora o idAluno do
  // corpo quando o papel e aluno e usa o do token.
  if (method === 'POST' && /^\/agenda-sessions\/\d+\/enroll$/.test(pathname)) return true;
  if (method === 'DELETE' && /^\/agenda-sessions\/\d+\/unenroll$/.test(pathname)) return true;

  if (method === 'GET') {
    return STUDENT_GET_ALLOW.some((re) => re.test(pathname));
  }

  return false;
}
