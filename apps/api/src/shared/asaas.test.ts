// Testes da leitura e da verificacao de eventos do Asaas.
//
// E aqui que se decide se um POST vindo da internet pode marcar dinheiro como
// recebido. Por isso os casos incluem os payloads que ninguem consegue produzir
// contra um sandbox: evento sem tipo, tipo desconhecido, corpo vazio, corpo
// hostil. Um sandbox so manda o que o provedor manda; o atacante nao.
import { describe, expect, it } from 'vitest';
import {
  buildCustomerPayload,
  buildPaymentPayload,
  formatDueDate,
  isPaidStatus,
  parseAsaasEvent,
  tokensMatch,
} from './asaas.js';

const TOKEN = 'k9Zx2pQw7mNv4TbL8sRy1cHj6dFg0aEu';

describe('tokensMatch', () => {
  it('aceita o token igual', () => {
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
  });

  it('recusa token diferente do mesmo tamanho', () => {
    const trocado = `${TOKEN.slice(0, -1)}X`;
    expect(trocado.length).toBe(TOKEN.length);
    expect(tokensMatch(trocado, TOKEN)).toBe(false);
  });

  it('recusa tamanhos diferentes sem estourar', () => {
    // `timingSafeEqual` lanca com tamanhos diferentes; a funcao tem que
    // devolver false, nao derrubar a rota.
    expect(tokensMatch('curto', TOKEN)).toBe(false);
    expect(tokensMatch(`${TOKEN}extra`, TOKEN)).toBe(false);
  });

  it('recusa ausencia dos dois lados', () => {
    expect(tokensMatch(undefined, TOKEN)).toBe(false);
    expect(tokensMatch(null, TOKEN)).toBe(false);
    expect(tokensMatch('', TOKEN)).toBe(false);
    expect(tokensMatch(TOKEN, null)).toBe(false);
    expect(tokensMatch(TOKEN, '')).toBe(false);
  });

  it('recusa o que nao e string', () => {
    // Header repetido chega como array no Fastify; sem esta guarda, um
    // `['a','b']` viraria comparacao com o texto "a,b".
    expect(tokensMatch([TOKEN], TOKEN)).toBe(false);
    expect(tokensMatch({ toString: () => TOKEN }, TOKEN)).toBe(false);
  });
});

describe('isPaidStatus', () => {
  it('reconhece os status de dinheiro recebido', () => {
    for (const status of ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'received']) {
      expect(isPaidStatus(status)).toBe(true);
    }
  });

  it('recusa os demais', () => {
    for (const status of ['PENDING', 'OVERDUE', 'REFUNDED', 'DELETED', '', null, undefined]) {
      expect(isPaidStatus(status)).toBe(false);
    }
  });
});

describe('parseAsaasEvent', () => {
  const recebido = {
    id: 'evt_0011223344',
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: 'pay_998877',
      externalReference: '412',
      value: 149.9,
      netValue: 145.2,
      status: 'RECEIVED',
    },
  };

  it('extrai o que liga o evento a nossa cobranca', () => {
    const evento = parseAsaasEvent(recebido);
    expect(evento).toEqual({
      idEvento: 'evt_0011223344',
      tipo: 'PAYMENT_RECEIVED',
      idCobranca: 'pay_998877',
      referenciaExterna: '412',
      vlInformado: 149.9,
      acao: 'confirmar',
    });
  });

  it('classifica confirmacao, estorno e ruido', () => {
    const acaoDe = (event: string) => parseAsaasEvent({ ...recebido, event }).acao;

    expect(acaoDe('PAYMENT_RECEIVED')).toBe('confirmar');
    expect(acaoDe('PAYMENT_CONFIRMED')).toBe('confirmar');

    // Estorno e chargeback PRECISAM existir desde o inicio: uma integracao que
    // so sabe confirmar deixa como paga uma parcela estornada, e o erro so
    // aparece na conciliacao — quando o aluno ja treinou o mes de graca.
    expect(acaoDe('PAYMENT_REFUNDED')).toBe('estornar');
    expect(acaoDe('PAYMENT_CHARGEBACK_REQUESTED')).toBe('estornar');
    expect(acaoDe('PAYMENT_DELETED')).toBe('estornar');

    // Ruido: o Asaas avisa de coisas que nao mudam nada para nos.
    expect(acaoDe('PAYMENT_CREATED')).toBe('ignorar');
    expect(acaoDe('PAYMENT_UPDATED')).toBe('ignorar');
    expect(acaoDe('EVENTO_QUE_NAO_EXISTE')).toBe('ignorar');
  });

  it('normaliza a caixa do tipo', () => {
    expect(parseAsaasEvent({ ...recebido, event: 'payment_received' }).acao).toBe('confirmar');
  });

  it('cai em netValue quando nao ha value', () => {
    const evento = parseAsaasEvent({
      ...recebido,
      payment: { ...recebido.payment, value: null },
    });
    expect(evento.vlInformado).toBe(145.2);
  });

  it('aguenta corpo vazio, nulo e sem payment', () => {
    // Um parser rigido transformaria mudanca de envelope do provedor numa fila
    // de eventos perdidos. Tolerante aqui; rigido na confirmacao.
    for (const corpo of [null, undefined, {}, { event: 'PAYMENT_RECEIVED' }]) {
      const evento = parseAsaasEvent(corpo);
      expect(evento.idCobranca).toBeNull();
      expect(['confirmar', 'ignorar']).toContain(evento.acao);
    }
  });

  it('nao aceita numero em campo de texto nem texto em campo de valor', () => {
    const evento = parseAsaasEvent({
      id: 12345,
      event: 'PAYMENT_RECEIVED',
      payment: { id: { $ne: null }, externalReference: [], value: 'muito dinheiro' },
    });
    // Tudo que nao e texto util vira null, e null nao casa com cobranca nenhuma
    // — o evento sera recusado la na frente em vez de virar baixa.
    expect(evento.idEvento).toBeNull();
    expect(evento.idCobranca).toBeNull();
    expect(evento.referenciaExterna).toBeNull();
    expect(evento.vlInformado).toBeNull();
  });

  it('nao deixa referencia externa hostil virar id', () => {
    // A rota converte a referencia com Number() e so usa se for inteiro > 0.
    // Aqui garantimos que o parser nao a "conserta" para algo utilizavel.
    const evento = parseAsaasEvent({
      ...recebido,
      payment: { ...recebido.payment, externalReference: '412 OR 1=1' },
    });
    expect(evento.referenciaExterna).toBe('412 OR 1=1');
    expect(Number.isInteger(Number(evento.referenciaExterna))).toBe(false);
  });
});

// --- emissao ---------------------------------------------------------------
//
// So o que da para provar sem conta: a FORMA do pedido. As chamadas de rede
// (criar cliente, criar cobranca, buscar o codigo) nao foram exercitadas contra
// a API real — nao existe credencial. Isso esta dito no modulo e no relatorio.

describe('buildCustomerPayload', () => {
  const aluno = {
    nome: 'Gustavo Aluno',
    cpf: '123.456.789-01',
    email: 'Gustavo@Exemplo.COM',
    telefone: '(11) 98765-4321',
    referencia: '3',
  };

  it('manda o minimo necessario para identificar o pagador', () => {
    expect(buildCustomerPayload(aluno)).toEqual({
      name: 'Gustavo Aluno',
      cpfCnpj: '12345678901',
      email: 'gustavo@exemplo.com',
      mobilePhone: '11987654321',
      externalReference: '3',
      notificationDisabled: true,
    });
  });

  it('omite campo opcional vazio em vez de mandar string vazia', () => {
    // O Asaas recusa o cadastro INTEIRO quando recebe e-mail ou telefone
    // vazio como string — e a mensagem de erro nao diz qual campo foi.
    const semContato = buildCustomerPayload({ ...aluno, email: '', telefone: null });
    expect(semContato).not.toHaveProperty('email');
    expect(semContato).not.toHaveProperty('mobilePhone');
  });

  it('descarta telefone curto demais para ser telefone', () => {
    expect(buildCustomerPayload({ ...aluno, telefone: '1234' })).not.toHaveProperty('mobilePhone');
  });

  it('recusa CPF invalido e aluno sem nome', () => {
    // Melhor falhar aqui do que criar no provedor um cliente que nao da para
    // cobrar — e que fica no painel deles para sempre.
    expect(() => buildCustomerPayload({ ...aluno, cpf: '123' })).toThrow('CPF do aluno invalido');
    expect(() => buildCustomerPayload({ ...aluno, cpf: '' })).toThrow();
    expect(() => buildCustomerPayload({ ...aluno, nome: '   ' })).toThrow('sem nome');
  });

  it('nao desativa a notificacao do proprio provedor por acidente', () => {
    // `notificationDisabled: true` e deliberado: quem avisa o aluno somos nos
    // (e-mail e push), e deixar os dois mandando cobranca dobraria a mensagem.
    expect(buildCustomerPayload(aluno).notificationDisabled).toBe(true);
  });
});

describe('formatDueDate', () => {
  it('usa o dia LOCAL, nao o de UTC', () => {
    // No fuso do Brasil, 21h vira o dia seguinte em UTC. Com toISOString, a
    // cobranca venceria um dia antes do combinado.
    expect(formatDueDate(new Date(2026, 8, 1, 21, 30))).toBe('2026-09-01');
    expect(formatDueDate(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05');
  });

  it('preenche mes e dia com dois digitos', () => {
    expect(formatDueDate(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('buildPaymentPayload', () => {
  const base = {
    idClienteExterno: 'cus_000123',
    valor: 149.9,
    vencimento: new Date(2026, 8, 1),
    referencia: '412',
  };

  it('carrega a referencia que o webhook usa para casar', () => {
    const pedido = buildPaymentPayload(base);
    expect(pedido.externalReference).toBe('412');
    expect(pedido.customer).toBe('cus_000123');
    expect(pedido.dueDate).toBe('2026-09-01');
    expect(pedido.billingType).toBe('PIX');
  });

  it('arredonda o valor para centavos', () => {
    // Float cru produz 149.90000000000003, e o Asaas recusa mais de duas casas.
    expect(buildPaymentPayload({ ...base, valor: 149.9 + 0.00000000000003 }).value).toBe(149.9);
    expect(buildPaymentPayload({ ...base, valor: 10.005 }).value).toBe(10.01);
  });

  it('recusa valor zero, negativo ou vencimento invalido', () => {
    expect(() => buildPaymentPayload({ ...base, valor: 0 })).toThrow();
    expect(() => buildPaymentPayload({ ...base, valor: -1 })).toThrow();
    expect(() => buildPaymentPayload({ ...base, vencimento: new Date('nao e data') })).toThrow();
  });

  it('corta descricao longa em vez de deixar o provedor recusar', () => {
    const pedido = buildPaymentPayload({ ...base, descricao: 'x'.repeat(900) });
    expect((pedido as { description: string }).description.length).toBe(500);
  });

  it('omite descricao quando nao ha', () => {
    expect(buildPaymentPayload(base)).not.toHaveProperty('description');
  });
});
