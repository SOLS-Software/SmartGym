import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ThemeProvider } from '../lib/contexts/ThemeContext';
import type { ClientTheme } from '../lib/types/client';
import { ClientLoadScreen } from '../lib/components/ClientLoadScreen';
import { useCurrentClient } from '../lib/hooks/useCurrentClient';

export default function RootLayout() {
  const { clientId, isLoaded } = useCurrentClient();
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
            console.error('Erro ao carregar cliente:', error);
          }}
        />
        <StatusBar style="dark" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
