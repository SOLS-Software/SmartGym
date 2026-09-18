// Remove tudo que semear.mts criou.
//
//   pnpm --filter @solsfit/db exec tsx scripts/demo/limpar.mts             (previa)
//   pnpm --filter @solsfit/db exec tsx scripts/demo/limpar.mts --confirmar (apaga)
//
// A ORDEM E O QUE FAZ FUNCIONAR
//
// As exclusoes vao de folha para raiz. O banco tem chave estrangeira em tudo
// (por acerto de projeto), entao apagar aluno antes do check-in dele nao falha
// silenciosamente: falha com erro — e uma limpeza que falha no meio deixa o
// banco compartilhado pior do que estava.
//
// APAGA POR VINCULO, NAO POR NOME
//
// So aluno, lead e atividade carregam a marca `[DEMO]`. Todo o resto e
// alcancado pela chave estrangeira que aponta para eles. E por isso que o
// script apaga tabelas que o seed nem escreve (evolucoes, treinos, pontuacoes,
// avisos): se alguem exercitou a aplicacao por cima dos dados de demonstracao,
// esses registros existem e seguram a exclusao do aluno. Melhor levar junto do
// que abortar na metade.

import { MARCA, ID_CLIENTE, prisma, bancoAlvo, contarMarcados, contarTudo } from './comum.mts';

const APAGAR = process.argv.includes('--confirmar');

async function main() {
  console.log(`Banco alvo : ${bancoAlvo()}`);
  console.log(`Cliente    : ${ID_CLIENTE}`);
  console.log(`Marca      : ${MARCA}`);
  console.log(`Modo       : ${APAGAR ? 'APAGANDO' : 'previa (use --confirmar para apagar)'}\n`);

  const marcados = await contarMarcados();

  console.log('Encontrado com a marca:');
  console.log(`  alunos            ${marcados.alunos}`);
  console.log(`  matriculas        ${marcados.matriculas}`);
  console.log(`  pagamentos        ${marcados.pagamentos}`);
  console.log(`  check-ins         ${marcados.checkIns}`);
  console.log(`  leads             ${marcados.leads}`);
  console.log(`  atividades        ${marcados.atividades}`);
  console.log(`  turmas            ${marcados.agendas}`);
  console.log(`  inscricoes        ${marcados.inscricoes}\n`);

  if (marcados.alunos === 0 && marcados.leads === 0 && marcados.atividades === 0) {
    console.log('Nada marcado para remover.');
    return;
  }

  if (!APAGAR) {
    console.log('Previa apenas. Nada foi apagado.');
    return;
  }

  const antes = await contarTudo();
  const { idsAlunos, idsAtividades } = marcados;
  const doAluno = { idAluno: { in: idsAlunos } };

  const agendasDemo = await prisma.atividadeAgenda.findMany({
    where: { idAtividade: { in: idsAtividades } },
    select: { id: true },
  });
  const idsAgendas = agendasDemo.map((a) => a.id);

  // --- Folhas ---------------------------------------------------------------
  // Pontuacao aponta para check-in por chave unica: sai antes dele.
  await prisma.alunoPontuacao.deleteMany({ where: doAluno });
  await prisma.treinoExecucao.deleteMany({
    where: { alunoCheckIn: { idAluno: { in: idsAlunos } } },
  });
  await prisma.pagamento.deleteMany({ where: { alunoPlano: doAluno } });
  await prisma.alunoCheckIn.deleteMany({
    where: { OR: [doAluno, { idAtividadeAgenda: { in: idsAgendas } }] },
  });
  await prisma.alunoAtividadeAgenda.deleteMany({
    where: { OR: [doAluno, { idAtividadeAgenda: { in: idsAgendas } }] },
  });
  await prisma.solicitacaoPlano.deleteMany({
    where: { OR: [doAluno, { alunoPlano: doAluno }] },
  });
  await prisma.notificacao.deleteMany({ where: doAluno });
  await prisma.alunoEvolucao.deleteMany({ where: doAluno });
  await prisma.alunoTreinoSequencia.deleteMany({ where: { alunoTreino: doAluno } });
  await prisma.alunoTreino.deleteMany({ where: doAluno });
  await prisma.alunoArquivo.deleteMany({ where: doAluno });
  await prisma.alunoBiometriaFacial.deleteMany({ where: doAluno });
  await prisma.catracaEvento.deleteMany({ where: doAluno });
  await prisma.produtoMovimentacao.deleteMany({ where: doAluno });

  // --- Intermediarios -------------------------------------------------------
  await prisma.alunoPlano.deleteMany({ where: doAluno });

  // Lead aponta para aluno: desvincula pelos que sobraram antes de apagar o
  // aluno. Um lead NAO marcado que converteu num aluno de demonstracao existe
  // se alguem mexeu na tela — desvincular preserva o lead real.
  await prisma.lead.updateMany({
    where: { idAluno: { in: idsAlunos }, NOT: { nmLead: { startsWith: MARCA } } },
    data: { idAluno: null },
  });
  await prisma.lead.deleteMany({
    where: { idCliente: ID_CLIENTE, nmLead: { startsWith: MARCA } },
  });

  await prisma.usuario.deleteMany({ where: doAluno });

  // --- Raizes ---------------------------------------------------------------
  await prisma.aluno.deleteMany({ where: { id: { in: idsAlunos } } });
  await prisma.funcionarioAtividadeAgenda.deleteMany({
    where: { idAtividadeAgenda: { in: idsAgendas } },
  });
  await prisma.atividadeAgenda.deleteMany({ where: { idAtividade: { in: idsAtividades } } });
  await prisma.planoAtividade.deleteMany({ where: { idAtividade: { in: idsAtividades } } });
  await prisma.atividade.deleteMany({ where: { id: { in: idsAtividades } } });

  const depois = await contarTudo();
  const sobrou = await contarMarcados();

  console.log('Removido:');
  for (const chave of Object.keys(antes) as Array<keyof typeof antes>) {
    const delta = antes[chave] - depois[chave];
    if (delta > 0) console.log(`  ${chave.padEnd(18)} -${delta}  (total ${depois[chave]})`);
  }

  const restante = sobrou.alunos + sobrou.leads + sobrou.atividades;
  console.log(
    restante === 0
      ? '\nNada com a marca restou no banco.'
      : `\nATENCAO: ainda restam ${restante} registro(s) marcado(s).`,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
