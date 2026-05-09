import { onlyDigits } from '../../shared/registration/registrationHelpers';
import type { CompanyChildRecord } from '../../shared/registration/registrationTypes';

export function getSelectedRecord(records: CompanyChildRecord[], selectedId: number | null) {
  return selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
}

export function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);

  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
    return false;
  }

  const calculateDigit = (size: number) => {
    const weights =
      size === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;

    for (let index = 0; index < size; index += 1) {
      sum += Number(cnpj[index]) * Number(weights[index]);
    }

    const rest = sum % 11;

    return rest < 2 ? 0 : 11 - rest;
  };

  return calculateDigit(12) === Number(cnpj[12]) && calculateDigit(13) === Number(cnpj[13]);
}
