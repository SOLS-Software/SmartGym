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

// Segunda copia de isValidCnpj (a outra estava na API). Unificada em
// @smartgym/shared e reexportada daqui para os imports existentes seguirem.
export { isValidCnpj } from '@smartgym/shared';

