// Ponte entre as regras puras de planCoverage.ts e o banco.
//
// Fica separada do modulo puro para que as regras continuem testaveis sem
// Prisma, e num arquivo so porque as DUAS rotas de inscricao (a tela de
// Atividades e o Calendario) precisam da mesma resposta — com a consulta
// copiada nas duas, uma delas envelheceria.
import type { PrismaLike } from './payments.js';
import { motivoForaDoPlano, planoCobreAtividade } from './planCoverage.js';

export type AulaPretendida = {
  idAtividade: number;
  idEmpresa: number | null;
  dsAtividade?: string | null;
};

/**
 * Recusa a inscricao quando o plano do aluno nao cobre a atividade.
 *
 * Aluno SEM plano ativo nao e barrado aqui: quem cuida disso e a validacao de
 * acesso (studentAccess), com mensagem propria. Duplicar a recusa faria a
 * mesma situacao ter dois textos diferentes conforme a tela.
 *
 * Plano sem nenhuma atividade marcada continua dando acesso a todas — e a
 * convencao do cadastro, e inverte-la trancaria todo plano ja existente.
 */
export async function assertPlanoCobreAtividades(
  db: PrismaLike,
  idAluno: number,
  aulas: AulaPretendida[],
): Promise<void> {
  if (aulas.length === 0) return;

  const matricula = await db.alunoPlano.findFirst({
    where: { idAluno, boInativo: false },
    orderBy: { dtCadastro: 'desc' },
    select: {
      plano: {
        select: {
          planoAtividades: {
            where: { boInativo: false },
            select: {
              idAtividade: true,
              idEmpresa: true,
              boInativo: true,
              atividade: { select: { dsAtividade: true } },
            },
          },
        },
      },
    },
  });

  const doPlano = matricula?.plano?.planoAtividades ?? [];
  if (doPlano.length === 0) return;

  for (const aula of aulas) {
    if (!planoCobreAtividade(doPlano, aula.idAtividade, aula.idEmpresa)) {
      throw new Error(motivoForaDoPlano(doPlano, aula.dsAtividade));
    }
  }
}
