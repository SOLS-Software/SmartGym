import type { Metadata } from 'next';
import './styles.css';

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
      <body>{children}</body>
    </html>
  );
}
