// Matricular um aluno num plano: cria o vinculo e gera as cobrancas.
//
// POR QUE EXISTE COMO MODULO: esta rotina tinha UM chamador (a ficha do aluno)
// e agora tem tres — a ficha, a aprovacao de renovacao e a aprovacao de troca
// de plano. Deixar cada um montar o AlunoPlano do seu jeito faria as regras de
// valor, empresa e promocao divergirem em silencio, e a divergencia so
// apareceria no boleto errado de alguem.
//
// O QUE ELA NAO DECIDE: se o aluno DEVE ser matriculado. Quem decide isso e o
// chamador — a equipe pela ficha, ou a aprovacao de um pedido que o proprio
// aluno abriu. Aqui e so a execucao.
import { Prisma } from '@smartgym/db';
import { generateInitialPayments, isRecurringFrequency } from './payments.js';

export type EnrollArgs = {
  transaction: Prisma.TransactionClient;
  idCliente: number;
  idAluno: number;
  idPlano: number;
  /** Filial que recebe. Ausente, cai na primeira que tiver preco para o plano. */
  idEmpresa?: number | null;
  nrDiaPagamento?: number | null;
  qtParcelas?: number | null;
  idPromocaoPlano?: number | null;
  dtAdmissao?: Date | null;
  boInativo?: boolean;
};

/**
 * Matricula e devolve o AlunoPlano criado.
 *
 * Recebe uma TRANSACAO, nao o prisma: criar o vinculo sem gerar as parcelas
 * (ou o contrario) deixaria o aluno num estado que nenhuma tela sabe mostrar.
 * Os dois nascem juntos ou nenhum nasce.
 */
export async function enrollStudentInPlan(args: EnrollArgs) {
  const { transaction, idCliente, idAluno, idPlano } = args;

  // findFirst com idCliente, nao findUnique por id: sem o filtro de tenant
  // aqui, matricular um aluno num plano de OUTRA academia era so passar o id
  // certo — e as parcelas nasciam com o preco do concorrente.
  const plano = await transaction.plano.findFirst({
    where: { id: idPlano, idCliente },
    include: {
      frequencia: true,
      planoValores: { where: { boInativo: false }, orderBy: { dtCadastro: 'desc' } },
    },
  });
  if (!plano) throw new Error('Plano invalido.');

  const nrDiaPagamento = Number(args.nrDiaPagamento ?? 1);
  const admissao = args.dtAdmissao ?? new Date();

  // A empresa vem do chamador ou da primeira que tenha preco cadastrado. Sem
  // nenhuma das duas nao ha como gerar cobranca — e uma matricula sem cobranca
  // e um plano que ninguem paga.
  const idEmpresa =
    args.idEmpresa ?? plano.planoValores.find((valor) => valor.idEmpresa)?.idEmpresa ?? null;
  if (!idEmpresa) throw new Error('Informe a empresa para gerar os pagamentos.');

  const empresa = await transaction.empresa.findFirst({
    where: { id: idEmpresa, idCliente },
    select: { id: true },
  });
  if (!empresa) throw new Error('Empresa invalida para este cliente.');

  // Preco da filial; sem preco proprio, o primeiro cadastrado. O valor vigente
  // e o mais recente — `planoValores` ja vem ordenado por data desc.
  const valorDaEmpresa =
    plano.planoValores.find((valor) => valor.idEmpresa === idEmpresa) ??
    plano.planoValores[0] ??
    null;
  const vlParcela = Number(valorDaEmpresa?.vlVenda ?? 0);

  // Plano recorrente cobra uma parcela por ciclo; os demais parcelam.
  const recurring = isRecurringFrequency(plano.frequencia);
  const qtParcelas = recurring ? 1 : Math.max(1, Number(args.qtParcelas ?? 1));

  const idPromocaoPlano = args.idPromocaoPlano ?? null;
  const promocaoPlano = idPromocaoPlano
    ? await transaction.promocaoPlano.findFirst({
        // idEmpresa nulo aqui e "vale em todas as filiais"; quem garante o
        // tenant e a campanha dona, nao a filial da linha.
        where: {
          id: idPromocaoPlano,
          promocao: { idCliente },
          OR: [{ idEmpresa: null }, { empresa: { idCliente } }],
        },
        include: { promocao: true },
      })
    : null;
  if (idPromocaoPlano && !promocaoPlano) throw new Error('Promocao invalida para este cliente.');

  const criado = await transaction.alunoPlano.create({
    data: {
      idAluno,
      idPlano,
      idPromocaoPlano,
      nrDiaPagamento,
      qtParcelas,
      dtAdmissao: admissao,
      boInativo: args.boInativo ?? false,
    },
  });

  await generateInitialPayments({
    db: transaction,
    idAlunoPlano: criado.id,
    idEmpresa,
    nrDiaPagamento,
    qtParcelas,
    vlParcela,
    admissao,
    freq: plano.frequencia,
    promo: promocaoPlano?.promocao ?? null,
  });

  return criado;
}
