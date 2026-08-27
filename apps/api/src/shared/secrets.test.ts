// Testes da criptografia de segredos de integracao.
//
// Isto guarda credencial que movimenta dinheiro do cliente. Um defeito aqui nao
// aparece em nenhuma tela: o sistema segue funcionando com o segredo em claro,
// ou com a mascara vazando o valor inteiro, e ninguem percebe ate auditar.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  maskPixKey,
  maskSecret,
} from './secrets.js';
import { encryptPii } from './pii.js';

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY ??= 'y'.repeat(48);
});

describe('encryptSecret / decryptSecret', () => {
  it('faz a volta completa', () => {
    const token = '$aact_YTU5YTE0M2M2N2I4MTliNzk0YTI5N2U5MzdjNWZm';
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('marca o valor com o prefixo de cifrado', () => {
    expect(isEncryptedSecret(encryptSecret('abc'))).toBe(true);
    expect(isEncryptedSecret('abc')).toBe(false);
    expect(isEncryptedSecret(null)).toBe(false);
  });

  it('cifra o mesmo valor de formas diferentes a cada vez', () => {
    // IV aleatorio por chamada. Sem isto, dois clientes com a mesma chave Pix
    // teriam o mesmo texto cifrado no banco — e daria para descobrir que sao
    // iguais sem decifrar nenhum dos dois.
    const a = encryptSecret('mesma-chave');
    const b = encryptSecret('mesma-chave');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('recusa valor adulterado', () => {
    // AES-GCM autentica: mexer num byte do texto cifrado tem que estourar, e
    // nao devolver lixo que o resto do codigo trataria como credencial.
    const cifrado = encryptSecret('token-original');
    const corrompido = cifrado.slice(0, -6) + 'AAAAAA';
    expect(() => decryptSecret(corrompido)).toThrow();
  });

  it('NAO decifra o que foi cifrado com a chave de PII', () => {
    // A separacao de subchaves e o ponto do modulo: quem consegue ler CPF nao
    // le credencial de pagamento. Se este teste passar a falhar, as duas
    // derivacoes colidiram e a separacao virou decorativa.
    expect(() => decryptSecret(encryptPii('12345678901'))).toThrow();
  });

  it('recusa valor em claro em vez de devolve-lo como veio', () => {
    // Segredo em claro no banco e defeito. Devolver em silencio faria o sistema
    // seguir por cima do defeito ate alguem auditar.
    expect(() => decryptSecret('token-em-claro')).toThrow('Valor nao esta cifrado.');
  });
});

describe('maskSecret', () => {
  it('mostra so os quatro ultimos caracteres', () => {
    expect(maskSecret(encryptSecret('abcdefghij1234'))).toBe('••••1234');
  });

  it('esconde inteiro o segredo curto demais para mascarar', () => {
    expect(maskSecret(encryptSecret('abcd'))).toBe('••••');
  });

  it('devolve nulo quando nao ha segredo', () => {
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret('')).toBeNull();
  });

  it('nao estoura com valor cifrado por outra chave', () => {
    // Restore de backup antigo ou env trocada: a tela precisa dizer que existe
    // algo ali sem fingir que sabe o que e — e sem derrubar a listagem.
    expect(maskSecret('enc:v1:' + Buffer.from('lixo').toString('base64'))).toBe('••••');
  });
});

describe('maskPixKey', () => {
  it('guarda o dominio do e-mail, que e o que se reconhece', () => {
    expect(maskPixKey(encryptSecret('financeiro@academia.com.br'), 'email')).toBe(
      'fi•••@academia.com.br',
    );
  });

  it('mostra so os ultimos digitos de CPF, CNPJ e telefone', () => {
    expect(maskPixKey(encryptSecret('12345678901'), 'cpf')).toBe('•••8901');
    expect(maskPixKey(encryptSecret('11987654321'), 'telefone')).toBe('•••4321');
  });

  it('mostra comeco e fim da chave aleatoria', () => {
    const uuid = '7d9e1f2a-3b4c-5d6e-7f80-91a2b3c4d5e6';
    expect(maskPixKey(encryptSecret(uuid), 'aleatoria')).toBe('7d9e••••d5e6');
  });

  it('devolve nulo quando nao ha chave', () => {
    expect(maskPixKey(null, 'cpf')).toBeNull();
  });
});
