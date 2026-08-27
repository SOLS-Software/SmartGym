import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiUrl, authFetch } from '../api/client';

// Registro do aparelho para receber aviso push.
//
// O QUE O PUSH ACRESCENTA: o aviso de cobrança e vencimento já sai por e-mail,
// e o e-mail alcança todo mundo. O push alcança na hora — e alcança quem parou
// de abrir o app, que é exatamente quem está prestes a cancelar.
//
// NADA AQUI LANÇA. Push é entrega secundária: se a permissão for negada, se o
// aparelho for um emulador ou se a rede cair, o app continua funcionando e o
// e-mail continua sendo a entrega. Um erro de push nunca pode derrubar a tela.

/**
 * Aviso chegando com o app ABERTO.
 *
 * Sem isto o sistema operacional engole a notificação em primeiro plano — e o
 * caso mais comum de teste (app aberto, dispara o aviso) pareceria quebrado.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Canal do Android por onde os avisos entram.
 *
 * TEM QUE BATER com `CANAL_ANDROID` em apps/api/src/shared/push.ts. No Android
 * quem define importância, som e se o aviso acende a tela é o CANAL, não a
 * mensagem — se os dois nomes divergirem, o aviso cai no canal padrão e toda a
 * configuração abaixo deixa de valer, silenciosamente.
 */
export const CANAL_AVISOS = 'avisos';

/** Emulador e navegador não recebem push: o serviço exige aparelho real. */
function podeReceberPush(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

/**
 * Pede permissão, obtém o token do Expo e o envia à API.
 *
 * Devolve o token registrado, ou null quando não foi possível — o chamador não
 * precisa tratar o null de forma alguma além de seguir em frente.
 */
export async function registrarPush(): Promise<string | null> {
  if (!podeReceberPush()) return null;

  try {
    // Canal do Android. Sem ele o aviso chega sem som e sem prioridade, e em
    // algumas versões nem aparece na barra.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL_AVISOS, {
        name: 'Avisos da academia',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    // NÃO pedir de novo o que já foi concedido: cada chamada a
    // requestPermissions abre o diálogo do sistema, e abrir isso a toda
    // inicialização é o caminho mais curto para o usuário negar de vez.
    const atual = await Notifications.getPermissionsAsync();
    let status = atual.status;

    if (status !== 'granted') {
      // Negada ANTES pelo usuário: o sistema não mostra o diálogo de novo, e
      // insistir só gasta chamada. Quem mudou de ideia reabilita nos ajustes
      // do aparelho.
      if (!atual.canAskAgain) return null;
      status = (await Notifications.requestPermissionsAsync()).status;
    }

    if (status !== 'granted') return null;

    // O projectId vem do app.json (EAS). Sem ele o serviço do Expo não sabe
    // para qual projeto emitir o token — e é justamente o que falta enquanto
    // o build não existe.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token) return null;

    const response = await authFetch(`${apiUrl}/auth/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
    if (!response.ok) return null;

    return token;
  } catch {
    // Sem projectId, sem serviço do Google, emulador, offline... nada disso é
    // erro do app. O aviso continua chegando por e-mail.
    return null;
  }
}

/**
 * Descadastra o aparelho. Chamado no logout: sem isto o telefone continuaria
 * recebendo aviso de uma conta que já saiu dele.
 */
export async function desregistrarPush(): Promise<void> {
  if (!podeReceberPush()) return;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token) return;

    // DELETE enquanto o token de sessão ainda está no cofre: o authFetch o
    // injeta, e o servidor exige que o aparelho seja do próprio usuário.
    await authFetch(`${apiUrl}/auth/push-token`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Best-effort: o logout não pode falhar porque o push não colaborou.
  }
}
