'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import {
  GRID_PAGE_SIZE,
  GridPagination,
  formatChildCell,
  formatDateInput,
  getLookupLabel,
  paginateItems,
} from '../../shared/registration/registrationHelpers';
import type {
  CompanyChildColumn,
  CompanyChildField,
  DomainConfig,
  DomainConfigMap,
  DomainRecord,
  LookupRecord,
} from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';

const domainItems = [
  'Cargo',
  'Frequencia',
  'Nivel',
  'Unidade de Tempo',
  'Status de Pagamento',
  'Forma de Pagamento',
  'Metodo de Treino',
  'Tipo de Arquivo',
  'Esporte',
  'Categoria',
  'Area Corporal',
  'Tipo de Check-In',
];

const domainConfig: DomainConfigMap = {
  Cargo: { endpoint: 'roles', field: 'dsCargo', label: 'Cargo', saveLabel: 'Salvar cargo' },
  Frequencia: {
    endpoint: 'frequencies',
    field: 'dsFrequencia',
    label: 'Frequência',
    saveLabel: 'Salvar frequência',
    fields: [
      { key: 'qtPeriodo', label: 'Período', type: 'number', required: true },
      {
        key: 'idUnidadeTempo',
        label: 'Unidade de tempo',
        type: 'number',
        required: true,
        lookupEndpoint: 'time-units',
        lookupLabelKey: 'dsUnidadeTempo',
      },
    ],
  },
  Nivel: { endpoint: 'levels', field: 'dsNivel', label: 'Nível', saveLabel: 'Salvar nível' },
  "Unidade de Tempo": { endpoint: 'time-units', field: 'dsUnidadeTempo', label: 'Unidade de tempo', saveLabel: 'Salvar unidade' },
  "Status de Pagamento": { endpoint: 'payment-statuses', field: 'dsStatusPagamento', label: 'Status de pagamento', saveLabel: 'Salvar status' },
  "Forma de Pagamento": { endpoint: 'payment-methods', field: 'dsFormaPagamento', label: 'Forma de pagamento', saveLabel: 'Salvar forma' },
  "Metodo de Treino": {
    endpoint: 'training-methods',
    field: 'nmMetodoTreino',
    label: 'Método de treino',
    saveLabel: 'Salvar método',
    fields: [{ key: 'dsMetodoTreino', label: 'Descrição', type: 'text' }],
  },
  "Tipo de Arquivo": { endpoint: 'file-types', field: 'dsTipo', label: 'Tipo de arquivo', saveLabel: 'Salvar tipo' },
  Esporte: { endpoint: 'sports', field: 'dsEsporte', label: 'Esporte', saveLabel: 'Salvar esporte' },
  Categoria: {
    endpoint: 'categories',
    field: 'dsCategoria',
    label: 'Categoria',
    saveLabel: 'Salvar categoria',
    fields: [
      {
        key: 'idEsporte',
        label: 'Esporte',
        type: 'number',
        lookupEndpoint: 'sports',
        lookupLabelKey: 'dsEsporte',
      },
    ],
  },
  "Area Corporal": { endpoint: 'body-areas', field: 'dsAreaCorporal', label: 'Área corporal', saveLabel: 'Salvar área' },
  "Tipo de Check-In": { endpoint: 'check-in-types', field: 'dsTipoCheckIn', label: 'Tipo de check-in', saveLabel: 'Salvar tipo' },
};

/** Column shown in the grid for an extra field (name column is handled apart). */
function fieldToColumn(field: CompanyChildField): CompanyChildColumn {
  return {
    key: field.key,
    label: field.label,
    type: field.type === 'date' ? 'date' : undefined,
    lookupLabelKey: field.lookupLabelKey,
  };
}

function mapDomainRecord(item: Record<string, unknown>, config: DomainConfig): DomainRecord {
  return {
    id: Number(item.id),
    name: String(item[config.field] ?? ''),
    boInativo: Boolean(item.boInativo),
    values: item,
  };
}

export function DomainRegistration() {
  const [selectedDomain, setSelectedDomain] = useState(domainItems[0]);
  const [records, setRecords] = useState<DomainRecord[]>([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [lookups, setLookups] = useState<Record<string, LookupRecord[]>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const config = domainConfig[selectedDomain as keyof typeof domainConfig];
  const extraFields = config?.fields ?? [];
  const extraColumns = extraFields.map(fieldToColumn);
  const filteredRecords = records.filter((record) =>
    record.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const recordsTotalPages = Math.max(1, Math.ceil(filteredRecords.length / GRID_PAGE_SIZE));
  const paginatedRecords = paginateItems(filteredRecords, recordsPage);
  const gridTemplateColumns = `1fr ${extraColumns.map(() => '1fr').join(' ')} auto 2.75rem`.replace('  ', ' ');

  async function loadRecords() {
    if (!config) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/${config.endpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar o domínio.');
      }

      const data = (await response.json()) as Array<Record<string, unknown>>;
      setRecords(data.map((item) => mapDomainRecord(item, config)));
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar domínio.');
    }
  }

  async function loadLookups() {
    const lookupFields = extraFields.filter((field) => field.lookupEndpoint);

    if (lookupFields.length === 0) {
      setLookups({});
      return;
    }

    try {
      const nextLookups: Record<string, LookupRecord[]> = {};
      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) return;
          const response = await fetch(`${apiUrl}/${field.lookupEndpoint}`);
          if (!response.ok) {
            await getApiError(response, `Não foi possível carregar ${field.label}.`);
          }
          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );
      setLookups(nextLookups);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar opções.');
    }
  }

  useEffect(() => {
    if (config) {
      void loadRecords();
      void loadLookups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain]);

  useEffect(() => {
    setRecordsPage(1);
  }, [searchTerm, selectedDomain]);

  useEffect(() => {
    if (recordsPage > recordsTotalPages) {
      setRecordsPage(recordsTotalPages);
    }
  }, [recordsPage, recordsTotalPages]);

  function clearForm() {
    setSelectedRecordId(null);
    setIsCreating(false);
    setName('');
    setFieldValues({});
    setIsActive(false);
    setIsDrawerOpen(false);
  }

  function handleChangeDomain(domain: string) {
    if (domain === selectedDomain) {
      return;
    }

    clearForm();
    setFeedback('');
    setSelectedDomain(domain);
  }

  function handleNew() {
    setSelectedRecordId(null);
    setIsCreating(true);
    setName('');
    setFieldValues({});
    setIsActive(true);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  function handleSelect(record: DomainRecord) {
    const values = extraFields.reduce<Record<string, string>>((current, field) => {
      const value = record.values[field.key];
      current[field.key] =
        field.type === 'date' ? formatDateInput(String(value ?? '')) : String(value ?? '');
      return current;
    }, {});

    setSelectedRecordId(record.id);
    setIsCreating(false);
    setName(record.name);
    setFieldValues(values);
    setIsActive(record.boInativo === false);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  function handleEditRecord(record: DomainRecord) {
    handleSelect(record);
  }

  async function handleToggleStatus() {
    if (!config || !selectedRecordId) return;

    const nextActive = !isActive;
    setIsActive(nextActive);

    try {
      const response = await fetch(`${apiUrl}/${config.endpoint}/${selectedRecordId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? false : true,
        }),
      });

      if (!response.ok) {
        await getApiError(response, 'Não foi possível alterar o status.');
      }

      const updated = (await response.json()) as Record<string, unknown>;
      const mapped = mapDomainRecord(updated, config);
      setRecords((current) =>
        current.map((record) => (record.id === mapped.id ? mapped : record)),
      );
    } catch (error) {
      setIsActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;

    try {
      const payload: Record<string, unknown> = {
        [config.field]: name,
        boInativo: isActive ? false : true,
      };
      for (const field of extraFields) {
        const value = fieldValues[field.key] ?? '';
        payload[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
      }

      const response = await fetch(
        selectedRecordId
          ? `${apiUrl}/${config.endpoint}/${selectedRecordId}`
          : `${apiUrl}/${config.endpoint}`,
        {
          method: selectedRecordId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Record<string, unknown>;
      const mapped = mapDomainRecord(saved, config);

      setRecords((current) => {
        if (selectedRecordId) {
          return current.map((record) => (record.id === mapped.id ? mapped : record));
        }

        return [...current, mapped].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedRecordId(mapped.id);
      setIsCreating(false);
      setFeedback(`${config.label} salvo com sucesso.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <>
    <header className="module-page-header">
      <p className="section-label">Domínios</p>
      <h2 className="module-page-title">CADASTRO DE DOMÍNIOS</h2>
    </header>
    <div className="form-view company-view">

      {config ? (
        <section className="domain-workspace domain-workspace-two-col">
          <div className="domain-panel">
            <section className="data-grid-section">
              <div className="grid-toolbar">
                <div>
                  <p className="section-label">Domínios</p>
                  <h3>Selecione um domínio</h3>
                </div>
              </div>

              <div className="domain-select-table" role="table" aria-label="Domínios">
                <div className="domain-select-row header" role="row">
                  <span role="columnheader">Nome</span>
                </div>

                {domainItems.map((item) => (
                  <button
                    className={`domain-select-row selectable ${item === selectedDomain ? 'selected' : ''}`}
                    key={item}
                    onClick={() => handleChangeDomain(item)}
                    role="row"
                    type="button"
                  >
                    <span role="cell">{item}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="domain-panel">
            <section className="data-grid-section">
              <div className="grid-toolbar">
                <div>
                  <p className="section-label">{selectedDomain}</p>
                  <h3>Itens cadastrados</h3>
                </div>
                <button className="new-button" onClick={handleNew} type="button">
                  <Plus size={16} />
                  Novo
                </button>
                <label className="search-field">
                  <span>Pesquisar</span>
                  <input
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar item"
                    type="search"
                    value={searchTerm}
                  />
                </label>
              </div>

              <div className="product-table domain-records-table" key={`domain-records-${selectedDomain}-${searchTerm}-${recordsPage}`} role="table" aria-label="Itens cadastrados">
                <div
                  className={`product-row domain-records-row ${extraColumns.length ? 'with-relation' : ''} header`}
                  role="row"
                  style={{ gridTemplateColumns }}
                >
                  <span role="columnheader">{config.label}</span>
                  {extraColumns.map((column) => (
                    <span key={column.key} role="columnheader">{column.label}</span>
                  ))}
                  <span role="columnheader">Status</span>
                  <span role="columnheader"></span>
                </div>

                {paginatedRecords.map((record) => (
                  <div
                    className={`product-row domain-records-row ${extraColumns.length ? 'with-relation' : ''} selectable ${record.id === selectedRecordId ? 'selected' : ''}`}
                    key={record.id}
                    onClick={() => handleEditRecord(record)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleEditRecord(record);
                      }
                    }}
                    role="row"
                    style={{ gridTemplateColumns }}
                    tabIndex={0}
                  >
                    <span role="cell">{record.name}</span>
                    {extraColumns.map((column) => (
                      <span key={column.key} role="cell">
                        {formatChildCell(
                          { id: record.id, boInativo: record.boInativo, ...record.values },
                          column,
                          lookups[column.key] ?? [],
                        )}
                      </span>
                    ))}
                    <span role="cell">
                      <span className={`status-badge ${record.boInativo === false ? 'active' : 'inactive'}`}>
                        {record.boInativo === false ? 'Ativo' : 'Inativo'}
                      </span>
                    </span>
                    <span role="cell" className="grid-row-actions">
                      <button
                        aria-label="Editar"
                        className="grid-edit-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditRecord(record);
                        }}
                        type="button"
                      >
                        <Pencil size={13} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              <GridPagination
                onChange={setRecordsPage}
                page={recordsPage}
                totalItems={filteredRecords.length}
              />
            </section>
          </div>

          <RegistrationDrawer isOpen={isDrawerOpen} title={config ? config.label : 'Domínio'} onClose={() => setIsDrawerOpen(false)}>
            <form className="drawer-fields" onSubmit={handleSave}>
              {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
              <div className="field field-size-full">
                <label htmlFor="domainName">{config?.label ?? 'Nome'}</label>
                <input
                  id="domainName"
                  maxLength={255}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Digite aqui"
                  type="text"
                  value={name}
                />
              </div>
              {extraFields.map((field) => (
                <div className="field field-size-full" key={field.key}>
                  <label htmlFor={`domainField-${field.key}`}>{field.label}</label>
                  {field.lookupEndpoint ? (
                    <select
                      id={`domainField-${field.key}`}
                      onChange={(event) =>
                        setFieldValues((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                      required={field.required}
                      value={fieldValues[field.key] ?? ''}
                    >
                      <option value="">Selecione</option>
                      {(lookups[field.key] ?? []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {getLookupLabel(option, field)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`domainField-${field.key}`}
                      maxLength={field.type === 'text' ? 255 : undefined}
                      onChange={(event) =>
                        setFieldValues((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                      placeholder="Digite aqui"
                      required={field.required}
                      type={field.type}
                      value={fieldValues[field.key] ?? ''}
                    />
                  )}
                </div>
              ))}
              <div className="field field-size-sm">
                <label htmlFor="domainStatus">Status</label>
                <button
                  aria-pressed={isActive}
                  className={`status-toggle ${isActive ? 'active' : ''}`}
                  id="domainStatus"
                  onClick={handleToggleStatus}
                  type="button"
                >
                  <span>{isActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </div>
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
                <button type="submit"><Save size={16} />{config?.saveLabel ?? 'Salvar'}</button>
              </div>
            </form>
          </RegistrationDrawer>
        </section>
      ) : null}
    </div>
    </>
  );
}
