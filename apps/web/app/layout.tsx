import type { Metadata } from 'next';
import '../src/shared/styles/globals.css';
import { GlobalValidation } from '../src/shared/components/GlobalValidation';

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
        {children}
      </body>
    </html>
  );
}
