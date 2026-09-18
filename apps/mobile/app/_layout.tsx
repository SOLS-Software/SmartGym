import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '../lib/contexts/AuthContext';
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
    <AuthProvider>
      <TemaDaSessao temaDeBootstrap={theme}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </TemaDaSessao>
    </AuthProvider>
  );
}

/**
 * O tema segue a SESSÃO.
 *
 * Antes o AuthProvider ficava DENTRO do ThemeProvider, e a cor vinha só do
 * `@solsfit:client_id` gravado no AsyncStorage. Quem grava esse id é a tela
 * /admin — e ninguém mais. Aluno e funcionário que entram pelo login normal
 * nunca passavam por lá, então o app ficava eternamente com as cores padrão,
 * mesmo sabendo perfeitamente de qual academia a pessoa era.
 *
 * Invertendo a ordem, o tema passa a ser função da sessão: entrou, veste as
 * cores da academia; saiu, volta ao padrão — que é o comportamento certo num
 * aparelho compartilhado, onde a próxima pessoa pode ser de outra academia.
 *
 * O tema do bootstrap continua valendo como base, para o caminho da /admin, que
 * escolhe o cliente antes de existir sessão.
 */
function TemaDaSessao({
  temaDeBootstrap,
  children,
}: {
  temaDeBootstrap: ClientTheme | null;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  return <ThemeProvider theme={user?.theme ?? temaDeBootstrap}>{children}</ThemeProvider>;
}
