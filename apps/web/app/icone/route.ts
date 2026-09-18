import { NextResponse, type NextRequest } from 'next/server';
import { marcaPorHost } from '../../src/shared/marca/marcaPorHost';

/**
 * O ícone que a academia ganha na tela inicial de quem instala.
 *
 * POR QUE O SERVIDOR MONTA A IMAGEM, em vez de apontar direto para o logo:
 *
 *  1. O logo vem do Supabase como URL ASSINADA, válida por uma hora. Um ícone
 *     de aplicativo instalado precisa continuar existindo depois disso — o
 *     navegador rebusca o ícone quando quer, e um endereço vencido deixaria o
 *     atalho sem imagem, sem nada explicar.
 *  2. Embutindo os bytes aqui, o ícone não depende de origem externa, o que
 *     evita brigar com a CSP e com o modo privado.
 *  3. O logo do cliente raramente é quadrado. Centralizado sobre a cor de fundo
 *     da marca, ele vira um ícone; esticado, vira um borrão.
 *
 * SVG de propósito: o mesmo arquivo serve todas as densidades de tela, sem
 * biblioteca de imagem no servidor e sem gerar um PNG por tamanho.
 *
 * `?ios=1` devolve os BYTES ORIGINAIS do logo. O Safari ignora os ícones do
 * manifesto e usa `apple-touch-icon`, que precisa ser raster — SVG ali faz o
 * iPhone salvar uma miniatura da página no lugar do ícone.
 */

export const dynamic = 'force-dynamic';

const LARGURA = 512;
/** Zona segura do formato `maskable`: o sistema pode recortar em círculo. */
const MARGEM = 64;

function escapar(texto: string) {
  return texto.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Iniciais da academia, para quando ela ainda não subiu logo. */
function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');
}

export async function GET(request: NextRequest) {
  const marca = await marcaPorHost(request);
  const nome = marca?.dsCliente?.trim() || 'SOLSFIT';
  const fundo = marca?.corFundo || '#032da2';
  const primaria = marca?.corPrimaria || '#032da2';
  const texto = marca?.corTexto || '#ffffff';

  let logoEmbutido: string | null = null;
  if (marca?.logoUrl) {
    try {
      const resposta = await fetch(marca.logoUrl, { signal: AbortSignal.timeout(4000) });
      if (resposta.ok) {
        const tipo = resposta.headers.get('content-type') ?? 'image/png';
        const bytes = Buffer.from(await resposta.arrayBuffer());

        if (request.nextUrl.searchParams.get('ios') === '1') {
          return new NextResponse(bytes, {
            headers: {
              'content-type': tipo,
              // Dez minutos: a academia troca o logo no painel do provedor e o
              // ícone acompanha sem ninguém precisar limpar cache.
              'cache-control': 'public, max-age=600',
            },
          });
        }

        // Teto do que vale embutir. Base64 engorda o arquivo em um terço, então
        // um logo de 3 MB viraria um ícone de 4 MB que o navegador busca toda
        // vez que redesenha o atalho. Acima disso, as iniciais — feias, porém
        // instantâneas. O logo real medido aqui tem 4 KB; este limite existe
        // para o caso patológico, cujo sintoma seria só "o ícone não aparece".
        const TETO = 1_000_000;
        logoEmbutido =
          bytes.byteLength <= TETO ? `data:${tipo};base64,${bytes.toString('base64')}` : null;
      }
    } catch {
      /* sem logo cai nas iniciais; icone generico e melhor que icone quebrado */
    }
  }

  // Sem logo e pedindo o formato do iPhone: não há raster para devolver. O
  // Safari então usa a miniatura da página, que é o comportamento dele quando
  // não encontra apple-touch-icon — e a saída é a academia subir um logo.
  if (request.nextUrl.searchParams.get('ios') === '1') {
    return new NextResponse(null, { status: 404 });
  }

  const interno = LARGURA - MARGEM * 2;
  const conteudo = logoEmbutido
    ? `<image href="${logoEmbutido}" x="${MARGEM}" y="${MARGEM}" width="${interno}" height="${interno}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="200" font-weight="800" fill="${escapar(texto)}">${escapar(iniciais(nome))}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${LARGURA}" width="${LARGURA}" height="${LARGURA}" role="img" aria-label="${escapar(nome)}">
  <rect width="${LARGURA}" height="${LARGURA}" fill="${escapar(logoEmbutido ? fundo : primaria)}"/>
  ${conteudo}
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
}
