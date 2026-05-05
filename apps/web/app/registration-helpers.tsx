import type {
  CompanyChildColumn,
  CompanyChildField,
  CompanyChildRecord,
  GridPaginationProps,
  LookupRecord,
} from './registration-types';

export const GRID_PAGE_SIZE = 20;

export function paginateItems<T>(items: T[], page: number, pageSize = GRID_PAGE_SIZE) {
  const safePage = page < 1 ? 1 : page;
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function GridPagination({
  page,
  totalItems,
  onChange,
  pageSize = GRID_PAGE_SIZE,
}: GridPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="grid-pagination" aria-label="Paginacao da tabela">
      <p>
        {start}-{end} de {totalItems}
      </p>
      <div>
        <button
          className="secondary-button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          type="button"
        >
          Anterior
        </button>
        <span>
          Pagina {page} de {totalPages}
        </span>
        <button
          className="secondary-button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          type="button"
        >
          Proxima
        </button>
      </div>
    </div>
  );
}

export function formatDateInput(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

export function formatDateDisplay(value: string | null) {
  const inputDate = formatDateInput(value);

  if (!inputDate) {
    return '';
  }

  const [year, month, day] = inputDate.split('-');

  return `${day}/${month}/${year}`;
}

function getLookupValue(option: LookupRecord, lookupLabelKey?: string) {
  if (!lookupLabelKey) {
    return undefined;
  }

  return lookupLabelKey.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, option);
}

function getLookupDescription(option: LookupRecord, lookupLabelKey?: string) {
  const labelValue = getLookupValue(option, lookupLabelKey);

  if (labelValue === undefined || labelValue === null || labelValue === '') {
    return String(option.id);
  }

  return String(labelValue);
}

export function formatChildCell(
  record: CompanyChildRecord,
  column: CompanyChildColumn,
  lookupOptions: LookupRecord[] = [],
) {
  const value = record[column.key];

  if (column.type === 'status') {
    const isActive = Number(value ?? 0) === 0;

    return (
      <span className={`status-badge ${isActive ? 'active' : 'inactive'}`}>
        {isActive ? 'Ativo' : 'Inativo'}
      </span>
    );
  }

  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (column.lookupLabelKey) {
    const option = lookupOptions.find((lookupOption) => String(lookupOption.id) === String(value));
    return option ? getLookupDescription(option, column.lookupLabelKey) : String(value);
  }

  if (column.type === 'date') {
    return formatDateDisplay(String(value));
  }

  if (column.type === 'money') {
    return Number(value).toLocaleString('pt-BR', {
      currency: 'BRL',
      style: 'currency',
    });
  }

  return String(value);
}

export function formatChildSearchValue(
  record: CompanyChildRecord,
  column: CompanyChildColumn,
  lookupOptions: LookupRecord[] = [],
) {
  const value = record[column.key];

  if (column.type === 'status') {
    return Number(value ?? 0) === 0 ? 'ativo' : 'inativo';
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (column.lookupLabelKey) {
    const option = lookupOptions.find((lookupOption) => String(lookupOption.id) === String(value));
    return option
      ? `${option.id} ${getLookupDescription(option, column.lookupLabelKey)}`.toLowerCase()
      : String(value).toLowerCase();
  }

  if (column.type === 'date') {
    return `${formatDateInput(String(value))} ${formatDateDisplay(String(value))}`.toLowerCase();
  }

  return String(value).toLowerCase();
}

export function getLookupLabel(option: LookupRecord, field: CompanyChildField) {
  const labelValue = getLookupValue(option, field.lookupLabelKey);

  if (labelValue === undefined || labelValue === null || labelValue === '') {
    return String(option.id);
  }

  if (String(labelValue) === String(option.id)) {
    return String(option.id);
  }

  return `${option.id} - ${String(labelValue)}`;
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (size: number) => {
    let sum = 0;

    for (let index = 0; index < size; index += 1) {
      sum += Number(cpf[index]) * (size + 1 - index);
    }

    const rest = (sum * 10) % 11;

    return rest === 10 ? 0 : rest;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function isImageFile(path: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
}
