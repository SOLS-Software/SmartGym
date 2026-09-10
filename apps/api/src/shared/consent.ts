// Gate de consentimento LGPD (art. 8 e art. 11). Operações que dependem de
// consentimento específico — biometria facial (dado sensível) e push — passam a
// ser negadas para quem não tem o consentimento vigente.
//
// KILL-SWITCH: `CONSENT_ENFORCEMENT=false` desliga o gate. A decisão de negócio é
// manter LIGADO (default). O switch existia para a janela sem tela de captura —
// essa janela FECHOU: a captura agora existe no app do aluno
// (app/(aluno)/consentimentos.tsx) e na ficha da equipe
// (StudentConsentPanel.tsx). Em produção, remover qualquer `CONSENT_ENFORCEMENT=false`
// que tenha sido setado durante a janela — atentando que alunos sem consentimento
// passam a ter biometria/push bloqueados até consentirem (comportamento LGPD correto).

export function consentEnforcementEnabled(): boolean {
  return process.env.CONSENT_ENFORCEMENT !== 'false';
}

type ConsentDelegate = {
  findFirst: (args: {
    where: { idAluno: number; cnFinalidade: string };
    orderBy: { dtRegistro: 'desc' };
    select: { boConcedido: true };
  }) => Promise<{ boConcedido: boolean } | null>;
};
type ConsentDb = { consentimento: ConsentDelegate };

// Estado atual = o registro mais recente daquela finalidade (a tabela e
// append-only; a ultima palavra vence).
export async function hasActiveConsent(
  db: ConsentDb,
  idAluno: number,
  finalidade: string,
): Promise<boolean> {
  const ultimo = await db.consentimento.findFirst({
    where: { idAluno, cnFinalidade: finalidade },
    orderBy: { dtRegistro: 'desc' },
    select: { boConcedido: true },
  });
  return ultimo?.boConcedido === true;
}

// Lança se o gate está ligado e não há consentimento vigente. No-op quando o
// kill-switch está desligado.
export async function assertConsent(
  db: ConsentDb,
  idAluno: number,
  finalidade: string,
  mensagem: string,
): Promise<void> {
  if (!consentEnforcementEnabled()) return;
  if (!(await hasActiveConsent(db, idAluno, finalidade))) {
    throw new Error(mensagem);
  }
}
