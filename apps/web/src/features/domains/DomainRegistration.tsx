'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, GridPagination, paginateItems } from '../../shared/registration/registrationHelpers';
import type { DomainConfigMap, DomainRecord } from '../../shared/registration/registrationTypes';
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
];

const domainConfig: DomainConfigMap = {
  Cargo: { endpoint: 'roles', field: 'dsCargo', label: 'Cargo', saveLabel: 'Salvar cargo' },
  Frequencia: { endpoint: 'frequencies', field: 'dsFrequencia', label: 'Frequência', saveLabel: 'Salvar frequência' },
  Nivel: { endpoint: 'levels', field: 'dsNivel', label: 'Nível', saveLabel: 'Salvar nível' },
  "Unidade de Tempo": { endpoint: 'time-units', field: 'dsUnidadeTempo', label: 'Unidade de tempo', saveLabel: 'Salvar unidade' },
  "Status de Pagamento": { endpoint: 'payment-statuses', field: 'dsStatusPagamento', label: 'Status de pagamento', saveLabel: 'Salvar status' },
  "Forma de Pagamento": { endpoint: 'payment-methods', field: 'dsFormaPagamento', label: 'Forma de pagamento', saveLabel: 'Salvar forma' },
  "Metodo de Treino": {
    endpoint: 'training-methods',
    field: 'nmMetodoTreino',
    label: 'Método de treino',
    saveLabel: 'Salvar método',
    secondField: 'dsMetodoTreino',
    secondFieldLabel: 'Descrição',
  },
  "Tipo de Arquivo": { endpoint: 'file-types', field: 'dsTipo', label: 'Tipo de arquivo', saveLabel: 'Salvar tipo' },
  Esporte: { endpoint: 'sports', field: 'dsEsporte', label: 'Esporte', saveLabel: 'Salvar esporte' },
  Categoria: {
    endpoint: 'categories',
    field: 'dsCategoria',
    label: 'Categoria',
    saveLabel: 'Salvar categoria',
    relationField: 'idEsporte',
    relationLabel: 'Esporte',
    relationEndpoint: 'sports',
    relationValueField: 'dsEsporte',
  },
  "Area Corporal": { endpoint: 'body-areas', field: 'dsAreaCorporal', label: 'Área corporal', saveLabel: 'Salvar área' },
};

export function DomainRegistration() {
  const [selectedDomain, setSelectedDomain] = useState(domainItems[0]);
  const [records, setRecords] = useState<DomainRecord[]>([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [relationOptions, setRelationOptions] = useState<DomainRecord[]>([]);
  const [selectedRelationId, setSelectedRelationId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const config = domainConfig[selectedDomain as keyof typeof domainConfig];
  const filteredRecords = records.filter((record) =>
    record.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const recordsTotalPages = Math.max(1, Math.ceil(filteredRecords.length / GRID_PAGE_SIZE));
  const paginatedRecords = paginateItems(filteredRecords, recordsPage);

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
      setRecords(
        data.map((item) => {
          const secondField = config.secondField;
          const description =
            secondField && item[secondField] ? String(item[secondField]) : '';

          return {
            id: Number(item.id),
            name: String(item[config.field] ?? ''),
            description,
            relationId: config.relationField ? Number(item[config.relationField] ?? 0) || null : null,
            relationName:
              config.relationField && typeof item.esporte === 'object' && item.esporte !== null
                ? String((item.esporte as Record<string, unknown>).dsEsporte ?? '')
                : '',
            boInativo: Number(item.boInativo ?? 0),
          };
        }),
      );
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar domínio.');
    }
  }

  async function loadRelationOptions() {
    if (!config?.relationEndpoint || !config.relationValueField) {
      setRelationOptions([]);
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/${config.relationEndpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar as opcoes.');
      }

      const data = (await response.json()) as Array<Record<string, unknown>>;
      setRelationOptions(
        data.map((item) => ({
          id: Number(item.id),
          name: String(item[config.relationValueField ?? ''] ?? ''),
          boInativo: Number(item.boInativo ?? 0),
        })),
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar opcoes.');
    }
  }

  useEffect(() => {
    if (config) {
      void loadRecords();
      void loadRelationOptions();
    }
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
    setDescription('');
    setSelectedRelationId('');
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
    setDescription('');
    setSelectedRelationId('');
    setIsActive(true);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  function handleSelect(record: DomainRecord) {
    setSelectedRecordId(record.id);
    setIsCreating(false);
    setName(record.name);
    setDescription(record.description ?? '');
    setSelectedRelationId(record.relationId ? String(record.relationId) : '');
    setIsActive(record.boInativo === 0);
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
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        await getApiError(response, 'Não foi possível alterar o status.');
      }

      const updated = (await response.json()) as Record<string, unknown>;
      setRecords((current) =>
        current.map((record) => {
          const secondField = config.secondField;
          const updatedDescription =
            secondField && updated[secondField] ? String(updated[secondField]) : '';

          return record.id === Number(updated.id)
            ? {
              id: Number(updated.id),
              name: String(updated[config.field] ?? ''),
              description: updatedDescription,
              relationId: config.relationField ? Number(updated[config.relationField] ?? 0) || null : null,
              relationName:
                config.relationField && typeof updated.esporte === 'object' && updated.esporte !== null
                  ? String((updated.esporte as Record<string, unknown>).dsEsporte ?? '')
                  : '',
              boInativo: Number(updated.boInativo ?? 0),
            }
            : record;
        }),
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
        boInativo: isActive ? 0 : 1,
      };
      if (config.secondField) payload[config.secondField] = description;
      if (config.relationField) {
        payload[config.relationField] = selectedRelationId ? Number(selectedRelationId) : null;
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
      const secondField = config.secondField;
      const mapped: DomainRecord = {
        id: Number(saved.id),
        name: String(saved[config.field] ?? ''),
        description: secondField && saved[secondField] ? String(saved[secondField]) : '',
        relationId: config.relationField ? Number(saved[config.relationField] ?? 0) || null : null,
        relationName:
          config.relationField && typeof saved.esporte === 'object' && saved.esporte !== null
            ? String((saved.esporte as Record<string, unknown>).dsEsporte ?? '')
            : '',
        boInativo: Number(saved.boInativo ?? 0),
      };

      setRecords((current) => {
        if (selectedRecordId) {
          return current.map((record) => (record.id === mapped.id ? mapped : record));
        }

        return [...current, mapped].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
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
        <section className="domain-workspace" style={{ gridTemplateColumns: 'minmax(18.75rem, 1.25fr) minmax(26.25rem, 1.45fr)' }}>
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
                  className={`product-row domain-records-row ${config.relationField ? 'with-relation' : ''} header`}
                  role="row"
                  style={{ gridTemplateColumns: config.relationField ? `1fr 1fr auto 2.75rem` : `1fr auto 2.75rem` }}
                >
                  <span role="columnheader">{config.label}</span>
                  {config.relationField ? <span role="columnheader">{config.relationLabel}</span> : null}
                  <span role="columnheader">Status</span>
                  <span role="columnheader"></span>
                </div>

                {paginatedRecords.map((record) => (
                  <div
                    className={`product-row domain-records-row ${config.relationField ? 'with-relation' : ''} selectable ${record.id === selectedRecordId ? 'selected' : ''}`}
                    key={record.id}
                    onClick={() => handleEditRecord(record)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleEditRecord(record);
                      }
                    }}
                    role="row"
                    style={{ gridTemplateColumns: config.relationField ? `1fr 1fr auto 2.75rem` : `1fr auto 2.75rem` }}
                    tabIndex={0}
                  >
                    <span role="cell">{record.name}</span>
                    {config.relationField ? <span role="cell">{record.relationName}</span> : null}
                    <span role="cell">
                      <span className={`status-badge ${record.boInativo === 0 ? 'active' : 'inactive'}`}>
                        {record.boInativo === 0 ? 'Ativo' : 'Inativo'}
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
              {config?.secondField ? (
                <div className="field field-size-full">
                  <label htmlFor="domainDescription">{config.secondFieldLabel}</label>
                  <input
                    id="domainDescription"
                    maxLength={255}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Digite aqui"
                    type="text"
                    value={description}
                  />
                </div>
              ) : null}
              {config?.relationField ? (
                <div className="field field-size-full">
                  <label htmlFor="domainRelation">{config.relationLabel}</label>
                  <select
                    id="domainRelation"
                    onChange={(event) => setSelectedRelationId(event.target.value)}
                    value={selectedRelationId}
                  >
                    <option value="">Selecione</option>
                    {relationOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
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
