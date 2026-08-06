// Fichas dos exercicios do catalogo global. Uma entrada por exercicio ativo,
// no mesmo padrao aprovado no exercicio 1: descricao + passos numerados em
// dsInstrucao, areas corporais e equipamentos basicos.

export type Ficha = {
  id: number;
  nome: string; // conferido contra dsExercicio antes de gravar
  descricao: string;
  passos: string[];
  areas: string[];
  equipamentos: string[];
};

export const FICHAS: Ficha[] = [
  // ----- PEITORAL -----
  {
    id: 2,
    nome: 'Supino Inclinado',
    descricao:
      'Variação do supino com o banco entre 30 e 45 graus. A inclinação desloca a ênfase para a porção clavicular (superior) do peitoral e aumenta a participação do deltoide anterior.',
    passos: [
      'Ajuste o banco entre 30 e 45 graus e deite com os pés firmes no chão, glúteos e costas apoiados.',
      'Segure a barra com pegada pronada pouco mais aberta que os ombros e retraia as escápulas.',
      'Desça a barra de forma controlada até a altura da parte alta do peito, próxima às clavículas.',
      'Empurre até estender os cotovelos, sem tirar o quadril do banco.',
      'Evite inclinações acima de 45 graus: o ombro passa a assumir o trabalho no lugar do peitoral.',
    ],
    areas: ['Peitoral', 'Ombros', 'Tríceps'],
    equipamentos: ['Banco Inclinado', 'Barra Olímpica'],
  },
  {
    id: 3,
    nome: 'Supino Declinado',
    descricao:
      'Supino com o banco inclinado para baixo, entre 15 e 30 graus. Prioriza a porção esternocostal (inferior) do peitoral e reduz a exigência sobre o ombro.',
    passos: [
      'Deite no banco declinado e prenda as pernas nos apoios antes de retirar a barra.',
      'Pegada pronada pouco mais aberta que os ombros, escápulas retraídas.',
      'Desça a barra até a parte inferior do peito, controlando a descida.',
      'Empurre de volta até estender os cotovelos, expirando na subida.',
      'Peça ajuda para retirar e devolver a barra: nesta posição a saída sozinho é desconfortável.',
    ],
    areas: ['Peitoral', 'Tríceps'],
    equipamentos: ['Banco Declinado', 'Barra Olímpica'],
  },
  {
    id: 4,
    nome: 'Supino com Halteres',
    descricao:
      'Supino executado com um halter em cada mão. A amplitude é maior que na barra e cada lado trabalha de forma independente, corrigindo assimetrias de força.',
    passos: [
      'Sente no banco com os halteres sobre as coxas e deite impulsionando-os com os joelhos até a posição inicial.',
      'Posicione os halteres na linha do peito, palmas voltadas para a frente e escápulas retraídas.',
      'Desça de forma controlada até sentir alongamento no peitoral, com os cotovelos pouco abaixo da linha dos ombros.',
      'Empurre os halteres para cima aproximando-os levemente, sem batê-los um no outro.',
      'Para encerrar, traga os halteres às coxas e sente antes de soltá-los.',
    ],
    areas: ['Peitoral', 'Ombros', 'Tríceps'],
    equipamentos: ['Banco Reto', 'Halteres'],
  },
  {
    id: 5,
    nome: 'Crucifixo Reto',
    descricao:
      'Exercício de isolamento do peitoral em banco reto, com abertura e fechamento dos braços em arco. Trabalha a adução horizontal do ombro com pouca participação do tríceps.',
    passos: [
      'Deite no banco reto com um halter em cada mão, braços estendidos acima do peito e palmas voltadas uma para a outra.',
      'Mantenha os cotovelos levemente flexionados e fixos nesse ângulo durante todo o movimento.',
      'Abra os braços em arco até que os halteres fiquem na linha do peito, sentindo o alongamento.',
      'Feche o arco contraindo o peitoral, sem deixar os halteres se tocarem no topo.',
      'Use carga menor que a do supino: o braço de alavanca longo sobrecarrega a articulação do ombro.',
    ],
    areas: ['Peitoral', 'Ombros'],
    equipamentos: ['Banco Reto', 'Halteres'],
  },
  {
    id: 6,
    nome: 'Crucifixo Inclinado',
    descricao:
      'Crucifixo com o banco entre 30 e 45 graus, deslocando a ênfase do isolamento para a porção superior do peitoral.',
    passos: [
      'Ajuste o banco entre 30 e 45 graus e deite com um halter em cada mão sobre o peito.',
      'Estenda os braços mantendo cotovelos levemente flexionados e palmas frente a frente.',
      'Abra em arco até a linha dos ombros, controlando a descida.',
      'Feche o arco contraindo o peitoral superior.',
      'Mantenha as escápulas apoiadas no banco: soltá-las joga a carga para o ombro.',
    ],
    areas: ['Peitoral', 'Ombros'],
    equipamentos: ['Banco Inclinado', 'Halteres'],
  },
  {
    id: 7,
    nome: 'Crossover',
    descricao:
      'Adução dos braços em polias opostas, em pé. A tensão do cabo é constante em toda a amplitude, o que diferencia o exercício do crucifixo com halteres.',
    passos: [
      'Ajuste as polias na altura alta e segure um pegador em cada mão, com os cotovelos levemente flexionados.',
      'Dê um passo à frente, tronco levemente inclinado e abdômen contraído.',
      'Traga as mãos para a frente e para baixo, cruzando-as levemente na altura do quadril.',
      'Contraia o peitoral no fim do movimento e volte controlando, sem deixar a carga bater.',
      'Variar a altura da polia muda a ênfase: alta para a porção inferior, baixa para a superior.',
    ],
    areas: ['Peitoral', 'Ombros'],
    equipamentos: ['Máquina Crossover', 'Polia Alta'],
  },
  {
    id: 8,
    nome: 'Peck Deck',
    descricao:
      'Adução horizontal dos ombros em máquina sentada, com trajetória guiada. É a forma mais segura de isolar o peitoral, indicada para iniciantes e para finalizar o treino.',
    passos: [
      'Ajuste o banco de modo que os pegadores fiquem na altura do peito quando você estiver sentado.',
      'Apoie as costas no encosto, pés no chão e segure os pegadores com os cotovelos levemente flexionados.',
      'Feche os braços à frente do corpo contraindo o peitoral.',
      'Volte controlando até sentir o alongamento, sem deixar a carga encostar entre as repetições.',
      'Evite empurrar com os punhos: a força deve sair do peito, não do antebraço.',
    ],
    areas: ['Peitoral', 'Ombros'],
    equipamentos: ['Máquina Peck Deck'],
  },
  {
    id: 9,
    nome: 'Flexão de Braço',
    descricao:
      'Exercício de empurrar horizontal com o peso do próprio corpo. Trabalha peitoral, tríceps e ombro e exige estabilização do tronco, o que recruta o abdômen.',
    passos: [
      'Apoie as mãos no chão pouco mais abertas que a largura dos ombros, corpo alinhado da cabeça aos calcanhares.',
      'Contraia abdômen e glúteos para não deixar o quadril cair nem subir.',
      'Desça o corpo até o peito ficar próximo ao chão, com os cotovelos a cerca de 45 graus do tronco.',
      'Empurre o chão até estender os cotovelos, mantendo o alinhamento do corpo.',
      'Para facilitar, apoie os joelhos no chão; para dificultar, eleve os pés em um banco.',
    ],
    areas: ['Peitoral', 'Ombros', 'Tríceps', 'Abdômen'],
    equipamentos: ['Colchonete'],
  },
  {
    id: 10,
    nome: 'Pullover',
    descricao:
      'Movimento de arco acima da cabeça, deitado. Trabalha peitoral e grande dorsal ao mesmo tempo e alonga a caixa torácica, sendo comum como transição entre treino de peito e de costas.',
    passos: [
      'Deite no banco reto segurando um halter com as duas mãos, palmas apoiadas na parte interna do peso.',
      'Estenda os braços acima do peito com os cotovelos levemente flexionados.',
      'Leve o halter para trás da cabeça em arco, até sentir o alongamento do peitoral e do dorsal.',
      'Traga de volta pelo mesmo caminho, sem estender demais os cotovelos.',
      'Não force a amplitude para trás além do confortável: o ombro fica em posição vulnerável.',
    ],
    areas: ['Peitoral', 'Costas', 'Tríceps'],
    equipamentos: ['Banco Reto', 'Halteres'],
  },

  // ----- COSTAS -----
  {
    id: 11,
    nome: 'Puxada Frontal',
    descricao:
      'Puxada vertical na polia alta, sentado, com a barra descendo à frente do corpo. É o principal exercício de largura das costas e a alternativa acessível à barra fixa.',
    passos: [
      'Sente na máquina e ajuste o apoio das coxas para que o quadril não suba durante a puxada.',
      'Segure a barra com pegada pronada pouco mais aberta que os ombros.',
      'Incline o tronco levemente para trás e puxe a barra até a altura do queixo ou da clavícula.',
      'Concentre o esforço em levar os cotovelos para baixo e para trás, aproximando as escápulas.',
      'Suba controlando até estender os braços, sem soltar a carga de uma vez.',
    ],
    areas: ['Costas', 'Bíceps', 'Antebraço'],
    equipamentos: ['Polia Alta', 'Barra de Puxada'],
  },
  {
    id: 12,
    nome: 'Puxada Aberta',
    descricao:
      'Puxada na polia alta com pegada bem mais aberta que a largura dos ombros. A amplitude é menor, mas o recrutamento do grande dorsal na porção externa é maior.',
    passos: [
      'Sente na máquina com as coxas travadas sob o apoio.',
      'Segure a barra com pegada pronada bem aberta, além da largura dos ombros.',
      'Puxe a barra até a clavícula mantendo o tronco quase vertical.',
      'Leve os cotovelos para baixo em direção às costelas e junte as escápulas no fim.',
      'Volte controlando até a extensão completa dos braços.',
    ],
    areas: ['Costas', 'Ombros', 'Bíceps'],
    equipamentos: ['Polia Alta', 'Barra de Puxada'],
  },
  {
    id: 13,
    nome: 'Puxada Fechada',
    descricao:
      'Puxada na polia alta com pegada estreita ou neutra. A amplitude aumenta e o exercício enfatiza a espessura das costas e a participação do bíceps.',
    passos: [
      'Sente com as coxas travadas e prenda o triângulo ou uma barra curta na polia alta.',
      'Segure com as mãos próximas, palmas voltadas uma para a outra.',
      'Puxe até o pegador chegar à parte alta do peito, com o tronco levemente inclinado para trás.',
      'Aproxime as escápulas no fim do movimento e segure a contração por um instante.',
      'Suba controlando, deixando o dorsal alongar por completo.',
    ],
    areas: ['Costas', 'Bíceps'],
    equipamentos: ['Polia Alta', 'Triângulo (Pegador Neutro)'],
  },
  {
    id: 14,
    nome: 'Barra Fixa',
    descricao:
      'Puxada vertical com o peso do próprio corpo. É o exercício mais completo para o dorsal e um dos melhores indicadores de força relativa.',
    passos: [
      'Segure a barra com pegada pronada pouco mais aberta que os ombros e deixe o corpo pendurado.',
      'Antes de puxar, deprima as escápulas — o movimento começa nas costas, não nos braços.',
      'Puxe o corpo até o queixo ultrapassar a barra, levando os cotovelos para baixo.',
      'Desça controlando até estender os braços por completo.',
      'Se ainda não conseguir a repetição completa, use elástico de assistência ou a máquina graviton.',
    ],
    areas: ['Costas', 'Bíceps', 'Antebraço'],
    equipamentos: ['Barra Fixa'],
  },
  {
    id: 15,
    nome: 'Remada Curvada',
    descricao:
      'Remada com barra e tronco inclinado à frente. Constrói espessura de costas e exige forte estabilização da lombar, sendo um dos exercícios básicos de puxada horizontal.',
    passos: [
      'Em pé, pés na largura do quadril, segure a barra com pegada pronada pouco mais aberta que os ombros.',
      'Incline o tronco entre 45 e 70 graus mantendo a coluna neutra e os joelhos levemente flexionados.',
      'Puxe a barra em direção ao umbigo ou à parte baixa do abdômen, com os cotovelos junto ao corpo.',
      'Junte as escápulas no topo e desça controlando até estender os braços.',
      'Não use impulso de tronco: se precisar jogar as costas, a carga está alta demais.',
    ],
    areas: ['Costas', 'Lombar', 'Bíceps'],
    equipamentos: ['Barra Olímpica', 'Anilhas'],
  },
  {
    id: 16,
    nome: 'Remada Baixa',
    descricao:
      'Puxada horizontal sentado na polia baixa. Trabalha a espessura das costas com a coluna apoiada em posição estável, o que reduz a exigência sobre a lombar.',
    passos: [
      'Sente na máquina com os pés apoiados na plataforma e joelhos levemente flexionados.',
      'Segure o triângulo com o tronco ereto e os braços estendidos à frente.',
      'Puxe o pegador em direção ao abdômen, levando os cotovelos para trás junto ao corpo.',
      'Junte as escápulas no fim do movimento, sem inclinar o tronco para trás.',
      'Volte controlando, deixando as escápulas se afastarem sem arredondar a lombar.',
    ],
    areas: ['Costas', 'Bíceps', 'Antebraço'],
    equipamentos: ['Polia Baixa', 'Triângulo (Pegador Neutro)'],
  },
  {
    id: 17,
    nome: 'Remada Unilateral',
    descricao:
      'Remada com halter, um lado por vez, apoiado no banco. O apoio elimina a sobrecarga da lombar e permite corrigir diferenças de força entre os lados.',
    passos: [
      'Apoie um joelho e a mão do mesmo lado no banco, mantendo as costas paralelas ao chão.',
      'Segure o halter com a outra mão, braço estendido e escápula solta.',
      'Puxe o halter em direção ao quadril, com o cotovelo rente ao corpo.',
      'Contraia a escápula no topo e desça controlando até o alongamento completo.',
      'Mantenha o quadril nivelado: girar o tronco para levantar mais peso tira o dorsal do movimento.',
    ],
    areas: ['Costas', 'Bíceps', 'Lombar'],
    equipamentos: ['Halteres', 'Banco Reto'],
  },
  {
    id: 18,
    nome: 'Remada Cavalinho',
    descricao:
      'Remada em máquina com apoio de peito ou barra em T, com pegada neutra. Combina a espessura da remada curvada com menor exigência da lombar.',
    passos: [
      'Posicione-se na máquina com o peito apoiado e os pés firmes na plataforma.',
      'Segure os pegadores com as palmas voltadas uma para a outra e braços estendidos.',
      'Puxe os pegadores em direção às costelas, com os cotovelos junto ao corpo.',
      'Junte as escápulas no fim e volte controlando até a extensão completa.',
      'Mantenha o peito colado no apoio durante toda a série.',
    ],
    areas: ['Costas', 'Bíceps', 'Lombar'],
    equipamentos: ['Máquina de Remada Cavalinho', 'Anilhas'],
  },
  {
    id: 20,
    nome: 'Levantamento Terra',
    descricao:
      'Levantamento da barra do chão até a extensão completa de quadril e joelhos. É o exercício que move mais carga total do treino e recruta praticamente toda a cadeia posterior.',
    passos: [
      'Posicione os pés na largura do quadril, com a barra sobre o meio do pé.',
      'Flexione quadril e joelhos, segure a barra pouco fora das pernas e trave a coluna em posição neutra, peito aberto.',
      'Empurre o chão com as pernas mantendo a barra rente ao corpo, sem arredondar as costas.',
      'Estenda quadril e joelhos ao mesmo tempo até ficar totalmente ereto, sem hiperestender a lombar.',
      'Desça pelo mesmo caminho, levando o quadril para trás primeiro.',
    ],
    areas: ['Costas', 'Lombar', 'Glúteos', 'Posterior de Coxa', 'Quadríceps', 'Antebraço'],
    equipamentos: ['Barra Olímpica', 'Anilhas'],
  },

  // ----- OMBROS -----
  {
    id: 21,
    nome: 'Desenvolvimento com Halteres',
    descricao:
      'Empurrar vertical acima da cabeça com halteres. Trabalha principalmente o deltoide anterior e lateral, com amplitude maior que a versão com barra.',
    passos: [
      'Sente em um banco com encosto quase vertical e apoie as costas.',
      'Leve os halteres à altura dos ombros, palmas voltadas para a frente e cotovelos abaixo dos punhos.',
      'Empurre para cima até quase estender os cotovelos, aproximando levemente os halteres.',
      'Desça controlando até os cotovelos ficarem na linha dos ombros.',
      'Mantenha o abdômen contraído para não arquear a lombar no encosto.',
    ],
    areas: ['Ombros', 'Tríceps', 'Trapézio'],
    equipamentos: ['Halteres', 'Banco Inclinado'],
  },
  {
    id: 22,
    nome: 'Desenvolvimento com Barra',
    descricao:
      'Empurrar vertical com barra, sentado ou em pé. Permite mais carga que a versão com halteres e é o exercício básico de força para os ombros.',
    passos: [
      'Segure a barra com pegada pronada pouco mais aberta que os ombros, na altura das clavículas.',
      'Contraia abdômen e glúteos para estabilizar o tronco.',
      'Empurre a barra acima da cabeça em linha reta, afastando levemente a cabeça na passagem.',
      'Estenda os cotovelos com a barra alinhada sobre o meio do pé e desça controlando.',
      'Prefira a versão à frente: o desenvolvimento por trás da nuca força a rotação externa do ombro.',
    ],
    areas: ['Ombros', 'Tríceps', 'Trapézio'],
    equipamentos: ['Barra Olímpica', 'Banco Inclinado'],
  },
  {
    id: 23,
    nome: 'Elevação Lateral',
    descricao:
      'Abdução do ombro com halteres. É o exercício de isolamento do deltoide lateral, responsável pela largura visual dos ombros.',
    passos: [
      'Em pé, pés na largura do quadril, um halter em cada mão ao lado do corpo.',
      'Mantenha os cotovelos levemente flexionados e fixos nesse ângulo.',
      'Eleve os braços pelos lados até a altura dos ombros, sem passar da linha.',
      'Desça controlando, resistindo à descida, sem deixar os halteres caírem.',
      'Use carga baixa: usar impulso de tronco transfere o trabalho para o trapézio.',
    ],
    areas: ['Ombros', 'Trapézio'],
    equipamentos: ['Halteres'],
  },
  {
    id: 24,
    nome: 'Elevação Frontal',
    descricao:
      'Flexão do ombro à frente do corpo, com halteres, barra ou anilha. Isola o deltoide anterior e a porção clavicular do peitoral.',
    passos: [
      'Em pé, segure os halteres à frente das coxas com as palmas voltadas para o corpo.',
      'Eleve um braço (ou os dois) à frente até a altura dos ombros, cotovelo quase estendido.',
      'Pare na altura dos ombros e desça controlando.',
      'Mantenha o tronco imóvel, sem balançar para gerar impulso.',
      'Se o treino já tem muito desenvolvimento e supino, este exercício costuma ser dispensável.',
    ],
    areas: ['Ombros', 'Peitoral'],
    equipamentos: ['Halteres'],
  },
  {
    id: 25,
    nome: 'Crucifixo Invertido',
    descricao:
      'Abertura dos braços com o tronco inclinado à frente. Isola o deltoide posterior, região quase sempre subtreinada, e ajuda a equilibrar a postura dos ombros.',
    passos: [
      'Sente na ponta do banco e incline o tronco sobre as coxas, ou fique em pé com o tronco a 90 graus.',
      'Segure um halter em cada mão sob o peito, cotovelos levemente flexionados.',
      'Abra os braços pelos lados até a altura dos ombros, liderando o movimento com os cotovelos.',
      'Junte as escápulas no fim e desça controlando.',
      'Use carga leve: com peso alto o trapézio assume o movimento.',
    ],
    areas: ['Ombros', 'Costas', 'Trapézio'],
    equipamentos: ['Halteres', 'Banco Inclinado'],
  },
  {
    id: 26,
    nome: 'Encolhimento',
    descricao:
      'Elevação dos ombros em direção às orelhas, com carga nas mãos. É o exercício direto para a porção superior do trapézio.',
    passos: [
      'Em pé, segure um halter em cada mão (ou uma barra à frente das coxas), braços estendidos.',
      'Mantenha os cotovelos praticamente estendidos durante todo o movimento.',
      'Eleve os ombros o mais alto possível, em linha reta, sem girá-los.',
      'Segure a contração no topo por um instante e desça controlando.',
      'Não role os ombros para trás: o movimento circular não acrescenta nada e estressa a articulação.',
    ],
    areas: ['Trapézio', 'Antebraço'],
    equipamentos: ['Halteres', 'Barra Olímpica'],
  },
  {
    id: 27,
    nome: 'Arnold Press',
    descricao:
      'Desenvolvimento com rotação dos punhos durante a subida. A rotação faz o deltoide anterior e o lateral trabalharem em sequência dentro da mesma repetição.',
    passos: [
      'Sente no banco com encosto e segure os halteres à frente do peito, palmas voltadas para você.',
      'Comece a subir girando os punhos para fora, até as palmas ficarem voltadas para a frente.',
      'Termine a subida com os braços quase estendidos acima da cabeça.',
      'Desça refazendo a rotação no sentido inverso, até voltar com as palmas para o corpo.',
      'Use carga menor que a do desenvolvimento comum: a rotação exige mais controle.',
    ],
    areas: ['Ombros', 'Tríceps', 'Trapézio'],
    equipamentos: ['Halteres', 'Banco Inclinado'],
  },
  {
    id: 28,
    nome: 'Remada Alta',
    descricao:
      'Puxada vertical da barra rente ao corpo até a altura do peito. Trabalha deltoide lateral e trapézio ao mesmo tempo.',
    passos: [
      'Em pé, segure a barra com pegada pronada na largura dos ombros, braços estendidos à frente das coxas.',
      'Puxe a barra para cima rente ao corpo, liderando o movimento com os cotovelos.',
      'Suba até a barra chegar à altura da parte alta do peito, com os cotovelos acima das mãos.',
      'Desça controlando até estender os braços.',
      'Não suba além da linha do peito nem use pegada muito fechada: a combinação comprime o ombro.',
    ],
    areas: ['Ombros', 'Trapézio', 'Bíceps'],
    equipamentos: ['Barra Olímpica', 'Polia Baixa'],
  },

  // ----- BICEPS -----
  {
    id: 29,
    nome: 'Rosca Direta',
    descricao:
      'Flexão de cotovelo com barra, em pé. É o exercício básico de bíceps e permite mais carga que as variações com halteres.',
    passos: [
      'Em pé, pés na largura do quadril, segure a barra com pegada supinada na largura dos ombros.',
      'Mantenha os cotovelos colados ao tronco e o abdômen contraído.',
      'Flexione os cotovelos levando a barra até a altura dos ombros.',
      'Desça controlando até estender os braços por completo.',
      'Se o cotovelo sair para a frente ou o tronco balançar, reduza a carga.',
    ],
    areas: ['Bíceps', 'Antebraço'],
    equipamentos: ['Barra W', 'Anilhas'],
  },
  {
    id: 30,
    nome: 'Rosca Alternada',
    descricao:
      'Rosca com halteres, um braço por vez, com supinação do punho. Permite maior amplitude e concentração em cada lado.',
    passos: [
      'Em pé ou sentado, segure um halter em cada mão com as palmas voltadas para o corpo.',
      'Flexione um cotovelo girando o punho para fora durante a subida, até a palma ficar voltada para cima.',
      'Suba até a altura do ombro e contraia o bíceps.',
      'Desça controlando e desfazendo a rotação, e repita com o outro braço.',
      'Mantenha o cotovelo parado ao lado do tronco: ele não deve avançar durante a subida.',
    ],
    areas: ['Bíceps', 'Antebraço'],
    equipamentos: ['Halteres'],
  },
  {
    id: 31,
    nome: 'Rosca Martelo',
    descricao:
      'Rosca com pegada neutra, palmas voltadas uma para a outra. Enfatiza o braquial e o braquiorradial, aumentando a espessura do braço.',
    passos: [
      'Em pé, segure um halter em cada mão com as palmas voltadas para o corpo.',
      'Mantenha essa pegada fixa durante todo o movimento, sem girar o punho.',
      'Flexione os cotovelos até os halteres chegarem à altura dos ombros.',
      'Desça controlando até a extensão completa.',
      'Pode ser feito alternado ou com os dois braços ao mesmo tempo.',
    ],
    areas: ['Bíceps', 'Antebraço'],
    equipamentos: ['Halteres'],
  },
  {
    id: 32,
    nome: 'Rosca Scott',
    descricao:
      'Rosca com os braços apoiados no banco inclinado. O apoio elimina o impulso e coloca o bíceps em alongamento na posição inicial.',
    passos: [
      'Ajuste o banco Scott de modo que a axila fique apoiada na borda superior do apoio.',
      'Segure a barra W com pegada supinada e braços apoiados no acolchoado.',
      'Flexione os cotovelos até a barra chegar próxima aos ombros.',
      'Desça controlando até quase estender os cotovelos, sem soltar a tensão.',
      'Não estenda de forma brusca no final: a posição alongada com carga é onde ocorrem as lesões.',
    ],
    areas: ['Bíceps', 'Antebraço'],
    equipamentos: ['Banco Scott', 'Barra W'],
  },
  {
    id: 33,
    nome: 'Rosca Concentrada',
    descricao:
      'Rosca com um braço apoiado na face interna da coxa, sentado. É o isolamento mais estrito do bíceps, usado para finalizar o treino de braço.',
    passos: [
      'Sente na ponta do banco com as pernas afastadas e segure um halter com uma das mãos.',
      'Apoie a parte de trás do braço na face interna da coxa do mesmo lado.',
      'Flexione o cotovelo levando o halter até o ombro, sem tirar o braço do apoio.',
      'Contraia o bíceps no topo e desça controlando até estender o braço.',
      'Complete todas as repetições de um lado antes de trocar.',
    ],
    areas: ['Bíceps'],
    equipamentos: ['Halteres', 'Banco Reto'],
  },
  {
    id: 34,
    nome: 'Rosca Inversa',
    descricao:
      'Rosca com pegada pronada, palmas para baixo. Desloca o esforço para o braquiorradial e os extensores do antebraço.',
    passos: [
      'Em pé, segure a barra com pegada pronada na largura dos ombros.',
      'Mantenha os cotovelos junto ao tronco e os punhos firmes, sem deixá-los cair.',
      'Flexione os cotovelos até a barra chegar à altura do peito.',
      'Desça controlando até estender os braços.',
      'A carga será bem menor que na rosca direta — é o esperado nesta pegada.',
    ],
    areas: ['Antebraço', 'Bíceps'],
    equipamentos: ['Barra W', 'Anilhas'],
  },
  {
    id: 35,
    nome: 'Rosca 21',
    descricao:
      'Série de 21 repetições dividida em três amplitudes parciais de sete. Aumenta muito o tempo sob tensão do bíceps e é usada como técnica de intensificação.',
    passos: [
      'Segure a barra com pegada supinada, em pé, cotovelos junto ao tronco.',
      'Faça 7 repetições da posição estendida até a metade do movimento (altura do cotovelo).',
      'Faça 7 repetições da metade até a altura dos ombros.',
      'Faça 7 repetições completas, da extensão até os ombros, sem descanso entre os blocos.',
      'Use carga bem abaixo da rosca direta habitual: são 21 repetições contínuas.',
    ],
    areas: ['Bíceps', 'Antebraço'],
    equipamentos: ['Barra W', 'Anilhas'],
  },
  {
    id: 36,
    nome: 'Rosca no Cabo',
    descricao:
      'Rosca executada na polia baixa. O cabo mantém tensão constante inclusive na posição inicial, onde a barra livre perde carga.',
    passos: [
      'Prenda uma barra na polia baixa e fique em pé de frente para o aparelho.',
      'Segure com pegada supinada, braços estendidos e cotovelos junto ao tronco.',
      'Flexione os cotovelos até a barra chegar à altura dos ombros.',
      'Desça controlando, sem deixar a carga bater no fim do curso.',
      'Fique próximo ao aparelho para o cabo não puxar o cotovelo para trás.',
    ],
    areas: ['Bíceps', 'Antebraço'],
    equipamentos: ['Polia Baixa', 'Barra W'],
  },

  // ----- TRICEPS -----
  {
    id: 37,
    nome: 'Tríceps Pulley',
    descricao:
      'Extensão de cotovelo na polia alta com barra reta. É o exercício mais usado para tríceps por ser seguro, simples e manter tensão constante.',
    passos: [
      'Fique em pé de frente para a polia alta e segure a barra com pegada pronada na largura dos ombros.',
      'Cole os cotovelos ao tronco e incline levemente o corpo à frente.',
      'Estenda os cotovelos empurrando a barra para baixo até os braços ficarem retos.',
      'Contraia o tríceps no fim e volte controlando até os cotovelos formarem 90 graus.',
      'Os cotovelos devem ficar parados: se abrirem para os lados, reduza a carga.',
    ],
    areas: ['Tríceps'],
    equipamentos: ['Polia Alta', 'Barra de Pulley'],
  },
  {
    id: 38,
    nome: 'Tríceps Corda',
    descricao:
      'Extensão na polia alta com corda, permitindo abrir as mãos no fim do movimento. A abertura aumenta a contração da cabeça lateral do tríceps.',
    passos: [
      'Prenda a corda na polia alta e segure as pontas com pegada neutra.',
      'Cole os cotovelos ao tronco, com o corpo levemente inclinado à frente.',
      'Estenda os cotovelos empurrando a corda para baixo.',
      'No fim do movimento, afaste as mãos abrindo a corda e contraia o tríceps.',
      'Volte controlando, juntando as mãos, até os cotovelos formarem 90 graus.',
    ],
    areas: ['Tríceps'],
    equipamentos: ['Polia Alta', 'Corda de Tríceps'],
  },
  {
    id: 39,
    nome: 'Tríceps Francês',
    descricao:
      'Extensão de cotovelo com o braço acima da cabeça. A posição alonga a cabeça longa do tríceps, que fica pouco recrutada nos exercícios de pulley.',
    passos: [
      'Sentado ou em pé, segure um halter com as duas mãos acima da cabeça, braços estendidos.',
      'Mantenha os cotovelos apontados para cima e próximos da cabeça.',
      'Flexione os cotovelos levando o halter para trás da nuca, de forma controlada.',
      'Estenda os cotovelos de volta até os braços ficarem retos, sem travar.',
      'Não deixe os cotovelos abrirem para os lados: isso tira a tensão do tríceps.',
    ],
    areas: ['Tríceps'],
    equipamentos: ['Halteres', 'Banco Reto'],
  },
  {
    id: 40,
    nome: 'Tríceps Testa',
    descricao:
      'Extensão de cotovelo deitado, com a barra descendo até a altura da testa. Combina boa carga com alongamento da cabeça longa do tríceps.',
    passos: [
      'Deite no banco reto segurando a barra W com pegada pronada, braços estendidos sobre o peito.',
      'Incline levemente os braços em direção à cabeça, para manter tensão no tríceps.',
      'Flexione os cotovelos descendo a barra até próximo da testa, mantendo os cotovelos parados.',
      'Estenda os cotovelos de volta à posição inicial.',
      'Se sentir desconforto no cotovelo, troque a barra reta pela W ou reduza a carga.',
    ],
    areas: ['Tríceps'],
    equipamentos: ['Barra W', 'Banco Reto'],
  },
  {
    id: 41,
    nome: 'Tríceps Banco',
    descricao:
      'Extensão de cotovelo com o peso do corpo, mãos apoiadas atrás em um banco. Alternativa sem equipamento de carga, útil para finalizar o treino.',
    passos: [
      'Sente na borda do banco e apoie as mãos ao lado do quadril, dedos voltados para a frente.',
      'Deslize o quadril para fora do banco, sustentando o corpo com os braços.',
      'Desça flexionando os cotovelos até formarem cerca de 90 graus, mantendo-os apontados para trás.',
      'Empurre o banco até estender os braços.',
      'Não desça além dos 90 graus: a posição profunda força a cápsula anterior do ombro.',
    ],
    areas: ['Tríceps', 'Ombros'],
    equipamentos: ['Banco Reto'],
  },
  {
    id: 42,
    nome: 'Mergulho Paralela',
    descricao:
      'Flexão e extensão de cotovelo suspenso em barras paralelas. Trabalha tríceps e peitoral inferior com o peso do próprio corpo e permite muita sobrecarga.',
    passos: [
      'Apoie-se nas paralelas com os braços estendidos e o corpo suspenso.',
      'Para focar o tríceps, mantenha o tronco vertical; para focar o peitoral, incline-o à frente.',
      'Desça flexionando os cotovelos até formarem cerca de 90 graus.',
      'Empurre até estender os braços, sem travar os cotovelos.',
      'Se ainda não sustentar o peso do corpo, use a máquina assistida ou elástico.',
    ],
    areas: ['Tríceps', 'Peitoral', 'Ombros'],
    equipamentos: ['Barras Paralelas'],
  },
  {
    id: 43,
    nome: 'Tríceps Coice',
    descricao:
      'Extensão de cotovelo com o tronco inclinado e o braço paralelo ao corpo. Isolamento de baixa carga, indicado para finalizar o treino com foco na contração.',
    passos: [
      'Apoie um joelho e uma mão no banco, com as costas paralelas ao chão.',
      'Segure o halter com a outra mão e leve o cotovelo para trás, colado ao tronco, formando 90 graus.',
      'Estenda o cotovelo levando o halter para trás, até o braço ficar reto.',
      'Contraia o tríceps no fim e volte controlando aos 90 graus.',
      'O ombro e o cotovelo ficam imóveis: só o antebraço se move.',
    ],
    areas: ['Tríceps'],
    equipamentos: ['Halteres', 'Banco Reto'],
  },

  // ----- PERNAS -----
  {
    id: 44,
    nome: 'Agachamento Livre',
    descricao:
      'Agachamento com barra apoiada nas costas. É o exercício mais completo para membros inferiores e exige estabilização de tronco, quadril e tornozelo.',
    passos: [
      'Apoie a barra sobre o trapézio, retire do suporte e afaste-se dois passos.',
      'Posicione os pés na largura dos ombros, com as pontas levemente para fora.',
      'Desça empurrando o quadril para trás e flexionando os joelhos, mantendo a coluna neutra e o peito aberto.',
      'Desça até as coxas ficarem pelo menos paralelas ao chão, com os joelhos alinhados às pontas dos pés.',
      'Suba empurrando o chão com os pés inteiros, estendendo quadril e joelhos ao mesmo tempo.',
    ],
    areas: ['Quadríceps', 'Glúteos', 'Posterior de Coxa', 'Lombar', 'Abdômen'],
    equipamentos: ['Barra Olímpica', 'Anilhas'],
  },
  {
    id: 45,
    nome: 'Agachamento Smith',
    descricao:
      'Agachamento na barra guiada. A trajetória fixa reduz a exigência de equilíbrio e permite variar a posição dos pés para alterar a ênfase muscular.',
    passos: [
      'Posicione a barra sobre o trapézio e destrave os ganchos do Smith.',
      'Coloque os pés um pouco à frente da linha do corpo, na largura dos ombros.',
      'Desça flexionando quadril e joelhos até as coxas ficarem paralelas ao chão.',
      'Suba empurrando com os pés, sem travar os joelhos no topo.',
      'Pés mais à frente enfatizam glúteo e posterior; mais embaixo, quadríceps.',
    ],
    areas: ['Quadríceps', 'Glúteos', 'Posterior de Coxa'],
    equipamentos: ['Smith Machine', 'Anilhas'],
  },
  {
    id: 46,
    nome: 'Leg Press',
    descricao:
      'Empurrar a plataforma com as pernas em máquina inclinada. Permite alta carga para os membros inferiores com a coluna apoiada e sem exigência de equilíbrio.',
    passos: [
      'Sente na máquina com as costas e o quadril totalmente apoiados no encosto.',
      'Posicione os pés na plataforma na largura dos ombros, na altura média.',
      'Destrave a máquina e desça controlando até os joelhos formarem cerca de 90 graus.',
      'Empurre a plataforma até quase estender os joelhos, sem travá-los.',
      'Não deixe o quadril descolar do encosto na descida: é assim que se lesiona a lombar aqui.',
    ],
    areas: ['Quadríceps', 'Glúteos', 'Posterior de Coxa'],
    equipamentos: ['Leg Press', 'Anilhas'],
  },
  {
    id: 47,
    nome: 'Cadeira Extensora',
    descricao:
      'Extensão de joelho em máquina sentada. É o isolamento direto do quadríceps, muito usado para pré-exaustão ou finalização do treino de perna.',
    passos: [
      'Sente na máquina com as costas apoiadas e ajuste o rolo logo acima dos tornozelos.',
      'Alinhe o eixo da máquina com a articulação do joelho.',
      'Estenda os joelhos até as pernas ficarem retas, contraindo o quadríceps no topo.',
      'Desça controlando até a posição inicial, sem deixar a carga bater.',
      'Evite cargas muito altas com extensão completa e rápida: sobrecarrega a patela.',
    ],
    areas: ['Quadríceps'],
    equipamentos: ['Cadeira Extensora'],
  },
  {
    id: 48,
    nome: 'Cadeira Flexora',
    descricao:
      'Flexão de joelho em máquina sentada. Isola os isquiotibiais na posição em que o quadril está flexionado, complementando a mesa flexora.',
    passos: [
      'Sente na máquina com as costas apoiadas e trave o apoio sobre as coxas.',
      'Ajuste o rolo para ficar logo acima da parte de trás dos tornozelos.',
      'Flexione os joelhos puxando o rolo para baixo e para trás.',
      'Contraia o posterior no fim e volte controlando até quase estender as pernas.',
      'Mantenha o quadril colado no assento durante toda a série.',
    ],
    areas: ['Posterior de Coxa', 'Glúteos'],
    equipamentos: ['Cadeira Flexora'],
  },
  {
    id: 49,
    nome: 'Mesa Flexora',
    descricao:
      'Flexão de joelho deitado de bruços. Trabalha os isquiotibiais com o quadril estendido, posição complementar à da cadeira flexora.',
    passos: [
      'Deite de bruços na mesa com os joelhos logo além da borda do apoio.',
      'Ajuste o rolo para apoiar logo acima da parte de trás dos tornozelos.',
      'Segure os pegadores e flexione os joelhos levando o rolo em direção aos glúteos.',
      'Contraia o posterior no fim e desça controlando até quase estender as pernas.',
      'Não levante o quadril na subida: fazer isso tira a carga do posterior.',
    ],
    areas: ['Posterior de Coxa', 'Glúteos'],
    equipamentos: ['Mesa Flexora'],
  },
  {
    id: 50,
    nome: 'Stiff',
    descricao:
      'Flexão de quadril com as pernas quase estendidas e a barra descendo rente às pernas. Alonga e fortalece os isquiotibiais e os glúteos com ênfase na fase excêntrica.',
    passos: [
      'Em pé, pés na largura do quadril, segure a barra à frente das coxas com pegada pronada.',
      'Mantenha os joelhos levemente flexionados e fixos nesse ângulo.',
      'Empurre o quadril para trás descendo a barra rente às pernas, com a coluna neutra.',
      'Desça até sentir o alongamento do posterior, sem arredondar a lombar.',
      'Suba estendendo o quadril e contraindo os glúteos no topo.',
    ],
    areas: ['Posterior de Coxa', 'Glúteos', 'Lombar'],
    equipamentos: ['Barra Olímpica', 'Anilhas'],
  },
  {
    id: 51,
    nome: 'Levantamento Terra Romeno',
    descricao:
      'Variação do terra que começa em pé e enfatiza a fase excêntrica com flexão de quadril. Difere do stiff pela maior flexão de joelho e do terra convencional por não partir do chão.',
    passos: [
      'Comece em pé segurando a barra à frente das coxas, com os pés na largura do quadril.',
      'Empurre o quadril para trás flexionando levemente mais os joelhos que no stiff.',
      'Desça a barra rente às pernas até a altura do meio da canela, com a coluna neutra.',
      'Suba estendendo o quadril e contraindo os glúteos, sem hiperestender a lombar.',
      'A barra deve encostar de leve nas pernas o tempo todo: afastá-la sobrecarrega a lombar.',
    ],
    areas: ['Posterior de Coxa', 'Glúteos', 'Lombar', 'Costas'],
    equipamentos: ['Barra Olímpica', 'Anilhas'],
  },
  {
    id: 52,
    nome: 'Afundo',
    descricao:
      'Agachamento unilateral com uma perna à frente e outra atrás, sem deslocamento. Trabalha cada perna isoladamente e exige estabilidade de quadril e joelho.',
    passos: [
      'Em pé, dê um passo à frente e mantenha essa posição durante toda a série.',
      'Segure um halter em cada mão ao lado do corpo, tronco ereto.',
      'Desça flexionando os dois joelhos até o de trás quase encostar no chão.',
      'O joelho da frente deve ficar alinhado ao pé, sem ultrapassá-lo demais.',
      'Suba empurrando com o calcanhar da perna da frente e repita antes de trocar de lado.',
    ],
    areas: ['Quadríceps', 'Glúteos', 'Posterior de Coxa'],
    equipamentos: ['Halteres'],
  },
  {
    id: 53,
    nome: 'Passada',
    descricao:
      'Afundo com deslocamento: a cada repetição a perna de trás avança. Além da força, exige controle dinâmico do equilíbrio, o que aumenta o gasto energético.',
    passos: [
      'Em pé, segure um halter em cada mão ao lado do corpo.',
      'Dê um passo à frente e desça flexionando os dois joelhos até o de trás quase encostar no chão.',
      'Empurre com o calcanhar da perna da frente e traga a perna de trás à frente, dando o próximo passo.',
      'Mantenha o tronco ereto e o olhar à frente durante todo o percurso.',
      'Precisa de espaço livre: sem corredor, prefira o afundo estacionário.',
    ],
    areas: ['Quadríceps', 'Glúteos', 'Posterior de Coxa'],
    equipamentos: ['Halteres'],
  },
  {
    id: 54,
    nome: 'Hack Squat',
    descricao:
      'Agachamento em máquina com apoio de costas inclinado. A trajetória guiada permite carga alta com ênfase no quadríceps e baixa exigência da lombar.',
    passos: [
      'Posicione-se na máquina com as costas e os ombros apoiados nos acolchoados.',
      'Coloque os pés na plataforma na largura dos ombros, ligeiramente à frente.',
      'Destrave a máquina e desça flexionando os joelhos até as coxas ficarem paralelas.',
      'Suba empurrando com os pés inteiros, sem travar os joelhos no topo.',
      'Manter as costas coladas no apoio é o que protege a lombar aqui.',
    ],
    areas: ['Quadríceps', 'Glúteos'],
    equipamentos: ['Hack Machine', 'Anilhas'],
  },
  {
    id: 56,
    nome: 'Agachamento Búlgaro',
    descricao:
      'Agachamento unilateral com o pé de trás elevado em um banco. Concentra quase toda a carga na perna da frente e é um dos exercícios mais eficientes para glúteo.',
    passos: [
      'Fique de costas para o banco e apoie o peito do pé de trás sobre ele.',
      'Dê um passo à frente com a outra perna, mantendo o tronco ereto.',
      'Desça flexionando o joelho da frente até a coxa ficar próxima da paralela.',
      'Suba empurrando com o calcanhar da perna da frente.',
      'Complete todas as repetições de um lado antes de trocar.',
    ],
    areas: ['Quadríceps', 'Glúteos', 'Posterior de Coxa'],
    equipamentos: ['Halteres', 'Banco Reto'],
  },
  {
    id: 57,
    nome: 'Glúteo no Cabo',
    descricao:
      'Extensão de quadril na polia baixa, com caneleira. Isola o glúteo máximo com tensão constante e amplitude controlada.',
    passos: [
      'Prenda a caneleira no tornozelo e conecte-a à polia baixa.',
      'Fique de frente para o aparelho, segurando a estrutura para se apoiar.',
      'Estenda o quadril levando a perna para trás, mantendo o joelho quase estendido.',
      'Contraia o glúteo no fim do movimento, sem arquear a lombar para ganhar amplitude.',
      'Volte controlando até a posição inicial e complete a série antes de trocar de perna.',
    ],
    areas: ['Glúteos', 'Posterior de Coxa'],
    equipamentos: ['Polia Baixa', 'Caneleira'],
  },
  {
    id: 58,
    nome: 'Elevação Pélvica',
    descricao:
      'Extensão de quadril com as costas apoiadas em um banco e barra sobre a pelve. É o exercício com maior ativação de glúteo máximo entre os movimentos de quadril.',
    passos: [
      'Sente no chão com as costas apoiadas na lateral do banco, na altura das escápulas.',
      'Posicione a barra sobre a pelve, protegida por uma almofada, e apoie os pés no chão na largura do quadril.',
      'Estenda o quadril elevando a barra até o tronco ficar paralelo ao chão.',
      'Contraia os glúteos no topo por um instante, com o queixo levemente para baixo.',
      'Desça controlando até quase encostar o quadril no chão.',
    ],
    areas: ['Glúteos', 'Posterior de Coxa'],
    equipamentos: ['Banco Reto', 'Barra Olímpica'],
  },
  {
    id: 59,
    nome: 'Panturrilha em Pé',
    descricao:
      'Flexão plantar em pé, com o joelho estendido. Nessa posição o gastrocnêmio é o principal músculo recrutado.',
    passos: [
      'Posicione-se na máquina com os ombros sob os apoios e a ponta dos pés na plataforma.',
      'Deixe os calcanhares livres para descer além da borda.',
      'Desça os calcanhares até sentir o alongamento da panturrilha.',
      'Suba na ponta dos pés o máximo possível, contraindo no topo.',
      'Faça o movimento devagar: panturrilha responde à amplitude completa, não ao impulso.',
    ],
    areas: ['Panturrilha'],
    equipamentos: ['Máquina de Panturrilha em Pé'],
  },
  {
    id: 60,
    nome: 'Panturrilha Sentado',
    descricao:
      'Flexão plantar sentado, com o joelho flexionado. A flexão do joelho tira o gastrocnêmio de ação e concentra o trabalho no sóleo.',
    passos: [
      'Sente na máquina e posicione os apoios sobre as coxas, próximo aos joelhos.',
      'Apoie a ponta dos pés na plataforma, com os calcanhares livres.',
      'Desça os calcanhares até o alongamento máximo.',
      'Suba empurrando com a ponta dos pés e contraia no topo.',
      'Complementa a panturrilha em pé: as duas versões treinam músculos diferentes.',
    ],
    areas: ['Panturrilha'],
    equipamentos: ['Máquina de Panturrilha Sentado'],
  },
  {
    id: 61,
    nome: 'Panturrilha no Leg Press',
    descricao:
      'Flexão plantar executada no leg press, empurrando a plataforma apenas com a ponta dos pés. Permite carga alta sem compressão da coluna.',
    passos: [
      'Sente no leg press e apoie apenas a ponta dos pés na borda inferior da plataforma.',
      'Estenda os joelhos quase por completo e mantenha-os fixos nesse ângulo.',
      'Empurre a plataforma com a ponta dos pés, contraindo a panturrilha.',
      'Volte controlando até sentir o alongamento, sem flexionar os joelhos.',
      'Confirme que a trava de segurança está acionada antes de começar.',
    ],
    areas: ['Panturrilha'],
    equipamentos: ['Leg Press', 'Anilhas'],
  },

  // ----- ABDOMEN -----
  {
    id: 63,
    nome: 'Abdominal Supra',
    descricao:
      'Flexão de tronco a partir do solo, com amplitude curta. Trabalha a porção superior do reto abdominal.',
    passos: [
      'Deite de costas no colchonete com os joelhos flexionados e os pés apoiados no chão.',
      'Coloque as mãos ao lado da cabeça ou cruzadas no peito, sem puxar o pescoço.',
      'Eleve o tronco enrolando a coluna, tirando as escápulas do chão.',
      'Contraia o abdômen no topo e desça controlando até quase encostar.',
      'Não precisa subir muito: acima de 30 graus o trabalho passa para o flexor de quadril.',
    ],
    areas: ['Abdômen'],
    equipamentos: ['Colchonete'],
  },
  {
    id: 64,
    nome: 'Abdominal Infra',
    descricao:
      'Elevação da pelve a partir do solo, com as pernas. Enfatiza a porção inferior do reto abdominal, região que a flexão de tronco recruta menos.',
    passos: [
      'Deite de costas com as mãos ao lado do corpo ou sob os glúteos.',
      'Eleve as pernas até formarem 90 graus com o tronco, joelhos levemente flexionados.',
      'Eleve a pelve do chão empurrando as pernas para cima, sem impulso.',
      'Desça controlando até a pelve encostar, mantendo as pernas paradas.',
      'Se a lombar descolar do chão, reduza a amplitude das pernas.',
    ],
    areas: ['Abdômen'],
    equipamentos: ['Colchonete'],
  },
  {
    id: 65,
    nome: 'Abdominal Oblíquo',
    descricao:
      'Flexão de tronco com rotação. Recruta os oblíquos interno e externo, responsáveis pela rotação e pela inclinação lateral do tronco.',
    passos: [
      'Deite de costas com os joelhos flexionados e os pés no chão.',
      'Coloque uma mão ao lado da cabeça e a outra estendida ao lado do corpo.',
      'Eleve o tronco levando o cotovelo em direção ao joelho do lado oposto.',
      'Contraia no fim e desça controlando.',
      'Alterne os lados ou complete a série de um lado antes de trocar.',
    ],
    areas: ['Abdômen'],
    equipamentos: ['Colchonete'],
  },
  {
    id: 66,
    nome: 'Prancha',
    descricao:
      'Exercício isométrico de sustentação do corpo apoiado nos antebraços e pontas dos pés. Treina o core na função real dele: impedir o movimento da coluna.',
    passos: [
      'Apoie os antebraços no chão com os cotovelos alinhados abaixo dos ombros.',
      'Estenda as pernas apoiando as pontas dos pés, corpo alinhado da cabeça aos calcanhares.',
      'Contraia abdômen e glúteos para não deixar o quadril cair nem subir.',
      'Mantenha a posição respirando normalmente pelo tempo determinado.',
      'Encerre a série quando o quadril começar a ceder: tempo com forma ruim não conta.',
    ],
    areas: ['Abdômen', 'Lombar', 'Ombros'],
    equipamentos: ['Colchonete'],
  },
  {
    id: 67,
    nome: 'Elevação de Pernas',
    descricao:
      'Elevação das pernas com o corpo suspenso na barra ou deitado no solo. Trabalha a porção inferior do abdômen com grande amplitude.',
    passos: [
      'Fique suspenso na barra fixa com os braços estendidos, ou deite no colchonete com as mãos sob os glúteos.',
      'Contraia o abdômen antes de iniciar o movimento, estabilizando o corpo.',
      'Eleve as pernas até formarem 90 graus com o tronco, joelhos estendidos ou levemente flexionados.',
      'Desça controlando, sem balançar o corpo.',
      'Se não conseguir com as pernas retas, comece flexionando os joelhos.',
    ],
    areas: ['Abdômen'],
    equipamentos: ['Barra Fixa', 'Colchonete'],
  },
  {
    id: 68,
    nome: 'Abdominal na Máquina',
    descricao:
      'Flexão de tronco em máquina com carga ajustável. Permite progressão de carga no abdômen, o que os exercícios de peso corporal não oferecem.',
    passos: [
      'Sente na máquina e ajuste o apoio na altura do peito ou dos ombros.',
      'Segure os pegadores e mantenha os pés apoiados.',
      'Flexione o tronco à frente enrolando a coluna, com a força saindo do abdômen.',
      'Contraia no fim e volte controlando até quase a posição inicial.',
      'Não puxe com os braços: eles apenas acompanham o movimento.',
    ],
    areas: ['Abdômen'],
    equipamentos: ['Máquina Abdominal'],
  },
  {
    id: 70,
    nome: 'Bicicleta no Solo',
    descricao:
      'Movimento alternado de pernas e tronco simulando uma pedalada, no solo. Combina flexão e rotação, trabalhando reto abdominal e oblíquos de forma contínua.',
    passos: [
      'Deite de costas com as mãos ao lado da cabeça e as pernas elevadas, joelhos a 90 graus.',
      'Eleve as escápulas do chão contraindo o abdômen.',
      'Leve o cotovelo direito em direção ao joelho esquerdo, estendendo a perna direita.',
      'Alterne os lados em movimento contínuo e controlado.',
      'Não puxe o pescoço com as mãos: elas só apoiam a cabeça.',
    ],
    areas: ['Abdômen'],
    equipamentos: ['Colchonete'],
  },

  // ----- CARDIO E FUNCIONAL -----
  {
    id: 71,
    nome: 'Esteira',
    descricao:
      'Caminhada ou corrida em esteira ergométrica. Permite controlar velocidade e inclinação com precisão, o que torna simples prescrever e repetir a intensidade.',
    passos: [
      'Prenda a trava de segurança na roupa antes de ligar o aparelho.',
      'Comece com 3 a 5 minutos de caminhada leve para aquecer.',
      'Ajuste velocidade e inclinação conforme o objetivo do treino.',
      'Mantenha o tronco ereto e o olhar à frente, sem se apoiar no corrimão.',
      'Encerre com 3 a 5 minutos em ritmo leve para desaquecer.',
    ],
    areas: ['Cardiorrespiratório', 'Quadríceps', 'Panturrilha'],
    equipamentos: ['Esteira Ergométrica'],
  },
  {
    id: 72,
    nome: 'Bicicleta Ergométrica',
    descricao:
      'Pedalada em bicicleta estacionária. É a opção de cardio com menor impacto nas articulações, indicada para reabilitação e para dias de alto volume de perna.',
    passos: [
      'Ajuste o selim na altura do quadril: com o pedal embaixo, o joelho deve ficar quase estendido.',
      'Comece pedalando com carga leve por 3 a 5 minutos para aquecer.',
      'Ajuste a resistência conforme o objetivo, mantendo cadência constante.',
      'Mantenha o tronco estável e evite balançar o quadril sobre o selim.',
      'Reduza a carga nos minutos finais para desaquecer.',
    ],
    areas: ['Cardiorrespiratório', 'Quadríceps'],
    equipamentos: ['Bicicleta Ergométrica'],
  },
  {
    id: 73,
    nome: 'Elíptico',
    descricao:
      'Movimento contínuo de pernas e braços em trajetória elíptica, sem impacto. Envolve mais massa muscular que a bicicleta e poupa as articulações em relação à corrida.',
    passos: [
      'Suba no aparelho apoiando os pés inteiros nos pedais e segure os apoios móveis.',
      'Comece com resistência leve por 3 a 5 minutos para aquecer.',
      'Mantenha o tronco ereto e empurre e puxe os apoios acompanhando as pernas.',
      'Ajuste resistência e cadência conforme o objetivo do treino.',
      'Reduza a resistência nos minutos finais para desaquecer.',
    ],
    areas: ['Cardiorrespiratório', 'Corpo Inteiro'],
    equipamentos: ['Elíptico'],
  },
  {
    id: 74,
    nome: 'Escada',
    descricao:
      'Subida contínua no simulador de escada. O gasto energético é alto e o padrão de subida recruta glúteo e quadríceps mais que a esteira plana.',
    passos: [
      'Suba no aparelho e apoie levemente as mãos no corrimão apenas para equilíbrio.',
      'Comece em ritmo lento por 2 a 3 minutos para aquecer.',
      'Suba pisando com o pé inteiro em cada degrau, mantendo o tronco ereto.',
      'Ajuste a velocidade conforme o objetivo, sem se pendurar no corrimão.',
      'Reduza o ritmo nos minutos finais para desaquecer.',
    ],
    areas: ['Cardiorrespiratório', 'Glúteos', 'Quadríceps'],
    equipamentos: ['Simulador de Escada'],
  },
  {
    id: 75,
    nome: 'Pular Corda',
    descricao:
      'Saltos contínuos sobre a corda. Trabalha condicionamento, coordenação e resistência de panturrilha com equipamento mínimo.',
    passos: [
      'Ajuste o tamanho da corda: pisando no meio dela, as alças devem chegar às axilas.',
      'Fique em pé com os cotovelos junto ao corpo, girando a corda com os punhos.',
      'Salte apenas o suficiente para a corda passar, caindo na ponta dos pés.',
      'Mantenha o ritmo constante e o tronco ereto.',
      'Comece com séries curtas de 30 a 60 segundos até dominar o ritmo.',
    ],
    areas: ['Cardiorrespiratório', 'Panturrilha'],
    equipamentos: ['Corda de Pular'],
  },
  {
    id: 77,
    nome: 'HIIT',
    descricao:
      'Protocolo de treino intervalado de alta intensidade, e não um exercício específico. Alterna blocos curtos em intensidade máxima com períodos de recuperação, e pode ser aplicado a esteira, bike, corda ou exercícios de peso corporal.',
    passos: [
      'Escolha o exercício base (esteira, bike, corda, burpee) e aqueça de 5 a 10 minutos.',
      'Execute um bloco em intensidade máxima, geralmente de 20 a 40 segundos.',
      'Recupere em intensidade baixa por um período de uma a três vezes o tempo do bloco intenso.',
      'Repita de 6 a 12 ciclos conforme o condicionamento.',
      'Encerre com 5 minutos de desaquecimento; 2 a 3 sessões por semana já bastam.',
    ],
    areas: ['Cardiorrespiratório', 'Corpo Inteiro'],
    equipamentos: ['Esteira Ergométrica', 'Cronômetro'],
  },
  {
    id: 78,
    nome: 'Remo Indoor',
    descricao:
      'Remada completa no ergômetro, coordenando pernas, tronco e braços. É um dos poucos exercícios de cardio que treina a musculatura de puxada.',
    passos: [
      'Prenda os pés nas alças e segure o pegador com os braços estendidos, joelhos flexionados.',
      'Inicie empurrando com as pernas, mantendo os braços estendidos e o tronco firme.',
      'Quando as pernas estiverem quase estendidas, incline o tronco para trás e puxe o pegador ao abdômen.',
      'Volte na ordem inversa: estenda os braços, incline o tronco à frente e flexione os joelhos.',
      'A sequência é pernas, tronco, braços na puxada e o contrário na volta.',
    ],
    areas: ['Cardiorrespiratório', 'Costas', 'Corpo Inteiro'],
    equipamentos: ['Remo Ergômetro'],
  },
  {
    id: 79,
    nome: 'Burpee',
    descricao:
      'Combinação de agachamento, prancha, flexão e salto em uma repetição contínua. Um dos exercícios de peso corporal com maior demanda cardiorrespiratória.',
    passos: [
      'Em pé, agache e apoie as mãos no chão à frente dos pés.',
      'Jogue as pernas para trás chegando à posição de prancha e faça uma flexão.',
      'Traga os pés de volta para junto das mãos em um salto.',
      'Levante e salte com os braços estendidos acima da cabeça.',
      'Para reduzir a intensidade, retire a flexão e o salto final.',
    ],
    areas: ['Corpo Inteiro', 'Cardiorrespiratório'],
    equipamentos: ['Colchonete'],
  },
  {
    id: 80,
    nome: 'Kettlebell Swing',
    descricao:
      'Balanço do kettlebell gerado pela extensão explosiva do quadril. Treina potência da cadeia posterior e condicionamento ao mesmo tempo.',
    passos: [
      'Em pé, pés um pouco além da largura dos ombros, com o kettlebell no chão à frente.',
      'Empurre o quadril para trás, segure a alça com as duas mãos e mantenha a coluna neutra.',
      'Balance o kettlebell entre as pernas e estenda o quadril de forma explosiva.',
      'Deixe o impulso levar o kettlebell até a altura do peito, sem elevá-lo com os braços.',
      'O movimento é de quadril, não de agachamento nem de ombro.',
    ],
    areas: ['Glúteos', 'Posterior de Coxa', 'Lombar', 'Ombros'],
    equipamentos: ['Kettlebell'],
  },
  {
    id: 81,
    nome: 'Battle Rope',
    descricao:
      'Ondas contínuas com cordas navais. Trabalha resistência de ombros e core com alta demanda metabólica e sem impacto articular.',
    passos: [
      'Segure uma ponta da corda em cada mão, com os pés na largura dos ombros.',
      'Flexione levemente joelhos e quadril, mantendo o tronco firme e o abdômen contraído.',
      'Gere ondas alternando os braços para cima e para baixo em ritmo rápido.',
      'Mantenha o ritmo pelo tempo determinado, geralmente de 20 a 40 segundos.',
      'Pode variar com ondas simultâneas, circulares ou com movimento lateral.',
    ],
    areas: ['Ombros', 'Corpo Inteiro', 'Cardiorrespiratório'],
    equipamentos: ['Battle Rope'],
  },
  {
    id: 82,
    nome: 'Box Jump',
    descricao:
      'Salto vertical sobre uma caixa. Exercício pliométrico que treina potência de membros inferiores e taxa de produção de força.',
    passos: [
      'Fique em pé a cerca de meio passo da caixa, pés na largura do quadril.',
      'Flexione levemente joelhos e quadril e balance os braços para trás.',
      'Salte projetando os braços à frente e aterrisse sobre a caixa com os dois pés e joelhos flexionados.',
      'Estenda o quadril em cima da caixa e desça caminhando, não saltando.',
      'Comece com caixa baixa: a lesão típica aqui é raspar a canela na borda.',
    ],
    areas: ['Quadríceps', 'Glúteos', 'Panturrilha'],
    equipamentos: ['Caixa Pliométrica'],
  },
  {
    id: 83,
    nome: 'Farmer Walk',
    descricao:
      'Caminhada carregando peso em cada mão. Treina preensão, trapézio e estabilidade de tronco, com transferência direta para tarefas do dia a dia.',
    passos: [
      'Posicione um halter ou kettlebell de cada lado do corpo e agache para pegá-los com a coluna neutra.',
      'Levante estendendo quadril e joelhos, com os ombros para trás e o peito aberto.',
      'Caminhe em linha reta com passos curtos e controlados, tronco ereto.',
      'Percorra a distância ou o tempo determinado sem deixar os ombros caírem à frente.',
      'Desça os pesos agachando, nunca soltando de qualquer jeito.',
    ],
    areas: ['Antebraço', 'Trapézio', 'Corpo Inteiro'],
    equipamentos: ['Halteres', 'Kettlebell'],
  },
  {
    id: 84,
    nome: 'Agachamento com Salto',
    descricao:
      'Agachamento com peso corporal terminado em salto vertical. Adiciona componente pliométrico ao agachamento, treinando potência de perna.',
    passos: [
      'Em pé, pés na largura dos ombros, mãos à frente do peito ou ao lado do corpo.',
      'Desça em agachamento até as coxas ficarem próximas da paralela.',
      'Suba de forma explosiva, saltando o mais alto possível.',
      'Aterrisse com os pés inteiros e os joelhos flexionados, absorvendo o impacto.',
      'Encadeie na descida da aterrissagem para a próxima repetição, sem pausa longa.',
    ],
    areas: ['Quadríceps', 'Glúteos', 'Panturrilha', 'Cardiorrespiratório'],
    equipamentos: ['Colchonete'],
  },
  {
    id: 85,
    nome: 'Medicine Ball Slam',
    descricao:
      'Arremesso da bola contra o chão com força máxima. Treina potência de tronco e coordenação entre cadeia anterior e posterior.',
    passos: [
      'Em pé, pés na largura dos ombros, segurando a medicine ball com as duas mãos.',
      'Eleve a bola acima da cabeça estendendo o corpo por completo.',
      'Arremesse a bola contra o chão à frente dos pés, flexionando tronco e quadril com força.',
      'Agache para pegar a bola de volta, mantendo a coluna neutra.',
      'Use bola própria para slam, que não quica de volta na direção do rosto.',
    ],
    areas: ['Corpo Inteiro', 'Abdômen', 'Ombros'],
    equipamentos: ['Medicine Ball'],
  },
  {
    id: 86,
    nome: 'Flexão Explosiva',
    descricao:
      'Flexão de braço em que a subida termina com o corpo saindo do chão. Versão pliométrica do movimento, treina potência de empurrar.',
    passos: [
      'Assuma a posição de flexão com as mãos pouco mais abertas que os ombros.',
      'Desça controlando até o peito ficar próximo do chão.',
      'Empurre o chão com força máxima até as mãos se descolarem.',
      'Aterrisse com os cotovelos levemente flexionados, absorvendo o impacto.',
      'Só progrida para esta versão depois de fazer a flexão comum com boa técnica.',
    ],
    areas: ['Peitoral', 'Tríceps', 'Ombros', 'Corpo Inteiro'],
    equipamentos: ['Colchonete'],
  },
];
