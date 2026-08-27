// Envio de notificacao push pelo servico do Expo.
//
// POR QUE SEM SDK: o `expo-server-sdk` resolve chunking e recibos; chunking sao
// oito linhas (abaixo) e recibo assincrono nao muda nada aqui, porque o aviso
// tambem sai por email — se o push falhar, o aluno nao fica sem saber. Uma
// dependencia a menos no servidor vale mais que isso.
//
// O QUE ISTO NAO SUBSTITUI: o email. Push so chega em quem instalou o app,
// deu permissao e nao desinstalou. O email continua sendo a entrega que
// alcanca todo mundo; o push e a que chega na hora.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Canal do Android por onde o aviso entra. TEM QUE BATER com o canal criado no
// app (lib/push/registrarPush.ts): quem define importancia, som e se o aviso
// acende a tela e o CANAL, nao a mensagem. Mandar sem `channelId` faz o aviso
// cair no canal padrao e a importancia alta configurada no app nao valer nada —
// que e exatamente o contrario do que um aviso de cobranca precisa.
const CANAL_ANDROID = 'avisos';

/** Limite documentado do endpoint: 100 mensagens por requisicao. */
const TAMANHO_LOTE = 100;

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type PushResult = {
  enviados: number;
  /** Tokens que o Expo recusou como mortos — o aparelho desinstalou o app ou
   *  revogou a permissao. Quem chama deve inativa-los, senao a base acumula
   *  endereco para onde nunca mais vai chegar nada. */
  tokensInvalidos: string[];
  falhas: Array<{ token: string; erro: string }>;
};

/**
 * Formato do token do Expo. Validar antes de gravar evita que um campo de texto
 * qualquer vire "aparelho registrado" e suje a base com endereco impossivel.
 */
export function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value.trim()) &&
    value.trim().length <= 255
  );
}

/**
 * Mensagem no formato que o Expo espera.
 *
 * Extraida em funcao pura para poder ser TESTADA: o que este objeto carrega
 * decide se o aviso acende a tela ou chega mudo, e nada disso aparece em erro
 * de compilacao — um `channelId` errado entrega a notificacao do mesmo jeito,
 * so que no canal errado.
 */
export function buildPushRequest(message: PushMessage) {
  return {
    to: message.to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: 'default' as const,
    // O aviso e de cobranca ou vencimento: precisa acender a tela, nao esperar
    // o proximo desbloqueio. No Android quem manda e o canal (CANAL_ANDROID);
    // `priority` cobre o iOS e o transporte.
    priority: 'high' as const,
    channelId: CANAL_ANDROID,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += size) lotes.push(items.slice(i, i + size));
  return lotes;
}

/**
 * Envia as mensagens e devolve o que deu certo, o que morreu e o que falhou.
 *
 * NUNCA LANCA: o push acompanha um envio de email em lote, e uma rejeicao do
 * Expo nao pode derrubar a rodada inteira de avisos.
 */
export async function sendExpoPush(messages: PushMessage[]): Promise<PushResult> {
  const resultado: PushResult = { enviados: 0, tokensInvalidos: [], falhas: [] };
  const validas = messages.filter((message) => isExpoPushToken(message.to));
  if (validas.length === 0) return resultado;

  for (const lote of chunk(validas, TAMANHO_LOTE)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
        },
        body: JSON.stringify(lote.map(buildPushRequest)),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        for (const message of lote) {
          resultado.falhas.push({ token: message.to, erro: `HTTP ${response.status}` });
        }
        continue;
      }

      const payload = (await response.json()) as {
        data?: Array<{ status: string; message?: string; details?: { error?: string } }>;
      };

      const tickets = payload.data ?? [];
      lote.forEach((message, indice) => {
        const ticket = tickets[indice];
        if (!ticket) {
          resultado.falhas.push({ token: message.to, erro: 'sem retorno do Expo' });
          return;
        }
        if (ticket.status === 'ok') {
          resultado.enviados++;
          return;
        }
        if (ticket.details?.error === 'DeviceNotRegistered') {
          resultado.tokensInvalidos.push(message.to);
          return;
        }
        resultado.falhas.push({ token: message.to, erro: ticket.message ?? 'falha no envio' });
      });
    } catch (error) {
      for (const message of lote) {
        resultado.falhas.push({
          token: message.to,
          erro: error instanceof Error ? error.message : 'falha de rede',
        });
      }
    }
  }

  return resultado;
}
