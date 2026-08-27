import { describe, expect, it } from 'vitest';
import { isStudentAllowed } from './studentRbac.js';

describe('isStudentAllowed (RBAC do aluno, deny-by-default)', () => {
  const ID = 7;

  it('permite os catalogos GET consumidos pelo app do aluno', () => {
    for (const p of [
      '/activities',
      '/activities/5',
      '/exercises',
      '/plans',
      '/promotions',
      '/trainings',
      '/trainings/5/related/exercises',
      '/clients/5',
      '/clients/5/theme',
      '/companies',
      '/companies/5/children/points',
    ]) {
      expect(isStudentAllowed('GET', p, ID)).toBe(true);
    }
  });

  it('nega sub-recursos de gestao — regressao C1/A2/A3/B5 (vazamento de PII)', () => {
    for (const p of [
      '/agenda-sessions/1/enrolled-students', // C1: lista de inscritos (CPF alheio)
      '/activities/1/related/schedules/1/employees', // A2/A3: professores da aula
      '/activities/1/related/schedules',
      '/clients/1/companies', // B5
      '/clients/1/domains',
      '/clients/1/files',
      '/employees',
      '/exercises/5', // detalhe nao esta na allowlist (so a listagem)
      '/trainings/5', // idem
      '/students', // listagem geral de alunos
      '/companies/1', // detalhe da filial nao esta liberado (so a listagem)
      '/companies/1/children/points/2', // detalhe de pontuacao
      '/companies/1/children/purchases', // demais sub-recursos da filial
      '/companies/1/children/student-plans', // planos de outros alunos
    ]) {
      expect(isStudentAllowed('GET', p, ID)).toBe(false);
    }
  });

  it('recurso proprio em /students/:id — somente o proprio idAluno', () => {
    expect(isStudentAllowed('GET', '/students/7', 7)).toBe(true);
    expect(isStudentAllowed('GET', '/students/7/related/plans', 7)).toBe(true);
    expect(isStudentAllowed('GET', '/students/8', 7)).toBe(false); // outro aluno
    expect(isStudentAllowed('GET', '/students/7', null)).toBe(false); // sem idAluno
  });

  it('mutacoes proprias restritas a matricula em aula e edicao do cadastro', () => {
    expect(isStudentAllowed('POST', '/students/7/activity-schedules/enroll', 7)).toBe(true);
    expect(isStudentAllowed('PUT', '/students/7', 7)).toBe(true);
    expect(isStudentAllowed('DELETE', '/students/7', 7)).toBe(false);
    expect(isStudentAllowed('POST', '/students/7/qualquer-coisa', 7)).toBe(false);
    expect(isStudentAllowed('PUT', '/students/8', 7)).toBe(false); // outro aluno
  });

  it('inscricao e cancelamento pela agenda — regressao: cancelar dava 403', () => {
    expect(isStudentAllowed('POST', '/agenda-sessions/12/enroll', ID)).toBe(true);
    expect(isStudentAllowed('DELETE', '/agenda-sessions/12/unenroll', ID)).toBe(true);
    // Metodo trocado nao vale, e nenhuma outra acao na agenda e liberada.
    expect(isStudentAllowed('DELETE', '/agenda-sessions/12/enroll', ID)).toBe(false);
    expect(isStudentAllowed('POST', '/agenda-sessions/12/unenroll', ID)).toBe(false);
    expect(isStudentAllowed('POST', '/agenda-sessions/12/students/9/presence', ID)).toBe(false);
    expect(isStudentAllowed('DELETE', '/agenda-sessions/12', ID)).toBe(false);
    expect(isStudentAllowed('POST', '/agenda-sessions', ID)).toBe(false);
  });

  it('sessao: verify sempre liberado; logout apenas via POST', () => {
    expect(isStudentAllowed('GET', '/auth/verify', ID)).toBe(true);
    expect(isStudentAllowed('POST', '/auth/logout', ID)).toBe(true);
    expect(isStudentAllowed('GET', '/auth/logout', ID)).toBe(false);
  });

  it('aluno nao altera o proprio vinculo com a catraca', () => {
    // `nrUsuarioCatraca` decide QUEM a catraca acha que o aluno e. Se o proprio
    // aluno pudesse editar, bastaria apontar para um usuario do equipamento que
    // esta sempre liberado para furar o bloqueio por inadimplencia — a regra de
    // plano e pagamento viraria enfeite. Por isso o vinculo vive num PATCH em
    // subrecurso, fora da allowlist, e nao no PUT do proprio cadastro.
    expect(isStudentAllowed('PATCH', `/students/${ID}/usuario-catraca`, ID)).toBe(false);
    expect(isStudentAllowed('PATCH', '/students/8/usuario-catraca', ID)).toBe(false);
    expect(isStudentAllowed('PATCH', `/students/${ID}/status`, ID)).toBe(false);
  });

  it('nega mutacoes nos catalogos (aluno so le)', () => {
    expect(isStudentAllowed('POST', '/activities', ID)).toBe(false);
    expect(isStudentAllowed('PUT', '/exercises/5', ID)).toBe(false);
    expect(isStudentAllowed('DELETE', '/plans/1', ID)).toBe(false);
  });
});

describe('registro de execucao do treino', () => {
  // Quem levanta o peso e o aluno, entao e ele quem grava o que fez.
  it('o aluno grava a execucao do proprio treino', () => {
    expect(isStudentAllowed('POST', '/students/7/related/executions', 7)).toBe(true);
    expect(isStudentAllowed('GET', '/students/7/related/executions', 7)).toBe(true);
  });

  it('mas nao a de outro aluno', () => {
    expect(isStudentAllowed('POST', '/students/8/related/executions', 7)).toBe(false);
    expect(isStudentAllowed('GET', '/students/8/related/executions', 7)).toBe(false);
  });

  it('e continua sem poder gravar avaliacao ou pontos para si', () => {
    expect(isStudentAllowed('POST', '/students/7/related/evolutions', 7)).toBe(false);
    expect(isStudentAllowed('POST', '/students/7/related/points', 7)).toBe(false);
  });
});

describe('codigo de pagamento da propria cobranca', () => {
  it('o aluno gera a cobranca da propria parcela', () => {
    // Regressao: a rota virou POST (em conta de gateway ela CRIA cobranca no
    // provedor), e o RBAC do aluno so libera POST em caminhos listados. Trocar
    // o verbo sem mexer aqui daria 403 para todo aluno — de novo.
    expect(isStudentAllowed('POST', '/students/7/related/payments/5/charge', 7)).toBe(true);
  });

  it('mas nao a da parcela de outro aluno', () => {
    // O codigo carrega valor devido e vencimento. Vazar isso e vazar a
    // situacao financeira de outra pessoa.
    expect(isStudentAllowed('POST', '/students/8/related/payments/5/charge', 7)).toBe(false);
  });

  it('e nao abre outros POST sob o mesmo prefixo', () => {
    expect(isStudentAllowed('POST', '/students/7/related/payments', 7)).toBe(false);
    expect(isStudentAllowed('POST', '/students/7/related/payments/5', 7)).toBe(false);
    expect(isStudentAllowed('DELETE', '/students/7/related/payments/5/charge', 7)).toBe(false);
  });
});

describe('conta do proprio aluno', () => {
  // Regressao: /auth/me e /auth/change-password estavam so na allowlist do
  // funcionario, e o aluno tomava 403 na propria conta.
  it('le os proprios dados e troca a propria senha', () => {
    expect(isStudentAllowed('GET', '/auth/me', 7)).toBe(true);
    expect(isStudentAllowed('POST', '/auth/change-password', 7)).toBe(true);
  });

  it('mas nao usa essas rotas com outro metodo', () => {
    expect(isStudentAllowed('POST', '/auth/me', 7)).toBe(false);
    expect(isStudentAllowed('GET', '/auth/change-password', 7)).toBe(false);
  });

  // Regressao da mesma familia: /auth/push-token entrou so na allowlist do
  // funcionario, e o aluno tomava 403 ao registrar o telefone. Como o app do
  // aluno E o app que recebe push, a feature inteira ficava inerte para quem
  // ela existe — e nada disso aparece em typecheck.
  it('registra e descadastra o proprio aparelho para push', () => {
    expect(isStudentAllowed('POST', '/auth/push-token', 7)).toBe(true);
    expect(isStudentAllowed('DELETE', '/auth/push-token', 7)).toBe(true);
    expect(isStudentAllowed('GET', '/auth/push-token', 7)).toBe(false);
  });
});

describe('solicitacoes e avisos do proprio aluno', () => {
  it('abre solicitacao de cancelamento/renovacao da propria matricula', () => {
    expect(isStudentAllowed('POST', '/students/7/related/plan-requests', 7)).toBe(true);
    expect(isStudentAllowed('GET', '/students/7/related/plan-requests', 7)).toBe(true);
  });

  it('marca o proprio aviso como lido', () => {
    expect(isStudentAllowed('POST', '/students/7/notifications/12/read', 7)).toBe(true);
  });

  it('nao mexe em solicitacao nem aviso de outro aluno', () => {
    expect(isStudentAllowed('POST', '/students/8/related/plan-requests', 7)).toBe(false);
    expect(isStudentAllowed('POST', '/students/8/notifications/12/read', 7)).toBe(false);
  });

  it('e nao responde a propria solicitacao (quem resolve e a equipe)', () => {
    expect(isStudentAllowed('PATCH', '/plan-requests/3', 7)).toBe(false);
    expect(isStudentAllowed('GET', '/plan-requests', 7)).toBe(false);
    expect(isStudentAllowed('POST', '/notifications/dispatch', 7)).toBe(false);
  });
});

describe('catalogos que o aluno precisa ler', () => {
  // Regressao: sem isto o formulario de cancelamento do app abria sem motivos
  // para escolher, e o pedido chegava na recepcao sem explicacao nenhuma.
  it('le a lista de motivos de cancelamento', () => {
    expect(isStudentAllowed('GET', '/cancellation-reasons', 7)).toBe(true);
  });

  it('mas nao altera a lista', () => {
    expect(isStudentAllowed('POST', '/cancellation-reasons', 7)).toBe(false);
    expect(isStudentAllowed('PUT', '/cancellation-reasons/1', 7)).toBe(false);
  });

  // O panorama agrega a base inteira: quantos alunos existem, quantos treinaram,
  // quanto da base ficou. E dado de gestao da academia, nao do aluno — e a
  // allowlist e explicita justamente para uma rota nova nao entrar de carona.
  it('nao alcanca o panorama de relatorio', () => {
    expect(isStudentAllowed('GET', '/reports/overview', 7)).toBe(false);
    expect(isStudentAllowed('GET', '/reports/financial', 7)).toBe(false);
  });
});
