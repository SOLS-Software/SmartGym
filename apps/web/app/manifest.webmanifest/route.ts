import { NextResponse, type NextRequest } from 'next/server';
import { marcaPorHost } from '../../src/shared/marca/marcaPorHost';

/**
 * Manifesto de instalação, MONTADO POR ACADEMIA.
 *
 * Isto resolve uma coisa que o aplicativo nativo não consegue: o ícone e o nome
 * na tela inicial. No Android eles são assados no APK, e o mesmo binário atende
 * todas as academias — então lá o atalho é sempre "SOLSFIT". Aqui o manifesto é
 * servido pelo NOSSO servidor, e o host diz de quem é a página: em
 * `inove.solssoftwares.com.br` volta o nome e o logo da Inove, e o atalho que
 * fica no celular é o da academia daquela pessoa.
 *
 * NÃO É ARQUIVO ESTÁTICO, e não pode ser: `app/manifest.ts` do Next é gerado no
 * build, uma vez, sem enxergar o host. Como route handler dinâmico, cada
 * academia recebe o seu na hora.
 *
 * `cache-control: no-store` porque a resposta depende do host: uma resposta
 * guardada por engano entregaria a marca de uma academia para outra, que é o
 * pior defeito possível num sistema multi-inquilino.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const marca = await marcaPorHost(request);
  const nome = marca?.dsCliente?.trim() || 'SOLSFIT';

  return NextResponse.json(
    {
      name: nome,
      // Cabe embaixo do ícone; o Android corta por volta de 12 caracteres.
      short_name: nome.slice(0, 12),
      description: `Área do aluno e da equipe — ${nome}`,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      lang: 'pt-BR',
      background_color: marca?.corFundo || '#ffffff',
      // Pinta a barra de status quando instalado: é o que faz parecer
      // aplicativo em vez de página aberta em tela cheia.
      theme_color: marca?.corPrimaria || '#032da2',
      icons: [
        {
          src: '/icone',
          // SVG serve qualquer densidade, mas os tamanhos concretos ficam
          // declarados porque o Chrome exige ao menos um icone de 192 para
          // oferecer a instalacao — com `any` sozinho ele as vezes nao oferece.
          sizes: '192x192 512x512',
          type: 'image/svg+xml',
          purpose: 'any',
        },
        {
          src: '/icone',
          sizes: '192x192 512x512',
          type: 'image/svg+xml',
          // O mesmo desenho serve de mascara porque ele ja nasce com margem: o
          // sistema recorta em circulo, quadrado ou squircle conforme o
          // aparelho, e sem a zona segura o logo perderia as bordas.
          purpose: 'maskable',
        },
      ],
    },
    {
      headers: {
        'content-type': 'application/manifest+json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
}
