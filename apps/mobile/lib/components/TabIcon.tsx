import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Ícone das abas.
 *
 * Substituiu emoji. O motivo não é estética: emoji é um GLIFO COLORIDO DO
 * SISTEMA e ignora a cor que se manda — então a aba ativa nunca pegava a cor da
 * academia, embora o `color` já estivesse sendo passado. O tema mudava tudo à
 * volta e o ícone ficava igual.
 *
 * Emoji também muda de desenho conforme o aparelho e a versão do Android: o
 * mesmo app não parecia o mesmo app em dois celulares.
 *
 * Ionicons vem do @expo/vector-icons, que já acompanha o Expo — não há
 * dependência nova, nem módulo nativo a mais no build. Uma família só para todas
 * as abas, de propósito: misturar conjuntos é o jeito mais rápido de um app
 * parecer remendado.
 *
 * CONTORNO quando inativa, PREENCHIDO quando ativa. A cor sozinha não basta: em
 * tema de baixo contraste — e o cliente escolhe as cores — a diferença entre
 * ativo e inativo pode ficar quase invisível. O peso do traço não depende da
 * paleta que a academia configurou.
 */

/**
 * Ícones disponíveis, nomeados pelo PAPEL que cumprem — não pelo desenho.
 *
 * `ficha` e não `clipboard`: o dia em que a prancheta virar outra coisa, troca-se
 * aqui e nenhuma tela precisa saber. Nome de desenho espalhado pelas telas é o
 * que transforma uma troca de ícone numa varredura no projeto inteiro.
 */
const ICONES = {
  treino: 'barbell',
  exercicios: 'fitness',
  ficha: 'clipboard',
  agenda: 'calendar',
  mais: 'menu',
  ponto: 'time',
  alunos: 'people',
  venda: 'cart',
  avisos: 'notifications',
  matricula: 'receipt',
  pontos: 'star',
  evolucao: 'trending-up',
  perfil: 'person',
  privacidade: 'lock-closed',
  planos: 'card',
} as const;

export type NomeDoIcone = keyof typeof ICONES;

export function TabIcon({
  nome,
  color,
  focused,
}: {
  nome: NomeDoIcone;
  color: string;
  focused: boolean;
}) {
  const base = ICONES[nome];
  return <Ionicons color={color} name={focused ? base : `${base}-outline`} size={22} />;
}
