import { describe, expect, it } from 'vitest';
import {
  diasDeTrancamento,
  referenciaDoDia,
  motivoDoTrancamento,
  trancamentoCobre,
  trancamentoFuturo,
  trancamentoVigente,
} from './trancamento.js';

// `d` imita o que o PRISMA devolve para uma coluna DATE: meia-noite UTC.
// Construir em horario local aqui esconderia justamente o bug que estes testes
// existem para travar — a leitura local de `2026-08-28T00:00:00Z` no Brasil da
// 27/08, e a pausa passava a valer um dia antes do combinado.
const d = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes - 1, dia));

// `ref` e um instante LOCAL: e assim que "agora" chega a regra.
const ref = (ano: number, mes: number, dia: number, hora = 12) =>
  new Date(ano, mes - 1, dia, hora);

describe('trancamentoCobre', () => {
  const pausa = { dtInicio: d(2026, 3, 10), dtPrevisaoRetorno: d(2026, 5, 10), dtRetorno: null };

  it('cobre do dia do inicio em diante', () => {
    expect(trancamentoCobre(pausa, ref(2026, 3, 9))).toBe(false);
    // O proprio dia do inicio ja conta: quem trancou hoje nao treina hoje.
    expect(trancamentoCobre(pausa, ref(2026, 3, 10))).toBe(true);
    expect(trancamentoCobre(pausa, ref(2026, 4, 1))).toBe(true);
  });

  it('libera NO dia do retorno, nao no seguinte', () => {
    expect(trancamentoCobre(pausa, ref(2026, 5, 9))).toBe(true);
    expect(trancamentoCobre(pausa, ref(2026, 5, 10))).toBe(false);
  });

  it('compara por dia, ignorando a hora', () => {
    expect(trancamentoCobre(pausa, new Date(2026, 4, 9, 23, 59, 59))).toBe(true);
    expect(trancamentoCobre(pausa, new Date(2026, 4, 10, 0, 0, 1))).toBe(false);
  });

  // Regressao do bug encontrado testando contra o banco de verdade.
  //
  // Uma pausa que comeca HOJE nao pode valer ontem. Com os getters locais sobre
  // a meia-noite UTC que o driver devolve, `dtInicio` de 28/08 lia como 27/08 e
  // a pausa cobria um dia a mais no comeco — e liberava um dia antes no fim.
  it('nao adianta um dia por causa do fuso da coluna DATE', () => {
    const comecaHoje = { dtInicio: d(2026, 8, 28), dtPrevisaoRetorno: d(2026, 10, 27), dtRetorno: null };
    // Vespera, ja de noite no Brasil (03:00Z do dia 28): ainda nao vale.
    expect(trancamentoCobre(comecaHoje, new Date(2026, 7, 27, 23, 0))).toBe(false);
    expect(trancamentoCobre(comecaHoje, new Date(2026, 7, 28, 0, 30))).toBe(true);
    // E a volta acontece no dia combinado, nao na vespera.
    expect(trancamentoCobre(comecaHoje, new Date(2026, 9, 26, 22, 0))).toBe(true);
    expect(trancamentoCobre(comecaHoje, new Date(2026, 9, 27, 8, 0))).toBe(false);
  });

  it('o retorno registrado manda na previsao', () => {
    // Combinou voltar em maio, voltou em abril.
    const voltouAntes = { ...pausa, dtRetorno: d(2026, 4, 5) };
    expect(trancamentoCobre(voltouAntes, ref(2026, 4, 4))).toBe(true);
    expect(trancamentoCobre(voltouAntes, ref(2026, 4, 5))).toBe(false);

    // Combinou voltar em maio, so voltou em junho.
    const voltouDepois = { ...pausa, dtRetorno: d(2026, 6, 1) };
    expect(trancamentoCobre(voltouDepois, ref(2026, 5, 20))).toBe(true);
    expect(trancamentoCobre(voltouDepois, ref(2026, 6, 1))).toBe(false);
  });

  it('a previsao vencida encerra a pausa sozinha', () => {
    // Regra deliberada: pausa com prazo que ninguem fechou nao segue valendo.
    expect(trancamentoCobre(pausa, ref(2026, 12, 1))).toBe(false);
  });

  // Desfazer no mesmo dia: a pausa nao chega a cobrir nada, e a linha fica no
  // historico com zero dias. E como a recepcao corrige um clique errado.
  it('retorno no mesmo dia do inicio anula a pausa', () => {
    const desfeito = { dtInicio: d(2026, 3, 10), dtPrevisaoRetorno: d(2026, 5, 10), dtRetorno: d(2026, 3, 10) };
    expect(trancamentoCobre(desfeito, ref(2026, 3, 10))).toBe(false);
    expect(diasDeTrancamento(desfeito)).toBe(0);
  });

  it('sem previsao e sem retorno, segue trancado', () => {
    const semPrazo = { dtInicio: d(2026, 3, 10), dtPrevisaoRetorno: null, dtRetorno: null };
    expect(trancamentoCobre(semPrazo, ref(2030, 1, 1))).toBe(true);
  });

  it('registro inativado nao cobre nada', () => {
    expect(trancamentoCobre({ ...pausa, boInativo: true }, ref(2026, 4, 1))).toBe(false);
  });
});

describe('referenciaDoDia', () => {
  // Regressao: sem esta conversao, perguntar "ja esta trancado no dia X?" com X
  // vindo do banco comparava contra o dia ANTERIOR, e a mesma matricula aceitava
  // dois trancamentos sobrepostos.
  it('permite comparar um dia armazenado contra a regra', () => {
    const pausa = { dtInicio: d(2026, 3, 10), dtPrevisaoRetorno: d(2026, 5, 10), dtRetorno: null };
    const mesmoDiaArmazenado = d(2026, 3, 10);

    expect(trancamentoCobre(pausa, mesmoDiaArmazenado)).toBe(false); // leitura ingenua erra
    expect(trancamentoCobre(pausa, referenciaDoDia(mesmoDiaArmazenado))).toBe(true);
  });
});

describe('trancamentoVigente', () => {
  it('devolve o registro que cobre a data, e nao apenas um booleano', () => {
    const historico = [
      { id: 1, dtInicio: d(2025, 1, 1), dtPrevisaoRetorno: null, dtRetorno: d(2025, 3, 1) },
      { id: 2, dtInicio: d(2026, 3, 10), dtPrevisaoRetorno: d(2026, 5, 10), dtRetorno: null },
    ];
    expect(trancamentoVigente(historico, ref(2026, 4, 1))?.id).toBe(2);
    expect(trancamentoVigente(historico, ref(2025, 2, 1))?.id).toBe(1);
    expect(trancamentoVigente(historico, ref(2025, 6, 1))).toBeNull();
  });
});

describe('trancamentoFuturo', () => {
  it('reconhece pausa agendada que ainda nao comecou', () => {
    const agendada = { dtInicio: d(2026, 6, 1), dtPrevisaoRetorno: d(2026, 7, 1), dtRetorno: null };
    expect(trancamentoFuturo(agendada, ref(2026, 5, 20))).toBe(true);
    expect(trancamentoCobre(agendada, ref(2026, 5, 20))).toBe(false);
    expect(trancamentoFuturo(agendada, ref(2026, 6, 1))).toBe(false);
  });
});

describe('diasDeTrancamento', () => {
  it('mede ate o retorno quando ele existe', () => {
    expect(
      diasDeTrancamento({ dtInicio: d(2026, 3, 1), dtRetorno: d(2026, 3, 31) }),
    ).toBe(30);
  });

  it('cai para a previsao, e depois para hoje', () => {
    expect(
      diasDeTrancamento({ dtInicio: d(2026, 3, 1), dtPrevisaoRetorno: d(2026, 3, 11) }),
    ).toBe(10);
    expect(
      diasDeTrancamento({ dtInicio: d(2026, 3, 1) }, ref(2026, 3, 6)),
    ).toBe(5);
  });

  it('nunca devolve negativo', () => {
    expect(diasDeTrancamento({ dtInicio: d(2026, 6, 1) }, ref(2026, 5, 1))).toBe(0);
  });
});

describe('motivoDoTrancamento', () => {
  it('diz ate quando, para a recepcao nao precisar adivinhar', () => {
    expect(motivoDoTrancamento({ dtInicio: d(2026, 3, 1), dtPrevisaoRetorno: d(2026, 5, 10) })).toBe(
      'Plano trancado ate 10/05.',
    );
  });

  it('sem data de volta, avisa so o estado', () => {
    expect(motivoDoTrancamento({ dtInicio: d(2026, 3, 1) })).toBe('Plano trancado.');
  });
});
