// A conta que decide se a recepcao entrega. Os dois erros que importam:
// deixar entregar duas vezes (uso de outra janela nao contado) e recusar um
// direito que o aluno tem (uso de outro beneficio contado por engano).
import { describe, expect, it } from 'vitest';
import {
  escolherBeneficioDeProduto,
  inicioDaJanela,
  janelaDoBeneficio,
  saldoDoBeneficio,
  saldosDoPlano,
} from './planBenefits.js';

const camiseta = {
  id: 1,
  cnTipo: 'produto',
  dsBeneficio: 'Camiseta da assinatura',
  qtLimite: 1,
  cnJanela: 'matricula',
};

const avaliacaoMensal = {
  id: 2,
  cnTipo: 'avaliacao',
  dsBeneficio: 'Avaliação física',
  qtLimite: 1,
  cnJanela: 'mes',
};

const agora = new Date(2026, 8, 15, 10, 0); // 15/09/2026
const uso = (idPlanoBeneficio: number, data: Date, extras: Record<string, unknown> = {}) => ({
  idPlanoBeneficio,
  qtUsada: 1,
  dtUso: data,
  ...extras,
});

describe('janelaDoBeneficio', () => {
  it('aceita as tres janelas do cadastro', () => {
    expect(janelaDoBeneficio('matricula')).toBe('matricula');
    expect(janelaDoBeneficio('MES')).toBe('mes');
    expect(janelaDoBeneficio(' ano ')).toBe('ano');
  });

  it('desconhecida vira null', () => {
    expect(janelaDoBeneficio('semestre')).toBeNull();
    expect(janelaDoBeneficio(null)).toBeNull();
  });
});

describe('inicioDaJanela', () => {
  it('matricula conta desde sempre', () => {
    // O filtro por matricula ja e feito na consulta; aqui nao ha corte de data.
    expect(inicioDaJanela('matricula', agora)).toBeNull();
  });

  it('mes e ano sao de calendario', () => {
    // "Uma avaliacao por mes" quer dizer uma em setembro e outra em outubro.
    // Janela movel de 30 dias faria quem avaliou dia 28 esperar ate o dia 28
    // seguinte — e ninguem entende esse "nao" no balcao.
    expect(inicioDaJanela('mes', agora)).toEqual(new Date(2026, 8, 1));
    expect(inicioDaJanela('ano', agora)).toEqual(new Date(2026, 0, 1));
  });
});

describe('saldoDoBeneficio', () => {
  it('direito intacto pode ser usado', () => {
    const saldo = saldoDoBeneficio(camiseta, [], agora);
    expect(saldo).toMatchObject({
      limite: 1,
      usadas: 0,
      restantes: 1,
      podeUsar: true,
      janela: 'por matrícula',
      descricao: 'Camiseta da assinatura',
    });
  });

  it('uma vez por matricula nao volta com o tempo', () => {
    // A camiseta entregue em janeiro continua entregue em setembro.
    const saldo = saldoDoBeneficio(camiseta, [uso(1, new Date(2026, 0, 5))], agora);
    expect(saldo.usadas).toBe(1);
    expect(saldo.restantes).toBe(0);
    expect(saldo.podeUsar).toBe(false);
  });

  it('mensal ignora o uso do mes passado', () => {
    const saldo = saldoDoBeneficio(
      avaliacaoMensal,
      [uso(2, new Date(2026, 7, 31, 23, 0))],
      agora,
    );
    expect(saldo.usadas).toBe(0);
    expect(saldo.podeUsar).toBe(true);
  });

  it('mensal conta o uso deste mes', () => {
    const saldo = saldoDoBeneficio(avaliacaoMensal, [uso(2, new Date(2026, 8, 2))], agora);
    expect(saldo.usadas).toBe(1);
    expect(saldo.podeUsar).toBe(false);
  });

  it('nao conta uso de OUTRO beneficio', () => {
    // O erro que recusaria um direito que o aluno tem.
    const saldo = saldoDoBeneficio(camiseta, [uso(2, new Date(2026, 8, 2))], agora);
    expect(saldo.usadas).toBe(0);
    expect(saldo.podeUsar).toBe(true);
  });

  it('uso cancelado devolve o direito', () => {
    // Entrega inativada e entrega desfeita: append-only, mas nao conta.
    const saldo = saldoDoBeneficio(camiseta, [uso(1, new Date(2026, 8, 2), { boInativo: true })], agora);
    expect(saldo.usadas).toBe(0);
    expect(saldo.podeUsar).toBe(true);
  });

  it('soma quantidades maiores que um', () => {
    const doisPasses = { ...camiseta, id: 3, qtLimite: 4, dsBeneficio: 'Passe de convidado' };
    const saldo = saldoDoBeneficio(
      doisPasses,
      [uso(3, new Date(2026, 2, 1), { qtUsada: 3 })],
      agora,
    );
    expect(saldo.usadas).toBe(3);
    expect(saldo.restantes).toBe(1);
    expect(saldo.podeUsar).toBe(true);
  });

  it('nunca devolve saldo negativo', () => {
    // Entrega manual a mais nao pode virar "-1 restante" na tela.
    const saldo = saldoDoBeneficio(
      camiseta,
      [uso(1, new Date(2026, 1, 1)), uso(1, new Date(2026, 3, 1))],
      agora,
    );
    expect(saldo.usadas).toBe(2);
    expect(saldo.restantes).toBe(0);
  });

  it('beneficio inativo mostra o historico mas nao entrega', () => {
    const saldo = saldoDoBeneficio({ ...camiseta, boInativo: true }, [], agora);
    expect(saldo.podeUsar).toBe(false);
    expect(saldo.limite).toBe(1);
  });

  it('cai no nome do produto quando o beneficio nao tem descricao', () => {
    const saldo = saldoDoBeneficio(
      { ...camiseta, dsBeneficio: '   ', produto: { id: 9, dsProduto: 'Garrafa' } },
      [],
      agora,
    );
    expect(saldo.descricao).toBe('Garrafa');
  });

  it('janela desconhecida cai em matricula, a mais restritiva', () => {
    // Errar para o lado de entregar menos: entregar a mais nao volta.
    const saldo = saldoDoBeneficio(
      { ...camiseta, cnJanela: 'semestre' },
      [uso(1, new Date(2026, 0, 5))],
      agora,
    );
    expect(saldo.podeUsar).toBe(false);
  });
});

describe('saldosDoPlano', () => {
  it('mantem a ordem e separa os usos por beneficio', () => {
    const saldos = saldosDoPlano(
      [camiseta, avaliacaoMensal],
      [uso(1, new Date(2026, 0, 5)), uso(2, new Date(2026, 8, 3))],
      agora,
    );
    expect(saldos.map((saldo) => saldo.idPlanoBeneficio)).toEqual([1, 2]);
    expect(saldos[0]!.podeUsar).toBe(false);
    expect(saldos[1]!.podeUsar).toBe(false);
  });
});

describe('escolherBeneficioDeProduto', () => {
  const camisetaProduto = {
    id: 1,
    cnTipo: 'produto',
    dsBeneficio: 'Camiseta da assinatura',
    qtLimite: 1,
    cnJanela: 'matricula',
    produto: { id: 50, dsProduto: 'Camiseta' },
  };
  const avaliacao = {
    id: 2,
    cnTipo: 'avaliacao',
    dsBeneficio: 'Avaliação física',
    qtLimite: 1,
    cnJanela: 'mes',
  };
  const hoje = new Date(2026, 8, 15);

  it('o saldo carrega o produto, para o balcao casar com a venda', () => {
    // Sem isto a tela de vendas nunca reconheceria que o produto escolhido ja
    // e direito do aluno — o botao simplesmente nao apareceria.
    const saldos = saldosDoPlano([camisetaProduto, avaliacao], [], hoje);
    expect(saldos[0]!.idProduto).toBe(50);
    expect(saldos[1]!.idProduto).toBeNull();
  });

  it('acha o direito do produto vendido', () => {
    const saldos = saldosDoPlano([camisetaProduto, avaliacao], [], hoje);
    const escolha = escolherBeneficioDeProduto(saldos, [camisetaProduto, avaliacao], 50, 1);
    expect('saldo' in escolha && escolha.saldo.idPlanoBeneficio).toBe(1);
  });

  it('nao confunde com direito de outro produto nem com avaliacao', () => {
    const saldos = saldosDoPlano([camisetaProduto, avaliacao], [], hoje);
    expect(escolherBeneficioDeProduto(saldos, [camisetaProduto, avaliacao], 99, 1)).toEqual({
      motivo: 'O plano do aluno nao inclui este produto.',
    });
  });

  it('recusa quantidade maior que o saldo, dizendo quanto cobre', () => {
    // Metade cortesia e metade venda na mesma linha exigiria dividir
    // movimentacao e cobranca; melhor o balcao fazer duas operacoes.
    const saldos = saldosDoPlano([camisetaProduto], [], hoje);
    const escolha = escolherBeneficioDeProduto(saldos, [camisetaProduto], 50, 3);
    expect('motivo' in escolha && escolha.motivo).toContain('cobre 1 unidade(s)');
  });

  it('direito ja usado devolve o motivo com os numeros', () => {
    const saldos = saldosDoPlano(
      [camisetaProduto],
      [{ idPlanoBeneficio: 1, qtUsada: 1, dtUso: new Date(2026, 1, 1) }],
      hoje,
    );
    const escolha = escolherBeneficioDeProduto(saldos, [camisetaProduto], 50, 1);
    expect('motivo' in escolha && escolha.motivo).toBe(
      'Camiseta da assinatura: ja usou 1 de 1 por matrícula.',
    );
  });

  it('ignora beneficio inativo', () => {
    const inativo = { ...camisetaProduto, boInativo: true };
    const saldos = saldosDoPlano([inativo], [], hoje);
    expect(escolherBeneficioDeProduto(saldos, [inativo], 50, 1)).toEqual({
      motivo: 'O plano do aluno nao inclui este produto.',
    });
  });
});
