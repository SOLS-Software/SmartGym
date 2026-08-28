// formatPhone era a 3a de quatro copias identicas. Vem de @smartgym/shared.
import { formatPhone, isValidPersonName, normalizePersonName } from '@smartgym/shared';

export { formatPhone, normalizePersonName };

// Mesma regra que o servidor aplica em normalizeStudentPayload, vinda do mesmo
// modulo compartilhado: aqui o objetivo e mostrar o erro no campo em vez de
// deixar a pessoa preencher o formulario inteiro para receber um 400.
export function getStudentNameError(value: string): string | undefined {
  const name = normalizePersonName(value);

  if (!name) {
    return 'Informe o nome do aluno.';
  }

  if (name.length < 2) {
    return 'O nome deve ter ao menos 2 caracteres.';
  }

  if (!isValidPersonName(name)) {
    return 'O nome aceita apenas letras, espaços, apóstrofos, hífens e pontos.';
  }

  return undefined;
}

export function toApiDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return null;
}

export function isValidBirthDate(value: string) {
  const apiDate = toApiDate(value);

  if (!apiDate) {
    return false;
  }

  const [yearValue, monthValue, dayValue] = apiDate.split('-');
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= new Date(new Date().setHours(0, 0, 0, 0))
  );
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
