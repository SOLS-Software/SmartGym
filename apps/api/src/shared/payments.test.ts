// Testes das datas de vencimento das parcelas.
//
// Isto decide QUANDO o aluno e cobrado. Errar aqui nao quebra nenhuma tela:
// gera um carne plausivel e errado, e quem descobre e o aluno, pagando duas
// vezes o mesmo mes.
import { describe, expect, it } from 'vitest';
import { computeDueDate } from './payments.js';

/** dd/mm/aaaa, para o teste falar a mesma lingua do carne. */
const br = (date: Date) =>
  `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

describe('computeDueDate', () => {
  it('vence no mes da admissao quando o dia ainda nao passou', () => {
    // Admissao dia 5, pagamento dia 10: da tempo de cobrar neste mes.
    expect(br(computeDueDate(new Date(2026, 6, 5), 10, 0))).toBe('10/07/2026');
    expect(br(computeDueDate(new Date(2026, 6, 5), 10, 1))).toBe('10/08/2026');
  });

  it('empurra o CICLO INTEIRO quando o dia ja passou na admissao', () => {
    // Regressao do bug que cobrava o primeiro mes em dobro: admissao em 16/07
    // com pagamento no dia 1 gerava 01/08 para a parcela 0 E para a 1, porque
    // o empurrao so valia para a primeira. As parcelas tem que andar juntas.
    const admissao = new Date(2027, 6, 16);
    expect(br(computeDueDate(admissao, 1, 0))).toBe('01/08/2027');
    expect(br(computeDueDate(admissao, 1, 1))).toBe('01/09/2027');
    expect(br(computeDueDate(admissao, 1, 2))).toBe('01/10/2027');
  });

  it('nunca gera duas parcelas na mesma data', () => {
    // Varre as combinacoes que mordem: qualquer dia de admissao contra
    // qualquer dia de vencimento, doze parcelas.
    for (const diaAdmissao of [1, 5, 15, 16, 28]) {
      for (const diaPagamento of [1, 10, 28]) {
        const admissao = new Date(2026, 0, diaAdmissao);
        const datas = Array.from({ length: 12 }, (_, i) =>
          computeDueDate(admissao, diaPagamento, i).getTime(),
        );
        expect(new Set(datas).size).toBe(datas.length);
      }
    }
  });

  it('nenhuma parcela vence antes da admissao', () => {
    for (const diaAdmissao of [1, 15, 16, 31]) {
      for (const diaPagamento of [1, 10, 31]) {
        const admissao = new Date(2026, 0, Math.min(diaAdmissao, 31));
        const primeira = computeDueDate(admissao, diaPagamento, 0);
        expect(primeira.getTime()).toBeGreaterThanOrEqual(admissao.getTime());
      }
    }
  });

  it('encaixa o dia 31 nos meses curtos', () => {
    // Fevereiro nao tem 31. Sem o encaixe, a data viraria marco e a parcela
    // pularia um mes inteiro.
    expect(br(computeDueDate(new Date(2026, 0, 1), 31, 1))).toBe('28/02/2026');
    expect(br(computeDueDate(new Date(2026, 0, 1), 31, 3))).toBe('30/04/2026');
  });

  it('atravessa a virada do ano', () => {
    expect(br(computeDueDate(new Date(2026, 10, 1), 5, 3))).toBe('05/02/2027');
  });

  it('trata dia de pagamento fora da faixa', () => {
    // 0 e 99 nao existem no calendario; a funcao encaixa em 1 e no ultimo dia
    // em vez de produzir data invalida.
    expect(br(computeDueDate(new Date(2026, 5, 10), 0, 0))).toBe('01/07/2026');
    expect(br(computeDueDate(new Date(2026, 5, 1), 99, 0))).toBe('30/06/2026');
  });
});
