import { prisma } from './prisma.js';

// Chave de login da identidade central (Usuario.caCPFHash).
//
// POR QUE ELA EXISTE. O login precisa achar a pessoa ANTES de saber em qual
// banco o perfil dela mora: com banco por cliente, o filtro antigo — que ia de
// tb_Usuarios (central) para tb_Alunos/tb_Funcionarios (aplicacao) — deixa de
// existir. E quem esta tentando entrar ainda nao disse de qual academia e; o
// app mobile nem dominio manda.
//
// O CUSTO ASSUMIDO. O hash passa a existir em dois lugares: na ficha, que e
// dado de negocio, e aqui, que e credencial. Nao da para evitar sem quebrar o
// login. O que da para fazer e manter os pontos de escrita poucos, todos em
// codigo, e todos passando por este modulo.
//
// A ORDEM IMPORTA. Quem muda um CPF grava a FICHA primeiro e a chave depois. Se
// a segunda escrita falhar, a pessoa continua entrando com o CPF antigo — um
// desencontro recuperavel, que o proximo salvamento conserta. Na ordem inversa,
// uma falha deixaria a pessoa sem conseguir entrar de jeito nenhum.

/**
 * Atualiza a chave de login das contas ligadas a um perfil.
 *
 * Nao lanca: quem chama ja gravou a ficha, e derrubar a requisicao depois disso
 * mostraria erro para uma operacao que deu certo pela metade. O desencontro fica
 * no log com o que seria preciso para reconciliar.
 */
export async function sincronizarChaveDeLogin(
  alvo: { idAluno?: number | null; idFuncionario?: number | null },
  caCPFHash: string | null,
  log?: { warn: (obj: unknown, msg?: string) => void },
): Promise<void> {
  const where =
    alvo.idAluno != null
      ? { idAluno: alvo.idAluno }
      : alvo.idFuncionario != null
        ? { idFuncionario: alvo.idFuncionario }
        : null;
  if (!where) return;

  try {
    await prisma.usuario.updateMany({ where, data: { caCPFHash } });
  } catch (error) {
    log?.warn(
      { err: error, ...where },
      'Ficha salva, mas a chave de login nao acompanhou: a pessoa segue entrando com o CPF anterior.',
    );
  }
}
