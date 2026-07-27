import { describe, expect, it } from 'vitest';
import { maskEmail } from './routes.js';

// Regressao do endurecimento do auto-cadastro: /auth/register-lookup e PUBLICO
// e antes devolvia o email completo do titular a quem informasse um CPF. Como
// /auth/register agora exige esse email como prova de titularidade, devolver o
// endereco inteiro anularia o controle — quem descobrisse o CPF (dado nada
// secreto no Brasil) leria o email na resposta e criaria a conta assim mesmo.
// A mascara precisa ser reconhecivel pelo dono e inutil para o atacante.
describe('maskEmail (auto-cadastro: dica sem entregar o endereco)', () => {
  it('preserva apenas 2 caracteres do local-part, 2 do dominio e o TLD', () => {
    expect(maskEmail('joao.silva@gmail.com')).toBe('jo***@gm***.com');
    expect(maskEmail('maria@empresa.com.br')).toBe('ma***@em***.br');
  });

  it('nao vaza o endereco completo em nenhum caso', () => {
    for (const email of [
      'joao.silva@gmail.com',
      'a@b.co',
      'ab@cd.com',
      'nome.sobrenome@subdominio.empresa.com',
    ]) {
      expect(maskEmail(email)).not.toBe(email);
      expect(maskEmail(email)).toContain('***');
    }
  });

  // Com 2 caracteres ou menos, revelar 2 seria revelar o trecho inteiro — a
  // mascara passa a mostrar apenas 1.
  it('revela menos ainda quando local-part/dominio sao curtos', () => {
    expect(maskEmail('a@b.co')).toBe('a***@b***.co');
    expect(maskEmail('ab@cd.com')).toBe('a***@c***.com');
  });

  it('devolve string vazia para entradas invalidas (nunca ecoa o valor cru)', () => {
    expect(maskEmail(null)).toBe('');
    expect(maskEmail(undefined)).toBe('');
    expect(maskEmail('')).toBe('');
    expect(maskEmail('sem-arroba')).toBe('');
    expect(maskEmail('@dominio.com')).toBe('');
  });
});
