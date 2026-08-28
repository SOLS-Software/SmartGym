import { describe, expect, it } from 'vitest';
import { churnMensal, montarCoorte, permanencia, type Matricula } from './coorte.js';

// Datas locais (new Date(ano, mes, dia)) — mesma convencao de janelas.ts.
const AGOSTO_2026 = new Date(2026, 7, 20, 10, 0);

const m = (inicio: [number, number, number], fim?: [number, number, number]): Matricula => ({
  inicio: new Date(inicio[0], inicio[1], inicio[2]),
  fim: fim ? new Date(fim[0], fim[1], fim[2]) : null,
});

describe('montarCoorte', () => {
  it('agrupa por mes de entrada e conta quem sobreviveu a cada mes', () => {
    const matriculas = [
      // Safra de junho: tres entram, uma sai em junho, outra em julho.
      m([2026, 5, 3], [2026, 5, 20]),
      m([2026, 5, 10], [2026, 6, 15]),
      m([2026, 5, 25]),
      // Safra de julho: duas entram, nenhuma sai.
      m([2026, 6, 2]),
      m([2026, 6, 18]),
    ];

    const [junho, julho, agosto] = montarCoorte(matriculas, 3, AGOSTO_2026);

    expect(junho?.label).toBe('jun/26');
    expect(junho?.tamanho).toBe(3);
    // Fim de junho: uma ja saiu -> 2. Fim de julho: outra saiu -> 1. Fim de
    // agosto: 1.
    expect(junho?.retidas).toEqual([2, 1, 1]);

    expect(julho?.tamanho).toBe(2);
    // Julho so tem dois meses decorridos (julho e agosto); o terceiro e nulo.
    expect(julho?.retidas).toEqual([2, 2, null]);

    expect(agosto?.tamanho).toBe(0);
    expect(agosto?.retidas).toEqual([0, null, null]);
  });

  it('nao fixa o mes 0 em 100%: desistencia imediata aparece', () => {
    // Duas entram em junho, uma desiste antes do fim do proprio mes.
    const matriculas = [m([2026, 5, 2], [2026, 5, 28]), m([2026, 5, 4])];
    const [junho] = montarCoorte(matriculas, 1, new Date(2026, 5, 30));

    expect(junho?.tamanho).toBe(2);
    expect(junho?.retidas[0]).toBe(1); // e nao 2
  });

  it('marca como nulo o mes que ainda nao terminou para a safra', () => {
    const linhas = montarCoorte([m([2026, 7, 1])], 3, AGOSTO_2026);
    const agosto = linhas[2];
    // A safra mais nova so tem a coluna 0 medida.
    expect(agosto?.retidas).toEqual([1, null, null]);
  });

  it('safra vazia continua na tabela, com tamanho zero', () => {
    const linhas = montarCoorte([m([2026, 7, 5])], 3, AGOSTO_2026);
    expect(linhas.map((linha) => linha.tamanho)).toEqual([0, 0, 1]);
    expect(linhas.map((linha) => linha.label)).toEqual(['jun/26', 'jul/26', 'ago/26']);
  });

  it('ignora matriculas anteriores a janela', () => {
    const linhas = montarCoorte([m([2020, 0, 1]), m([2026, 7, 3])], 2, AGOSTO_2026);
    expect(linhas.reduce((total, linha) => total + linha.tamanho, 0)).toBe(1);
  });
});

describe('churnMensal', () => {
  it('divide saidas do mes pela base do inicio do mes', () => {
    const matriculas = [
      m([2026, 4, 1]), // ativa desde maio, nunca saiu
      m([2026, 4, 2], [2026, 6, 10]), // sai em julho
      m([2026, 4, 3], [2026, 6, 20]), // sai em julho
      m([2026, 4, 4]),
    ];

    const serie = churnMensal(matriculas, 3, AGOSTO_2026);
    const julho = serie[1];

    expect(julho?.label).toBe('jul/26');
    expect(julho?.base).toBe(4);
    expect(julho?.saidas).toBe(2);
    expect(julho?.taxa).toBe(0.5);
  });

  it('nao conta como base quem entrou no proprio mes', () => {
    // Entrou em julho: nao estava na base do inicio de julho.
    const serie = churnMensal([m([2026, 6, 15])], 2, new Date(2026, 7, 10));
    expect(serie[0]?.base).toBe(0);
    expect(serie[1]?.base).toBe(1); // ja conta em agosto
  });

  it('devolve taxa nula quando nao havia base — e nao zero', () => {
    const serie = churnMensal([], 2, AGOSTO_2026);
    expect(serie.every((ponto) => ponto.taxa === null)).toBe(true);
  });
});

describe('permanencia', () => {
  it('mede so as matriculas ja encerradas', () => {
    const resultado = permanencia([
      m([2026, 0, 1], [2026, 0, 11]), // 10 dias
      m([2026, 0, 1], [2026, 0, 21]), // 20 dias
      m([2026, 0, 1], [2026, 2, 2]), // 60 dias
      m([2026, 0, 1]), // aberta: fora da conta
    ]);

    expect(resultado.encerradas).toBe(3);
    expect(resultado.mediaDias).toBe(30);
    expect(resultado.medianaDias).toBe(20);
  });

  it('a mediana resiste ao caso extremo que distorce a media', () => {
    const resultado = permanencia([
      m([2026, 0, 1], [2026, 0, 11]),
      m([2026, 0, 1], [2026, 0, 11]),
      m([2020, 0, 1], [2030, 0, 1]), // dez anos
    ]);

    expect(resultado.medianaDias).toBe(10);
    expect(resultado.mediaDias!).toBeGreaterThan(1000);
  });

  it('sem matricula encerrada nao inventa media', () => {
    expect(permanencia([m([2026, 0, 1])])).toEqual({
      encerradas: 0,
      mediaDias: null,
      medianaDias: null,
    });
  });
});
