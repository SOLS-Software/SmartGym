// A sessao do app e a unica escrita de check-in que vem de fora da academia.
// Estes testes existem para provar que o corpo do pedido nao decide nada do que
// tem valor: nem pontos, nem tipo, nem presenca.
import { describe, expect, it } from 'vitest';
import { buildSelfCheckInData, inicioDoDia } from './selfCheckIn.js';

const base = {
  idAluno: 7,
  idEmpresa: 3,
  idAlunoPlano: 12,
  idAlunoTreinosSequencia: 44,
};

describe('buildSelfCheckInData', () => {
  it('grava a sessao do aluno com o que o handler apurou', () => {
    expect(buildSelfCheckInData(base)).toEqual({
      idAluno: 7,
      idEmpresa: 3,
      idAlunoPlano: 12,
      idAlunoTreinosSequencia: 44,
      boPresencial: false,
      idPontuacao: null,
      idTipoCheckIn: null,
      boInativo: false,
    });
  });

  it('nunca marca presenca', () => {
    // O valor que separa "veio treinar" de "abriu o app". Se algum dia isto
    // virar true, a frequencia e a evasao passam a medir toque de botao.
    expect(buildSelfCheckInData(base).boPresencial).toBe(false);
  });

  it('ignora pontuacao, tipo e presenca mandados no corpo', () => {
    const hostil = {
      ...base,
      idPontuacao: 99,
      idTipoCheckIn: 2,
      boPresencial: true,
      boInativo: true,
    } as never;

    expect(buildSelfCheckInData(hostil)).toEqual({
      idAluno: 7,
      idEmpresa: 3,
      idAlunoPlano: 12,
      idAlunoTreinosSequencia: 44,
      boPresencial: false,
      idPontuacao: null,
      idTipoCheckIn: null,
      boInativo: false,
    });
  });

  it('aceita sessao sem plano e sem treino escolhido', () => {
    const dados = buildSelfCheckInData({
      ...base,
      idAlunoPlano: null,
      idAlunoTreinosSequencia: null,
    });
    expect(dados.idAlunoPlano).toBeNull();
    expect(dados.idAlunoTreinosSequencia).toBeNull();
  });

  it('recusa aluno ou empresa invalidos', () => {
    expect(() => buildSelfCheckInData({ ...base, idAluno: 0 })).toThrow('Aluno invalido');
    expect(() => buildSelfCheckInData({ ...base, idEmpresa: -1 })).toThrow('Empresa invalida');
    expect(() => buildSelfCheckInData({ ...base, idEmpresa: 1.5 })).toThrow();
  });
});

describe('inicioDoDia', () => {
  it('volta para a meia-noite local, nao para a de UTC', () => {
    const noite = new Date(2026, 7, 31, 21, 40, 12);
    const inicio = inicioDoDia(noite);

    expect(inicio.getFullYear()).toBe(2026);
    expect(inicio.getMonth()).toBe(7);
    expect(inicio.getDate()).toBe(31);
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
    expect(inicio.getSeconds()).toBe(0);
    expect(inicio.getMilliseconds()).toBe(0);
  });

  it('nao altera a data recebida', () => {
    const agora = new Date(2026, 0, 5, 13, 30);
    const copia = new Date(agora);
    inicioDoDia(agora);
    expect(agora.getTime()).toBe(copia.getTime());
  });

  it('treino da madrugada pertence ao dia que comecou', () => {
    // 00h20 de segunda: a sessao de hoje e a de segunda, nao a de domingo.
    const madrugada = new Date(2026, 5, 15, 0, 20);
    expect(inicioDoDia(madrugada).getDate()).toBe(15);
  });
});
