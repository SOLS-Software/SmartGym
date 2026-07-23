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

  it('sessao: verify sempre liberado; logout apenas via POST', () => {
    expect(isStudentAllowed('GET', '/auth/verify', ID)).toBe(true);
    expect(isStudentAllowed('POST', '/auth/logout', ID)).toBe(true);
    expect(isStudentAllowed('GET', '/auth/logout', ID)).toBe(false);
  });

  it('nega mutacoes nos catalogos (aluno so le)', () => {
    expect(isStudentAllowed('POST', '/activities', ID)).toBe(false);
    expect(isStudentAllowed('PUT', '/exercises/5', ID)).toBe(false);
    expect(isStudentAllowed('DELETE', '/plans/1', ID)).toBe(false);
  });
});
