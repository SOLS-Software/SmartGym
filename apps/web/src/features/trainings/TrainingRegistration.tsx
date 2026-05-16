'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Dumbbell, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, getLookupLabel, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import { RegistrationTabs } from '../../shared/registration/RegistrationTabs';
import type { Company, CompanyChildField, CompanyChildRecord, CompanyChildTable, Level, LookupRecord, Training } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

const trainingTabIcons = { exercises: Dumbbell };

const trainingRelatedTables: CompanyChildTable[] = [
  {
    key: 'exercises',
    endpoint: 'exercises',
    label: 'Exercícios',
    title: 'Exercícios do treino',
    columns: [
      { key: 'nrOrdem', label: 'Ordem' },
      { key: 'idExercicio', label: 'Exercicio', lookupLabelKey: 'dsExercicio' },
      { key: 'nrSeries', label: 'Series' },
      { key: 'nrRepeticoes', label: 'Repeticoes' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idExercicio', label: 'Exercicio', type: 'number', lookupEndpoint: 'exercises', lookupLabelKey: 'dsExercicio', required: true },
      { key: 'idMetodoTreino', label: 'Método de treino', type: 'number', lookupEndpoint: 'training-methods', lookupLabelKey: 'nmMetodoTreino' },
      { key: 'nrOrdem', label: 'Ordem', type: 'number' },
      { key: 'nrSeries', label: 'Series', type: 'number' },
      { key: 'nrRepeticoes', label: 'Repeticoes', type: 'number' },
      { key: 'qtDescanso', label: 'Descanso', type: 'number' },
    ],
  },
];

type TrainingRegistrationProps = {
  readOnly?: boolean;
};

export function TrainingRegistration({ readOnly = false }: TrainingRegistrationProps) {
  const trainingNameInputRef = useRef<HTMLInputElement | null>(null);
  const trainingRelatedFormRef = useRef<HTMLDivElement | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [trainingsPage, setTrainingsPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [isLoadingTrainings, setIsLoadingTrainings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrainingId, setSelectedTrainingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [trainingName, setTrainingName] = useState('');
  const [isTrainingActive, setIsTrainingActive] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [isTrainingFieldsCollapsed, setIsTrainingFieldsCollapsed] = useState(false);
  const [selectedTrainingRelatedTable, setSelectedTrainingRelatedTable] = useState('');
  const [trainingRelatedRecords, setTrainingRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingTrainingRelatedRecords, setIsLoadingTrainingRelatedRecords] = useState(false);
  const [trainingRelatedSearchTerm, setTrainingRelatedSearchTerm] = useState('');
  const [selectedTrainingRelatedRecordId, setSelectedTrainingRelatedRecordId] = useState<number | null>(null);
  const [isCreatingTrainingRelated, setIsCreatingTrainingRelated] = useState(false);
  const [trainingRelatedFormValues, setTrainingRelatedFormValues] = useState<Record<string, string>>({});
  const [isTrainingRelatedActive, setIsTrainingRelatedActive] = useState(true);
  const [trainingRelatedFeedback, setTrainingRelatedFeedback] = useState('');
  const [trainingRelatedLookups, setTrainingRelatedLookups] = useState<Record<string, LookupRecord[]>>({});
  const [isTrainingRelatedFieldsCollapsed, setIsTrainingRelatedFieldsCollapsed] = useState(false);
  const isFormEnabled = selectedTrainingId !== null || isCreating;
  const trainingRelatedConfig =
    trainingRelatedTables.find((table) => table.key === selectedTrainingRelatedTable) ?? null;
  const isTrainingRelatedFormEnabled =
    Boolean(selectedTrainingId) &&
    (selectedTrainingRelatedRecordId !== null || isCreatingTrainingRelated);
  const filteredTrainingRelatedRecords = trainingRelatedRecords.filter((record) =>
    trainingRelatedConfig
      ? trainingRelatedConfig.columns.some((column) =>
        formatChildSearchValue(
          record,
          column,
          trainingRelatedLookups[column.key],
        ).includes(trainingRelatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredTrainings = trainings.filter((training) => {
    if (selectedTrainingRelatedTable && selectedTrainingId !== null) {
      return training.id === selectedTrainingId;
    }

    const search = searchTerm.toLowerCase();
    const company = companies.find((item) => item.id === training.idEmpresa);
    const level = levels.find((item) => item.id === training.idNivel);

    return (
      training.dsTreino.toLowerCase().includes(search) ||
      String(company?.dsEmpresa ?? '').toLowerCase().includes(search) ||
      String(level?.dsNivel ?? '').toLowerCase().includes(search) ||
      (training.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const trainingsTotalPages = Math.max(1, Math.ceil(filteredTrainings.length / GRID_PAGE_SIZE));
  const paginatedTrainings = paginateItems(filteredTrainings, trainingsPage);

  async function loadTrainings() {
    try {
      setIsLoadingTrainings(true);
      const response = await fetch(`${apiUrl}/trainings?includeInactive=true`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar os treinos.');
      }

      setTrainings((await response.json()) as Training[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar treinos.');
    } finally {
      setIsLoadingTrainings(false);
    }
  }

  async function loadLookups() {
    try {
      const [companiesResponse, levelsResponse] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/levels`),
      ]);

      const failedLookup = [companiesResponse, levelsResponse].find((r) => !r.ok);
      if (failedLookup) {
        await getApiError(failedLookup, 'Não foi possível carregar empresas e níveis.');
      }

      const companiesData = (await companiesResponse.json()) as Company[];
      const levelsData = (await levelsResponse.json()) as Level[];
      setCompanies(companiesData.filter((company) => company.boInativo === 0));
      setLevels(levelsData.filter((level) => level.boInativo === 0));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadTrainingRelatedRecords(
    trainingId = selectedTrainingId,
    config = trainingRelatedConfig,
  ) {
    if (!config || !trainingId) {
      setTrainingRelatedRecords([]);
      setIsLoadingTrainingRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingTrainingRelatedRecords(true);
      const response = await fetch(`${apiUrl}/trainings/${trainingId}/related/${config.endpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar os registros relacionados.');
      }

      setTrainingRelatedRecords((await response.json()) as CompanyChildRecord[]);
      setTrainingRelatedFeedback('');
    } catch (error) {
      setTrainingRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.',
      );
      setTrainingRelatedRecords([]);
    } finally {
      setIsLoadingTrainingRelatedRecords(false);
    }
  }

  useEffect(() => {
    void loadTrainings();
    void loadLookups();
  }, []);

  useEffect(() => {
    setTrainingsPage(1);
  }, [searchTerm, selectedTrainingId]);

  useEffect(() => {
    if (trainingsPage > trainingsTotalPages) {
      setTrainingsPage(trainingsTotalPages);
    }
  }, [trainingsPage, trainingsTotalPages]);

  useEffect(() => {
    setSelectedTrainingRelatedRecordId(null);
    setIsCreatingTrainingRelated(false);
    setTrainingRelatedFormValues({});
    setIsTrainingRelatedActive(true);
    setTrainingRelatedSearchTerm('');
    setTrainingRelatedFeedback('');
    void loadTrainingRelatedRecords();
  }, [selectedTrainingId, selectedTrainingRelatedTable]);

  useEffect(() => {
    async function loadTrainingRelatedLookups() {
      if (!trainingRelatedConfig) {
        return;
      }

      const lookupFields = trainingRelatedConfig.fields.filter((field) => field.lookupEndpoint);
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) {
            return;
          }

          const response = await fetch(`${apiUrl}/${field.lookupEndpoint}`);

          if (!response.ok) {
            await getApiError(response, `Não foi possível carregar ${field.label}.`);
          }

          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setTrainingRelatedLookups((current) => ({
        ...current,
        ...nextLookups,
      }));
    }

    void loadTrainingRelatedLookups().catch((error) => {
      setTrainingRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar listas relacionadas.',
      );
    });
  }, [trainingRelatedConfig]);

  function clearForm() {
    setSelectedTrainingId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setSelectedLevelId('');
    setTrainingName('');
    setIsTrainingActive(true);
    setFeedback('');
    setTrainingRelatedRecords([]);
    setSelectedTrainingRelatedRecordId(null);
    setIsCreatingTrainingRelated(false);
    setTrainingRelatedFormValues({});
    setTrainingRelatedFeedback('');
  }

  function handleNewTraining() {
    clearForm();
    setIsCreating(true);
    setIsTrainingActive(true);
    setIsTrainingFieldsCollapsed(false);
    setIsTrainingRelatedFieldsCollapsed(true);
    setTimeout(() => trainingNameInputRef.current?.focus(), 0);
  }

  function handleSelectTraining(training: Training) {
    if (training.id === selectedTrainingId) {
      clearForm();
      return;
    }

    setSelectedTrainingId(training.id);
    setIsCreating(false);
    setSelectedCompanyId(training.idEmpresa ? String(training.idEmpresa) : '');
    setSelectedLevelId(training.idNivel ? String(training.idNivel) : '');
    setTrainingName(training.dsTreino);
    setIsTrainingActive(training.boInativo === 0);
    setFeedback('');
    setTrainingRelatedFeedback('');
    setIsTrainingFieldsCollapsed(false);
    setIsTrainingRelatedFieldsCollapsed(true);
  }

  function handleSelectTrainingRelatedTable(tableKey: string) {
    setSelectedTrainingRelatedTable(tableKey);
    setTrainingRelatedFeedback('');
  }

  function clearTrainingRelatedForm() {
    setSelectedTrainingRelatedRecordId(null);
    setIsCreatingTrainingRelated(false);
    setTrainingRelatedFormValues({});
    setIsTrainingRelatedActive(true);
    setTrainingRelatedFeedback('');
  }

  function handleNewTrainingRelated() {
    setSelectedTrainingRelatedRecordId(null);
    setIsCreatingTrainingRelated(true);
    setTrainingRelatedFormValues(
      trainingRelatedConfig?.fields.reduce<Record<string, string>>((current, field) => {
        if (field.key === 'idEmpresa') {
          current[field.key] = selectedCompanyId;
        } else if (['nrOrdem', 'nrSeries', 'nrRepeticoes', 'qtDescanso'].includes(field.key)) {
          current[field.key] = '0';
        }

        return current;
      }, {}) ?? {},
    );
    setIsTrainingRelatedActive(true);
    setTrainingRelatedFeedback('');
    setIsTrainingFieldsCollapsed(true);
    setIsTrainingRelatedFieldsCollapsed(false);
    setTimeout(() => { trainingRelatedFormRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled])')?.focus(); }, 0);
  }

  function handleSelectTrainingRelatedRecord(record: CompanyChildRecord) {
    if (!trainingRelatedConfig) {
      return;
    }

    const values = trainingRelatedConfig.fields.reduce<Record<string, string>>((current, field) => {
      const value = record[field.key];
      current[field.key] = String(value ?? '');
      return current;
    }, {});

    setSelectedTrainingRelatedRecordId(record.id);
    setIsCreatingTrainingRelated(false);
    setTrainingRelatedFormValues(values);
    setIsTrainingRelatedActive(Number(record.boInativo ?? 0) === 0);
    setTrainingRelatedFeedback('');
    setIsTrainingFieldsCollapsed(true);
    setIsTrainingRelatedFieldsCollapsed(false);
  }

  function getLevelLabel(levelId: number | null) {
    return levels.find((level) => level.id === levelId)?.dsNivel ?? '-';
  }

  async function handleToggleTrainingStatus() {
    const nextActive = !isTrainingActive;
    setIsTrainingActive(nextActive);

    if (!selectedTrainingId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/trainings/${selectedTrainingId}/status`, {
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

      const updatedTraining = (await response.json()) as Training;
      setTrainings((current) =>
        current.map((training) =>
          training.id === updatedTraining.id ? updatedTraining : training,
        ),
      );
    } catch (error) {
      setIsTrainingActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trainingName.trim()) {
      setFeedback('Informe o nome do treino.');
      return;
    }

    try {
      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        idNivel: selectedLevelId ? Number(selectedLevelId) : null,
        dsTreino: trainingName.trim(),
        boInativo: isTrainingActive ? 0 : 1,
      };
      const response = await fetch(
        isCreating ? `${apiUrl}/trainings` : `${apiUrl}/trainings/${selectedTrainingId}`,
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
        throw new Error(errorBody.message ?? 'Não foi possível salvar o treino.');
      }

      const savedTraining = (await response.json()) as Training;
      await loadTrainings();
      setSelectedTrainingId(savedTraining.id);
      setIsCreating(false);
      setFeedback('Treino salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar treino.');
    }
  }

  async function handleToggleTrainingRelatedStatus() {
    if (!trainingRelatedConfig) {
      return;
    }

    const nextActive = !isTrainingRelatedActive;
    setIsTrainingRelatedActive(nextActive);

    if (!selectedTrainingId || !selectedTrainingRelatedRecordId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/trainings/${selectedTrainingId}/related/${trainingRelatedConfig.endpoint}/${selectedTrainingRelatedRecordId}/status`,
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

      const updatedRecord = (await response.json()) as CompanyChildRecord;
      setTrainingRelatedRecords((current) =>
        current.map((record) => (record.id === updatedRecord.id ? updatedRecord : record)),
      );
    } catch (error) {
      setIsTrainingRelatedActive(!nextActive);
      setTrainingRelatedFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveTrainingRelated(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trainingRelatedConfig) {
      setTrainingRelatedFeedback('Selecione uma tabela relacionada antes de salvar.');
      return;
    }

    if (!selectedTrainingId) {
      setTrainingRelatedFeedback('Selecione um treino antes de salvar.');
      return;
    }

    const missingRequiredField = trainingRelatedConfig.fields.find(
      (field) => field.required && !trainingRelatedFormValues[field.key],
    );

    if (missingRequiredField) {
      setTrainingRelatedFeedback(`Informe ${missingRequiredField.label}.`);
      return;
    }

    try {
      const payload = trainingRelatedConfig.fields.reduce<Record<string, string | number | null>>(
        (current, field) => {
          const value = trainingRelatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        {
          boInativo: isTrainingRelatedActive ? 0 : 1,
        },
      );

      const response = await fetch(
        selectedTrainingRelatedRecordId
          ? `${apiUrl}/trainings/${selectedTrainingId}/related/${trainingRelatedConfig.endpoint}/${selectedTrainingRelatedRecordId}`
          : `${apiUrl}/trainings/${selectedTrainingId}/related/${trainingRelatedConfig.endpoint}`,
        {
          method: selectedTrainingRelatedRecordId ? 'PUT' : 'POST',
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

      const savedRecord = (await response.json()) as CompanyChildRecord;
      await loadTrainingRelatedRecords(selectedTrainingId, trainingRelatedConfig);
      setSelectedTrainingRelatedRecordId(savedRecord.id);
      setIsCreatingTrainingRelated(false);
      setTrainingRelatedFeedback(`${trainingRelatedConfig.label} salvo com sucesso.`);
    } catch (error) {
      setTrainingRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao salvar registro relacionado.',
      );
    }
  }

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Treino</p>
      </div>

      <div className="registration-split-layout plan-split-layout">
        <section className="data-grid-section company-grid-section">
          <RegistrationGrid<Training>
            ariaLabel="Treinos cadastrados"
            label="Treinos"
            columns={[
              { label: 'Treino', render: (t) => t.dsTreino },
              { label: 'Nível', render: (t) => getLevelLabel(t.idNivel) },
              { label: 'Status', render: (t) => <span className={`status-badge ${t.boInativo === 0 ? 'active' : 'inactive'}`}>{t.boInativo === 0 ? 'Ativo' : 'Inativo'}</span> },
            ]}
            records={paginatedTrainings}
            isLoading={isLoadingTrainings}
            selectedId={selectedTrainingId}
            onSelect={handleSelectTraining}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar treino"
            onNew={handleNewTraining}
            showNewButton={!readOnly}
            page={trainingsPage}
            totalItems={filteredTrainings.length}
            onPageChange={setTrainingsPage}
          />

          {trainingRelatedConfig ? (
            <section className="company-child-grid-section child-grid-desktop">
              {!selectedTrainingId ? (
                <div className="form-hint">
                  Selecione um treino para visualizar os registros relacionados.
                </div>
              ) : (
                <RegistrationGrid<CompanyChildRecord>
                  ariaLabel={trainingRelatedConfig.title}
                  label={trainingRelatedConfig.label}
                  columns={trainingRelatedConfig.columns.map((column) => ({
                    label: column.label,
                    render: (record) => formatChildCell(record, column, trainingRelatedLookups[column.key]),
                  }))}
                  records={filteredTrainingRelatedRecords}
                  isLoading={isLoadingTrainingRelatedRecords}
                  selectedId={selectedTrainingRelatedRecordId}
                  onSelect={handleSelectTrainingRelatedRecord}
                  searchTerm={trainingRelatedSearchTerm}
                  onSearch={setTrainingRelatedSearchTerm}
                  onNew={handleNewTrainingRelated}
                  newDisabled={!selectedTrainingId}
                  showNewButton={!readOnly}
                  variant="child"
                />
              )}
            </section>
          ) : null}
        </section>

        {readOnly ? null : (
        <div className="split-form-stack">
        <form
          className={`registration-form split-form-panel company-form-panel ${isTrainingFieldsCollapsed ? 'collapsed' : ''}`}
          onSubmit={handleSaveTraining}
        >
          <div className="collapsible-panel-header">
            <div>
              <p className="section-label">Cadastro de Treino</p>
            </div>
            <button
              aria-expanded={!isTrainingFieldsCollapsed}
              className="secondary-button"
              onClick={() => setIsTrainingFieldsCollapsed((current) => !current)}
              type="button"
            >
              {isTrainingFieldsCollapsed ? '+' : '-'}
            </button>
          </div>

          {!isTrainingFieldsCollapsed ? (
            <>
              {!isFormEnabled ? (
                <div className="form-hint">
                  Selecione um treino acima para editar ou clique em Novo.
                </div>
              ) : null}

              {feedback ? <div className="form-feedback">{feedback}</div> : null}

              <RegistrationField htmlFor="trainingName" label="Nome do treino" required>
                <input
                  disabled={!isFormEnabled}
                  id="trainingName"
                  maxLength={255}
                  onChange={(event) => setTrainingName(event.target.value)}
                  ref={trainingNameInputRef}
                  required
                  type="text"
                  value={trainingName}
                />
              </RegistrationField>

              <RegistrationField htmlFor="trainingCompany" label="Empresa">
                <select
                  disabled={!isFormEnabled}
                  id="trainingCompany"
                  onChange={(event) => setSelectedCompanyId(event.target.value)}
                  value={selectedCompanyId}
                >
                  <option value="">Selecione</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.dsEmpresa}
                    </option>
                  ))}
                </select>
              </RegistrationField>

              <RegistrationField htmlFor="trainingLevel" label="Nível">
                <select
                  disabled={!isFormEnabled}
                  id="trainingLevel"
                  onChange={(event) => setSelectedLevelId(event.target.value)}
                  value={selectedLevelId}
                >
                  <option value="">Selecione</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.dsNivel}
                    </option>
                  ))}
                </select>
              </RegistrationField>

              <RegistrationField htmlFor="trainingStatus" label="Status">
                <button
                  aria-pressed={isTrainingActive}
                  className={`status-toggle ${isTrainingActive ? 'active' : ''}`}
                  disabled={!isFormEnabled}
                  id="trainingStatus"
                  onClick={handleToggleTrainingStatus}
                  type="button"
                >
                  <span>{isTrainingActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </RegistrationField>

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
                  <Save size={16} />
                  Salvar treino
                </button>
              </div>
            </>
          ) : null}
        </form>

          {trainingRelatedConfig ? (
            <section className="company-child-grid-section child-grid-mobile">
              {!selectedTrainingId ? (
                <div className="form-hint">
                  Selecione um treino para visualizar os registros relacionados.
                </div>
              ) : (
                <RegistrationGrid<CompanyChildRecord>
                  ariaLabel={trainingRelatedConfig.title}
                  label={trainingRelatedConfig.label}
                  columns={trainingRelatedConfig.columns.map((column) => ({
                    label: column.label,
                    render: (record) => formatChildCell(record, column, trainingRelatedLookups[column.key]),
                  }))}
                  records={filteredTrainingRelatedRecords}
                  isLoading={isLoadingTrainingRelatedRecords}
                  selectedId={selectedTrainingRelatedRecordId}
                  onSelect={handleSelectTrainingRelatedRecord}
                  searchTerm={trainingRelatedSearchTerm}
                  onSearch={setTrainingRelatedSearchTerm}
                  onNew={handleNewTrainingRelated}
                  newDisabled={!selectedTrainingId}
                  showNewButton={!readOnly}
                  variant="child"
                />
              )}
            </section>
          ) : null}

          {trainingRelatedConfig ? (
            <form
              className={`registration-form split-form-panel company-child-form-panel ${isTrainingRelatedFieldsCollapsed ? 'collapsed' : ''}`}
              onSubmit={handleSaveTrainingRelated}
            >
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">{trainingRelatedConfig.label}</p>
                </div>
                <button
                  aria-expanded={!isTrainingRelatedFieldsCollapsed}
                  className="secondary-button"
                  onClick={() => setIsTrainingRelatedFieldsCollapsed((current) => !current)}
                  type="button"
                >
                  {isTrainingRelatedFieldsCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isTrainingRelatedFieldsCollapsed ? (
                <>
                  {trainingRelatedFeedback ? (
                    <div className="form-feedback">{trainingRelatedFeedback}</div>
                  ) : null}

                  {!isTrainingRelatedFormEnabled ? (
                    <div className="form-hint">
                      Selecione um registro relacionado acima ou clique em Novo.
                    </div>
                  ) : null}

                  <div className="company-child-fields" ref={trainingRelatedFormRef}>
                    {trainingRelatedConfig.fields.map((field: CompanyChildField) => (
                      <RegistrationField htmlFor={`trainingRelated-${field.key}`} key={field.key} label={field.label} required={field.required}>
                        {field.lookupEndpoint ? (
                          <select
                            disabled={!isTrainingRelatedFormEnabled}
                            id={`trainingRelated-${field.key}`}
                            onChange={(event) =>
                              setTrainingRelatedFormValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            required={field.required}
                            value={trainingRelatedFormValues[field.key] ?? ''}
                          >
                            <option value="">Selecione</option>
                            {(trainingRelatedLookups[field.key] ?? []).map((option) => (
                              <option key={option.id} value={option.id}>
                                {getLookupLabel(option, field)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            disabled={!isTrainingRelatedFormEnabled}
                            id={`trainingRelated-${field.key}`}
                            onChange={(event) =>
                              setTrainingRelatedFormValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            required={field.required}
                            type={field.type}
                            value={trainingRelatedFormValues[field.key] ?? ''}
                          />
                        )}
                      </RegistrationField>
                    ))}
                  </div>

                  <RegistrationField htmlFor="trainingRelatedStatus" label="Status">
                    <button
                      aria-pressed={isTrainingRelatedActive}
                      className={`status-toggle ${isTrainingRelatedActive ? 'active' : ''}`}
                      disabled={!isTrainingRelatedFormEnabled}
                      id="trainingRelatedStatus"
                      onClick={handleToggleTrainingRelatedStatus}
                      type="button"
                    >
                      <span>{isTrainingRelatedActive ? 'Ativo' : 'Inativo'}</span>
                    </button>
                  </RegistrationField>

                  <div className="form-actions">
                    <button
                      className="secondary-button"
                      disabled={!selectedTrainingId}
                      onClick={clearTrainingRelatedForm}
                      type="button"
                    >
                      Limpar
                    </button>
                    <button disabled={!isTrainingRelatedFormEnabled} type="submit">
                      <Save size={16} />
                      Salvar {trainingRelatedConfig.label}
                    </button>
                  </div>
                </>
              ) : null}
            </form>
          ) : null}
        </div>
        )}

        <RegistrationTabs
          tabs={trainingRelatedTables}
          activeTab={selectedTrainingRelatedTable}
          onTabChange={handleSelectTrainingRelatedTable}
          icons={trainingTabIcons}
          ariaLabel="Tabelas relacionadas do treino"
        />
      </div>
    </div>
  );
}
