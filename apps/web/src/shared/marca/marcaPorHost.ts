import type { NextRequest } from 'next/server';

/**
 * A marca da academia resolvida pelo HOSTNAME, no servidor.
 *
 * É a mesma fonte que a tela de login usa (`/auth/theme`), e é rota PÚBLICA de
 * propósito: quem instala o aplicativo na tela inicial ainda não entrou.
 *
 * Aqui a chamada vai DIRETO à API pela rede interna (`API_URL`), e não pelo
 * proxy do navegador: este código roda no servidor, e passar pelo proxy seria
 * dar uma volta para falar com quem está do lado.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3333';

export type MarcaDoCliente = {
  idCliente: number;
  dsCliente?: string | null;
  corPrimaria?: string | null;
  corFundo?: string | null;
  corTexto?: string | null;
  caCNPJ?: string | null;
  logoUrl?: string | null;
};

/**
 * Host PÚBLICO da requisição — o que o navegador realmente usou.
 *
 * MESMA ARMADILHA do proxy (app/api/proxy/[...path]/route.ts): auto-hospedado
 * atrás do Traefik, `request.nextUrl.host` é o endereço INTERNO do container
 * ("localhost:3000"), nunca o host que a pessoa digitou. Usar o nextUrl aqui
 * faria toda academia receber o manifesto de ninguém — o resolvedor de tenant
 * não acharia domínio algum e o ícone sairia genérico para todo mundo.
 */
export function hostPublico(request: NextRequest): string | null {
  const encaminhado = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  return encaminhado?.split(',')[0]?.trim().toLowerCase() || null;
}

/** Marca do cliente daquele host, ou null quando o domínio não é de ninguém. */
export async function marcaPorHost(request: NextRequest): Promise<MarcaDoCliente | null> {
  return marcaPorHostname(hostPublico(request));
}

/**
 * A mesma consulta, a partir do hostname já extraído.
 *
 * Existe porque `generateMetadata` não recebe a requisição — só alcança os
 * cabeçalhos por `headers()`. Sem esta porta, o título da aba e o do atalho no
 * iPhone ficariam de fora da marca, que são justamente os dois lugares onde o
 * nome da academia aparece antes de a pessoa entrar.
 */
export async function marcaPorHostname(host: string | null): Promise<MarcaDoCliente | null> {
  if (!host) return null;

  try {
    const resposta = await fetch(`${API_URL}/auth/theme?url=${encodeURIComponent(host)}`, {
      // Sem timeout, uma API lenta seguraria o pedido do manifesto e o navegador
      // desistiria da instalação sem dizer por quê.
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    // 204 = domínio não cadastrado. Não é erro: alguém abriu por um endereço
    // que ainda não pertence a academia nenhuma.
    if (!resposta.ok || resposta.status === 204) return null;
    return (await resposta.json()) as MarcaDoCliente;
  } catch {
    // A ausência de marca degrada para o padrão SOLSFIT. Um ícone genérico é
    // muito melhor que um manifesto quebrado, que faz o navegador simplesmente
    // não oferecer a instalação.
    return null;
  }
}
