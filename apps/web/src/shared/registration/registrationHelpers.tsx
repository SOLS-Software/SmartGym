import type {
  CompanyChildColumn,
  CompanyChildField,
  CompanyChildRecord,
  GridPaginationProps,
  LookupRecord,
} from './registrationTypes';

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
    <div className="grid-pagination" aria-label="Paginação da tabela">
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
          Página {page} de {totalPages}
        </span>
        <button
          className="secondary-button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          type="button"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

// Telefone completo num campo so.
//
// DDD e numero eram dois inputs separados, com validacao cruzada entre eles
// ("Informe o DDD do contato" / "Informe o contato") — regras que so existiam
// porque a divisao permite um estado invalido no meio do preenchimento. Para
// quem digita e um dado unico. O banco continua com nrDDD e nrContato
// separados; splitDddPhone faz a separacao na hora de salvar.
export function formatDddPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const formattedRest = rest.length <= 8
    ? rest.replace(/^(\d{4})(\d)/, '$1-$2')
    : rest.replace(/^(\d{5})(\d)/, '$1-$2');

  return `(${ddd}) ${formattedRest}`;
}

export function splitDddPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return { ddd: digits.slice(0, 2), phone: digits.slice(2) };
}

// Monta o valor do campo a partir das duas colunas do banco.
export function joinDddPhone(ddd: number | string | null | undefined, phone: number | string | null | undefined) {
  const dddDigits = String(ddd ?? '').replace(/\D/g, '');
  const phoneDigits = String(phone ?? '').replace(/\D/g, '');
  if (!dddDigits && !phoneDigits) return '';
  return formatDddPhone(`${dddDigits}${phoneDigits}`);
}

export function formatDateInput(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

export function getDefaultActivityDateRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const toInputValue = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { dateFrom: toInputValue(start), dateTo: toInputValue(end) };
}

export function formatDateDisplay(value: string | null) {
  const inputDate = formatDateInput(value);

  if (!inputDate) {
    return '';
  }

  const [year, month, day] = inputDate.split('-');

  return `${day}/${month}/${year}`;
}

export function formatDateTimeDisplay(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateDisplay(value);
  const datePart = date.toLocaleDateString('pt-BR');
  const timePart = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Indice de lookup por id.
//
// `formatChildCell` e `formatChildSearchValue` sao chamados uma vez POR CELULA e
// faziam `lookupOptions.find(o => String(o.id) === String(value))` — busca
// linear com duas alocacoes de string por comparacao. Numa grade de 20 linhas x
// 5 colunas de lookup sobre uma lista de 1000 opcoes (o limite default da API),
// isso e 100 mil comparacoes por render, refeitas a cada tecla digitada na
// busca.
//
// O indice fica em WeakMap chaveado pelo PROPRIO array: como as listas de
// lookup vem do state e mantem identidade referencial entre renders, o indice e
// construido uma vez (O(m)) e reaproveitado; quando o array e substituido, o
// antigo e coletado junto com seu indice. Nenhum chamador precisou mudar.
const lookupIndexCache = new WeakMap<LookupRecord[], Map<string, LookupRecord>>();

export function findLookupOption(
  lookupOptions: LookupRecord[] | undefined,
  value: unknown,
): LookupRecord | undefined {
  if (!lookupOptions || lookupOptions.length === 0) return undefined;
  if (value === null || value === undefined || value === '') return undefined;

  let index = lookupIndexCache.get(lookupOptions);
  if (!index) {
    index = new Map<string, LookupRecord>();
    for (const option of lookupOptions) {
      const key = String(option.id);
      // Primeira ocorrencia vence, igual ao comportamento de Array.find.
      if (!index.has(key)) index.set(key, option);
    }
    lookupIndexCache.set(lookupOptions, index);
  }

  return index.get(String(value));
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

  // Charge status: shows the payment status name, but flags overdue pending
  // charges (dtVencimento < today AND status "Pendente") as "Inadimplente".
  if (column.type === 'payment-status') {
    const option = findLookupOption(lookupOptions, value);
    const statusName = option ? getLookupDescription(option, column.lookupLabelKey) : String(value ?? '');
    const isPending = statusName.trim().toLowerCase() === 'pendente';
    const dueValue = record.dtVencimento;
    let isOverdue = false;
    if (isPending && dueValue) {
      const due = formatDateInput(String(dueValue));
      const today = new Date();
      const todayInput = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      isOverdue = Boolean(due) && due < todayInput;
    }

    if (isOverdue) {
      return <span className="status-badge inactive">Inadimplente</span>;
    }

    if (value === null || value === undefined || value === '') {
      return '-';
    }

    return <span className={`status-badge ${isPending ? '' : 'active'}`}>{statusName || '-'}</span>;
  }

  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (column.lookupLabelKey) {
    const option = findLookupOption(lookupOptions, value);
    return option ? getLookupDescription(option, column.lookupLabelKey) : String(value);
  }

  if (column.type === 'date') {
    return formatDateDisplay(String(value));
  }

  if (column.type === 'datetime') {
    return formatDateTimeDisplay(String(value));
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
    const option = findLookupOption(lookupOptions, value);
    return option
      ? `${option.id} ${getLookupDescription(option, column.lookupLabelKey)}`.toLowerCase()
      : String(value).toLowerCase();
  }

  if (column.type === 'date') {
    return `${formatDateInput(String(value))} ${formatDateDisplay(String(value))}`.toLowerCase();
  }

  if (column.type === 'datetime') {
    return formatDateTimeDisplay(String(value)).toLowerCase();
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

// onlyDigits/formatCpf/formatCep/isValidCpf/isImageFile viviam duplicados aqui
// e em apps/mobile/lib/utils/format.ts. Passaram para @smartgym/shared e sao
// reexportados para nao mexer nos ~30 imports das telas.
export {
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhone,
  isImageFile,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from '@smartgym/shared';

