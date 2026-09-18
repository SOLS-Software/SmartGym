// Consumo de benefício com o banco: a baixa do direito e a baixa do estoque na
// MESMA transação.
//
// POR QUE JUNTAS: entregar a camiseta da assinatura é um evento só. Baixar o
// estoque sem marcar o direito faz a recepção entregar de novo no mês seguinte;
// marcar o direito sem baixar o estoque faz a contagem do armário nunca fechar.
// Meio registro é pior que nenhum, porque parece completo.
//
// Duas portas chegam aqui — o balcão de vendas ("baixa do produto") e o painel
// da recepção ("entregar benefício") — e as duas passam por esta função para
// não divergirem.
import type { Prisma } from '@solsfit/db';
import {
  escolherBeneficioDeProduto,
  saldosDoPlano,
  type BeneficioDoPlano,
  type SaldoDoBeneficio,
} from './planBenefits.js';

export type EstadoDosBeneficios = {
  idAlunoPlano: number | null;
  dsPlano: string | null;
  beneficios: SaldoDoBeneficio[];
  /** Os cadastros crus, para quem precisa saber o tipo/produto de cada um. */
  cadastros: BeneficioDoPlano[];
};

/** Direitos da matrícula ativa do aluno, com o saldo de cada um. */
export async function carregarBeneficiosDoAluno(
  db: Prisma.TransactionClient,
  idAluno: number,
  idCliente: number,
): Promise<EstadoDosBeneficios> {
  const matricula = await db.alunoPlano.findFirst({
    where: { idAluno, boInativo: false, aluno: { idCliente } },
    orderBy: { dtCadastro: 'desc' },
    select: {
      id: true,
      plano: {
        select: {
          id: true,
          dsPlano: true,
          planoBeneficios: {
            include: { produto: { select: { id: true, dsProduto: true } } },
            orderBy: { id: 'asc' },
          },
        },
      },
    },
  });

  if (!matricula?.plano) {
    return { idAlunoPlano: null, dsPlano: null, beneficios: [], cadastros: [] };
  }

  // Usos DESTA matrícula: é o que faz "uma vez por matrícula" significar uma
  // vez por contrato, e não uma vez na vida do aluno.
  const usos = await db.alunoBeneficioUso.findMany({
    where: { idAlunoPlano: matricula.id, boInativo: false },
    select: { idPlanoBeneficio: true, qtUsada: true, dtUso: true, boInativo: true },
  });

  const cadastros = matricula.plano.planoBeneficios;

  return {
    idAlunoPlano: matricula.id,
    dsPlano: matricula.plano.dsPlano,
    beneficios: saldosDoPlano(cadastros, usos, new Date()),
    cadastros,
  };
}

/**
 * Baixa de estoque de um produto entregue a um aluno.
 *
 * Mesma mecânica da venda (movimentação + decremento + `qtDisponivel` com o
 * saldo posterior), sem cobrança: benefício do plano já foi pago na
 * mensalidade, e criar um Pagamento de R$ 0 sujaria o financeiro com linhas
 * que não representam dinheiro nenhum.
 */
export async function baixarEstoqueDeBeneficio(
  db: Prisma.TransactionClient,
  params: {
    idEmpresa: number;
    idProduto: number;
    idAluno: number;
    quantidade: number;
  },
): Promise<{ id: number; qtDisponivel: number }> {
  const produto = await db.produto.findUniqueOrThrow({
    where: { id: params.idProduto },
    select: { id: true, dsProduto: true, qtEstoque: true },
  });

  if (produto.qtEstoque < params.quantidade) {
    throw new Error(
      `Estoque insuficiente: ha ${produto.qtEstoque} unidade(s) de ${produto.dsProduto}.`,
    );
  }

  const movimentacao = await db.produtoMovimentacao.create({
    data: {
      idEmpresa: params.idEmpresa,
      idProduto: params.idProduto,
      idAluno: params.idAluno,
      qtMovimentada: params.quantidade,
      // Zero e a informacao certa: nao foi vendido, foi entregue como direito.
      vlUnitario: 0,
      qtDisponivel: 0,
      boInativo: false,
    },
    select: { id: true },
  });

  const atualizado = await db.produto.update({
    where: { id: params.idProduto },
    data: { qtEstoque: { decrement: params.quantidade } },
    select: { qtEstoque: true },
  });

  await db.produtoMovimentacao.update({
    where: { id: movimentacao.id },
    data: { qtDisponivel: atualizado.qtEstoque },
  });

  return { id: movimentacao.id, qtDisponivel: atualizado.qtEstoque };
}

/**
 * Registra o uso de um direito.
 *
 * Quando o direito é de produto e ainda não há movimentação amarrada, baixa o
 * estoque aqui mesmo — é o "entregar" do painel da recepção. Quando a
 * movimentação já existe (a venda no balcão acabou de criá-la), só amarra.
 */
export async function registrarUsoDeBeneficio(
  db: Prisma.TransactionClient,
  params: {
    estado: EstadoDosBeneficios;
    idPlanoBeneficio: number;
    idAluno: number;
    idEmpresa: number | null;
    quantidade?: number;
    idProdutoMovimentacao?: number | null;
    dsObservacao?: string | null;
    idUsuario?: number | null;
  },
) {
  const { estado, idPlanoBeneficio, idAluno } = params;
  const quantidade = params.quantidade && params.quantidade > 0 ? params.quantidade : 1;

  if (!estado.idAlunoPlano) throw new Error('Aluno sem matricula ativa.');

  const saldo = estado.beneficios.find((item) => item.idPlanoBeneficio === idPlanoBeneficio);
  const cadastro = estado.cadastros.find((item) => item.id === idPlanoBeneficio);
  if (!saldo || !cadastro) throw new Error('Este beneficio nao pertence ao plano do aluno.');

  if (!saldo.podeUsar || saldo.restantes < quantidade) {
    // A recusa diz o numero: "0 de 1 neste mes" resolve a conversa no balcao
    // sem ninguem precisar abrir relatorio.
    throw new Error(`${saldo.descricao}: ja usou ${saldo.usadas} de ${saldo.limite} ${saldo.janela}.`);
  }

  let idProdutoMovimentacao = params.idProdutoMovimentacao ?? null;

  if (cadastro.cnTipo === 'produto' && !idProdutoMovimentacao) {
    if (!cadastro.produto?.id) throw new Error('Beneficio de produto sem produto cadastrado.');
    if (!params.idEmpresa) throw new Error('Informe a unidade que esta entregando.');

    const movimentacao = await baixarEstoqueDeBeneficio(db, {
      idEmpresa: params.idEmpresa,
      idProduto: cadastro.produto.id,
      idAluno,
      quantidade,
    });
    idProdutoMovimentacao = movimentacao.id;
  }

  return db.alunoBeneficioUso.create({
    data: {
      idPlanoBeneficio,
      idAlunoPlano: estado.idAlunoPlano,
      idAluno,
      idEmpresa: params.idEmpresa ?? null,
      qtUsada: quantidade,
      idProdutoMovimentacao,
      dsObservacao: params.dsObservacao ?? null,
      idUsuarioCadastro: params.idUsuario ?? null,
    },
  });
}

/**
 * Consome o direito correspondente a um produto que ACABOU de sair do estoque.
 *
 * É a ponte do balcão: a venda já criou a movimentação e baixou o estoque;
 * aqui o direito é marcado como usado e amarrado àquela movimentação. Lança
 * quando não há direito disponível — e a transação da venda desfaz a baixa,
 * que é o certo: entregar de graça sem direito é decisão de gente, não efeito
 * colateral de um botão.
 */
export async function consumirBeneficioDeProduto(
  db: Prisma.TransactionClient,
  params: {
    idAluno: number;
    idCliente: number;
    idProduto: number;
    idEmpresa: number;
    quantidade: number;
    idProdutoMovimentacao: number;
    idUsuario?: number | null;
  },
) {
  const estado = await carregarBeneficiosDoAluno(db, params.idAluno, params.idCliente);
  const escolha = escolherBeneficioDeProduto(
    estado.beneficios,
    estado.cadastros,
    params.idProduto,
    params.quantidade,
  );

  if ('motivo' in escolha) throw new Error(escolha.motivo);

  await registrarUsoDeBeneficio(db, {
    estado,
    idPlanoBeneficio: escolha.saldo.idPlanoBeneficio,
    idAluno: params.idAluno,
    idEmpresa: params.idEmpresa,
    quantidade: params.quantidade,
    idProdutoMovimentacao: params.idProdutoMovimentacao,
    idUsuario: params.idUsuario,
  });

  return escolha.saldo;
}
