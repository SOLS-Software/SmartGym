import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AuthProvider } from '../lib/contexts/AuthContext';
import { ThemeProvider } from '../lib/contexts/ThemeContext';
import type { ClientTheme } from '../lib/types/client';
import { ClientLoadScreen } from '../lib/components/ClientLoadScreen';
import { useCurrentClient } from '../lib/hooks/useCurrentClient';

export default function RootLayout() {
  const { clientId, isLoaded, clearClient } = useCurrentClient();
  const [clientReady, setClientReady] = useState(false);
  const [theme, setTheme] = useState<ClientTheme | null>(null);

  // Toque na notificação leva à tela de avisos.
  //
  // Sem isto o push abriria o app na home e o aluno teria que caçar o que a
  // academia queria dizer — o que anula boa parte do motivo de existir do
  // push, que é encurtar o caminho entre o aviso e a ação.
  //
  // Fica no layout RAIZ porque o toque pode chegar com o app fechado: o
  // listener precisa existir antes de qualquer tela montar. O guard de sessão
  // de (aluno)/_layout continua valendo — quem não está logado é redirecionado
  // para o login em vez de ver a tela.
  useEffect(() => {
    const inscricao = Notifications.addNotificationResponseReceivedListener((resposta) => {
      const dados = resposta.notification.request.content.data as { tipo?: string } | undefined;
      if (dados?.tipo === 'aviso') router.push('/avisos');
    });
    return () => inscricao.remove();
  }, []);

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
