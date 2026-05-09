import { onlyDigits } from '../../shared/registration/registrationHelpers';

export function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 9);

  if (digits.length <= 8) {
    return digits.replace(/^(\d{4})(\d)/, '$1-$2');
  }

  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
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
