// Exercicio -> cena do padrao de movimento. Usado pelo gerador em lote
// (gerar-ilustracoes.mts) e pelo reenvio pontual (reenviar-ilustracao.mts).

export const MAPA: Record<string, number[]> = {
  'banco-supino': [2, 3, 4, 10, 39, 40],
  'banco-abertura': [5, 6, 7, 8, 25],
  'puxada-alta': [11, 12, 13],
  'remada-horizontal': [16, 18],
  'remada-curvada': [15, 17],
  'suspenso-barra': [14, 41, 42, 67],
  agachamento: [44, 45, 54, 56],
  'leg-press': [46, 61],
  'cadeira-maquina': [47, 48, 60, 68],
  'mesa-flexora': [49],
  'rosca-em-pe': [29, 30, 31, 32, 33, 34, 35, 36],
  'triceps-polia': [37, 38, 43],
  desenvolvimento: [21, 22, 27],
  'elevacao-bracos': [23, 24, 26, 28, 83],
  'abdominal-solo': [63, 64, 65, 70],
  'prancha-flexao': [9, 66, 86],
  burpee: [79],
  'stiff-quadril': [20, 50, 51, 80],
  afundo: [52, 53],
  panturrilha: [59],
  'elevacao-pelvica': [57, 58],
  'cardio-maquina': [71, 72, 73, 74, 77, 78],
  'corpo-livre-salto': [75, 81, 82, 84, 85],
};
