// Testes do codigo Pix copia e cola.
//
// Este e o raro caso em que o teste prova o resultado de verdade, sem falsear
// nada: o proprio formato carrega um CRC sobre todo o payload. Se a montagem
// estiver errada em um byte, a conta nao fecha. Por isso o modulo e puro e os
// testes sao offline — nao ha nada que um servico de terceiro proveria melhor.
import { describe, expect, it } from 'vitest';
import {
  buildPixPayload,
  crc16,
  formatAmount,
  isValidPixPayload,
  normalizePixKey,
  sanitizeText,
  sanitizeTxid,
} from './pix.js';

/**
 * Le o payload de volta como mapa de campos TLV.
 *
 * Escrito no teste de proposito: se ele reusasse o codigo de montagem, os dois
 * errariam juntos e o teste passaria em cima do erro.
 */
function parseTlv(payload: string): Record<string, string> {
  const campos: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const tamanho = Number(payload.slice(i + 2, i + 4));
    const valor = payload.slice(i + 4, i + 4 + tamanho);
    campos[id] = valor;
    i += 4 + tamanho;
  }
  return campos;
}

const conta = {
  chave: 'financeiro@academia.com.br',
  nomeBeneficiario: 'Academia Boa Forma',
  cidade: 'Sao Paulo',
};

describe('crc16', () => {
  it('bate com o valor de referencia do CRC-16/CCITT-FALSE', () => {
    // "123456789" -> 0x29B1 e o check value publicado do algoritmo. E o que
    // ancora esta implementacao em algo externo em vez de em si mesma: sem
    // ele, um CRC consistentemente errado passaria em todos os outros testes.
    expect(crc16('123456789')).toBe('29B1');
  });

  it('devolve sempre quatro hexadecimais maiusculos', () => {
    for (const entrada of ['', 'a', 'pix', '00020126']) {
      expect(crc16(entrada)).toMatch(/^[0-9A-F]{4}$/);
    }
  });

  it('muda quando o payload muda', () => {
    expect(crc16('00020101')).not.toBe(crc16('00020102'));
  });
});

describe('buildPixPayload', () => {
  it('gera codigo que valida contra o proprio CRC', () => {
    const codigo = buildPixPayload({ ...conta, valor: 150 });
    expect(isValidPixPayload(codigo)).toBe(true);
  });

  it('comeca com o indicador de formato e termina no CRC', () => {
    const codigo = buildPixPayload({ ...conta, valor: 150 });
    expect(codigo.startsWith('000201')).toBe(true);
    expect(codigo.slice(-8, -4)).toBe('6304');
    expect(codigo.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
  });

  it('monta os campos obrigatorios com os valores certos', () => {
    const campos = parseTlv(buildPixPayload({ ...conta, valor: 150, txid: 'SG412' }));

    expect(campos['00']).toBe('01');
    expect(campos['52']).toBe('0000');
    expect(campos['53']).toBe('986');
    expect(campos['54']).toBe('150.00');
    expect(campos['58']).toBe('BR');
    expect(campos['59']).toBe('ACADEMIA BOA FORMA');
    expect(campos['60']).toBe('SAO PAULO');

    // Campo 26 e um template: dentro dele, o arranjo e a chave.
    const arranjo = parseTlv(campos['26']!);
    expect(arranjo['00']).toBe('br.gov.bcb.pix');
    expect(arranjo['01']).toBe('financeiro@academia.com.br');

    // Campo 62 tambem e template: dentro, a referencia da cobranca.
    expect(parseTlv(campos['62']!)['05']).toBe('SG412');
  });

  it('declara o tamanho certo em cada campo', () => {
    // O tamanho e do VALOR e tem sempre dois digitos. Errar isto desloca a
    // leitura inteira, e o unico sintoma seria o banco recusar o codigo.
    // Percorre o codigo INTEIRO, inclusive o campo 63 (o CRC): ele tambem e um
    // TLV bem formado, com tamanho 04 e o hash como valor.
    const codigo = buildPixPayload({ ...conta, valor: 99.9 });
    let i = 0;
    let campos = 0;
    while (i < codigo.length) {
      const tamanho = Number(codigo.slice(i + 2, i + 4));
      expect(Number.isNaN(tamanho)).toBe(false);
      i += 4 + tamanho;
      campos++;
    }
    // Consumiu o codigo exatamente, sem sobra nem falta. Um tamanho errado em
    // qualquer campo desloca a leitura e faz esta conta estourar.
    expect(i).toBe(codigo.length);
    expect(campos).toBeGreaterThan(6);
    expect(parseTlv(codigo)['63']).toBe(codigo.slice(-4));
  });

  it('omite o valor quando nao ha valor definido', () => {
    // Sem o campo 54 o app do banco pergunta quanto pagar — que e o que se
    // quer quando a cobranca ainda nao tem numero fechado.
    const campos = parseTlv(buildPixPayload(conta));
    expect(campos['54']).toBeUndefined();
    expect(isValidPixPayload(buildPixPayload(conta))).toBe(true);
  });

  it('usa *** quando nao ha referencia', () => {
    const campos = parseTlv(buildPixPayload({ ...conta, valor: 10 }));
    expect(parseTlv(campos['62']!)['05']).toBe('***');
  });

  it('tira acento do nome e da cidade', () => {
    // Banco le ASCII. "José" no codigo vira "QR invalido" sem explicacao.
    const campos = parseTlv(
      buildPixPayload({
        chave: '12345678901',
        nomeBeneficiario: 'José Antônio Ação',
        cidade: 'Brasília',
        valor: 1,
      }),
    );
    expect(campos['59']).toBe('JOSE ANTONIO ACAO');
    expect(campos['60']).toBe('BRASILIA');
  });

  it('recusa valor zero ou negativo', () => {
    expect(() => buildPixPayload({ ...conta, valor: 0 })).toThrow();
    expect(() => buildPixPayload({ ...conta, valor: -5 })).toThrow();
  });

  it('recusa conta sem chave, sem nome ou sem cidade', () => {
    expect(() => buildPixPayload({ ...conta, chave: '  ' })).toThrow('Chave Pix ausente.');
    expect(() => buildPixPayload({ ...conta, nomeBeneficiario: '' })).toThrow();
    expect(() => buildPixPayload({ ...conta, cidade: '' })).toThrow();
  });

  it('nao estoura os limites do padrao', () => {
    const campos = parseTlv(
      buildPixPayload({
        chave: '12345678901',
        nomeBeneficiario: 'Academia Muito Grande Com Nome Enorme Demais',
        cidade: 'Cidade Com Nome Absurdamente Longo',
        valor: 1,
        txid: 'referencia-muito-longa-para-caber-no-campo',
      }),
    );
    expect(campos['59']!.length).toBeLessThanOrEqual(25);
    expect(campos['60']!.length).toBeLessThanOrEqual(15);
    expect(parseTlv(campos['62']!)['05']!.length).toBeLessThanOrEqual(25);
  });
});

describe('isValidPixPayload', () => {
  it('recusa codigo com um caractere trocado', () => {
    const codigo = buildPixPayload({ ...conta, valor: 150 });
    // Troca um digito do valor sem recalcular o CRC — e exatamente o que
    // aconteceria se alguem editasse o codigo a mao.
    const adulterado = codigo.replace('150.00', '950.00');
    expect(adulterado).not.toBe(codigo);
    expect(isValidPixPayload(adulterado)).toBe(false);
  });

  it('recusa texto que nao e codigo Pix', () => {
    expect(isValidPixPayload('')).toBe(false);
    expect(isValidPixPayload('qualquer coisa')).toBe(false);
    expect(isValidPixPayload('00020101021126ABCD')).toBe(false);
  });
});

describe('normalizePixKey', () => {
  it('deixa CPF e CNPJ so com digitos', () => {
    expect(normalizePixKey('123.456.789-01', 'cpf')).toBe('12345678901');
    expect(normalizePixKey('12.345.678/0001-90', 'cnpj')).toBe('12345678000190');
  });

  it('poe telefone em formato internacional sem duplicar o 55', () => {
    expect(normalizePixKey('(11) 98765-4321', 'telefone')).toBe('+5511987654321');
    expect(normalizePixKey('+5511987654321', 'telefone')).toBe('+5511987654321');
    expect(normalizePixKey('5511987654321', 'telefone')).toBe('+5511987654321');
  });

  it('baixa a caixa de e-mail e chave aleatoria', () => {
    expect(normalizePixKey('Financeiro@Academia.COM', 'email')).toBe('financeiro@academia.com');
    expect(normalizePixKey('7D9E1F2A-3B4C', 'aleatoria')).toBe('7d9e1f2a-3b4c');
  });
});

describe('formatAmount e sanitize', () => {
  it('formata o valor com duas casas e ponto decimal', () => {
    expect(formatAmount(150)).toBe('150.00');
    expect(formatAmount(99.9)).toBe('99.90');
    expect(formatAmount(1234.5)).toBe('1234.50');
  });

  it('corta texto no limite pedido', () => {
    expect(sanitizeText('Academia Boa Forma Ltda ME', 10)).toBe('ACADEMIA B');
  });

  it('limpa a referencia e cai em *** quando sobra nada', () => {
    expect(sanitizeTxid('SG-412')).toBe('SG412');
    expect(sanitizeTxid('---')).toBe('***');
    expect(sanitizeTxid(null)).toBe('***');
  });
});
