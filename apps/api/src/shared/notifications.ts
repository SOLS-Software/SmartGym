// Avisos ao aluno: geracao, deduplicacao e envio.
//
// Ponto unico de verdade do que o aluno precisa saber, como studentAccess.ts e
// para "pode treinar hoje?". A regra de QUANDO avisar mora aqui; as rotas so
// pedem "sincronize" ou "despache".
//
// POR QUE VIROU TABELA: antes os avisos eram calculados a cada abertura da tela
// e jogados fora. Isso significa que nao ha como saber se o aluno ja leu, nem
// como enviar por email sem reenviar o mesmo aviso todo dia — e o aviso que so
// existe enquanto a tela esta aberta nao alcanca justamente quem parou de
// abrir a tela, que e quem esta prestes a cancelar.
import type { PrismaLike } from './payments.js';
import { getStudentAccessStatus } from './studentAccess.js';
import { getStatusIdByName } from './payments.js';

export type NotificationSeverity = 'danger' | 'warning' | 'info';

export type NotificationDraft = {
  cnTipo: string;
  cnSeveridade: NotificationSeverity;
  dsTitulo: string;
  dsMensagem: string;
  /**
   * Identidade do aviso ao longo do tempo. Mesmo assunto = mesma chave, mesmo
   * que o texto mude. Inclui o id do registro de origem quando existe, para o
   * aviso da parcela 412 nao se confundir com o da 413.
   */
  caChave: string;
};

/** Dias de antecedencia do aviso de vencimento. */
const DIAS_AVISO_VENCIMENTO = 7;

/**
 * Quais avisos o aluno deveria estar vendo AGORA.
 *
 * Funcao pura de leitura: nao grava nada, so descreve o estado. Quem persiste e
 * `syncStudentNotifications`.
 */
export async function buildStudentNotifications(
  db: PrismaLike,
  idAluno: number,
): Promise<NotificationDraft[]> {
  const drafts: NotificationDraft[] = [];
  const access = await getStudentAccessStatus(db, idAluno);

  if (access.paymentOverdue) {
    drafts.push({
      cnTipo: 'pagamento_atrasado',
      cnSeveridade: 'danger',
      dsTitulo: 'Pagamento em atraso',
      dsMensagem:
        'Você possui um pagamento vencido. Regularize para manter seu acesso à academia.',
      caChave: `pagamento_atrasado:${access.idAlunoPlano ?? 0}`,
    });
  }

  if (access.paymentCancelled) {
    drafts.push({
      cnTipo: 'pagamento_cancelado',
      cnSeveridade: 'danger',
      dsTitulo: 'Pagamento cancelado',
      dsMensagem: 'O pagamento do seu plano foi cancelado. Entre em contato com a academia.',
      caChave: `pagamento_cancelado:${access.idAlunoPlano ?? 0}`,
    });
  }

  if (!access.hasPlan) {
    drafts.push({
      cnTipo: 'sem_plano',
      cnSeveridade: 'warning',
      dsTitulo: 'Sem plano ativo',
      dsMensagem: 'Você ainda não possui um plano. Consulte os planos disponíveis.',
      caChave: 'sem_plano',
    });
  } else if (!access.planActive) {
    drafts.push({
      cnTipo: 'plano_encerrado',
      cnSeveridade: 'warning',
      dsTitulo: 'Plano encerrado',
      dsMensagem: 'Seu plano expirou. Renove para continuar treinando.',
      caChave: `plano_encerrado:${access.idAlunoPlano ?? 0}`,
    });
  }

  if (access.hasPlan && access.idAlunoPlano) {
    const idPendente = await getStatusIdByName(db, 'Pendente');
    if (idPendente !== null) {
      const limite = new Date();
      limite.setDate(limite.getDate() + DIAS_AVISO_VENCIMENTO);

      const proxima = await db.pagamento.findFirst({
        where: {
          idAlunoPlano: access.idAlunoPlano,
          boInativo: false,
          idStatusPagamento: idPendente,
          dtVencimento: { gte: new Date(), lte: limite },
        },
        orderBy: { dtVencimento: 'asc' },
        select: { id: true, dtVencimento: true, vlPrevisto: true },
      });

      if (proxima) {
        const vencimento = proxima.dtVencimento
          ? new Date(proxima.dtVencimento).toLocaleDateString('pt-BR')
          : '';
        drafts.push({
          cnTipo: 'pagamento_vencendo',
          cnSeveridade: 'info',
          dsTitulo: 'Pagamento a vencer',
          dsMensagem: `Sua próxima parcela vence em ${vencimento}.`,
          // A chave carrega o id da parcela: quitada esta, o aviso da proxima e
          // um aviso NOVO, e volta a aparecer como novidade.
          caChave: `pagamento_vencendo:${proxima.id}`,
        });
      }
    }
  }

  return drafts;
}

/**
 * Grava os avisos correntes do aluno e devolve a lista completa dele.
 *
 * Idempotente pelo unique (idAluno, caChave): rodar de novo nao duplica e nao
 * "desmarca como lido" um aviso que o aluno ja viu — o upsert so atualiza o
 * texto, que e o que muda quando a data de vencimento avanca.
 *
 * Avisos que deixaram de valer sao INATIVADOS, nao apagados: o historico de que
 * o aluno foi avisado do atraso continua existindo depois de ele pagar.
 */
export async function syncStudentNotifications(db: PrismaLike, idAluno: number) {
  const drafts = await buildStudentNotifications(db, idAluno);
  const chavesAtuais = new Set(drafts.map((draft) => draft.caChave));

  for (const draft of drafts) {
    await db.notificacao.upsert({
      where: { idAluno_caChave: { idAluno, caChave: draft.caChave } },
      create: { idAluno, ...draft },
      update: {
        cnSeveridade: draft.cnSeveridade,
        dsTitulo: draft.dsTitulo,
        dsMensagem: draft.dsMensagem,
        boInativo: false,
      },
    });
  }

  const existentes = await db.notificacao.findMany({
    where: { idAluno, boInativo: false },
    select: { id: true, caChave: true },
  });

  const obsoletos = existentes
    .filter((item: { caChave: string }) => !chavesAtuais.has(item.caChave))
    .map((item: { id: number }) => item.id);

  if (obsoletos.length > 0) {
    await db.notificacao.updateMany({
      where: { id: { in: obsoletos } },
      data: { boInativo: true },
    });
  }

  return db.notificacao.findMany({
    where: { idAluno, boInativo: false },
    orderBy: [{ dtLeitura: 'asc' }, { dtCadastro: 'desc' }],
  });
}

/**
 * Assunto e corpo do email de um aviso.
 *
 * Texto puro, sem HTML: e uma linha de aviso, nao uma newsletter — e email
 * simples nao cai em filtro de promocao com a mesma facilidade.
 */
export function buildNotificationEmail(params: {
  nomeAluno: string;
  titulo: string;
  mensagem: string;
  nomeAcademia: string;
}) {
  return {
    subject: `${params.nomeAcademia}: ${params.titulo}`,
    text: [
      `Olá, ${params.nomeAluno.split(' ')[0] ?? params.nomeAluno}.`,
      '',
      params.mensagem,
      '',
      `— ${params.nomeAcademia}`,
    ].join('\n'),
  };
}
