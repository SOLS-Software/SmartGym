import type { Metadata } from 'next';
import '../src/shared/styles/globals.css';
import { GlobalValidation } from '../src/shared/components/GlobalValidation';
import { Providers } from '../src/shared/components/Providers';

export const metadata: Metadata = {
  title: 'SmartGym',
  description: 'Gestão inteligente para academias.',
};

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
