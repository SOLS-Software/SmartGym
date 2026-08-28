/**
 * Escolha da cor do texto sobre as células tingidas dos mapas de calor.
 *
 * POR QUE ISTO EXISTE
 *
 * As células da coorte e do mapa dia × hora são pintadas com a cor primária em
 * opacidade proporcional à intensidade. A cor primária NÃO é fixa: cada cliente
 * configura a própria (`TemaCustomizado`), e o modo escuro ainda clareia o tom
 * antes de aplicar. Uma academia com marca salmão e outra com marca azul-marinho
 * produzem células onde, respectivamente, texto escuro e texto claro são
 * legíveis — e o oposto é ilegível.
 *
 * Herdar `--color-text` funciona por acaso e falha por acaso. Aqui a tinta sai
 * da luminância real da célula depois de composta sobre a superfície, então
 * vale para qualquer marca que o cliente escolher.
 */

export type Rgb = { r: number; g: number; b: number };

/**
 * Lê um valor de cor CSS. Cobre os formatos que o sistema de tema produz: hex
 * de 3 ou 6 dígitos (`theme.corPrimaria`) e `rgb()/rgba()` (as variantes `-bg`).
 * Devolve nulo no que não reconhece — quem chama volta ao token e nada quebra.
 */
export function lerCor(valor: string): Rgb | null {
  const texto = valor.trim();
  if (!texto) return null;

  if (texto.startsWith('#')) {
    const hex = texto.slice(1);
    if (hex.length === 3) {
      const [r, g, b] = [...hex].map((c) => parseInt(c + c, 16));
      return Number.isNaN(r!) ? null : { r: r!, g: g!, b: b! };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : { r, g, b };
    }
    return null;
  }

  const numeros = texto.match(/-?\d*\.?\d+/g);
  if (texto.startsWith('rgb') && numeros && numeros.length >= 3) {
    return { r: Number(numeros[0]), g: Number(numeros[1]), b: Number(numeros[2]) };
  }

  return null;
}

/** Cor resultante de `frente` com opacidade `alpha` sobre `fundo`. */
export function compor(frente: Rgb, alpha: number, fundo: Rgb): Rgb {
  const misturar = (f: number, t: number) => Math.round(f * alpha + t * (1 - alpha));
  return { r: misturar(frente.r, fundo.r), g: misturar(frente.g, fundo.g), b: misturar(frente.b, fundo.b) };
}

/** Luminância relativa (WCAG 2.1), 0 = preto, 1 = branco. */
export function luminancia({ r, g, b }: Rgb): number {
  const canal = (valor: number) => {
    const v = valor / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * As duas tintas disponíveis. Precisam bater com os literais de
 * `.tinta-clara` / `.tinta-escura` em shared/styles/dashboards.css — é a
 * única coisa acoplada entre este arquivo e o CSS, e mudar uma sem a outra
 * faz a escolha ser calculada para uma cor que não é a exibida.
 */
export const TINTA_CLARA: Rgb = { r: 242, g: 247, b: 244 }; // #f2f7f4
export const TINTA_ESCURA: Rgb = { r: 16, g: 35, b: 26 }; // #10231a

/** Razão de contraste WCAG entre duas cores opacas (1 a 21). */
export function contraste(a: Rgb, b: Rgb): number {
  const claro = Math.max(luminancia(a), luminancia(b));
  const escuro = Math.min(luminancia(a), luminancia(b));
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * Qual tinta lê melhor sobre esta cor.
 *
 * Compara o contraste real das duas candidatas em vez de cortar por um limiar
 * de luminância. A primeira versão usava limiar, e ele errava justamente onde
 * mais importa: sobre a marca salmão do cliente de teste (#ff8080 a 82% sobre
 * a superfície escura), o limiar escolhia tinta clara a 3,3:1 quando a escura
 * dava 5,3:1 — abaixo do mínimo AA quando havia opção acima dele. Contra
 * qualquer cor de marca, comparar não tem esse ponto cego.
 */
export function tintaSobre(fundo: Rgb): 'clara' | 'escura' {
  return contraste(fundo, TINTA_ESCURA) >= contraste(fundo, TINTA_CLARA) ? 'escura' : 'clara';
}

/**
 * A classe de tinta para uma célula pintada com `primaria` em `alpha` sobre
 * `superficie`. Nulo quando alguma cor não pôde ser lida — nesse caso a célula
 * fica com a cor de texto padrão, que é o comportamento de antes.
 */
export function classeDaTinta(
  primaria: string,
  superficie: string,
  alpha: number,
): 'tinta-clara' | 'tinta-escura' | null {
  const frente = lerCor(primaria);
  const fundo = lerCor(superficie);
  if (!frente || !fundo) return null;
  return `tinta-${tintaSobre(compor(frente, alpha, fundo))}` as const;
}
