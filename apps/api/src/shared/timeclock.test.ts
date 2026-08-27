// Testes do espelho de ponto.
//
// Sem banco de proposito: e conta de hora trabalhada. Errar aqui nao quebra
// nenhuma tela — so produz um total plausivel e errado, que e o pior tipo de
// defeito porque ninguem desconfia dele.
import { describe, expect, it } from 'vitest';
import {
  buildTimeSheet,
  dayKey,
  formatMinutes,
  nextPunchType,
  type Punch,
} from './timeclock.js';

let proximoId = 1;

/** Batida no dia informado, hora local. */
function batida(dia: string, hora: string, cnTipo: 'entrada' | 'saida'): Punch {
  return { id: proximoId++, cnTipo, dtRegistro: new Date(`${dia}T${hora}:00`) };
}

describe('nextPunchType', () => {
  it('comeca por entrada quando o dia nao tem batida', () => {
    expect(nextPunchType(null)).toBe('entrada');
    expect(nextPunchType(undefined)).toBe('entrada');
  });

  it('alterna a partir da ultima batida', () => {
    expect(nextPunchType(batida('2026-08-25', '08:00', 'entrada'))).toBe('saida');
    expect(nextPunchType(batida('2026-08-25', '12:00', 'saida'))).toBe('entrada');
  });
});

describe('dayKey', () => {
  it('usa o dia LOCAL e nao o de UTC', () => {
    // No fuso do Brasil (UTC-3), 22h vira o dia seguinte em UTC. Se o
    // agrupamento usasse toISOString, a batida da noite cairia no dia errado e
    // o espelho mostraria jornada em dia que a pessoa nao trabalhou.
    expect(dayKey(new Date('2026-08-25T22:30:00'))).toBe('2026-08-25');
    expect(dayKey(new Date('2026-08-25T00:10:00'))).toBe('2026-08-25');
  });
});

describe('buildTimeSheet', () => {
  it('emparelha entrada e saida e soma o intervalo', () => {
    const espelho = buildTimeSheet([
      batida('2026-08-25', '08:00', 'entrada'),
      batida('2026-08-25', '12:00', 'saida'),
    ]);

    expect(espelho.dias).toHaveLength(1);
    expect(espelho.dias[0]!.minutos).toBe(240);
    expect(espelho.totalMinutos).toBe(240);
    expect(espelho.diasTrabalhados).toBe(1);
    expect(espelho.dias[0]!.aberto).toBe(false);
    expect(espelho.dias[0]!.inconsistente).toBe(false);
  });

  it('soma os dois turnos de quem sai para almocar', () => {
    const espelho = buildTimeSheet([
      batida('2026-08-25', '08:00', 'entrada'),
      batida('2026-08-25', '12:00', 'saida'),
      batida('2026-08-25', '13:00', 'entrada'),
      batida('2026-08-25', '17:30', 'saida'),
    ]);

    expect(espelho.dias[0]!.pares).toHaveLength(2);
    expect(espelho.totalMinutos).toBe(240 + 270);
    expect(espelho.dias[0]!.inconsistente).toBe(false);
  });

  it('ordena por horario mesmo recebendo fora de ordem', () => {
    const espelho = buildTimeSheet([
      batida('2026-08-25', '17:00', 'saida'),
      batida('2026-08-25', '09:00', 'entrada'),
    ]);

    expect(espelho.totalMinutos).toBe(480);
    expect(espelho.dias[0]!.inconsistente).toBe(false);
  });

  it('marca como aberto o dia que so tem entrada', () => {
    const espelho = buildTimeSheet([batida('2026-08-25', '08:00', 'entrada')]);

    expect(espelho.dias[0]!.aberto).toBe(true);
    expect(espelho.dias[0]!.minutos).toBe(0);
    // Nao inventa saida: quem ainda esta dentro nao tem hora fechada.
    expect(espelho.totalMinutos).toBe(0);
    expect(espelho.diasTrabalhados).toBe(0);
  });

  it('nao descarta saida sem entrada — marca o dia como inconsistente', () => {
    const espelho = buildTimeSheet([batida('2026-08-25', '17:00', 'saida')]);

    expect(espelho.dias[0]!.inconsistente).toBe(true);
    expect(espelho.dias[0]!.pares).toEqual([
      expect.objectContaining({ entrada: null, minutos: 0 }),
    ]);
    // A batida continua visivel: some-la esconderia justamente o caso que
    // precisa da correcao do gerente.
    expect(espelho.dias[0]!.batidas).toHaveLength(1);
  });

  it('duas entradas seguidas deixam a primeira sem par e acusam o dia', () => {
    const espelho = buildTimeSheet([
      batida('2026-08-25', '08:00', 'entrada'),
      batida('2026-08-25', '13:00', 'entrada'),
      batida('2026-08-25', '17:00', 'saida'),
    ]);

    expect(espelho.dias[0]!.inconsistente).toBe(true);
    // So o par fechado conta: as 4h da manha nao viram hora porque ninguem
    // sabe quando ela terminou.
    expect(espelho.totalMinutos).toBe(240);
  });

  it('separa dias e devolve o mais recente primeiro', () => {
    const espelho = buildTimeSheet([
      batida('2026-08-24', '08:00', 'entrada'),
      batida('2026-08-24', '12:00', 'saida'),
      batida('2026-08-25', '08:00', 'entrada'),
      batida('2026-08-25', '10:00', 'saida'),
    ]);

    expect(espelho.dias.map((dia) => dia.dia)).toEqual(['2026-08-25', '2026-08-24']);
    expect(espelho.totalMinutos).toBe(240 + 120);
    expect(espelho.diasTrabalhados).toBe(2);
  });

  it('turno que vira o dia aparece partido, sem supor duracao de jornada', () => {
    const espelho = buildTimeSheet([
      batida('2026-08-25', '22:00', 'entrada'),
      batida('2026-08-26', '06:00', 'saida'),
    ]);

    expect(espelho.dias).toHaveLength(2);
    expect(espelho.totalMinutos).toBe(0);
    expect(espelho.dias.find((dia) => dia.dia === '2026-08-25')!.aberto).toBe(true);
    expect(espelho.dias.find((dia) => dia.dia === '2026-08-26')!.inconsistente).toBe(true);
  });

  it('devolve espelho vazio sem batida nenhuma', () => {
    expect(buildTimeSheet([])).toEqual({ dias: [], totalMinutos: 0, diasTrabalhados: 0 });
  });
});

describe('formatMinutes', () => {
  it('formata horas e minutos com dois digitos', () => {
    expect(formatMinutes(0)).toBe('0h00');
    expect(formatMinutes(5)).toBe('0h05');
    expect(formatMinutes(60)).toBe('1h00');
    expect(formatMinutes(455)).toBe('7h35');
  });
});
