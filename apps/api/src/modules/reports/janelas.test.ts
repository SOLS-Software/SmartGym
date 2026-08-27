import { describe, expect, it } from 'vitest';
import { chaveDoDia, encaixar, limitesDe, ultimasSemanas, ultimosMeses } from './janelas.js';

// Datas montadas com `new Date(ano, mes, dia)` de proposito: as janelas sao
// horario LOCAL (ver o cabecalho de janelas.ts), e um literal ISO seria UTC.
const QUARTA_12_AGO_2026 = new Date(2026, 7, 12, 15, 30);

describe('ultimasSemanas', () => {
  it('devolve semanas de segunda a domingo terminando na semana da referencia', () => {
    const semanas = ultimasSemanas(3, QUARTA_12_AGO_2026);

    expect(semanas).toHaveLength(3);
    expect(semanas.map((semana) => semana.label)).toEqual(['27/07', '03/08', '10/08']);
    // Toda janela comeca numa segunda-feira a meia-noite.
    for (const semana of semanas) {
      expect(semana.inicio.getDay()).toBe(1);
      expect(semana.inicio.getHours()).toBe(0);
      expect(semana.fim.getDay()).toBe(0);
      expect(semana.fim.getHours()).toBe(23);
    }
  });

  it('trata domingo como fim da semana que comecou seis dias antes', () => {
    const domingo = new Date(2026, 7, 16, 10, 0);
    const [semana] = ultimasSemanas(1, domingo);
    expect(semana?.label).toBe('10/08');
  });

  it('nao deixa buraco nem sobreposicao entre janelas consecutivas', () => {
    const semanas = ultimasSemanas(12, QUARTA_12_AGO_2026);
    for (let i = 1; i < semanas.length; i += 1) {
      const anterior = semanas[i - 1]!;
      const atual = semanas[i]!;
      expect(atual.inicio.getTime() - anterior.fim.getTime()).toBe(1);
    }
  });
});

describe('ultimosMeses', () => {
  it('rotula em portugues e fecha no ultimo dia de cada mes', () => {
    const meses = ultimosMeses(3, QUARTA_12_AGO_2026);

    expect(meses.map((mes) => mes.label)).toEqual(['jun', 'jul', 'ago']);
    expect(meses[0]?.fim.getDate()).toBe(30); // junho
    expect(meses[1]?.fim.getDate()).toBe(31); // julho
  });

  it('atravessa a virada de ano', () => {
    const meses = ultimosMeses(3, new Date(2026, 0, 20));
    expect(meses.map((mes) => mes.label)).toEqual(['nov', 'dez', 'jan']);
    expect(meses[0]?.inicio.getFullYear()).toBe(2025);
  });

  it('pega fevereiro bissexto', () => {
    const [fevereiro] = ultimosMeses(1, new Date(2028, 1, 10));
    expect(fevereiro?.fim.getDate()).toBe(29);
  });
});

describe('chaveDoDia', () => {
  it('usa horario local, nao UTC', () => {
    // Meia-noite local do dia 1o. Com toISOString(), a oeste de Greenwich isto
    // viraria o dia 31 do mes anterior e deslocaria o balde inteiro.
    expect(chaveDoDia(new Date(2026, 7, 1, 0, 0, 0))).toBe('2026-08-01');
    expect(chaveDoDia(new Date(2026, 7, 31, 23, 59, 59))).toBe('2026-08-31');
  });
});

describe('encaixar', () => {
  it('preenche com zero as janelas sem linha no banco', () => {
    const meses = ultimosMeses(3, QUARTA_12_AGO_2026);
    const serie = encaixar(meses, [{ bucket: '2026-08-01', total: 42 }]);

    expect(serie).toEqual([
      { label: 'jun', value: 0 },
      { label: 'jul', value: 0 },
      { label: 'ago', value: 42 },
    ]);
  });

  it('ignora baldes fora das janelas', () => {
    const meses = ultimosMeses(2, QUARTA_12_AGO_2026);
    const serie = encaixar(meses, [
      { bucket: '2025-01-01', total: 999 },
      { bucket: '2026-07-01', total: 7 },
    ]);

    expect(serie).toEqual([
      { label: 'jul', value: 7 },
      { label: 'ago', value: 0 },
    ]);
  });

  // Regressao do bug que zerava a serie inteira em producao.
  //
  // Quando o balde vinha como Date, o driver entregava a meia-noite LOCAL do
  // Postgres rotulada como UTC: a segunda 13/07 chegava como
  // "2026-07-13T00:00:00Z" e virava domingo 12/07 as 21h em Brasilia. A chave
  // andava um dia e nao casava com janela nenhuma — grafico vazio ao lado de um
  // contador dizendo que havia 8 check-ins. O contrato agora e string, e este
  // teste trava o formato dos dois lados.
  it('casa a chave do banco com a chave da janela, sem converter fuso', () => {
    const semanas = ultimasSemanas(3, QUARTA_12_AGO_2026);
    const segundaDaUltima = semanas[2]!;

    expect(chaveDoDia(segundaDaUltima.inicio)).toBe('2026-08-10');
    expect(encaixar(semanas, [{ bucket: '2026-08-10', total: 8 }])).toEqual([
      { label: '27/07', value: 0 },
      { label: '03/08', value: 0 },
      { label: '10/08', value: 8 },
    ]);

    // O formato antigo (ISO com Z) nao casa mais em silencio: se alguem voltar
    // a mandar Date pela consulta, a serie zera no teste e nao em producao.
    expect(encaixar(semanas, [{ bucket: '2026-08-10T00:00:00.000Z', total: 8 }])).toEqual([
      { label: '27/07', value: 0 },
      { label: '03/08', value: 0 },
      { label: '10/08', value: 0 },
    ]);
  });

  it('preserva a ordem cronologica das janelas', () => {
    const semanas = ultimasSemanas(3, QUARTA_12_AGO_2026);
    const serie = encaixar(semanas, [
      { bucket: chaveDoDia(semanas[2]!.inicio), total: 3 },
      { bucket: chaveDoDia(semanas[0]!.inicio), total: 1 },
    ]);

    expect(serie.map((ponto) => ponto.value)).toEqual([1, 0, 3]);
  });
});

describe('limitesDe', () => {
  it('cobre do primeiro ao ultimo instante da serie', () => {
    const meses = ultimosMeses(6, QUARTA_12_AGO_2026);
    const limites = limitesDe(meses);

    expect(limites?.inicio).toEqual(new Date(2026, 2, 1));
    expect(limites?.fim).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('devolve nulo para lista vazia', () => {
    expect(limitesDe([])).toBeNull();
  });
});
