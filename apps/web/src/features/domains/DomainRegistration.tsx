'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { GRID_PAGE_SIZE, GridPagination, paginateItems } from '../../shared/registration/registrationHelpers';
import type { DomainConfigMap, DomainRecord } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

const domainItems = [
  'Cargo',
  'Tema',
  'Frequencia',
  'Nivel',
  'UnidadeTempo',
  'StatusPagamento',
  'FormaPagamento',
  'MetodoTreino',
  'TipoArquivo',
];

const domainConfig: DomainConfigMap = {
  Cargo: { endpoint: 'roles', field: 'dsCargo', label: 'Cargo', saveLabel: 'Salvar cargo' },
  Frequencia: { endpoint: 'frequencies', field: 'dsFrequencia', label: 'Frequência', saveLabel: 'Salvar frequência' },
  Nivel: { endpoint: 'levels', field: 'dsNivel', label: 'Nível', saveLabel: 'Salvar nível' },
  UnidadeTempo: { endpoint: 'time-units', field: 'dsUnidadeTempo', label: 'Unidade de tempo', saveLabel: 'Salvar unidade' },
  StatusPagamento: { endpoint: 'payment-statuses', field: 'dsStatusPagamento', label: 'Status de pagamento', saveLabel: 'Salvar status' },
  FormaPagamento: { endpoint: 'payment-methods', field: 'dsFormaPagamento', label: 'Forma de pagamento', saveLabel: 'Salvar forma' },
  MetodoTreino: {
    endpoint: 'training-methods',
    field: 'nmMetodoTreino',
    label: 'Método de treino',
    saveLabel: 'Salvar método',
    secondField: 'dsMetodoTreino',
    secondFieldLabel: 'Descrição',
  },
  TipoArquivo: { endpoint: 'file-types', field: 'dsTipo', label: 'Tipo de arquivo', saveLabel: 'Salvar tipo' },
};

export function DomainRegistration() {
  const [selectedDomain, setSelectedDomain] = useState(domainItems[0]);
  const [records, setRecords] = useState<DomainRecord[]>([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const config = domainConfig[selectedDomain as keyof typeof domainConfig];
  const isFormEnabled = Boolean(config) && (selectedRecordId !== null || isCreating);
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
        throw new Error('Não foi possível carregar o domínio.');
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
            boInativo: Number(item.boInativo ?? 0),
          };
        }),
      );
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar domínio.');
    }
  }

  useEffect(() => {
    if (config) void loadRecords();
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
    setIsActive(false);
  }

  function handleNew() {
    setSelectedRecordId(null);
    setIsCreating(true);
    setName('');
    setDescription('');
    setIsActive(true);
    setFeedback('');
  }

  function handleSelect(record: DomainRecord) {
    setSelectedRecordId(record.id);
    setIsCreating(false);
    setName(record.name);
    setDescription(record.description ?? '');
    setIsActive(record.boInativo === 0);
    setFeedback('');
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
        throw new Error('Não foi possível alterar o status.');
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
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Domínios</p>
        <h2>Cadastro de Domínios</h2>
        <p>Tabelas de apoio para tipos e configurações gerais do sistema.</p>
      </div>

      {config ? (
        <section className="domain-workspace">
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
                    className={`domain-select-row selectable ${item === selectedDomain ? 'selected' : ''
                      }`}
                    key={item}
                    onClick={() => setSelectedDomain(item)}
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
                <div className="product-row domain-records-row header" role="row">
                  <span role="columnheader">{config.label}</span>
                  <span role="columnheader">Status</span>
                </div>

                {paginatedRecords.map((record) => (
                  <button
                    className={`product-row domain-records-row selectable ${record.id === selectedRecordId ? 'selected' : ''
                      }`}
                    key={record.id}
                    onClick={() => handleSelect(record)}
                    role="row"
                    type="button"
                  >
                    <span role="cell">{record.name}</span>
                    <span role="cell">
                      <span className={`status-badge ${record.boInativo === 0 ? 'active' : 'inactive'}`}>
                        {record.boInativo === 0 ? 'Ativo' : 'Inativo'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <GridPagination
                onChange={setRecordsPage}
                page={recordsPage}
                totalItems={filteredRecords.length}
              />
            </section>
          </div>

          <form className="registration-form domain-panel domain-form-panel" onSubmit={handleSave}>
            {!isFormEnabled ? (
              <div className="form-hint">Selecione um item acima ou clique em Novo.</div>
            ) : null}
            {feedback ? <div className="form-feedback">{feedback}</div> : null}

            <div className="field">
              <label htmlFor="domainName">{config.label}</label>
              <input
                disabled={!isFormEnabled}
                id="domainName"
                maxLength={255}
                onChange={(event) => setName(event.target.value)}
                placeholder="Digite aqui"
                type="text"
                value={name}
              />
            </div>
            {config.secondField ? (
              <div className="field">
                <label htmlFor="domainDescription">{config.secondFieldLabel}</label>
                <input
                  disabled={!isFormEnabled}
                  id="domainDescription"
                  maxLength={255}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Digite aqui"
                  type="text"
                  value={description}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="domainStatus">Status</label>
              <button
                aria-pressed={isActive}
                className={`status-toggle ${isActive ? 'active' : ''}`}
                disabled={!isFormEnabled}
                id="domainStatus"
                onClick={handleToggleStatus}
                type="button"
              >
                <span>{isActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </div>

            <div className="form-actions">
              <button
                className="secondary-button"
                disabled={!isFormEnabled}
                onClick={clearForm}
                type="button"
              >
                Limpar
              </button>
              <button disabled={!isFormEnabled} type="submit">
                {config.saveLabel}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="registration-form">
          <div className="form-hint">
            Domínio selecionado: <strong>{selectedDomain}</strong>
          </div>
        </section>
      )}
    </div>
  );
}

