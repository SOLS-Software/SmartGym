'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { GRID_PAGE_SIZE, GridPagination, formatChildCell, formatChildSearchValue, formatDateInput, getLookupLabel, paginateItems } from './registration-helpers';
import type { CompanyChildColumn, CompanyChildField, CompanyChildRecord, CompanyChildTable, Frequency, LookupRecord, Plan } from './registration-types';
import { apiFetch as fetch, apiUrl } from './api-fetch';

const planRelatedTables: CompanyChildTable[] = [
  {
    key: 'values',
    endpoint: 'values',
    label: 'Valores',
    title: 'Valores do plano',
    columns: [
      { key: 'idEmpresa', label: 'ID empresa' },
      { key: 'vlVenda', label: 'Valor', type: 'money' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'vlVenda', label: 'Valor de venda', type: 'number' },
    ],
  },
  {
    key: 'products',
    endpoint: 'products',
    label: 'Produtos',
    title: 'Produtos do plano',
    columns: [
      { key: 'idEmpresa', label: 'ID empresa' },
      { key: 'idProduto', label: 'ID produto' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idProduto', label: 'Produto', type: 'number', lookupEndpoint: 'products', lookupLabelKey: 'dsProduto' },
    ],
  },
  {
    key: 'companies',
    endpoint: 'companies',
    label: 'Empresas',
    title: 'Empresas do plano',
    columns: [
      { key: 'idEmpresa', label: 'ID empresa' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
    ],
  },
  {
    key: 'activities',
    endpoint: 'activities',
    label: 'Atividades',
    title: 'Atividades do plano',
    columns: [
      { key: 'idEmpresa', label: 'ID empresa' },
      { key: 'idAtividade', label: 'ID atividade' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idAtividade', label: 'Atividade', type: 'number', lookupEndpoint: 'activities', lookupLabelKey: 'dsAtividade' },
    ],
  },
  {
    key: 'promotionPlans',
    endpoint: 'promotion-plans',
    label: 'Promoções',
    title: 'Promoções do plano',
    columns: [
      { key: 'idEmpresa', label: 'ID empresa' },
      { key: 'idPromocao', label: 'ID promoção' },
      { key: 'qtDisponivel', label: 'Qtd disponível' },
      { key: 'dtInicio', label: 'Início', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idPromocao', label: 'Promoção', type: 'number', lookupEndpoint: 'promotions', lookupLabelKey: 'dsPromocao' },
      { key: 'qtDisponivel', label: 'Qtd disponível', type: 'number' },
      { key: 'dtInicio', label: 'Início', type: 'date' },
      { key: 'dtEncerramento', label: 'Encerramento', type: 'date' },
    ],
  },
];

export function PlanRegistration() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansPage, setPlansPage] = useState(1);
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planFrequencyId, setPlanFrequencyId] = useState('');
  const [isPlanActive, setIsPlanActive] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [isPlanFieldsCollapsed, setIsPlanFieldsCollapsed] = useState(false);
  const [selectedPlanRelatedTable, setSelectedPlanRelatedTable] = useState('');
  const [planRelatedRecords, setPlanRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingPlanRelatedRecords, setIsLoadingPlanRelatedRecords] = useState(false);
  const [planRelatedSearchTerm, setPlanRelatedSearchTerm] = useState('');
  const [selectedPlanRelatedRecordId, setSelectedPlanRelatedRecordId] = useState<number | null>(null);
  const [isCreatingPlanRelated, setIsCreatingPlanRelated] = useState(false);
  const [planRelatedFormValues, setPlanRelatedFormValues] = useState<Record<string, string>>({});
  const [isPlanRelatedActive, setIsPlanRelatedActive] = useState(true);
  const [planRelatedFeedback, setPlanRelatedFeedback] = useState('');
  const [planRelatedLookups, setPlanRelatedLookups] = useState<Record<string, LookupRecord[]>>({});
  const [isPlanRelatedFieldsCollapsed, setIsPlanRelatedFieldsCollapsed] = useState(false);
  const isFormEnabled = selectedPlanId !== null || isCreating;
  const isPlanRelatedFormEnabled =
    Boolean(selectedPlanId) && (selectedPlanRelatedRecordId !== null || isCreatingPlanRelated);
  const planRelatedConfig =
    planRelatedTables.find((table) => table.key === selectedPlanRelatedTable) ?? null;
  const filteredPlanRelatedRecords = planRelatedRecords.filter((record) =>
    planRelatedConfig
      ? planRelatedConfig.columns.some((column) =>
        formatChildSearchValue(record, column).includes(planRelatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredPlans = plans.filter((plan) => {
    const search = searchTerm.toLowerCase();
    const frequency = frequencies.find((item) => item.id === plan.idFrequencia);

    return (
      plan.dsPlano.toLowerCase().includes(search) ||
      String(plan.idFrequencia ?? '').includes(searchTerm) ||
      String(frequency?.dsFrequencia ?? '').toLowerCase().includes(search) ||
      (plan.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const plansTotalPages = Math.max(1, Math.ceil(filteredPlans.length / GRID_PAGE_SIZE));
  const paginatedPlans = paginateItems(filteredPlans, plansPage);

  async function loadPlans() {
    try {
      setIsLoadingPlans(true);
      const response = await fetch(`${apiUrl}/plans?includeInactive=true`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar os planos.');
      }

      const data = (await response.json()) as Plan[];
      setPlans(data);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar planos.');
    } finally {
      setIsLoadingPlans(false);
    }
  }

  async function loadFrequencies() {
    try {
      const response = await fetch(`${apiUrl}/frequencies`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar as frequências.');
      }

      setFrequencies((await response.json()) as Frequency[]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar frequências.');
    }
  }

  async function loadPlanRelatedRecords(
    planId = selectedPlanId,
    config = planRelatedConfig,
  ) {
    if (!config || !planId) {
      setPlanRelatedRecords([]);
      setIsLoadingPlanRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingPlanRelatedRecords(true);
      const response = await fetch(`${apiUrl}/plans/${planId}/related/${config.endpoint}`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar os registros relacionados.');
      }

      setPlanRelatedRecords((await response.json()) as CompanyChildRecord[]);
      setPlanRelatedFeedback('');
    } catch (error) {
      setPlanRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.',
      );
      setPlanRelatedRecords([]);
    } finally {
      setIsLoadingPlanRelatedRecords(false);
    }
  }

  useEffect(() => {
    void loadPlans();
    void loadFrequencies();
  }, []);

  useEffect(() => {
    setSelectedPlanRelatedRecordId(null);
    setIsCreatingPlanRelated(false);
    setPlanRelatedFormValues({});
    setIsPlanRelatedActive(true);
    setPlanRelatedSearchTerm('');
    void loadPlanRelatedRecords();
  }, [selectedPlanId, selectedPlanRelatedTable]);

  useEffect(() => {
    async function loadPlanRelatedLookups() {
      if (!planRelatedConfig) {
        return;
      }

      const lookupFields = planRelatedConfig.fields.filter((field) => field.lookupEndpoint);
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) {
            return;
          }

          const response = await fetch(`${apiUrl}/${field.lookupEndpoint}`);

          if (!response.ok) {
            throw new Error(`Não foi possível carregar ${field.label}.`);
          }

          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setPlanRelatedLookups((current) => ({
        ...current,
        ...nextLookups,
      }));
    }

    void loadPlanRelatedLookups().catch((error) => {
      setPlanRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar listas relacionadas.',
      );
    });
  }, [planRelatedConfig]);

  useEffect(() => {
    setPlansPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (plansPage > plansTotalPages) {
      setPlansPage(plansTotalPages);
    }
  }, [plansPage, plansTotalPages]);

  function clearForm() {
    setSelectedPlanId(null);
    setIsCreating(false);
    setPlanName('');
    setPlanFrequencyId('');
    setIsPlanActive(true);
    setFeedback('');
  }

  function handleNewPlan() {
    clearForm();
    setIsCreating(true);
    setIsPlanActive(true);
  }

  function handleSelectPlan(plan: Plan) {
    setSelectedPlanId(plan.id);
    setIsCreating(false);
    setPlanName(plan.dsPlano);
    setPlanFrequencyId(plan.idFrequencia ? String(plan.idFrequencia) : '');
    setIsPlanActive(plan.boInativo === 0);
    setFeedback('');
  }

  function handleSelectPlanRelatedTable(tableKey: string) {
    setSelectedPlanRelatedTable(tableKey);
    setPlanRelatedFeedback('');
  }

  function clearPlanRelatedForm() {
    setSelectedPlanRelatedRecordId(null);
    setIsCreatingPlanRelated(false);
    setPlanRelatedFormValues({});
    setIsPlanRelatedActive(true);
  }

  function handleNewPlanRelated() {
    setSelectedPlanRelatedRecordId(null);
    setIsCreatingPlanRelated(true);
    setPlanRelatedFormValues({});
    setIsPlanRelatedActive(true);
    setPlanRelatedFeedback('');
  }

  function handleSelectPlanRelatedRecord(record: CompanyChildRecord) {
    if (!planRelatedConfig) {
      return;
    }

    const values = planRelatedConfig.fields.reduce<Record<string, string>>((current, field) => {
      const value = record[field.key];
      current[field.key] = field.type === 'date' ? formatDateInput(String(value ?? '')) : String(value ?? '');
      return current;
    }, {});

    setSelectedPlanRelatedRecordId(record.id);
    setIsCreatingPlanRelated(false);
    setPlanRelatedFormValues(values);
    setIsPlanRelatedActive(Number(record.boInativo ?? 0) === 0);
    setPlanRelatedFeedback('');
  }

  async function handleTogglePlanStatus() {
    const nextActive = !isPlanActive;
    setIsPlanActive(nextActive);

    if (!selectedPlanId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/plans/${selectedPlanId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível alterar o status.');
      }

      await loadPlans();
      setFeedback('Status do plano atualizado.');
    } catch (error) {
      setIsPlanActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSavePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!planName.trim()) {
      setFeedback('Informe o nome do plano.');
      return;
    }

    try {
      const payload = {
        dsPlano: planName.trim(),
        idFrequencia: planFrequencyId ? Number(planFrequencyId) : null,
        boInativo: isPlanActive ? 0 : 1,
      };
      const response = await fetch(
        isCreating ? `${apiUrl}/plans` : `${apiUrl}/plans/${selectedPlanId}`,
        {
          method: isCreating ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o plano.');
      }

      const savedPlan = (await response.json()) as Plan;
      await loadPlans();
      setSelectedPlanId(savedPlan.id);
      setIsCreating(false);
      setFeedback('Plano salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar plano.');
    }
  }

  async function handleTogglePlanRelatedStatus() {
    if (!planRelatedConfig) {
      return;
    }

    const nextActive = !isPlanRelatedActive;
    setIsPlanRelatedActive(nextActive);

    if (!selectedPlanId || !selectedPlanRelatedRecordId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/plans/${selectedPlanId}/related/${planRelatedConfig.endpoint}/${selectedPlanRelatedRecordId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            boInativo: nextActive ? 0 : 1,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível alterar o status.');
      }

      const updated = (await response.json()) as CompanyChildRecord;
      setPlanRelatedRecords((current) =>
        current.map((record) => (record.id === updated.id ? updated : record)),
      );
    } catch (error) {
      setIsPlanRelatedActive(!nextActive);
      setPlanRelatedFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSavePlanRelated(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!planRelatedConfig) {
      setPlanRelatedFeedback('Selecione uma tabela relacionada antes de salvar.');
      return;
    }

    if (!selectedPlanId) {
      setPlanRelatedFeedback('Selecione um plano antes de salvar.');
      return;
    }

    try {
      const payload = planRelatedConfig.fields.reduce<Record<string, string | number | null>>(
        (current, field) => {
          const value = planRelatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        {
          boInativo: isPlanRelatedActive ? 0 : 1,
        },
      );

      const response = await fetch(
        selectedPlanRelatedRecordId
          ? `${apiUrl}/plans/${selectedPlanId}/related/${planRelatedConfig.endpoint}/${selectedPlanRelatedRecordId}`
          : `${apiUrl}/plans/${selectedPlanId}/related/${planRelatedConfig.endpoint}`,
        {
          method: selectedPlanRelatedRecordId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o registro relacionado.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadPlanRelatedRecords(selectedPlanId, planRelatedConfig);
      setSelectedPlanRelatedRecordId(saved.id);
      setIsCreatingPlanRelated(false);
      setPlanRelatedFeedback(`${planRelatedConfig.label} salvo com sucesso.`);
    } catch (error) {
      setPlanRelatedFeedback(error instanceof Error ? error.message : 'Erro ao salvar registro relacionado.');
    }
  }

  function getFrequencyLabel(frequencyId: number | null) {
    const frequency = frequencies.find((item) => item.id === frequencyId);
    return frequency?.dsFrequencia ? String(frequency.dsFrequencia) : '-';
  }

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Planos</p>
      </div>

      <div className="registration-split-layout plan-split-layout">
        <section className="data-grid-section company-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Planos</p>
            </div>
            <div className="child-grid-toolbar-actions">
              <label className="search-field">
                <span>Pesquisar</span>
                <input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar plano"
                  type="search"
                  value={searchTerm}
                />
              </label>
              <button className="new-button" onClick={handleNewPlan} type="button">
                Novo
              </button>
            </div>
          </div>

          <div className="product-table" role="table" aria-label="Planos cadastrados">
            <div className="product-row header" role="row">
              <span role="columnheader">Plano</span>
              <span role="columnheader">Frequência</span>
              <span role="columnheader">Status</span>
            </div>

            {isLoadingPlans ? <div className="empty-row">Carregando planos...</div> : null}

            {!isLoadingPlans
              ? paginatedPlans.map((plan) => (
                <button
                  className={`product-row selectable ${plan.id === selectedPlanId ? 'selected' : ''}`}
                  key={plan.id}
                  onClick={() => handleSelectPlan(plan)}
                  role="row"
                  type="button"
                >
                  <span role="cell">{plan.dsPlano}</span>
                  <span role="cell">{getFrequencyLabel(plan.idFrequencia)}</span>
                  <span role="cell">
                    <span className={`status-badge ${plan.boInativo === 0 ? 'active' : 'inactive'}`}>
                      {plan.boInativo === 0 ? 'Ativo' : 'Inativo'}
                    </span>
                  </span>
                </button>
              ))
              : null}

            {!isLoadingPlans && filteredPlans.length === 0 ? (
              <div className="empty-row">Nenhum plano encontrado.</div>
            ) : null}
          </div>

          <GridPagination
            onChange={setPlansPage}
            page={plansPage}
            totalItems={filteredPlans.length}
          />

          {planRelatedConfig ? (
            <section className="company-child-grid-section">
              {!selectedPlanId ? (
                <div className="form-hint">
                  Selecione um plano para visualizar os registros relacionados.
                </div>
              ) : (
                <>
                  <div className="grid-toolbar">
                    <div className="child-grid-toolbar-label">
                      <p className="section-label">{planRelatedConfig.label}</p>
                    </div>
                    <div className="child-grid-toolbar-actions">
                      <label className="search-field">
                        <span>Pesquisar</span>
                        <input
                          onChange={(event) => setPlanRelatedSearchTerm(event.target.value)}
                          placeholder="Buscar registro"
                          type="search"
                          value={planRelatedSearchTerm}
                        />
                      </label>
                      <button
                        className="new-button"
                        disabled={!selectedPlanId}
                        onClick={handleNewPlanRelated}
                        type="button"
                      >
                        Novo
                      </button>
                    </div>
                  </div>

                  <div
                    className="product-table company-child-grid-table"
                    role="table"
                    aria-label={planRelatedConfig.title}
                  >
                    <div
                      className="product-row company-child-grid-row header"
                      role="row"
                      style={{
                        gridTemplateColumns: `repeat(${planRelatedConfig.columns.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {planRelatedConfig.columns.map((column) => (
                        <span key={column.key} role="columnheader">
                          {column.label}
                        </span>
                      ))}
                    </div>

                    {isLoadingPlanRelatedRecords ? (
                      <div className="empty-row">
                        Carregando {planRelatedConfig.label.toLowerCase()}...
                      </div>
                    ) : null}

                    {!isLoadingPlanRelatedRecords
                      ? filteredPlanRelatedRecords.map((record) => (
                        <button
                          className={`product-row company-child-grid-row selectable ${record.id === selectedPlanRelatedRecordId ? 'selected' : ''}`}
                          key={record.id}
                          onClick={() => handleSelectPlanRelatedRecord(record)}
                          role="row"
                          style={{
                            gridTemplateColumns: `repeat(${planRelatedConfig.columns.length}, minmax(0, 1fr))`,
                          }}
                          type="button"
                        >
                          {planRelatedConfig.columns.map((column) => (
                            <span key={column.key} role="cell">
                              {formatChildCell(record, column)}
                            </span>
                          ))}
                        </button>
                      ))
                      : null}

                    {!isLoadingPlanRelatedRecords && filteredPlanRelatedRecords.length === 0 ? (
                      <div className="empty-row">
                        Nenhum registro de {planRelatedConfig.label.toLowerCase()} encontrado.
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}
        </section>

        <div className="split-form-stack">
          <form
            className={`registration-form split-form-panel company-form-panel ${isPlanFieldsCollapsed ? 'collapsed' : ''}`}
            onSubmit={handleSavePlan}
          >
            <div className="collapsible-panel-header">
              <div>
                <p className="section-label">Cadastro de Plano</p>
              </div>
              <button
                aria-expanded={!isPlanFieldsCollapsed}
                className="secondary-button"
                onClick={() => setIsPlanFieldsCollapsed((current) => !current)}
                type="button"
              >
                {isPlanFieldsCollapsed ? '+' : '-'}
              </button>
            </div>

            {!isPlanFieldsCollapsed ? (
              <>
                {!isFormEnabled ? (
                  <div className="form-hint">
                    Selecione um plano acima para editar ou clique em Novo.
                  </div>
                ) : null}

                {feedback ? <div className="form-feedback">{feedback}</div> : null}

                <div className="field">
                  <label htmlFor="planName">Nome do plano *</label>
                  <input
                    disabled={!isFormEnabled}
                    id="planName"
                    maxLength={255}
                    onChange={(event) => setPlanName(event.target.value)}
                    required
                    type="text"
                    value={planName}
                  />
                </div>

                <div className="field">
                  <label htmlFor="planFrequency">Frequência</label>
                  <select
                    disabled={!isFormEnabled}
                    id="planFrequency"
                    onChange={(event) => setPlanFrequencyId(event.target.value)}
                    value={planFrequencyId}
                  >
                    <option value="">Selecione</option>
                    {frequencies.map((frequency) => (
                      <option key={frequency.id} value={frequency.id}>
                        {frequency.dsFrequencia}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="planStatus">Status</label>
                  <button
                    aria-pressed={isPlanActive}
                    className={`status-toggle ${isPlanActive ? 'active' : ''}`}
                    disabled={!isFormEnabled}
                    id="planStatus"
                    onClick={handleTogglePlanStatus}
                    type="button"
                  >
                    <span>{isPlanActive ? 'Ativo' : 'Inativo'}</span>
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
                    Salvar plano
                  </button>
                </div>
              </>
            ) : null}
          </form>

          {planRelatedConfig ? (
            <form
              className={`registration-form split-form-panel company-child-form-panel ${isPlanRelatedFieldsCollapsed ? 'collapsed' : ''}`}
              onSubmit={handleSavePlanRelated}
            >
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">{planRelatedConfig.label}</p>
                </div>
                <button
                  aria-expanded={!isPlanRelatedFieldsCollapsed}
                  className="secondary-button"
                  onClick={() => setIsPlanRelatedFieldsCollapsed((current) => !current)}
                  type="button"
                >
                  {isPlanRelatedFieldsCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isPlanRelatedFieldsCollapsed ? (
                <>
                  {planRelatedFeedback ? (
                    <div className="form-feedback">{planRelatedFeedback}</div>
                  ) : null}

                  <div className="company-child-fields">
                    {planRelatedConfig.fields.map((field) => (
                      <div className="field" key={field.key}>
                        <label htmlFor={`planRelated-${field.key}`}>
                          {field.label}
                          {field.required ? ' *' : ''}
                        </label>
                        {field.lookupEndpoint ? (
                          <select
                            disabled={!isPlanRelatedFormEnabled}
                            id={`planRelated-${field.key}`}
                            onChange={(event) =>
                              setPlanRelatedFormValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            required={field.required}
                            value={planRelatedFormValues[field.key] ?? ''}
                          >
                            <option value="">Selecione</option>
                            {(planRelatedLookups[field.key] ?? []).map((option) => (
                              <option key={option.id} value={option.id}>
                                {getLookupLabel(option, field)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            disabled={!isPlanRelatedFormEnabled}
                            id={`planRelated-${field.key}`}
                            onChange={(event) =>
                              setPlanRelatedFormValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            required={field.required}
                            type={field.type}
                            value={planRelatedFormValues[field.key] ?? ''}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {!isPlanRelatedFormEnabled ? (
                    <div className="form-hint">
                      Selecione um registro relacionado acima ou clique em Novo.
                    </div>
                  ) : null}

                  <div className="field">
                    <label htmlFor="planRelatedStatus">Status</label>
                    <button
                      aria-pressed={isPlanRelatedActive}
                      className={`status-toggle ${isPlanRelatedActive ? 'active' : ''}`}
                      disabled={!isPlanRelatedFormEnabled}
                      id="planRelatedStatus"
                      onClick={handleTogglePlanRelatedStatus}
                      type="button"
                    >
                      <span>{isPlanRelatedActive ? 'Ativo' : 'Inativo'}</span>
                    </button>
                  </div>

                  <div className="form-actions">
                    <button
                      className="secondary-button"
                      disabled={!selectedPlanId}
                      onClick={clearPlanRelatedForm}
                      type="button"
                    >
                      Limpar
                    </button>
                    <button disabled={!isPlanRelatedFormEnabled} type="submit">
                      Salvar {planRelatedConfig.label}
                    </button>
                  </div>
                </>
              ) : null}
            </form>
          ) : null}
        </div>

        <section className="company-child-tabs" aria-label="Tabelas relacionadas do plano">
          <div className="company-child-tabs-list" role="tablist" aria-label="Tabelas relacionadas do plano">
            {planRelatedTables.map((table) => (
              <button
                aria-selected={selectedPlanRelatedTable === table.key}
                className={selectedPlanRelatedTable === table.key ? 'active' : ''}
                key={table.key}
                onClick={() => handleSelectPlanRelatedTable(table.key)}
                role="tab"
                type="button"
              >
                {table.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}


