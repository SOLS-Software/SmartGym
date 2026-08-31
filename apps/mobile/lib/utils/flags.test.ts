import { estaAtivo } from './flags';

describe('estaAtivo', () => {
  it('entende o booleano que a API devolve hoje', () => {
    // O caso que quebrou as telas: `false === 0` é falso, então o filtro
    // antigo (`boInativo === 0`) descartava todo registro ativo.
    expect(estaAtivo(false)).toBe(true);
    expect(estaAtivo(true)).toBe(false);
  });

  it('continua entendendo 0/1', () => {
    expect(estaAtivo(0)).toBe(true);
    expect(estaAtivo(1)).toBe(false);
  });

  it('trata ausência como ativo', () => {
    // Sumir por omissão é pior do que aparecer indevidamente: um registro a
    // mais na lista se vê; um a menos, não.
    expect(estaAtivo(null)).toBe(true);
    expect(estaAtivo(undefined)).toBe(true);
  });
});
