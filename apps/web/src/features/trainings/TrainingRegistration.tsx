'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Dumbbell, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, getLookupLabel, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import type { Company, CompanyChildField, CompanyChildRecord, CompanyChildTable, Level, LookupRecord, Training } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';


const trainingRelatedConfig: CompanyChildTable = {
  key: 'exercises',
  endpoint: 'exercises',
  label: 'Exercícios',
  title: 'Exercícios do treino',
  columns: [
    { key: 'nrOrdem', label: 'Ordem' },
    { key: 'idExercicio', label: 'Exercício', lookupLabelKey: 'dsExercicio' },
    { key: 'nrSeries', label: 'Séries' },
    { key: 'nrRepeticoes', label: 'Repetições' },
    { key: 'qtPeso', label: 'Peso' },
    { key: 'idUnidadeMedida', label: 'Unidade', lookupLabelKey: 'cnUnidade' },
    { key: 'boInativo', label: 'Status', type: 'status' },
  ],
  fields: [
    { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa', size: 'full' },
    { key: 'idExercicio', label: 'Exercício', type: 'number', lookupEndpoint: 'exercises', lookupLabelKey: 'dsExercicio', required: true, size: 'full' },
    { key: 'idMetodoTreino', label: 'Método de treino', type: 'number', lookupEndpoint: 'training-methods', lookupLabelKey: 'nmMetodoTreino', size: 'full' },
    { key: 'nrOrdem', label: 'Ordem', type: 'number', size: 'xs' },
    { key: 'nrSeries', label: 'Séries', type: 'number', size: 'xs' },
    { key: 'nrRepeticoes', label: 'Repetições', type: 'number', size: 'sm' },
    { key: 'qtDescanso', label: 'Descanso (s)', type: 'number', size: 'sm' },
    { key: 'qtPeso', label: 'Peso', type: 'number', size: 'sm' },
    { key: 'idUnidadeMedida', label: 'Unidade', type: 'number', lookupEndpoint: 'measurement-units', lookupLabelKey: 'cnUnidade', size: 'sm' },
  ],
};

type DrawerMode = 'training' | 'exercise';

type TrainingRegistrationProps = {
  readOnly?: boolean;
};

export function TrainingRegistration({ readOnly = false }: TrainingRegistrationProps) {
  const trainingNameInputRef = useRef<HTMLInputElement | null>(null);

  // Training list state
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [trainingsPage, setTrainingsPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [isLoadingTrainings, setIsLoadingTrainings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected training state
  const [selectedTrainingId, setSelectedTrainingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [trainingName, setTrainingName] = useState('');
  const [isTrainingActive, setIsTrainingActive] = useState(true);
  const [feedback, setFeedback] = useState('');

  // Exercise list state
  const [trainingRelatedRecords, setTrainingRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingTrainingRelatedRecords, setIsLoadingTrainingRelatedRecords] = useState(false);
  const [trainingRelatedSearchTerm, setTrainingRelatedSearchTerm] = useState('');

  // Selected exercise state
  const [selectedTrainingRelatedRecordId, setSelectedTrainingRelatedRecordId] = useState<number | null>(null);
  const [isCreatingTrainingRelated, setIsCreatingTrainingRelated] = useState(false);
  const [trainingRelatedFormValues, setTrainingRelatedFormValues] = useState<Record<string, string>>({});
  const [isTrainingRelatedActive, setIsTrainingRelatedActive] = useState(true);
  const [trainingRelatedFeedback, setTrainingRelatedFeedback] = useState('');
  const [trainingRelatedLookups, setTrainingRelatedLookups] = useState<Record<string, LookupRecord[]>>({});

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('training');

  const isTrainingFormEnabled = selectedTrainingId !== null || isCreating;
  const isExerciseFormEnabled = Boolean(selectedTrainingId) && (selectedTrainingRelatedRecordId !== null || isCreatingTrainingRelated);

  const filteredTrainingRelatedRecords = trainingRelatedRecords.filter((record) =>
    trainingRelatedConfig.columns.some((column) =>
      formatChildSearchValue(record, column, trainingRelatedLookups[column.key]).includes(
        trainingRelatedSearchTerm.toLowerCase(),
      ),
    ),
  );

  const filteredTrainings = trainings.filter((training) => {
    const search = searchTerm.toLowerCase();
    const company = companies.find((item) => item.id === training.idEmpresa);
    const level = levels.find((item) => item.id === training.idNivel);

    return (
      training.dsTreino.toLowerCase().includes(search) ||
      String(company?.dsEmpresa ?? '').toLowerCase().includes(search) ||
      String(level?.dsNivel ?? '').toLowerCase().includes(search) ||
      (training.boInativo === false ? 'ativo' : 'inativo').includes(search)
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
      setCompanies(companiesData.filter((company) => company.boInativo === false));
      setLevels(levelsData.filter((level) => level.boInativo === false));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadExercises(trainingId = selectedTrainingId) {
    if (!trainingId) {
      setTrainingRelatedRecords([]);
      setIsLoadingTrainingRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingTrainingRelatedRecords(true);
      const response = await fetch(`${apiUrl}/trainings/${trainingId}/related/${trainingRelatedConfig.endpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar os exercícios.');
      }

      setTrainingRelatedRecords((await response.json()) as CompanyChildRecord[]);
      setTrainingRelatedFeedback('');
    } catch (error) {
      setTrainingRelatedFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios.');
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
    async function loadExerciseLookups() {
      const lookupFields = trainingRelatedConfig.fields.filter((field) => field.lookupEndpoint);
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) return;
          const response = await fetch(`${apiUrl}/${field.lookupEndpoint}`);
          if (!response.ok) await getApiError(response, `Não foi possível carregar ${field.label}.`);
          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setTrainingRelatedLookups((current) => ({ ...current, ...nextLookups }));
    }

    void loadExerciseLookups().catch((error) => {
      setTrainingRelatedFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    });
  }, []);

  useEffect(() => {
    setTrainingsPage(1);
  }, [searchTerm]);

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
    void loadExercises();
  }, [selectedTrainingId]);

  function clearTrainingForm() {
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

  function clearExerciseForm() {
    setSelectedTrainingRelatedRecordId(null);
    setIsCreatingTrainingRelated(false);
    setTrainingRelatedFormValues({});
    setIsTrainingRelatedActive(true);
    setTrainingRelatedFeedback('');
  }

  function handleNewTraining() {
    clearTrainingForm();
    setIsCreating(true);
    setIsTrainingActive(true);
    setIsDrawerOpen(true);
    setDrawerMode('training');
    setTimeout(() => trainingNameInputRef.current?.focus(), 100);
  }

  function handleSelectTraining(training: Training) {
    if (training.id === selectedTrainingId) {
      clearTrainingForm();
      return;
    }

    setSelectedTrainingId(training.id);
    setIsCreating(false);
    setSelectedCompanyId(training.idEmpresa ? String(training.idEmpresa) : '');
    setSelectedLevelId(training.idNivel ? String(training.idNivel) : '');
    setTrainingName(training.dsTreino);
    setIsTrainingActive(training.boInativo === false);
    setFeedback('');
    setTrainingRelatedFeedback('');
  }

  function handleEditTraining(training: Training) {
    setSelectedTrainingId(training.id);
    setIsCreating(false);
    setSelectedCompanyId(training.idEmpresa ? String(training.idEmpresa) : '');
    setSelectedLevelId(training.idNivel ? String(training.idNivel) : '');
    setTrainingName(training.dsTreino);
    setIsTrainingActive(training.boInativo === false);
    setFeedback('');
    setIsDrawerOpen(true);
    setDrawerMode('training');
  }

  function handleNewExercise() {
    setSelectedTrainingRelatedRecordId(null);
    setIsCreatingTrainingRelated(true);
    setTrainingRelatedFormValues(
      trainingRelatedConfig.fields.reduce<Record<string, string>>((current, field) => {
        if (field.key === 'idEmpresa') {
          current[field.key] = selectedCompanyId;
        } else if (['nrOrdem', 'nrSeries', 'nrRepeticoes', 'qtDescanso'].includes(field.key)) {
          current[field.key] = '0';
        }
        return current;
      }, {}),
    );
    setIsTrainingRelatedActive(true);
    setTrainingRelatedFeedback('');
    setIsDrawerOpen(true);
    setDrawerMode('exercise');
  }

  function handleSelectExercise(record: CompanyChildRecord) {
    setSelectedTrainingRelatedRecordId(record.id);
  }

  function handleEditExercise(record: CompanyChildRecord) {
    const values = trainingRelatedConfig.fields.reduce<Record<string, string>>((current, field) => {
      const value = record[field.key];
      current[field.key] = String(value ?? '');
      return current;
    }, {});

    setSelectedTrainingRelatedRecordId(record.id);
    setIsCreatingTrainingRelated(false);
    setTrainingRelatedFormValues(values);
    setIsTrainingRelatedActive((record.boInativo ?? false) === false);
    setTrainingRelatedFeedback('');
    setIsDrawerOpen(true);
    setDrawerMode('exercise');
  }

  function handleCloseDrawer() {
    setIsDrawerOpen(false);
  }

  function getLevelLabel(levelId: number | null) {
    return levels.find((level) => level.id === levelId)?.dsNivel ?? '-';
  }

  async function handleToggleTrainingStatus() {
    const nextActive = !isTrainingActive;
    setIsTrainingActive(nextActive);

    if (!selectedTrainingId) return;

    try {
      const response = await fetch(`${apiUrl}/trainings/${selectedTrainingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? false : true }),
      });

      if (!response.ok) {
        await getApiError(response, 'Não foi possível alterar o status.');
      }

      const updatedTraining = (await response.json()) as Training;
      setTrainings((current) =>
        current.map((training) => (training.id === updatedTraining.id ? updatedTraining : training)),
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
        boInativo: isTrainingActive ? false : true,
      };
      const response = await fetch(
        isCreating ? `${apiUrl}/trainings` : `${apiUrl}/trainings/${selectedTrainingId}`,
        {
          method: isCreating ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
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

  async function handleToggleExerciseStatus() {
    const nextActive = !isTrainingRelatedActive;
    setIsTrainingRelatedActive(nextActive);

    if (!selectedTrainingId || !selectedTrainingRelatedRecordId) return;

    try {
      const response = await fetch(
        `${apiUrl}/trainings/${selectedTrainingId}/related/${trainingRelatedConfig.endpoint}/${selectedTrainingRelatedRecordId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? false : true }),
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

  async function handleSaveExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      const payload = trainingRelatedConfig.fields.reduce<Record<string, string | number | boolean | null>>(
        (current, field) => {
          const value = trainingRelatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        { boInativo: isTrainingRelatedActive ? false : true },
      );

      const response = await fetch(
        selectedTrainingRelatedRecordId
          ? `${apiUrl}/trainings/${selectedTrainingId}/related/${trainingRelatedConfig.endpoint}/${selectedTrainingRelatedRecordId}`
          : `${apiUrl}/trainings/${selectedTrainingId}/related/${trainingRelatedConfig.endpoint}`,
        {
          method: selectedTrainingRelatedRecordId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o exercício.');
      }

      const savedRecord = (await response.json()) as CompanyChildRecord;
      await loadExercises(selectedTrainingId);
      setSelectedTrainingRelatedRecordId(savedRecord.id);
      setIsCreatingTrainingRelated(false);
      setTrainingRelatedFeedback(`${trainingRelatedConfig.label} salvo com sucesso.`);
    } catch (error) {
      setTrainingRelatedFeedback(error instanceof Error ? error.message : 'Erro ao salvar exercício.');
    }
  }

  return (
    <>
    <header className="module-page-header">
      <p className="section-label">Treino</p>
      <h2 className="module-page-title">CADASTRO DE TREINOS</h2>
    </header>
    <div className="form-view company-view">

      <div className={`training-page-layout${selectedTrainingId !== null ? ' has-exercises' : ''}`}>
        <section className="data-grid-section">
          <RegistrationGrid<Training>
            ariaLabel="Treinos cadastrados"
            label="Treinos"
            columns={[
              { label: 'Treino', render: (t) => t.dsTreino, tooltip: (t) => t.dsTreino },
              { label: 'Nível', render: (t) => getLevelLabel(t.idNivel), tooltip: (t) => getLevelLabel(t.idNivel) },
              {
                label: 'Status',
                render: (t) => (
                  <span className={`status-badge ${t.boInativo === false ? 'active' : 'inactive'}`}>
                    {t.boInativo === false ? 'Ativo' : 'Inativo'}
                  </span>
                ),
              },
            ]}
            records={paginatedTrainings}
            isLoading={isLoadingTrainings}
            selectedId={selectedTrainingId}
            onSelect={handleSelectTraining}
            onEdit={readOnly ? undefined : handleEditTraining}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar treino"
            onNew={handleNewTraining}
            showNewButton={!readOnly}
            page={trainingsPage}
            totalItems={filteredTrainings.length}
            onPageChange={setTrainingsPage}
          />
        </section>

        {selectedTrainingId !== null ? (
          <section className="data-grid-section">
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
              onSelect={handleSelectExercise}
              onEdit={readOnly ? undefined : handleEditExercise}
              searchTerm={trainingRelatedSearchTerm}
              onSearch={setTrainingRelatedSearchTerm}
              onNew={handleNewExercise}
              newDisabled={!selectedTrainingId}
              showNewButton={!readOnly}
              variant="child"
            />
          </section>
        ) : null}
      </div>

      {!readOnly ? (
        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={drawerMode === 'training' ? 'Cadastro de Treino' : trainingRelatedConfig.label}
          onClose={handleCloseDrawer}
        >
          {drawerMode === 'training' ? (
            <form className="drawer-fields" onSubmit={handleSaveTraining}>
              {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}

              <RegistrationField htmlFor="trainingName" label="Nome do treino" required size="full">
                <input
                  disabled={!isTrainingFormEnabled}
                  id="trainingName"
                  maxLength={255}
                  onChange={(event) => setTrainingName(event.target.value)}
                  ref={trainingNameInputRef}
                  required
                  type="text"
                  value={trainingName}
                />
              </RegistrationField>

              <RegistrationField htmlFor="trainingCompany" label="Empresa" size="lg">
                <select
                  disabled={!isTrainingFormEnabled}
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

              <RegistrationField htmlFor="trainingLevel" label="Nível" size="md">
                <select
                  disabled={!isTrainingFormEnabled}
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

              <RegistrationField htmlFor="trainingStatus" label="Status" size="sm">
                <button
                  aria-pressed={isTrainingActive}
                  className={`status-toggle ${isTrainingActive ? 'active' : ''}`}
                  disabled={!isTrainingFormEnabled}
                  id="trainingStatus"
                  onClick={handleToggleTrainingStatus}
                  type="button"
                >
                  <span>{isTrainingActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </RegistrationField>

              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button
                  className="secondary-button"
                  onClick={() => { clearTrainingForm(); handleCloseDrawer(); }}
                  type="button"
                >
                  Limpar
                </button>
                <button disabled={!isTrainingFormEnabled} type="submit">
                  <Save size={16} />
                  Salvar treino
                </button>
              </div>
            </form>
          ) : (
            <form className="drawer-fields" onSubmit={handleSaveExercise}>
              {trainingRelatedFeedback ? (
                <div className="form-feedback" style={{ flex: '1 1 100%' }}>{trainingRelatedFeedback}</div>
              ) : null}

              {trainingRelatedConfig.fields.map((field: CompanyChildField) => (
                <RegistrationField
                  htmlFor={`exercise-${field.key}`}
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  size={field.size}
                >
                  {field.selectOptions ? (
                    <select
                      disabled={!isExerciseFormEnabled}
                      id={`exercise-${field.key}`}
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
                      {field.selectOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.lookupEndpoint ? (
                    <select
                      disabled={!isExerciseFormEnabled}
                      id={`exercise-${field.key}`}
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
                      disabled={!isExerciseFormEnabled}
                      id={`exercise-${field.key}`}
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

              <RegistrationField htmlFor="exerciseStatus" label="Status" size="sm">
                <button
                  aria-pressed={isTrainingRelatedActive}
                  className={`status-toggle ${isTrainingRelatedActive ? 'active' : ''}`}
                  disabled={!isExerciseFormEnabled}
                  id="exerciseStatus"
                  onClick={handleToggleExerciseStatus}
                  type="button"
                >
                  <span>{isTrainingRelatedActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </RegistrationField>

              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button
                  className="secondary-button"
                  disabled={!selectedTrainingId}
                  onClick={() => { clearExerciseForm(); handleCloseDrawer(); }}
                  type="button"
                >
                  Limpar
                </button>
                <button disabled={!isExerciseFormEnabled} type="submit">
                  <Save size={16} />
                  Salvar {trainingRelatedConfig.label}
                </button>
              </div>
            </form>
          )}
        </RegistrationDrawer>
      ) : null}
    </div>
    </>
  );
}
