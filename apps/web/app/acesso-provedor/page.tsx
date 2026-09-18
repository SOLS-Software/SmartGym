import type { Metadata } from 'next';
import ProviderAccessPage from '../../src/app/acesso/ProviderAccessPage';

export const metadata: Metadata = {
  title: 'Acesso de implantação',
  // Esta porta nao e conteudo e nao deve aparecer em busca nenhuma.
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ProviderAccessPage />;
}
