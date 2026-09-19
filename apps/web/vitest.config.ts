import { defineConfig } from 'vitest/config';

// Testes do painel.
//
// POR QUE ESTE ARQUIVO PASSOU A EXISTIR: o `apps/web` era o único app do
// monorepo sem runner nenhum, e foi onde nasceram três defeitos cujo sintoma
// não acusava a causa — o host público no CSRF do proxy, o caminho em texto
// claro na quebra de vidro, e o template de grade inline vencendo a media
// query. Nenhum deles quebrava build ou typecheck.
//
// O alvo aqui é a LÓGICA COMPARTILHADA, da qual muitas telas dependem: um erro
// nela não aparece numa tela, aparece em trinta. Tela isolada continua sendo
// verificada no navegador, que é onde layout de fato se vê.
//
// `jsdom` porque o que se testa aqui é código de navegador — hooks de React,
// tradução de erro de `fetch`, sinais de aborto. O `node` do vitest da API não
// serviria.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
  },
});
