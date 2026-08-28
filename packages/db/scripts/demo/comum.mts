// Base compartilhada dos scripts de dados de demonstracao.
//
// POR QUE ESTES SCRIPTS EXISTEM
//
// A aba Dashboards foi construida e testada contra um banco com 7 alunos, 15
// check-ins e ZERO leads. A forma dos paineis esta validada; o comportamento
// nao: o funil nunca renderizou com conteudo, a coorte nunca teve uma safra
// grande, o aging nunca teve as quatro faixas povoadas e nenhuma consulta foi
// medida sob carga. Este seed produz o volume que falta.
//
// A MARCA E O CONTRATO
//
// Tudo que estes scripts criam carrega `[DEMO]` no nome, e tudo que NAO tem
// nome proprio (pagamento, check-in, inscricao) pende por chave estrangeira de
// algo que tem. Essa e a unica garantia de que `limpar.mts` devolve o banco ao
// estado anterior — o banco de desenvolvimento e compartilhado, e deixar lixo
// nele custa o tempo de outra pessoa, nao o nosso.
//
// Nao geramos CPF: `caCPF` fica vazio e `caCPFHash` nulo. O campo e PII
// criptografada (ver apps/api/src/shared/pii.ts) e nenhum indicador dos paineis
// o consulta — inventar CPF exigiria a chave de criptografia aqui dentro em
// troca de nada. O efeito colateral e que aluno de demonstracao nao faz login,
// o que tambem e desejavel.

import { PrismaClient } from '@prisma/client';

export const MARCA = '[DEMO]';

/** Cliente (rede) alvo. Sobrescrevivel para semear outro tenant. */
export const ID_CLIENTE = Number(process.env.DEMO_ID_CLIENTE ?? 1);

export const prisma = new PrismaClient();

/**
 * Gerador pseudoaleatorio DETERMINISTICO (mulberry32).
 *
 * `Math.random()` tornaria cada execucao um conjunto diferente: um numero
 * estranho num painel nao poderia ser reproduzido, e comparar duas rodadas
 * viraria adivinhacao. Com semente fixa, o mesmo comando produz o mesmo banco.
 */
export function criarRng(semente: number) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Inteiro em [min, max]. */
export function inteiro(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Um item da lista, uniforme. */
export function escolher<T>(rng: Rng, itens: readonly T[]): T {
  return itens[Math.floor(rng() * itens.length)]!;
}

/**
 * Escolha com peso. Recebe pares [item, peso]; peso maior sai mais vezes.
 * Usado onde a distribuicao uniforme mentiria — motivo de cancelamento,
 * forma de pagamento e hora do check-in nao sao uniformes na vida real, e um
 * painel alimentado com uniforme nao ensina nada a quem vai olhar.
 */
export function escolherComPeso<T>(rng: Rng, pares: ReadonlyArray<readonly [T, number]>): T {
  const total = pares.reduce((soma, [, peso]) => soma + peso, 0);
  let sorteio = rng() * total;
  for (const [item, peso] of pares) {
    sorteio -= peso;
    if (sorteio <= 0) return item;
  }
  return pares[pares.length - 1]![0];
}

/** true com probabilidade `p`. */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function somarDias(data: Date, dias: number): Date {
  const nova = new Date(data);
  nova.setDate(nova.getDate() + dias);
  return nova;
}

export function somarMeses(data: Date, meses: number): Date {
  const nova = new Date(data);
  nova.setMonth(nova.getMonth() + meses);
  return nova;
}

export function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Insere em lotes. O banco de desenvolvimento e remoto (Neon): mandar 12 mil
 * check-ins numa tacada estoura limite de payload e, quando nao estoura, prende
 * a conexao por minutos sem dar sinal de progresso.
 */
export async function inserirEmLotes<T>(
  nome: string,
  linhas: T[],
  inserir: (lote: T[]) => Promise<unknown>,
  tamanho = 1000,
): Promise<number> {
  for (let i = 0; i < linhas.length; i += tamanho) {
    await inserir(linhas.slice(i, i + tamanho));
    process.stdout.write(`\r  ${nome}: ${Math.min(i + tamanho, linhas.length)}/${linhas.length}`);
  }
  if (linhas.length > 0) process.stdout.write('\n');
  return linhas.length;
}

/** Host do banco alvo, para o operador conferir ANTES de qualquer escrita. */
export function bancoAlvo(): string {
  const url = process.env.DATABASE_URL ?? '';
  const match = url.match(/@([^/?]+)/);
  return match?.[1] ?? '(DATABASE_URL nao definida)';
}

/** Conta o que existe hoje com a marca — serve de antes/depois nos dois scripts. */
export async function contarMarcados() {
  const alunos = await prisma.aluno.findMany({
    where: { idCliente: ID_CLIENTE, nmAluno: { startsWith: MARCA } },
    select: { id: true },
  });
  const idsAlunos = alunos.map((a) => a.id);

  const atividades = await prisma.atividade.findMany({
    where: { empresa: { idCliente: ID_CLIENTE }, dsAtividade: { startsWith: MARCA } },
    select: { id: true },
  });
  const idsAtividades = atividades.map((a) => a.id);

  const [matriculas, checkIns, pagamentos, leads, agendas, inscricoes] = await Promise.all([
    prisma.alunoPlano.count({ where: { idAluno: { in: idsAlunos } } }),
    prisma.alunoCheckIn.count({ where: { idAluno: { in: idsAlunos } } }),
    prisma.pagamento.count({ where: { alunoPlano: { idAluno: { in: idsAlunos } } } }),
    prisma.lead.count({ where: { idCliente: ID_CLIENTE, nmLead: { startsWith: MARCA } } }),
    prisma.atividadeAgenda.count({ where: { idAtividade: { in: idsAtividades } } }),
    prisma.alunoAtividadeAgenda.count({ where: { idAluno: { in: idsAlunos } } }),
  ]);

  return {
    idsAlunos,
    idsAtividades,
    alunos: idsAlunos.length,
    matriculas,
    checkIns,
    pagamentos,
    leads,
    atividades: idsAtividades.length,
    agendas,
    inscricoes,
  };
}

/** Total geral das tabelas que o seed toca — a prova de que a limpeza reverteu. */
export async function contarTudo() {
  const [alunos, matriculas, checkIns, pagamentos, leads, atividades, agendas, inscricoes] =
    await Promise.all([
      prisma.aluno.count(),
      prisma.alunoPlano.count(),
      prisma.alunoCheckIn.count(),
      prisma.pagamento.count(),
      prisma.lead.count(),
      prisma.atividade.count(),
      prisma.atividadeAgenda.count(),
      prisma.alunoAtividadeAgenda.count(),
    ]);
  return { alunos, matriculas, checkIns, pagamentos, leads, atividades, agendas, inscricoes };
}
