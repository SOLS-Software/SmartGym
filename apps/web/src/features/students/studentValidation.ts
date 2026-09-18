// formatPhone era a 3a de quatro copias identicas. Vem de @solsfit/shared.
// A regra de nome e a mensagem dela chegaram em duas copias identicas — esta e
// a do mobile (lib/utils/format.ts). Passaram para @solsfit/shared, que ja e a
// casa de isValidCpf e das regras de senha: uma edicao muda o texto nas duas
// telas e no servidor.
export { formatPhone, getStudentNameError, normalizePersonName } from '@solsfit/shared';

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
