import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '../src/shared/styles/globals.css';
import { GlobalValidation } from '../src/shared/components/GlobalValidation';
import { Providers } from '../src/shared/components/Providers';
import { marcaPorHostname } from '../src/shared/marca/marcaPorHost';

/**
 * O host diz de qual academia é a página, então o título e o ícone de
 * instalação saem por academia — inclusive ANTES do login, que é quando a
 * pessoa instala o atalho na tela inicial.
 *
 * O mesmo cabeçalho encaminhado do proxy: `x-forwarded-host` primeiro, porque
 * atrás do Traefik o host que o Next enxerga é o interno do container.
 */
async function hostDaRequisicao() {
  const cabecalhos = await headers();
  const encaminhado = cabecalhos.get('x-forwarded-host') ?? cabecalhos.get('host');
  return encaminhado?.split(',')[0]?.trim().toLowerCase() ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const marca = await marcaPorHostname(await hostDaRequisicao());
  const nome = marca?.dsCliente?.trim();

  return {
    title: nome ? `SOLSFIT · ${nome}` : 'SOLSFIT',
    description: 'Gestão inteligente para academias.',
    manifest: '/manifest.webmanifest',
    icons: {
      // O Safari ignora os ícones do manifesto e usa este. Precisa ser raster,
      // então a rota devolve os bytes originais do logo — e 404 quando a
      // academia ainda não subiu nenhum, caso em que o iPhone guarda uma
      // miniatura da página.
      apple: '/icone?ios=1',
    },
    appleWebApp: {
      capable: true,
      // É este texto que aparece embaixo do atalho no iPhone.
      title: nome ?? 'SOLSFIT',
      statusBarStyle: 'default',
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const marca = await marcaPorHostname(await hostDaRequisicao());
  return {
    // Pinta a barra do navegador com a cor da academia. O manifesto já faz isso
    // para quem instalou; isto vale para quem só abriu a página.
    themeColor: marca?.corPrimaria || '#032da2',
  };
}

// Renderizacao dinamica por request: necessaria para a CSP estrita baseada em
// nonce (middleware.ts). Uma pagina gerada estaticamente e montada no build,
// antes do nonce por request existir, entao suas tags <script> sairiam sem
// nonce e seriam bloqueadas por 'strict-dynamic'. Forcando dynamic, o Next
// injeta o nonce vindo do header de CSP em cada request. Estas telas sao SPAs
// autenticadas ('use client'), sem ganho real de cache com prerender estatico.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <GlobalValidation />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
