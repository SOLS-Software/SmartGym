// Biblioteca de cenas por PADRAO DE MOVIMENTO. Cada cena desenha dois quadros
// (t=0 posicao inicial, t=1 posicao final) e vira um GIF de 2 frames.
// Exercicios da mesma familia compartilham a cena — ver MAPA em mapa.mts.
//
// CONVENCAO DE ORIENTACAO (errar aqui foi o bug das primeiras versoes):
// - Quase toda figura em pe ou sentada olha para a ESQUERDA (cabeca com x menor
//   que o quadril). Nessas, a ponta do pe tem de apontar para a ESQUERDA e a
//   perna dobra para a DIREITA. A excecao e o `afundo`, que olha para a direita.
// - Figura deitada de costas: cabeca a esquerda, quadril -> joelho -> pe sempre
//   para a DIREITA. Joelho a esquerda do quadril dobra a perna sobre o tronco.

const W = 640;
const H = 420;

const L = (a: number, b: number, t: number) => a + (b - a) * t;
const n = (v: number) => Math.round(v * 10) / 10;

const CORPO = '#1e3a5f';
const MEMBRO = '#2f5c8f';
const APARELHO = '#cbd5e1';
const ESTRUTURA = '#94a3b8';
const CARGA = '#f97316';
const CARGA_BORDA = '#c2410c';

const chao = (y = 360) =>
  `<line x1="40" y1="${y}" x2="600" y2="${y}" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>`;

const membro = (pontos: Array<[number, number]>, largura = 15, cor = MEMBRO) =>
  `<polyline points="${pontos.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="${largura}" stroke-linecap="round" stroke-linejoin="round"/>`;

const cabeca = (x: number, y: number, r = 17) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${CORPO}"/>`;

// Anilha vista de frente (a barra aparece de topo, por isso o disco).
const anilha = (x: number, y: number, r = 28) =>
  `<line x1="${n(x - r - 22)}" y1="${n(y)}" x2="${n(x + r + 22)}" y2="${n(y)}" stroke="#64748b" stroke-width="6" stroke-linecap="round"/>` +
  `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${CARGA}" fill-opacity="0.9" stroke="${CARGA_BORDA}" stroke-width="3"/>` +
  `<circle cx="${n(x)}" cy="${n(y)}" r="6" fill="#7c2d12"/>`;

const halter = (x: number, y: number) =>
  `<rect x="${n(x - 20)}" y="${n(y - 5)}" width="40" height="10" rx="4" fill="#64748b"/>` +
  `<rect x="${n(x - 26)}" y="${n(y - 12)}" width="12" height="24" rx="4" fill="${CARGA}" stroke="${CARGA_BORDA}" stroke-width="2"/>` +
  `<rect x="${n(x + 14)}" y="${n(y - 12)}" width="12" height="24" rx="4" fill="${CARGA}" stroke="${CARGA_BORDA}" stroke-width="2"/>`;

const barraCurta = (x: number, y: number, meio = 34) =>
  `<line x1="${n(x - meio)}" y1="${n(y)}" x2="${n(x + meio)}" y2="${n(y)}" stroke="#475569" stroke-width="9" stroke-linecap="round"/>`;

const cabo = (x1: number, y1: number, x2: number, y2: number) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#64748b" stroke-width="3"/>`;

const torrePolia = (x: number, topo: number) =>
  `<rect x="${x}" y="${topo}" width="16" height="${360 - topo}" rx="6" fill="${ESTRUTURA}"/>` +
  `<circle cx="${x + 8}" cy="${topo + 10}" r="11" fill="#64748b"/>`;

const seta = (x: number, y1: number, y2: number) => {
  const dir = y2 < y1 ? -1 : 1;
  const pontaY = y2 + dir * 4;
  return (
    `<line x1="${x}" y1="${y1}" x2="${n(y2 - dir * 14)}" y2="${n(y2 - dir * 14)}" stroke="#0ea5e9" stroke-width="0"/>` +
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${n(y2 - dir * 12)}" stroke="#0ea5e9" stroke-width="5" stroke-linecap="round"/>` +
    `<polygon points="${x},${n(pontaY)} ${x - 9},${n(pontaY - dir * 18)} ${x + 9},${n(pontaY - dir * 18)}" fill="#0ea5e9"/>`
  );
};

// A maioria das cenas tem 2 quadros e `desenho` recebe t=0 ou t=1, usado como
// fator de interpolacao entre a posicao inicial e a final. Cenas com mais de 2
// quadros (ex.: burpee) recebem o INDICE do quadro e desenham cada pose de
// forma discreta — o numero de quadros e o tamanho de `legendas`.
export type Cena = {
  legendas: string[];
  desenho: (quadro: number) => string;
};

export const quadrosDaCena = (id: string) => {
  const cena = CENAS[id];
  if (!cena) throw new Error(`Cena desconhecida: ${id}`);
  return cena.legendas.length;
};

export const CENAS: Record<string, Cena> = {
  // -------------------------------------------------------------------------
  'banco-supino': {
    legendas: ['1. Desça controlado até a carga tocar o peito', '2. Empurre até estender os cotovelos'],
    desenho: (t) => {
      const barY = L(208, 118, t);
      const cot: [number, number] = [L(232, 228, t), L(262, 166, t)];
      return [
        chao(),
        `<rect x="112" y="160" width="12" height="200" rx="5" fill="${ESTRUTURA}"/>`,
        `<path d="M118 168 L118 150 Q118 142 126 142 L140 142" fill="none" stroke="#64748b" stroke-width="9" stroke-linecap="round"/>`,
        `<rect x="130" y="250" width="300" height="18" rx="7" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="150" y="268" width="14" height="92" rx="4" fill="${ESTRUTURA}"/>`,
        `<rect x="396" y="268" width="14" height="92" rx="4" fill="${ESTRUTURA}"/>`,
        membro([[330, 236], [392, 284], [398, 352]], 17, CORPO),
        membro([[384, 356], [416, 356]], 10, CORPO),
        membro([[196, 236], [330, 236]], 29, CORPO),
        cabeca(172, 234, 18),
        membro([[207, 226], cot, [252, barY]], 15),
        anilha(252, barY, 30),
        seta(345, 206, 140),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'banco-abertura': {
    legendas: ['1. Abra os braços em arco até sentir o alongamento', '2. Feche o arco contraindo o peitoral'],
    desenho: (t) => {
      // Mao aberta para o lado fica na altura do banco (nao abaixo dele).
      const maoX = L(272, 250, t);
      const maoY = L(246, 128, t);
      const cot: [number, number] = [L(246, 238, t), L(234, 178, t)];
      return [
        chao(),
        `<rect x="130" y="250" width="300" height="18" rx="7" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="150" y="268" width="14" height="92" rx="4" fill="${ESTRUTURA}"/>`,
        `<rect x="396" y="268" width="14" height="92" rx="4" fill="${ESTRUTURA}"/>`,
        membro([[330, 236], [392, 284], [398, 352]], 17, CORPO),
        membro([[384, 356], [416, 356]], 10, CORPO),
        membro([[196, 236], [330, 236]], 29, CORPO),
        cabeca(172, 234, 18),
        membro([[207, 226], cot, [maoX, maoY]], 15),
        halter(maoX, maoY),
        seta(360, 268, 150),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'puxada-alta': {
    legendas: ['1. Braços estendidos, escápulas soltas', '2. Puxe até a barra chegar ao peito'],
    desenho: (t) => {
      const maoX = L(196, 258, t);
      const maoY = L(106, 194, t);
      const cot: [number, number] = [L(252, 330, t), L(140, 206, t)];
      return [
        chao(),
        torrePolia(90, 60),
        `<rect x="250" y="252" width="140" height="16" rx="6" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="360" y="268" width="14" height="92" rx="4" fill="${ESTRUTURA}"/>`,
        `<rect x="268" y="212" width="94" height="14" rx="6" fill="${ESTRUTURA}"/>`,
        membro([[330, 246], [270, 252], [262, 352]], 17, CORPO),
        membro([[238, 356], [270, 356]], 10, CORPO),
        membro([[330, 246], [312, 170]], 28, CORPO),
        cabeca(306, 148),
        cabo(98, 70, maoX, maoY),
        membro([[312, 170], cot, [maoX, maoY]], 14),
        barraCurta(maoX, maoY, 40),
        seta(430, 130, 210),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'remada-horizontal': {
    legendas: ['1. Braços à frente, tronco ereto', '2. Puxe o pegador até o abdômen'],
    desenho: (t) => {
      const maoX = L(186, 292, t);
      const maoY = L(234, 232, t);
      const cot: [number, number] = [L(250, 352, t), L(224, 214, t)];
      return [
        chao(),
        `<rect x="78" y="296" width="44" height="64" rx="6" fill="${ESTRUTURA}"/>`,
        `<circle cx="100" cy="304" r="10" fill="#64748b"/>`,
        `<rect x="130" y="268" width="18" height="64" rx="5" fill="${ESTRUTURA}"/>`,
        `<rect x="248" y="280" width="132" height="16" rx="6" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="350" y="296" width="14" height="64" rx="4" fill="${ESTRUTURA}"/>`,
        membro([[320, 274], [206, 264], [154, 288]], 17, CORPO),
        membro([[320, 274], [312, 192]], 28, CORPO),
        cabeca(306, 170),
        cabo(100, 304, maoX, maoY),
        membro([[312, 192], cot, [maoX, maoY]], 14),
        barraCurta(maoX, maoY, 16),
        seta(430, 160, 232),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'remada-curvada': {
    legendas: ['1. Tronco inclinado, braços estendidos', '2. Puxe a barra até o abdômen'],
    desenho: (t) => {
      const barY = L(304, 236, t);
      const cot: [number, number] = [L(248, 306, t), L(262, 250, t)];
      return [
        chao(),
        membro([[330, 244], [332, 302], [324, 354]], 17, CORPO),
        membro([[300, 358], [332, 358]], 10, CORPO),
        membro([[330, 244], [242, 208]], 28, CORPO),
        cabeca(220, 200),
        membro([[240, 216], cot, [252, barY]], 14),
        anilha(252, barY, 27),
        seta(420, 300, 238),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'suspenso-barra': {
    legendas: ['1. Pendurado, braços estendidos', '2. Puxe o corpo até o queixo passar a barra'],
    desenho: (t) => {
      const ombroY = L(162, 122, t);
      const quadrilY = L(258, 218, t);
      const cot: [number, number] = [L(316, 352, t), L(128, 118, t)];
      return [
        `<line x1="180" y1="90" x2="460" y2="90" stroke="#64748b" stroke-width="10" stroke-linecap="round"/>`,
        `<rect x="184" y="90" width="12" height="270" rx="5" fill="${ESTRUTURA}"/>`,
        `<rect x="444" y="90" width="12" height="270" rx="5" fill="${ESTRUTURA}"/>`,
        chao(),
        membro([[320, quadrilY], [346, quadrilY + 58], [338, quadrilY + 112]], 17, CORPO),
        membro([[314, ombroY], [320, quadrilY]], 28, CORPO),
        cabeca(306, ombroY - 26),
        membro([[314, ombroY], cot, [320, 96]], 14),
        seta(430, 200, 150),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  agachamento: {
    legendas: ['1. Desça até as coxas ficarem paralelas ao chão', '2. Suba estendendo quadril e joelhos'],
    desenho: (t) => {
      const quadril: [number, number] = [L(312, 296, t), L(240, 300, t)];
      const ombro: [number, number] = [L(302, 284, t), L(164, 226, t)];
      const joelho: [number, number] = [L(318, 364, t), L(300, 302, t)];
      return [
        chao(),
        membro([ombro, quadril], 28, CORPO),
        membro([quadril, joelho, [318, 354]], 17, CORPO),
        membro([[294, 358], [326, 358]], 10, CORPO),
        cabeca(ombro[0] - 10, ombro[1] - 26),
        membro([ombro, [ombro[0] + 28, ombro[1] + 26]], 13),
        // A anilha fica atras do ombro (x maior) para nao cobrir a cabeca.
        anilha(ombro[0] + 24, ombro[1] + 2, 26),
        seta(440, 300, 220),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'leg-press': {
    legendas: ['1. Desça até os joelhos formarem 90 graus', '2. Empurre a plataforma até quase estender'],
    desenho: (t) => {
      const pe: [number, number] = [L(322, 232, t), L(276, 178, t)];
      const joelho: [number, number] = [L(356, 328, t), L(228, 252, t)];
      return [
        chao(),
        `<line x1="196" y1="140" x2="404" y2="330" stroke="${ESTRUTURA}" stroke-width="7" stroke-linecap="round"/>`,
        `<line x1="230" y1="120" x2="438" y2="310" stroke="${ESTRUTURA}" stroke-width="7" stroke-linecap="round"/>`,
        `<line x1="${n(pe[0] - 34)}" y1="${n(pe[1] - 30)}" x2="${n(pe[0] + 30)}" y2="${n(pe[1] + 28)}" stroke="${CARGA}" stroke-width="16" stroke-linecap="round"/>`,
        `<rect x="392" y="296" width="76" height="16" rx="6" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<line x1="432" y1="300" x2="496" y2="228" stroke="${APARELHO}" stroke-width="18" stroke-linecap="round"/>`,
        membro([[422, 292], joelho, pe], 17, CORPO),
        membro([[422, 292], [472, 250]], 28, CORPO),
        cabeca(486, 236),
        seta(300, 360, 300),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'cadeira-maquina': {
    legendas: ['1. Posição inicial, com o rolo apoiado', '2. Complete a amplitude e contraia'],
    desenho: (t) => {
      const pe: [number, number] = [L(292, 222, t), L(338, 262, t)];
      return [
        chao(),
        `<rect x="390" y="176" width="18" height="112" rx="7" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="298" y="280" width="112" height="16" rx="6" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="340" y="296" width="14" height="64" rx="4" fill="${ESTRUTURA}"/>`,
        membro([[384, 272], [300, 276], pe], 17, CORPO),
        membro([[384, 272], [392, 198]], 28, CORPO),
        cabeca(390, 176),
        membro([[392, 198], [360, 250]], 13),
        `<circle cx="${n(pe[0])}" cy="${n(pe[1])}" r="13" fill="${CARGA}" stroke="${CARGA_BORDA}" stroke-width="3"/>`,
        seta(220, 330, 268),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'mesa-flexora': {
    legendas: ['1. Pernas quase estendidas', '2. Flexione os joelhos até contrair o posterior'],
    desenho: (t) => {
      const pe: [number, number] = [L(424, 352, t), L(314, 198, t)];
      return [
        chao(),
        `<rect x="146" y="248" width="264" height="18" rx="7" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="170" y="266" width="14" height="94" rx="4" fill="${ESTRUTURA}"/>`,
        `<rect x="380" y="266" width="14" height="94" rx="4" fill="${ESTRUTURA}"/>`,
        membro([[196, 234], [330, 234]], 29, CORPO),
        cabeca(172, 232, 18),
        membro([[330, 234], [396, 244], pe], 17, CORPO),
        `<circle cx="${n(pe[0])}" cy="${n(pe[1])}" r="13" fill="${CARGA}" stroke="${CARGA_BORDA}" stroke-width="3"/>`,
        seta(470, 320, 220),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'rosca-em-pe': {
    legendas: ['1. Braços estendidos, cotovelos junto ao tronco', '2. Flexione até a altura dos ombros'],
    desenho: (t) => {
      const maoX = L(330, 296, t);
      const maoY = L(300, 188, t);
      return [
        chao(),
        membro([[320, 250], [324, 304], [318, 354]], 17, CORPO),
        membro([[293, 358], [325, 358]], 10, CORPO),
        membro([[320, 250], [312, 162]], 28, CORPO),
        cabeca(306, 140),
        membro([[312, 168], [324, 226], [maoX, maoY]], 14),
        anilha(maoX, maoY, 22),
        seta(430, 292, 200),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'triceps-polia': {
    legendas: ['1. Cotovelos a 90 graus, colados ao tronco', '2. Estenda até os braços ficarem retos'],
    desenho: (t) => {
      const maoX = L(272, 288, t);
      const maoY = L(190, 266, t);
      return [
        chao(),
        torrePolia(110, 60),
        membro([[330, 252], [334, 306], [328, 355]], 17, CORPO),
        membro([[304, 358], [336, 358]], 10, CORPO),
        membro([[330, 252], [318, 164]], 28, CORPO),
        cabeca(310, 142),
        cabo(118, 70, maoX, maoY),
        membro([[318, 172], [302, 226], [maoX, maoY]], 14),
        barraCurta(maoX, maoY, 20),
        seta(430, 200, 272),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  desenvolvimento: {
    legendas: ['1. Carga na altura dos ombros', '2. Empurre acima da cabeça'],
    desenho: (t) => {
      const maoX = L(298, 316, t);
      const maoY = L(170, 92, t);
      const cot: [number, number] = [L(322, 332, t), L(206, 134, t)];
      return [
        chao(),
        `<rect x="352" y="156" width="16" height="116" rx="6" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="268" y="270" width="102" height="16" rx="6" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="332" y="286" width="14" height="74" rx="4" fill="${ESTRUTURA}"/>`,
        membro([[348, 264], [282, 272], [276, 352]], 17, CORPO),
        membro([[252, 356], [284, 356]], 10, CORPO),
        membro([[348, 264], [344, 182]], 28, CORPO),
        cabeca(338, 160),
        membro([[344, 182], cot, [maoX, maoY]], 14),
        halter(maoX, maoY),
        seta(440, 190, 110),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'elevacao-bracos': {
    legendas: ['1. Braços ao lado do corpo', '2. Eleve até a altura dos ombros'],
    desenho: (t) => {
      const maoX = L(330, 236, t);
      const maoY = L(244, 164, t);
      const cot: [number, number] = [L(322, 274, t), L(202, 168, t)];
      return [
        chao(),
        membro([[320, 250], [324, 304], [318, 354]], 17, CORPO),
        membro([[293, 358], [325, 358]], 10, CORPO),
        membro([[320, 250], [312, 162]], 28, CORPO),
        cabeca(306, 140),
        membro([[312, 168], cot, [maoX, maoY]], 14),
        halter(maoX, maoY),
        seta(430, 250, 168),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'abdominal-solo': {
    legendas: ['1. Deitado, escápulas no chão', '2. Enrole a coluna e eleve o tronco'],
    desenho: (t) => {
      const ombro: [number, number] = [L(206, 240, t), L(300, 254, t)];
      return [
        chao(336),
        `<rect x="120" y="326" width="340" height="11" rx="5" fill="${APARELHO}"/>`,
        // Cabeca a ESQUERDA, entao quadril -> joelho -> pe tem de ir para a
        // DIREITA. Com o joelho a esquerda do quadril a perna dobrava por cima
        // do tronco, na direcao da cabeca.
        membro([[326, 300], [392, 252], [428, 318]], 17, CORPO),
        membro([ombro, [326, 300]], 28, CORPO),
        cabeca(ombro[0] - 24, ombro[1] - 14),
        membro([ombro, [ombro[0] - 6, ombro[1] - 22]], 12),
        seta(500, 300, 240),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'prancha-flexao': {
    legendas: ['1. Desça mantendo o corpo alinhado', '2. Empurre o chão até estender os braços'],
    desenho: (t) => {
      const ombroY = L(304, 268, t);
      const quadrilY = L(312, 284, t);
      const cot: [number, number] = [L(218, 212, t), L(318, 300, t)];
      return [
        chao(340),
        `<rect x="150" y="332" width="320" height="10" rx="5" fill="${APARELHO}"/>`,
        membro([[350, quadrilY], [412, quadrilY + 18], [442, 334]], 17, CORPO),
        membro([[228, ombroY], [350, quadrilY]], 27, CORPO),
        cabeca(206, ombroY - 16, 16),
        membro([[200, 334], cot, [228, ombroY]], 14),
        seta(430, 250, 200),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'stiff-quadril': {
    legendas: ['1. Em pé, quadril estendido', '2. Empurre o quadril para trás descendo a carga'],
    desenho: (t) => {
      const ombro: [number, number] = [L(318, 252, t), L(158, 206, t)];
      const mao: [number, number] = [L(324, 262, t), L(256, 302, t)];
      return [
        chao(),
        membro([[330, 246], [336, 302], [328, 355]], 17, CORPO),
        membro([[304, 358], [336, 358]], 10, CORPO),
        membro([ombro, [330, 246]], 28, CORPO),
        cabeca(ombro[0] - 12, ombro[1] - 24),
        membro([ombro, mao], 14),
        anilha(mao[0], mao[1], 27),
        seta(440, 210, 290),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  afundo: {
    legendas: ['1. Um pé à frente, tronco ereto', '2. Desça até o joelho de trás quase tocar o chão'],
    desenho: (t) => {
      const quadrilY = L(240, 288, t);
      const ombroY = L(158, 206, t);
      return [
        chao(),
        membro([[326, quadrilY], [252, L(302, 330, t)], [224, 354]], 16, CORPO),
        membro([[212, 358], [242, 358]], 10, CORPO),
        membro([[326, quadrilY], [392, L(292, 300, t)], [400, 354]], 17, CORPO),
        membro([[388, 358], [418, 358]], 10, CORPO),
        membro([[320, ombroY], [326, quadrilY]], 28, CORPO),
        cabeca(312, ombroY - 24),
        membro([[320, ombroY], [300, ombroY + 74]], 13),
        halter(300, ombroY + 74),
        seta(470, 220, 290),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  panturrilha: {
    legendas: ['1. Calcanhares abaixo da plataforma', '2. Suba na ponta dos pés e contraia'],
    desenho: (t) => {
      const dy = L(0, -24, t);
      const calcanharY = L(344, 316, t);
      return [
        chao(),
        `<rect x="248" y="150" width="14" height="200" rx="5" fill="${ESTRUTURA}"/>`,
        `<rect x="262" y="${n(150 + dy * 0.5)}" width="96" height="16" rx="6" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="290" y="336" width="96" height="14" rx="5" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        membro([[326, 246 + dy], [330, 300 + dy], [330, 336]], 17, CORPO),
        membro([[326, 246 + dy], [318, 158 + dy]], 28, CORPO),
        cabeca(312, 136 + dy),
        membro([[318, 166 + dy], [332, 250 + dy]], 13),
        // Figura virada para a esquerda: ponta do pe na plataforma (esquerda) e
        // calcanhar atras (direita), que e o que sobe.
        membro([[300, 340], [352, calcanharY]], 10, CORPO),
        seta(440, 300, 250),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'elevacao-pelvica': {
    legendas: ['1. Quadril próximo ao chão', '2. Estenda o quadril e contraia os glúteos'],
    desenho: (t) => {
      const quadrilY = L(318, 256, t);
      return [
        chao(),
        `<rect x="146" y="248" width="146" height="16" rx="6" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="166" y="264" width="14" height="96" rx="4" fill="${ESTRUTURA}"/>`,
        membro([[350, quadrilY], [416, 300], [426, 352]], 17, CORPO),
        membro([[412, 356], [442, 356]], 10, CORPO),
        membro([[252, 244], [350, quadrilY]], 27, CORPO),
        cabeca(228, 232, 16),
        anilha(350, quadrilY - 16, 24),
        seta(490, 306, 250),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'cardio-maquina': {
    legendas: ['1. Ritmo leve para aquecer', '2. Ajuste a intensidade e mantenha o ritmo'],
    desenho: (t) => {
      const joelhoA: [number, number] = [L(348, 276, t), L(290, 288, t)];
      const peA: [number, number] = [L(358, 258, t), L(318, 262, t)];
      const joelhoB: [number, number] = [L(276, 344, t), L(290, 288, t)];
      const peB: [number, number] = [L(258, 356, t), L(262, 318, t)];
      const maoA: [number, number] = [L(258, 344, t), L(226, 214, t)];
      const maoB: [number, number] = [L(344, 262, t), L(214, 226, t)];
      return [
        chao(),
        `<rect x="170" y="320" width="300" height="20" rx="8" fill="${APARELHO}" stroke="${ESTRUTURA}" stroke-width="2"/>`,
        `<rect x="182" y="340" width="16" height="20" rx="4" fill="${ESTRUTURA}"/>`,
        `<rect x="442" y="340" width="16" height="20" rx="4" fill="${ESTRUTURA}"/>`,
        `<rect x="444" y="182" width="12" height="140" rx="5" fill="${ESTRUTURA}"/>`,
        `<rect x="418" y="150" width="60" height="40" rx="7" fill="#64748b"/>`,
        membro([[302, 244], joelhoB, peB], 15, CORPO),
        membro([[298, 160], [302, 244]], 27, CORPO),
        membro([[302, 244], joelhoA, peA], 16, CORPO),
        cabeca(292, 138),
        membro([[298, 168], maoA], 12),
        membro([[298, 168], maoB], 13),
        seta(520, 280, 220),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  'corpo-livre-salto': {
    legendas: ['1. Agache preparando o impulso', '2. Salte estendendo o corpo'],
    desenho: (t) => {
      // t=0 agachado com os pes no chao; t=1 no ar, corpo estendido.
      const quadrilY = L(288, 216, t);
      const ombroY = L(206, 128, t);
      const joelho: [number, number] = [L(370, 336, t), L(300, 278, t)];
      const pe: [number, number] = [L(322, 330, t), L(356, 336, t)];
      const mao: [number, number] = [L(276, 322, t), L(268, 74, t)];
      return [
        chao(),
        membro([[322, quadrilY], joelho, pe], 17, CORPO),
        membro([[314, ombroY], [322, quadrilY]], 28, CORPO),
        cabeca(306, ombroY - 24),
        membro([[314, ombroY], mao], 14),
        seta(440, 280, 200),
      ].join('\n');
    },
  },

  // -------------------------------------------------------------------------
  // Unica cena com mais de 2 quadros: o burpee encadeia agachamento, prancha,
  // flexao e salto, e em 2 quadros a sequencia nao se le.
  burpee: {
    legendas: [
      '1. Em pé, pés na largura dos ombros',
      '2. Agache e apoie as mãos no chão',
      '3. Jogue as pernas para trás até a prancha',
      '4. Faça uma flexão',
      '5. Volte os pés e salte com os braços acima',
    ],
    desenho: (q) => {
      const base = [chao(358)];

      if (q === 0) {
        return [
          ...base,
          membro([[320, 248], [326, 302], [320, 352]], 17, CORPO),
          membro([[295, 356], [327, 356]], 10, CORPO),
          membro([[320, 248], [312, 160]], 28, CORPO),
          cabeca(306, 138),
          // Braco um pouco a frente do tronco, senao some dentro dele.
          membro([[312, 166], [296, 206], [290, 242]], 13),
          seta(440, 300, 240),
        ].join('\n');
      }

      if (q === 1) {
        return [
          ...base,
          membro([[344, 288], [334, 318], [332, 350]], 17, CORPO),
          membro([[318, 354], [350, 354]], 10, CORPO),
          membro([[344, 288], [302, 276]], 27, CORPO),
          cabeca(282, 266, 16),
          membro([[302, 276], [268, 316], [252, 348]], 13),
          seta(440, 260, 320),
        ].join('\n');
      }

      if (q === 2) {
        return [
          ...base,
          membro([[338, 300], [404, 318], [438, 348]], 17, CORPO),
          membro([[238, 300], [338, 300]], 27, CORPO),
          cabeca(216, 286, 16),
          membro([[210, 352], [222, 326], [238, 300]], 13),
          `<text x="452" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="15" fill="#0ea5e9">prancha</text>`,
        ].join('\n');
      }

      if (q === 3) {
        return [
          ...base,
          membro([[338, 320], [404, 330], [438, 350]], 17, CORPO),
          membro([[236, 326], [338, 320]], 27, CORPO),
          cabeca(214, 312, 16),
          membro([[210, 352], [226, 344], [236, 326]], 13),
          seta(470, 292, 336),
        ].join('\n');
      }

      return [
        ...base,
        membro([[320, 200], [332, 254], [324, 300]], 17, CORPO),
        membro([[312, 306], [340, 306]], 10, CORPO),
        membro([[320, 200], [312, 112]], 28, CORPO),
        cabeca(306, 88),
        // Bracos acima da cabeca, abertos para a frente para nao se fundirem
        // com o tronco na silhueta.
        membro([[312, 118], [286, 76], [272, 38]], 13),
        seta(440, 300, 200),
      ].join('\n');
    },
  },
};

export function montarSvg(
  cenaId: string,
  quadro: number,
  titulo: string,
  areas: string,
): string {
  const cena = CENAS[cenaId];
  if (!cena) throw new Error(`Cena desconhecida: ${cenaId}`);
  const legenda = cena.legendas[quadro];
  if (!legenda) throw new Error(`Cena ${cenaId} não tem o quadro ${quadro}.`);
  const tamanhoTitulo = titulo.length > 24 ? 22 : 27;
  const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="40" y="46" font-family="Segoe UI, Arial, sans-serif" font-size="${tamanhoTitulo}" font-weight="700" fill="#0f172a">${escapar(titulo)}</text>
  <text x="40" y="70" font-family="Segoe UI, Arial, sans-serif" font-size="15" fill="#64748b">${escapar(areas)}</text>
${cena.desenho(quadro)}
  <text x="40" y="400" font-family="Segoe UI, Arial, sans-serif" font-size="17" fill="#0f172a">${escapar(legenda)}</text>
</svg>`;
}
