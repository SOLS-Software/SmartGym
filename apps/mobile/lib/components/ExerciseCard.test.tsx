import { StyleSheet } from 'react-native';
// Na v14 `render` e ASSINCRONO (raiz concorrente do React 19): sem await ele
// devolve uma Promise, nada monta e toda query estoura com "render function has
// not been called". O objeto resolvido e o proprio `screen` — usar o retorno
// evita tambem o retrato que `import { screen }` tira do binding inicial.
import { fireEvent, render } from '@testing-library/react-native';
import { ExerciseCard } from './ExerciseCard';
import type { ExerciseWithCover } from '../types/training';

const AGACHAMENTO: ExerciseWithCover = {
  id: 44,
  idEmpresa: 0,
  boInativo: 0,
  dsExercicio: 'Agachamento Livre',
  dsInstrucao:
    'Agachamento com barra apoiada nas costas. É o exercício mais completo para membros inferiores.\n\nComo executar:\n1. Apoie a barra sobre o trapézio e afaste-se dois passos.\n2. Posicione os pés na largura dos ombros.\n3. Desça até as coxas ficarem paralelas ao chão.',
  areas: [
    { id: 14, dsAreaCorporal: 'Quadríceps', boInativo: 0 },
    { id: 13, dsAreaCorporal: 'Glúteos', boInativo: 0 },
  ],
  equipamentos: [
    { id: 6, nmEquipamento: 'Barra Olímpica', dsEquipamento: 'Barra reta de 2,20 m e 20 kg.' },
    { id: 7, nmEquipamento: 'Anilhas', dsEquipamento: null },
  ],
  coverImageUrl: 'https://exemplo.test/agachamento-livre.gif',
};

const achatar = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('ExerciseCard', () => {
  // Regressao do bug de 2026-08-06: a View da capa tinha so `width`, sem altura.
  // Em Yoga, `height: '100%'` da Image nao resolve contra altura indefinida e a
  // Image cai para a altura intrinseca do arquivo (420) — o card esticava por
  // meia tela e o resizeMode="cover" mostrava so uma fatia do meio do gif.
  // Enquanto a caixa tiver dimensao propria (aspectRatio ou height) isso nao
  // volta a acontecer.
  it('dá dimensão própria à caixa da capa', async () => {
    const tela = await render(<ExerciseCard exercise={AGACHAMENTO} />);

    const estilo = achatar(tela.getByTestId('exercise-card-photo').props.style);

    expect(estilo.aspectRatio ?? estilo.height).toBeDefined();
  });

  it('encolhe a caixa da capa quando o exercício não tem imagem', async () => {
    const tela = await render(<ExerciseCard exercise={{ ...AGACHAMENTO, coverImageUrl: null }} />);

    const estilo = achatar(tela.getByTestId('exercise-card-photo').props.style);

    expect(estilo.height).toBe(34);
    expect(estilo.aspectRatio).toBeUndefined();
  });

  // Com o catalogo preenchido a instrucao tem descricao + 5 ou 6 passos. Sem
  // corte, cada card ocupa varias telas.
  it('corta a instrução em 3 linhas', async () => {
    const tela = await render(<ExerciseCard exercise={AGACHAMENTO} />);

    expect(tela.getByTestId('exercise-card-instruction').props.numberOfLines).toBe(3);
  });

  it('mostra áreas e equipamentos no card', async () => {
    const tela = await render(<ExerciseCard exercise={AGACHAMENTO} />);

    expect(tela.getByText('Quadríceps')).toBeTruthy();
    expect(tela.getByText('Glúteos')).toBeTruthy();
    expect(tela.getByText('Barra Olímpica · Anilhas')).toBeTruthy();
  });

  it('abre o detalhe ao tocar, com o passo a passo numerado', async () => {
    const tela = await render(<ExerciseCard exercise={AGACHAMENTO} />);

    expect(tela.queryByText('COMO EXECUTAR')).toBeNull();

    await fireEvent.press(tela.getByLabelText('Ver detalhes de Agachamento Livre'));

    // findBy* reespera: a raiz concorrente do React 19 nao aplica o setState do
    // toque no mesmo tick.
    expect(await tela.findByText('COMO EXECUTAR')).toBeTruthy();
    expect(await tela.findByText('Apoie a barra sobre o trapézio e afaste-se dois passos.')).toBeTruthy();
    expect(await tela.findByText('EQUIPAMENTOS')).toBeTruthy();
    expect(await tela.findByText('Barra reta de 2,20 m e 20 kg.')).toBeTruthy();
    // A numeracao sai da lista, nao do texto: sem isso saía "1. 1. Apoie...".
    expect(tela.queryByText('1. Apoie a barra sobre o trapézio e afaste-se dois passos.')).toBeNull();
  });

  it('separa descrição do passo a passo no detalhe', async () => {
    const tela = await render(<ExerciseCard exercise={AGACHAMENTO} />);

    await fireEvent.press(tela.getByLabelText('Ver detalhes de Agachamento Livre'));

    expect(
      await tela.findByText(
        'Agachamento com barra apoiada nas costas. É o exercício mais completo para membros inferiores.',
      ),
    ).toBeTruthy();
  });
});
