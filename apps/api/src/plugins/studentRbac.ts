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
  // Tela de Pontuacoes do aluno: precisa das filiais para o seletor e do
  // catalogo de pontos da filial escolhida. Sem estes dois a tela abria
  // mostrando "Acesso nao autorizado." — estava no menu e nunca funcionou.
  // Ambos sao dados da propria academia (escopo do tenant, filtrado por
  // idCliente na rota); nao expoem nenhum dado de outro aluno.
  /^\/companies$/,
  /^\/companies\/\d+\/children\/points$/,
  // Motivos de cancelamento: o aluno escolhe um ao pedir para sair. E catalogo
  // da academia, sem dado de ninguem — e sem ele o formulario de cancelamento
  // abriria vazio, perdendo justamente o dado que a solicitacao existe para
  // capturar.
  /^\/cancellation-reasons$/,
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
  // Dados e senha da PROPRIA conta. O aluno tambem e dono de uma conta: sem
  // isto ele nao consegue nem ver o proprio cadastro nem trocar a senha.
  if (pathname === '/auth/me' && method === 'GET') return true;
  if (pathname === '/auth/change-password' && method === 'POST') return true;
  // Registro e descadastro do aparelho para push. O app do aluno E o app que
  // recebe push: sem isto o aluno nunca conseguiria registrar o telefone e a
  // feature inteira ficaria inerte justamente para quem ela existe. O aparelho
  // e amarrado ao usuario do token, e o DELETE so alcanca aparelho do proprio
  // usuario (ver modules/auth/routes.ts).
  if (pathname === '/auth/push-token' && (method === 'POST' || method === 'DELETE')) return true;

  const studentMatch = pathname.match(/^\/students\/(\d+)(\/|$)/);
  if (studentMatch) {
    if (!idAluno || Number(studentMatch[1]) !== idAluno) return false;
    if (method === 'GET') return true;
    return (
      (method === 'POST' && /^\/students\/\d+\/activity-schedules\/enroll$/.test(pathname)) ||
      // Registro de execucao do treino: quem levanta o peso e o aluno, entao e
      // ele quem grava o que fez. A rota e upsert por (sessao, exercicio) e a
      // posse da sessao e conferida no handler; aqui basta o caminho ser o dele
      // (o \d+ ja foi comparado com o idAluno do token acima).
      (method === 'POST' && /^\/students\/\d+\/related\/executions$/.test(pathname)) ||
      // Pedir cancelamento ou renovacao da propria matricula. Quem resolve e a
      // equipe (ver modules/planRequests) — aqui o aluno so abre o pedido.
      (method === 'POST' && /^\/students\/\d+\/related\/plan-requests$/.test(pathname)) ||
      // Abrir a propria sessao de treino, para ter onde anotar carga e series.
      // NAO e presenca: o handler grava `boPresencial: false`, ignora pontuacao
      // e tipo vindos do corpo e nao credita fidelidade — frequencia, evasao e
      // pontos continuam sendo o que a catraca e a recepcao registram. Liberar
      // a rota crua aqui deixaria o aluno pontuar de casa escolhendo a regra
      // que mais vale.
      (method === 'POST' && /^\/students\/\d+\/related\/check-ins$/.test(pathname)) ||
      // Marcar o proprio aviso como lido.
      (method === 'POST' && /^\/students\/\d+\/notifications\/\d+\/read$/.test(pathname)) ||
      // Gerar o codigo de pagamento da PROPRIA parcela. E POST porque, em conta
      // de gateway, isso cria a cobranca no provedor. A posse da parcela e
      // conferida no handler; aqui basta o caminho ser o dele.
      (method === 'POST' &&
        /^\/students\/\d+\/related\/payments\/\d+\/charge$/.test(pathname)) ||
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
