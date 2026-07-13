import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { AuthProvider } from '../lib/contexts/AuthContext';
import { ThemeProvider } from '../lib/contexts/ThemeContext';
import type { ClientTheme } from '../lib/types/client';
import { ClientLoadScreen } from '../lib/components/ClientLoadScreen';
import { useCurrentClient } from '../lib/hooks/useCurrentClient';

export default function RootLayout() {
  const { clientId, isLoaded, clearClient } = useCurrentClient();
  const [clientReady, setClientReady] = useState(false);
  const [theme, setTheme] = useState<ClientTheme | null>(null);

  if (!isLoaded) {
    return <StatusBar style="dark" />;
  }

  if (clientId && !clientReady) {
    return (
      <ThemeProvider theme={null}>
        <ClientLoadScreen
          clientId={clientId}
          onSuccess={(fetchedTheme) => {
            setTheme(fetchedTheme);
            setClientReady(true);
          }}
          onError={(error) => {
            // Um clientId obsoleto/inválido não deve travar o app: limpa e segue
            // para o login com o tema padrão (bootstrap de cliente é opcional).
            console.warn('Bootstrap de cliente falhou, seguindo sem tema:', error);
            void clearClient();
            setClientReady(true);
          }}
        />
        <StatusBar style="dark" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
