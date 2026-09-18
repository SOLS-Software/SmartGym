import { describe, expect, it } from 'vitest';
import { montarBuscaNominatim } from './routes.js';

// A consulta de geocodificacao ja errou uma vez EM SILENCIO: mandava o bairro
// no parametro `county`, e o Nominatim devolvia lista vazia em vez de ignorar o
// parametro que nao entendeu. O resultado era "endereco nao encontrado" para um
// endereco que existe.
//
// Estes testes travam o formato da consulta justamente porque o sintoma do erro
// nao acusa a causa: sem eles, alguem reintroduz o bairro achando que ajuda a
// precisao, e ninguem descobre ate um cliente reclamar.

describe('consulta ao Nominatim', () => {
  it('NUNCA manda o bairro — nem como county, nem em campo nenhum', () => {
    const url = montarBuscaNominatim({
      street: 'Avenida Henriqueta Mendes Guerra',
      city: 'Barueri',
      state: 'SP',
      postalcode: '06401-160',
    });

    expect(url.searchParams.has('county')).toBe(false);
    // Varredura: o bairro nao pode aparecer embutido em nenhum parametro, o que
    // pegaria tambem a tentacao de cola-lo numa busca em texto livre (`q=`).
    for (const [, valor] of url.searchParams) {
      expect(valor.toLowerCase()).not.toContain('vila sao joao');
    }
  });

  it('manda rua, cidade, estado e CEP, presos ao Brasil', () => {
    const url = montarBuscaNominatim({
      street: '100 Avenida Henriqueta Mendes Guerra',
      city: 'Barueri',
      state: 'SP',
      postalcode: '06401-160',
    });

    expect(url.searchParams.get('street')).toBe('100 Avenida Henriqueta Mendes Guerra');
    expect(url.searchParams.get('city')).toBe('Barueri');
    expect(url.searchParams.get('state')).toBe('SP');
    expect(url.searchParams.get('postalcode')).toBe('06401-160');
    // `countrycodes` e o filtro forte; `country` sozinho aceitaria homonimos
    // de rua em outro pais quando a cidade nao casa.
    expect(url.searchParams.get('countrycodes')).toBe('br');
    expect(url.searchParams.get('country')).toBe('Brasil');
  });

  // A segunda tentativa da rota: quando a rua nao existe no OpenStreetMap, o
  // CEP sozinho poe o pino no quarteirao certo. Campo vazio nao pode virar
  // `street=` na URL — isso muda a consulta em vez de afrouxa-la.
  it('omite o que nao foi informado, em vez de mandar vazio', () => {
    const url = montarBuscaNominatim({ postalcode: '06401-160' });

    expect(url.searchParams.has('street')).toBe(false);
    expect(url.searchParams.has('city')).toBe(false);
    expect(url.searchParams.has('state')).toBe(false);
    expect(url.searchParams.get('postalcode')).toBe('06401-160');
  });

  it('pede um resultado so, sem detalhamento de endereco', () => {
    const url = montarBuscaNominatim({ postalcode: '06401-160' });

    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('limit')).toBe('1');
    // A rota so usa lat/lon/display_name; `addressdetails` traria um objeto
    // aninhado com o endereco inteiro, que e resposta maior sem uso.
    expect(url.searchParams.get('addressdetails')).toBe('0');
  });
});
