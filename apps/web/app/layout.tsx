import type { Metadata } from 'next';
import '../src/shared/styles/globals.css';
import { GlobalValidation } from '../src/shared/components/GlobalValidation';
import { Providers } from '../src/shared/components/Providers';

export const metadata: Metadata = {
  title: 'SmartGym',
  description: 'Gestão inteligente para academias.',
};

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
