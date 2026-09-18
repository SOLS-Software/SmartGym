import { describe, expect, it } from 'vitest';
import {
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhone,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  onlyDigits,
} from '@solsfit/shared';

// Estas funcoes existiam em ate QUATRO copias espalhadas por api/web/mobile e
// foram unificadas em @solsfit/shared. O teste trava o comportamento das tres
// implementacoes originais para garantir que a consolidacao nao mudou nenhuma
// regra — em especial a validacao de CPF/CNPJ, que decide se um cadastro entra
// ou nao no sistema.
describe('@solsfit/shared — validadores unificados', () => {
  describe('isValidCpf', () => {
    it('aceita CPFs com digitos verificadores corretos', () => {
      expect(isValidCpf('529.982.247-25')).toBe(true);
      expect(isValidCpf('52998224725')).toBe(true);
    });

    it('rejeita digito verificador errado', () => {
      expect(isValidCpf('529.982.247-24')).toBe(false);
    });

    it('rejeita sequencias repetidas (passam no modulo 11, mas nao sao validas)', () => {
      for (const repeated of ['00000000000', '11111111111', '99999999999']) {
        expect(isValidCpf(repeated)).toBe(false);
      }
    });

    it('rejeita tamanho diferente de 11 digitos', () => {
      expect(isValidCpf('5299822472')).toBe(false);
      expect(isValidCpf('529982247250')).toBe(false);
      expect(isValidCpf('')).toBe(false);
    });
  });

  describe('isValidCnpj', () => {
    it('aceita CNPJ com digitos verificadores corretos', () => {
      expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
      expect(isValidCnpj('11222333000181')).toBe(true);
    });

    it('rejeita digito verificador errado e sequencias repetidas', () => {
      expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
      expect(isValidCnpj('11111111111111')).toBe(false);
      expect(isValidCnpj('112223330001')).toBe(false);
    });
  });

  describe('mascaras', () => {
    it('formatCpf aplica pontuacao progressiva e trunca em 11 digitos', () => {
      expect(formatCpf('529')).toBe('529');
      expect(formatCpf('529982')).toBe('529.982');
      expect(formatCpf('52998224725')).toBe('529.982.247-25');
      expect(formatCpf('529982247259999')).toBe('529.982.247-25');
    });

    it('formatCnpj aplica a mascara completa', () => {
      expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    });

    it('formatCep trunca em 8 digitos', () => {
      expect(formatCep('01310100')).toBe('01310-100');
      expect(formatCep('013101009999')).toBe('01310-100');
    });

    it('formatPhone distingue 8 e 9 digitos', () => {
      expect(formatPhone('12345678')).toBe('1234-5678');
      expect(formatPhone('123456789')).toBe('12345-6789');
    });

    it('mascaras ignoram caracteres nao numericos ja presentes', () => {
      expect(formatCpf('529.982.247-25')).toBe('529.982.247-25');
      expect(onlyDigits('529.982.247-25')).toBe('52998224725');
    });
  });

  describe('isValidEmail', () => {
    it('aceita formato basico e rejeita entradas incompletas', () => {
      expect(isValidEmail('aluno@academia.com.br')).toBe(true);
      expect(isValidEmail('sem-arroba.com')).toBe(false);
      expect(isValidEmail('sem@dominio')).toBe(false);
      expect(isValidEmail('com espaco@dominio.com')).toBe(false);
    });
  });
});
