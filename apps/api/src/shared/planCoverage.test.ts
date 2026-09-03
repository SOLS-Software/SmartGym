// Estas regras decidem quem passa na catraca e quem entra na aula. O caso que
// mais assusta nao e o aluno errado entrar: e a lista vazia trancar a porta de
// todo mundo — a maioria dos planos cadastrados nao tem filial nem atividade
// marcada.
import { describe, expect, it } from 'vitest';
import {
  avaliarFrequencia,
  motivoForaDaUnidade,
  motivoForaDoPlano,
  periodoDeAcesso,
  planoCobreAtividade,
  planoCobreUnidade,
} from './planCoverage.js';

describe('planoCobreUnidade', () => {
  const unidades = [
    { idEmpresa: 1, empresa: { dsEmpresa: 'Filial 1' } },
    { idEmpresa: 2, empresa: { dsEmpresa: 'Filial 2' } },
  ];

  it('lista vazia = plano da rede toda', () => {
    // A convencao do cadastro. Inverter isso trancaria a porta de todo plano
    // que nunca preencheu a lista — que sao quase todos.
    expect(planoCobreUnidade([], 7)).toBe(true);
    expect(planoCobreUnidade(null, 7)).toBe(true);
    expect(planoCobreUnidade(undefined, 7)).toBe(true);
  });

  it('cobre as unidades listadas e recusa as demais', () => {
    expect(planoCobreUnidade(unidades, 1)).toBe(true);
    expect(planoCobreUnidade(unidades, 2)).toBe(true);
    expect(planoCobreUnidade(unidades, 3)).toBe(false);
  });

  it('ignora linha inativa', () => {
    // Tirar a filial do plano tem que fechar a porta dela.
    const semFilial2 = [unidades[0]!, { ...unidades[1]!, boInativo: true }];
    expect(planoCobreUnidade(semFilial2, 2)).toBe(false);
    expect(planoCobreUnidade(semFilial2, 1)).toBe(true);
  });

  it('sem unidade informada nao ha o que negar', () => {
    // Login e telas do aluno perguntam "ele esta em dia?" sem falar de porta
    // nenhuma; a resposta nao pode virar "nao" so por falta de contexto.
    expect(planoCobreUnidade(unidades, null)).toBe(true);
    expect(planoCobreUnidade(unidades, undefined)).toBe(true);
  });

  it('todas as linhas inativas voltam a valer como rede toda', () => {
    const todasInativas = unidades.map((u) => ({ ...u, boInativo: true }));
    expect(planoCobreUnidade(todasInativas, 9)).toBe(true);
  });
});

describe('motivoForaDaUnidade', () => {
  it('diz onde o plano vale, nao apenas que nao vale aqui', () => {
    expect(
      motivoForaDaUnidade([{ idEmpresa: 1, empresa: { dsEmpresa: 'Centro' } }]),
    ).toBe('Plano valido apenas na unidade Centro.');

    expect(
      motivoForaDaUnidade([
        { idEmpresa: 1, empresa: { dsEmpresa: 'Centro' } },
        { idEmpresa: 2, empresa: { dsEmpresa: 'Zona Sul' } },
      ]),
    ).toBe('Plano valido apenas nas unidades: Centro, Zona Sul.');
  });

  it('aguenta unidade sem nome', () => {
    expect(motivoForaDaUnidade([{ idEmpresa: 1 }])).toBe('Plano nao cobre esta unidade.');
  });
});

describe('planoCobreAtividade', () => {
  const atividades = [
    { idAtividade: 10, idEmpresa: null, atividade: { dsAtividade: 'Musculação' } },
    { idAtividade: 20, idEmpresa: 2, atividade: { dsAtividade: 'Natação' } },
  ];

  it('lista vazia = todas as atividades', () => {
    expect(planoCobreAtividade([], 99, 1)).toBe(true);
  });

  it('cobre a atividade geral em qualquer unidade', () => {
    expect(planoCobreAtividade(atividades, 10, 1)).toBe(true);
    expect(planoCobreAtividade(atividades, 10, 2)).toBe(true);
  });

  it('respeita a atividade presa a uma unidade', () => {
    // "Natacao so na Filial 2" e um plano que existe de verdade.
    expect(planoCobreAtividade(atividades, 20, 2)).toBe(true);
    expect(planoCobreAtividade(atividades, 20, 1)).toBe(false);
  });

  it('recusa atividade fora da lista', () => {
    expect(planoCobreAtividade(atividades, 30, 2)).toBe(false);
  });

  it('ignora linha inativa', () => {
    const semNatacao = [atividades[0]!, { ...atividades[1]!, boInativo: true }];
    expect(planoCobreAtividade(semNatacao, 20, 2)).toBe(false);
  });
});

describe('motivoForaDoPlano', () => {
  it('nomeia a aula recusada e o que o plano inclui', () => {
    const texto = motivoForaDoPlano(
      [
        { idAtividade: 10, atividade: { dsAtividade: 'Musculação' } },
        { idAtividade: 11, atividade: { dsAtividade: 'Spinning' } },
      ],
      'Pilates',
    );
    expect(texto).toBe('Seu plano nao inclui Pilates. Ele da acesso a: Musculação, Spinning.');
  });

  it('nao repete a mesma atividade listada por unidade', () => {
    const texto = motivoForaDoPlano(
      [
        { idAtividade: 10, idEmpresa: 1, atividade: { dsAtividade: 'Musculação' } },
        { idAtividade: 10, idEmpresa: 2, atividade: { dsAtividade: 'Musculação' } },
      ],
      'Pilates',
    );
    expect(texto).toBe('Seu plano nao inclui Pilates. Ele da acesso a: Musculação.');
  });
});

describe('periodoDeAcesso', () => {
  it('aceita so os tres periodos do cadastro', () => {
    expect(periodoDeAcesso('dia')).toBe('dia');
    expect(periodoDeAcesso('SEMANA')).toBe('semana');
    expect(periodoDeAcesso(' mes ')).toBe('mes');
  });

  it('qualquer outra coisa vira null, e null nao limita nada', () => {
    // Inclusive o que vinha do ciclo de cobranca ("Mes(es)", "Dia(s)"): ler
    // aquilo como periodo de acesso acusaria todo mensalista na primeira visita.
    expect(periodoDeAcesso('Mes(es)')).toBeNull();
    expect(periodoDeAcesso('Dia(s)')).toBeNull();
    expect(periodoDeAcesso('')).toBeNull();
    expect(periodoDeAcesso(null)).toBeNull();
  });
});

describe('avaliarFrequencia', () => {
  const tresPorSemana = { qtAcessosPeriodo: 3, cnPeriodoAcesso: 'semana' };
  const agora = new Date(2026, 8, 10, 18, 0);
  const diasAtras = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);

  it('conta so as entradas dentro da janela movel', () => {
    // Janela movel, e nao semana do calendario: quem treinou sexta e segunda
    // nao estourou "3x por semana" por causa da virada do domingo.
    const uso = avaliarFrequencia(tresPorSemana, [diasAtras(1), diasAtras(3), diasAtras(9)], agora);
    expect(uso.limite).toBe(3);
    expect(uso.usadas).toBe(2);
    expect(uso.excedeu).toBe(false);
    expect(uso.aviso).toBeNull();
  });

  it('sinaliza quando o limite foi alcancado', () => {
    const uso = avaliarFrequencia(tresPorSemana, [diasAtras(0), diasAtras(2), diasAtras(5)], agora);
    expect(uso.usadas).toBe(3);
    expect(uso.excedeu).toBe(true);
    expect(uso.aviso).toContain('3 de 3');
    expect(uso.aviso).toContain('7 dias');
  });

  it('plano sem limite nao gera aviso', () => {
    const vazio = { limite: null, usadas: 0, excedeu: false, aviso: null };
    expect(avaliarFrequencia(null, [diasAtras(1)], agora)).toEqual(vazio);
    expect(avaliarFrequencia({}, [diasAtras(1)], agora)).toEqual(vazio);
    expect(avaliarFrequencia({ qtAcessosPeriodo: 0, cnPeriodoAcesso: 'semana' }, [], agora)).toEqual(
      vazio,
    );
  });

  it('quantidade sem periodo (ou o contrario) nao limita', () => {
    // Meio cadastro nao pode virar acusacao.
    expect(avaliarFrequencia({ qtAcessosPeriodo: 3 }, [diasAtras(1)], agora).limite).toBeNull();
    expect(avaliarFrequencia({ cnPeriodoAcesso: 'semana' }, [diasAtras(1)], agora).limite).toBeNull();
  });

  it('nao conta entrada futura', () => {
    const uso = avaliarFrequencia(
      tresPorSemana,
      [new Date(agora.getTime() + 60 * 60 * 1000), diasAtras(1)],
      agora,
    );
    expect(uso.usadas).toBe(1);
  });

  it('limite diario olha so as ultimas 24h', () => {
    const uso = avaliarFrequencia(
      { qtAcessosPeriodo: 1, cnPeriodoAcesso: 'dia' },
      [diasAtras(2)],
      agora,
    );
    expect(uso.excedeu).toBe(false);
  });
});
