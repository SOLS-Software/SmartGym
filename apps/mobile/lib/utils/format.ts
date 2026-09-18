// Helpers de formatação/validação das telas do app.
//
// Isto era a QUARTA cópia de onlyDigits/formatCpf/isValidCpf/formatPhone/
// isImageFile e a QUINTA implementação das regras de senha. O pacote
// @solsfit/shared existe justamente para isso, já é dependência do mobile e já
// funciona aqui (lib/components/ExerciseDetailModal.tsx importa dele) — a cópia
// não tinha impedimento técnico, só inércia.
//
// E a duplicação já tinha começado a divergir: a mensagem de senha daqui usava
// "não pode conter espaços" (com acento) e a do servidor "nao pode conter
// espacos". Mesma regra, dois textos — que é como uma regra sai de sincronia
// antes de sair de verdade.
//
// O re-export mantém os ~10 imports das telas intactos.
export {
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhone,
  // A regra de nome e a mensagem de erro dela vinham duplicadas aqui e no
  // web/studentValidation.ts. Mesmo caminho que formatPhone e as regras de
  // senha percorreram antes de divergir — agora nascem no pacote.
  getStudentNameError,
  isImageFile,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  isValidPersonName,
  normalizePersonName,
  onlyDigits,
} from '@solsfit/shared';

import { erroDaSenha } from '@solsfit/shared';

export { LIMITES, REGRAS_SENHA, SENHA_MAX, SENHA_MIN } from '@solsfit/shared';

/**
 * Mensagem da primeira regra de senha violada, ou '' quando a senha serve.
 *
 * Continua devolvendo string vazia (e não `null`) porque os chamadores fazem
 * `if (mensagem)`; a regra em si vem de `erroDaSenha`, a mesma que a API usa em
 * normalizeRegisterPassword e que as telas de senha do web usam.
 */
export function getPasswordValidationMessage(password: string) {
  return erroDaSenha(password) ?? '';
}

// Datas — string-split, sem shift de timezone (espelha o web registrationHelpers).
export function formatDateDisplay(value: string | null | undefined) {
  if (!value) return '-';
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return '-';
  return `${day}/${month}/${year}`;
}

export function formatDateTimeDisplay(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const datePart = date.toLocaleDateString('pt-BR');
  const timePart = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}
