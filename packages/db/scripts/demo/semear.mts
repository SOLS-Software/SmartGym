// Gera dados de demonstracao para os paineis (aba Dashboards e Relatorios).
//
//   pnpm --filter @solsfit/db exec tsx scripts/demo/semear.mts            (previa)
//   pnpm --filter @solsfit/db exec tsx scripts/demo/semear.mts --confirmar (grava)
//
// Sem `--confirmar` o script so imprime o que faria. Escrever milhares de
// linhas num banco compartilhado por engano de tecla e barato demais.
//
// O QUE E SIMULADO, E POR QUE NAO E UNIFORME
//
// Distribuicao uniforme produz painel bonito e inutil: todo horario com o mesmo
// movimento, todo motivo de cancelamento com a mesma fatia, toda parcela paga
// no dia. Nada aparece porque nada se destaca. Aqui cada dimensao tem a forma
// aproximada do que uma academia real produz — pico de manha e de fim de tarde,
// evasao concentrada nos primeiros meses, inadimplencia com cauda. E o que
// permite olhar um painel e dizer se ele comunica.
//
// LIMITE HONESTO: e uma imitacao plausivel, nao a realidade. Serve para validar
// legibilidade, desempenho e casos de borda dos indicadores. Nao serve para
// concluir nada sobre o negocio.

import {
  MARCA,
  ID_CLIENTE,
  prisma,
  criarRng,
  inteiro,
  escolher,
  escolherComPeso,
  chance,
  somarDias,
  somarMeses,
  inicioDoDia,
  inserirEmLotes,
  bancoAlvo,
  contarMarcados,
  contarTudo,
  type Rng,
} from './comum.mts';

const GRAVAR = process.argv.includes('--confirmar');
const SEMENTE = 20260827;

// --- Escala -----------------------------------------------------------------
const QT_ALUNOS = 240;
const MESES_DE_HISTORICO = 18;
const SEMANAS_DE_CHECKIN = 26;
const QT_LEADS = 200;

// --- Vocabulario ------------------------------------------------------------
const NOMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'Joao', 'Karina', 'Lucas', 'Mariana', 'Nathan', 'Olivia', 'Pedro',
  'Queila', 'Rafael', 'Sofia', 'Thiago', 'Ursula', 'Vinicius', 'Wesley', 'Yara',
  'Amanda', 'Caio', 'Diego', 'Elisa', 'Fernanda', 'Gustavo', 'Helena', 'Igor',
];
const SOBRENOMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
  'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho',
  'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
];

// Lookups conferidos no banco (ver README).
const STATUS_PENDENTE = 1;
const STATUS_PAGO = 2;
const TIPO_CHECKIN = [
  [1, 70], // Catraca
  [3, 22], // Aplicativo
  [2, 8], // Manual
] as const;
const FORMAS = [
  [1, 55], // Pix
  [4, 25], // Cartao de Credito
  [3, 12], // Cartao de Debito
  [2, 8], // Dinheiro
] as const;
// Motivos com peso: preco lidera em academia de bairro, e a cauda importa
// porque e nela que aparece o problema que da para consertar.
const MOTIVOS = [
  [1, 30], // Preco / financeiro
  [3, 24], // Falta de tempo
  [2, 12], // Mudou de cidade
  [7, 10], // Foi para outra academia
  [6, 9], // Problema de saude / lesao
  [4, 6], // Insatisfacao com a estrutura
  [8, 5], // Alcancou o objetivo
  [5, 3], // Insatisfacao com o atendimento
  [9, 1], // Outro
] as const;

/** Hora do check-in: dois picos (antes e depois do trabalho) e um vale ao meio-dia. */
const HORAS = [
  [6, 60], [7, 95], [8, 70], [9, 45], [10, 30], [11, 28], [12, 40], [13, 30],
  [14, 25], [15, 28], [16, 42], [17, 78], [18, 120], [19, 110], [20, 70], [21, 32],
] as const;

/** Dia da semana (0=dom): segunda enche, domingo esvazia. */
const DIAS = [[0, 8], [1, 100], [2, 92], [3, 96], [4, 88], [5, 78], [6, 40]] as const;

/** Mes de admissao: janeiro e a virada do ano, setembro e a "segunda janela". */
const SAZONALIDADE = [
  [0, 190], [1, 140], [2, 110], [3, 95], [4, 90], [5, 80],
  [6, 85], [7, 95], [8, 130], [9, 105], [10, 85], [11, 60],
] as const;

type PlanoDemo = { id: number; valor: number; nome: string; peso: number };
const PLANOS: PlanoDemo[] = [
  { id: 3, valor: 89.9, nome: 'Mensal Basico', peso: 34 },
  { id: 4, valor: 129.9, nome: 'Mensal Intermediario', peso: 26 },
  { id: 5, valor: 169.9, nome: 'Mensal Completo', peso: 22 },
  { id: 6, valor: 149.9, nome: 'Anual Completo', peso: 18 },
];

const ATIVIDADES_DEMO = [
  { nome: `${MARCA} Spinning`, capacidade: 22, horarios: [7, 19] },
  { nome: `${MARCA} Funcional`, capacidade: 16, horarios: [6, 18] },
  { nome: `${MARCA} Yoga`, capacidade: 12, horarios: [8, 20] },
];

type PerfilAluno = {
  indice: number;
  nome: string;
  email: string;
  idEmpresa: number;
  plano: PlanoDemo;
  admissao: Date;
  encerramento: Date | null;
  idMotivo: number | null;
  /** Visitas por semana enquanto ativo. Zero = matriculou e nunca veio. */
  frequencia: number;
  diaPagamento: number;
};

/**
 * Sorteia a data de admissao respeitando a sazonalidade do mes.
 * Sem isso, "novos alunos por mes" vira uma linha reta e o grafico nao ensina
 * a ler nada.
 */
function sortearAdmissao(rng: Rng, hoje: Date): Date {
  const mesesAtras = inteiro(rng, 0, MESES_DE_HISTORICO - 1);
  const base = somarMeses(new Date(hoje.getFullYear(), hoje.getMonth(), 1), -mesesAtras);
  const pesoDoMes = SAZONALIDADE.find(([mes]) => mes === base.getMonth())?.[1] ?? 100;
  // Rejeicao simples: meses fracos entram menos vezes na amostra final.
  if (!chance(rng, pesoDoMes / 190)) return sortearAdmissao(rng, hoje);
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return new Date(base.getFullYear(), base.getMonth(), inteiro(rng, 1, ultimoDia), 10, 0, 0);
}

/**
 * Quanto tempo o aluno fica antes de cancelar, em meses.
 *
 * Concentrado no comeco de proposito: em academia a evasao e mais pesada nos
 * primeiros 90 dias, e e exatamente isso que a coorte precisa mostrar para ter
 * serventia. Uma curva plana faria a tabela parecer saudavel em qualquer safra.
 */
function sortearDuracao(rng: Rng): number {
  return escolherComPeso(rng, [
    [1, 16], [2, 14], [3, 13], [4, 10], [5, 9], [6, 8],
    [7, 6], [8, 5], [9, 5], [10, 4], [11, 4], [12, 3], [14, 2], [16, 1],
  ]);
}

function gerarPerfis(rng: Rng, hoje: Date, empresas: number[]): PerfilAluno[] {
  const perfis: PerfilAluno[] = [];

  for (let i = 0; i < QT_ALUNOS; i += 1) {
    const admissao = sortearAdmissao(rng, hoje);
    const plano = escolherComPeso(rng, PLANOS.map((p) => [p, p.peso] as const));

    // ~34% ja sairam. A duracao sorteada so vira cancelamento se couber no
    // passado — quem "cancelaria" no mes 8 mas entrou ha 3 meses ainda esta la.
    const duracao = sortearDuracao(rng);
    const dataSaida = somarMeses(admissao, duracao);
    const saiu = chance(rng, 0.34) && dataSaida < hoje;

    // Frequencia: alguns nunca aparecem (matricula que nunca comecou), a maioria
    // fica entre 1 e 3 vezes por semana.
    const frequencia = escolherComPeso(rng, [
      [0, 7], [1, 18], [2, 30], [3, 24], [4, 14], [5, 7],
    ]);

    perfis.push({
      indice: i,
      nome: `${MARCA} ${escolher(rng, NOMES)} ${escolher(rng, SOBRENOMES)}`,
      email: `demo.${`${i}`.padStart(4, '0')}@exemplo.invalid`,
      idEmpresa: escolher(rng, empresas),
      plano,
      admissao,
      encerramento: saiu ? dataSaida : null,
      idMotivo: saiu ? escolherComPeso(rng, MOTIVOS) : null,
      frequencia,
      diaPagamento: escolherComPeso(rng, [[5, 30], [10, 30], [15, 20], [20, 12], [25, 8]]),
    });
  }

  return perfis;
}

async function main() {
  const hoje = new Date();
  const rng = criarRng(SEMENTE);

  console.log(`Banco alvo : ${bancoAlvo()}`);
  console.log(`Cliente    : ${ID_CLIENTE}`);
  console.log(`Marca      : ${MARCA}`);
  console.log(`Modo       : ${GRAVAR ? 'GRAVANDO' : 'previa (use --confirmar para gravar)'}\n`);

  const cliente = await prisma.cliente.findUnique({ where: { id: ID_CLIENTE } });
  if (!cliente) throw new Error(`Cliente ${ID_CLIENTE} nao existe.`);

  const empresasDoCliente = await prisma.empresa.findMany({
    where: { idCliente: ID_CLIENTE, boInativo: false },
    select: { id: true, dsEmpresa: true },
    orderBy: { id: 'asc' },
  });
  if (empresasDoCliente.length === 0) throw new Error('Cliente sem filial ativa.');
  // As duas primeiras: semear em seis filiais espalharia o movimento a ponto de
  // nenhum mapa de calor ter densidade suficiente para mostrar pico.
  const empresas = empresasDoCliente.slice(0, 2).map((e) => e.id);
  console.log(`Filiais    : ${empresas.join(', ')}\n`);

  const jaExiste = await contarMarcados();
  if (jaExiste.alunos > 0) {
    console.log(
      `Ja existem ${jaExiste.alunos} alunos ${MARCA} no banco.\n` +
        `Rode scripts/demo/limpar.mts --confirmar antes de semear de novo.`,
    );
    return;
  }

  const perfis = gerarPerfis(rng, hoje, empresas);

  // ---- Contagem previa (a previa precisa dizer o tamanho do estrago) --------
  const limiteCheckIn = somarDias(inicioDoDia(hoje), -SEMANAS_DE_CHECKIN * 7);
  let previsaoCheckIns = 0;
  for (const perfil of perfis) {
    const inicio = perfil.admissao > limiteCheckIn ? perfil.admissao : limiteCheckIn;
    const fim = perfil.encerramento && perfil.encerramento < hoje ? perfil.encerramento : hoje;
    const semanas = Math.max(0, (fim.getTime() - inicio.getTime()) / (7 * 86_400_000));
    previsaoCheckIns += Math.round(semanas * perfil.frequencia);
  }

  console.log('A criar (aproximado):');
  console.log(`  alunos            ${perfis.length}`);
  console.log(`  matriculas        ${perfis.length}  (${perfis.filter((p) => p.encerramento).length} encerradas)`);
  console.log(`  check-ins         ~${previsaoCheckIns}`);
  console.log(`  leads             ${QT_LEADS}`);
  console.log(`  atividades/aulas  ${ATIVIDADES_DEMO.length} atividades + agendas de 8 semanas\n`);

  if (!GRAVAR) {
    console.log('Previa apenas. Nada foi gravado.');
    return;
  }

  const antes = await contarTudo();

  // ---- Alunos --------------------------------------------------------------
  await inserirEmLotes('alunos', perfis, (lote) =>
    prisma.aluno.createMany({
      data: lote.map((p) => ({
        idCliente: ID_CLIENTE,
        nmAluno: p.nome,
        anEmail: p.email,
        nrDDD: 11,
        nrContato: `9${inteiro(rng, 10_000_000, 99_999_999)}`,
        dtNascimento: new Date(inteiro(rng, 1970, 2006), inteiro(rng, 0, 11), inteiro(rng, 1, 28)),
        dtCadastro: p.admissao,
        boInativo: p.encerramento !== null && chance(rng, 0.5),
      })),
    }),
  );

  // Correlacao pelo e-mail: `createMany` nao devolve ids, e o e-mail carrega o
  // indice do perfil justamente para reencontra-los sem depender da ordem.
  const alunosCriados = await prisma.aluno.findMany({
    where: { idCliente: ID_CLIENTE, nmAluno: { startsWith: MARCA } },
    select: { id: true, anEmail: true },
  });
  const idPorEmail = new Map(alunosCriados.map((a) => [a.anEmail, a.id]));

  // ---- Matriculas ----------------------------------------------------------
  await inserirEmLotes('matriculas', perfis, (lote) =>
    prisma.alunoPlano.createMany({
      data: lote.map((p) => ({
        idAluno: idPorEmail.get(p.email)!,
        idPlano: p.plano.id,
        nrDiaPagamento: p.diaPagamento,
        qtParcelas: p.plano.nome === 'Anual Completo' ? 12 : 1,
        dtAdmissao: p.admissao,
        dtVencimento: somarMeses(p.admissao, p.plano.nome === 'Anual Completo' ? 12 : 1),
        dtEncerramento: p.encerramento,
        idMotivoCancelamento: p.idMotivo,
        dtCadastro: p.admissao,
      })),
    }),
  );

  const matriculas = await prisma.alunoPlano.findMany({
    where: { aluno: { idCliente: ID_CLIENTE, nmAluno: { startsWith: MARCA } } },
    select: { id: true, idAluno: true },
  });
  const matriculaPorAluno = new Map(matriculas.map((m) => [m.idAluno, m.id]));

  // ---- Pagamentos ----------------------------------------------------------
  // Uma parcela por mes entre a admissao e o encerramento (ou dois meses a
  // frente, para a previsao de caixa ter o que mostrar).
  type LinhaPagamento = {
    idEmpresa: number;
    idAlunoPlano: number;
    idStatusPagamento: number;
    idFormaPagamento: number | null;
    vlPrevisto: number;
    vlPago: number | null;
    dtVencimento: Date;
    dtPagamento: Date | null;
    dtCompetencia: Date;
  };
  const pagamentos: LinhaPagamento[] = [];

  for (const perfil of perfis) {
    const idMatricula = matriculaPorAluno.get(idPorEmail.get(perfil.email)!);
    if (!idMatricula) continue;

    const fim = perfil.encerramento ?? somarMeses(hoje, 2);
    let competencia = new Date(perfil.admissao.getFullYear(), perfil.admissao.getMonth(), 1);

    while (competencia <= fim) {
      const ultimoDia = new Date(competencia.getFullYear(), competencia.getMonth() + 1, 0).getDate();
      const vencimento = new Date(
        competencia.getFullYear(),
        competencia.getMonth(),
        Math.min(perfil.diaPagamento, ultimoDia),
      );

      if (vencimento > fim) break;

      if (vencimento < hoje) {
        // Vencida. A maior parte foi paga; a cauda alimenta o aging.
        if (chance(rng, 0.88)) {
          // Atraso com cauda: a maioria paga perto do vencimento, alguns somem
          // por semanas. Uniforme aqui achataria o "atraso medio".
          const atraso = escolherComPeso(rng, [
            [-2, 22], [0, 30], [1, 16], [3, 12], [7, 10], [14, 6], [25, 4],
          ]);
          pagamentos.push({
            idEmpresa: perfil.idEmpresa,
            idAlunoPlano: idMatricula,
            idStatusPagamento: STATUS_PAGO,
            idFormaPagamento: escolherComPeso(rng, FORMAS),
            vlPrevisto: perfil.plano.valor,
            vlPago: perfil.plano.valor,
            dtVencimento: vencimento,
            dtPagamento: somarDias(vencimento, atraso),
            dtCompetencia: competencia,
          });
        } else {
          pagamentos.push({
            idEmpresa: perfil.idEmpresa,
            idAlunoPlano: idMatricula,
            idStatusPagamento: STATUS_PENDENTE,
            idFormaPagamento: null,
            vlPrevisto: perfil.plano.valor,
            vlPago: null,
            dtVencimento: vencimento,
            dtPagamento: null,
            dtCompetencia: competencia,
          });
        }
      } else {
        pagamentos.push({
          idEmpresa: perfil.idEmpresa,
          idAlunoPlano: idMatricula,
          idStatusPagamento: STATUS_PENDENTE,
          idFormaPagamento: null,
          vlPrevisto: perfil.plano.valor,
          vlPago: null,
          dtVencimento: vencimento,
          dtPagamento: null,
          dtCompetencia: competencia,
        });
      }

      competencia = somarMeses(competencia, 1);
    }
  }

  await inserirEmLotes('pagamentos', pagamentos, (lote) =>
    prisma.pagamento.createMany({ data: lote }),
  );

  // ---- Check-ins -----------------------------------------------------------
  type LinhaCheckIn = {
    idEmpresa: number;
    idAluno: number;
    idAlunoPlano: number;
    idTipoCheckIn: number;
    dtCadastro: Date;
  };
  const checkIns: LinhaCheckIn[] = [];

  for (const perfil of perfis) {
    if (perfil.frequencia === 0) continue;
    const idAluno = idPorEmail.get(perfil.email)!;
    const idMatricula = matriculaPorAluno.get(idAluno);
    if (!idMatricula) continue;

    const inicio = perfil.admissao > limiteCheckIn ? perfil.admissao : limiteCheckIn;
    const fim = perfil.encerramento && perfil.encerramento < hoje ? perfil.encerramento : hoje;

    for (let dia = inicioDoDia(inicio); dia <= fim; dia = somarDias(dia, 1)) {
      const pesoDoDia = DIAS.find(([d]) => d === dia.getDay())?.[1] ?? 50;
      // frequencia semanal -> probabilidade diaria, modulada pelo dia da semana
      const probabilidade = (perfil.frequencia / 7) * (pesoDoDia / 90);
      if (!chance(rng, probabilidade)) continue;

      const hora = escolherComPeso(rng, HORAS);
      checkIns.push({
        idEmpresa: perfil.idEmpresa,
        idAluno,
        idAlunoPlano: idMatricula,
        idTipoCheckIn: escolherComPeso(rng, TIPO_CHECKIN),
        dtCadastro: new Date(
          dia.getFullYear(), dia.getMonth(), dia.getDate(),
          hora, inteiro(rng, 0, 59), inteiro(rng, 0, 59),
        ),
      });
    }
  }

  await inserirEmLotes('check-ins', checkIns, (lote) =>
    prisma.alunoCheckIn.createMany({ data: lote }),
  );

  // ---- Leads ---------------------------------------------------------------
  const funcionarios = await prisma.funcionario.findMany({
    where: { empresa: { idCliente: ID_CLIENTE }, boInativo: false },
    select: { id: true },
  });
  const idsFuncionarios = funcionarios.map((f) => f.id);
  const alunosParaConversao = [...idPorEmail.values()];

  const leads = Array.from({ length: QT_LEADS }, (_, i) => {
    const dtCadastro = somarDias(hoje, -inteiro(rng, 0, 180));
    const status = escolherComPeso(rng, [
      ['convertido', 26], ['perdido', 30], ['em_contato', 24], ['novo', 20],
    ] as const);
    const contatado = status !== 'novo' && chance(rng, 0.92);
    return {
      idCliente: ID_CLIENTE,
      idEmpresa: escolher(rng, empresas),
      idPlano: escolherComPeso(rng, PLANOS.map((p) => [p.id, p.peso] as const)),
      nmLead: `${MARCA} ${escolher(rng, NOMES)} ${escolher(rng, SOBRENOMES)}`,
      nrDDD: 11,
      nrContato: `9${inteiro(rng, 10_000_000, 99_999_999)}`,
      anEmail: `demo.lead.${`${i}`.padStart(4, '0')}@exemplo.invalid`,
      cnStatus: status,
      caOrigem: escolherComPeso(rng, [['site', 62], ['balcao', 38]] as const),
      // Fecha o funil de verdade: 'convertido' sem aluno do outro lado seria so
      // uma palavra. A rota mede conversao pelo vinculo, nao pelo status.
      idAluno: status === 'convertido' ? escolher(rng, alunosParaConversao) : null,
      idFuncionario: chance(rng, 0.85) ? escolher(rng, idsFuncionarios) : null,
      dtContato: contatado ? somarDias(dtCadastro, inteiro(rng, 0, 6)) : null,
      dtCadastro,
    };
  });

  await inserirEmLotes('leads', leads, (lote) => prisma.lead.createMany({ data: lote }));

  // ---- Atividades, turmas e inscricoes -------------------------------------
  for (const atividade of ATIVIDADES_DEMO) {
    const criada = await prisma.atividade.create({
      data: { idEmpresa: empresas[0]!, dsAtividade: atividade.nome },
    });

    const agendas: Array<{ idEmpresa: number; idAtividade: number; qtAlunos: number; dtInicial: Date; dtFinal: Date }> = [];
    for (let semana = 7; semana >= 0; semana -= 1) {
      for (const diaDaSemana of [1, 3, 5]) {
        for (const hora of atividade.horarios) {
          const base = somarDias(inicioDoDia(hoje), -semana * 7);
          const dia = somarDias(base, diaDaSemana - base.getDay());
          if (dia > hoje) continue;
          const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hora, 0);
          agendas.push({
            idEmpresa: empresas[0]!,
            idAtividade: criada.id,
            qtAlunos: atividade.capacidade,
            dtInicial: inicio,
            dtFinal: new Date(inicio.getTime() + 55 * 60_000),
          });
        }
      }
    }
    await prisma.atividadeAgenda.createMany({ data: agendas });

    // Ocupacao por atividade: Spinning lota, Yoga nao. Sem variacao entre elas o
    // ranking de aulas nao teria o que ranquear.
    const ocupacaoAlvo = atividade.nome.includes('Spinning')
      ? 0.82
      : atividade.nome.includes('Funcional')
        ? 0.58
        : 0.31;

    // Quem comparece de fato. Sem estes check-ins vinculados a turma, o painel
    // mostraria 0% de presenca em tudo — ou seja, no-show de 100% em toda aula,
    // que e um numero pior que numero nenhum. A taxa varia por modalidade: a
    // aula concorrida tem menos falta que a de vaga sobrando.
    const presencaAlvo = atividade.nome.includes('Spinning')
      ? 0.81
      : atividade.nome.includes('Funcional')
        ? 0.7
        : 0.62;

    const inscricoes: Array<{ idEmpresa: number; idAtividadeAgenda: number; idAluno: number }> = [];
    const presencas: Array<{
      idEmpresa: number;
      idAluno: number;
      idAtividadeAgenda: number;
      idTipoCheckIn: number;
      dtCadastro: Date;
    }> = [];

    const agendasComData = await prisma.atividadeAgenda.findMany({
      where: { idAtividade: criada.id },
      select: { id: true, dtInicial: true },
    });

    for (const agenda of agendasComData) {
      const vagasUsadas = Math.round(atividade.capacidade * ocupacaoAlvo * (0.7 + rng() * 0.6));
      const escolhidos = new Set<number>();
      for (let i = 0; i < Math.min(vagasUsadas, atividade.capacidade); i += 1) {
        escolhidos.add(escolher(rng, alunosParaConversao));
      }
      for (const idAluno of escolhidos) {
        inscricoes.push({ idEmpresa: empresas[0]!, idAtividadeAgenda: agenda.id, idAluno });

        // Turma futura ainda nao tem presenca a registrar.
        if (!agenda.dtInicial || agenda.dtInicial > hoje) continue;
        if (!chance(rng, presencaAlvo)) continue;
        presencas.push({
          idEmpresa: empresas[0]!,
          idAluno,
          idAtividadeAgenda: agenda.id,
          idTipoCheckIn: escolherComPeso(rng, TIPO_CHECKIN),
          // Chega entre 12 minutos antes e 5 depois do inicio.
          dtCadastro: new Date(agenda.dtInicial.getTime() + inteiro(rng, -12, 5) * 60_000),
        });
      }
    }

    await inserirEmLotes(`inscricoes ${atividade.nome}`, inscricoes, (lote) =>
      prisma.alunoAtividadeAgenda.createMany({ data: lote }),
    );
    await inserirEmLotes(`presencas ${atividade.nome}`, presencas, (lote) =>
      prisma.alunoCheckIn.createMany({ data: lote }),
    );
  }

  const depois = await contarTudo();
  console.log('\nCriado:');
  for (const chave of Object.keys(depois) as Array<keyof typeof depois>) {
    const delta = depois[chave] - antes[chave];
    if (delta > 0) console.log(`  ${chave.padEnd(18)} +${delta}  (total ${depois[chave]})`);
  }
  console.log(`\nPara desfazer: tsx scripts/demo/limpar.mts --confirmar`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
