'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Dumbbell, LayoutList, Save, Trash2 } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, getLookupLabel, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import { limitesDoCampo } from '../../shared/registration/campoLimites';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import type { Company, CompanyChildField, CompanyChildRecord, CompanyChildTable, Level, LookupRecord, Training } from '../../shared/registration/registrationTypes';
import { useToast } from '../../shared/components/Toast';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useEnvio } from '../../shared/registration/useEnvio';


const trainingRelatedConfig: CompanyChildTable = {
  key: 'exercises',
  endpoint: 'exercises',
  label: 'Exercícios',
  labelSingular: 'Exercício',
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

/**
 * O campo de exercício da configuração acima, isolado porque a montagem em lote
 * precisa dele para rotular cada opção (`getLookupLabel` pede o campo, não a
 * chave). Buscar por `find` a cada render seria varrer a lista à toa.
 */
const campoDoExercicio = trainingRelatedConfig.fields.find(
  (field) => field.key === 'idExercicio',
) as CompanyChildField;

type DrawerMode = 'training' | 'exercise' | 'lote';

/**
 * Um exercicio ja escolhido para a montagem em lote, com os numeros que ele vai
 * receber. Guarda o NOME junto do id porque a pre-visualizacao precisa
 * mostra-lo sem revarrer a lista de lookup a cada render.
 */
type ItemDoLote = {
  idExercicio: number;
  dsExercicio: string;
  nrSeries: string;
  nrRepeticoes: string;
  qtDescanso: string;
};

type TrainingRegistrationProps = {
  readOnly?: boolean;
};

export function TrainingRegistration({ readOnly = false }: TrainingRegistrationProps) {
  const { showToast } = useToast();
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

  // Montagem em lote dos exercicios do treino.
  const { enviando, envolver } = useEnvio();
  const [loteItens, setLoteItens] = useState<ItemDoLote[]>([]);
  const [loteBusca, setLoteBusca] = useState('');
  const [loteSeries, setLoteSeries] = useState('3');
  const [loteRepeticoes, setLoteRepeticoes] = useState('12');
  const [loteDescanso, setLoteDescanso] = useState('60');
  const [loteMetodoId, setLoteMetodoId] = useState('');
  const [loteUnidadeId, setLoteUnidadeId] = useState('');
  const [loteFeedback, setLoteFeedback] = useState('');

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

  // ── Montagem em lote ────────────────────────────────────────────
  //
  // Mesmo desenho da montagem de agenda: o formulário à esquerda define o que
  // vale para todos, e a pré-visualização à direita mostra o que será criado —
  // já editável, para não precisar de uma segunda passada corrigindo linha por
  // linha depois de salvar.
  //
  // Montar um treino de dez exercícios pelo caminho antigo custava dez idas ao
  // drawer: abrir, escolher, preencher seis campos, salvar, repetir.

  /**
   * Opções do seletor: filtradas pela busca, e SEM os exercícios que o treino
   * já tem — reoferecer um que já está lá só produziria linha duplicada.
   */
  const exerciciosDisponiveis = (trainingRelatedLookups['idExercicio'] ?? []).filter((option) => {
    const jaNoTreino = trainingRelatedRecords.some(
      (registro) => Number(registro.idExercicio) === Number(option.id),
    );
    if (jaNoTreino) return false;
    const busca = loteBusca.trim().toLowerCase();
    if (!busca) return true;
    return getLookupLabel(option, campoDoExercicio).toLowerCase().includes(busca);
  });

  function handleAbrirLote() {
    setLoteItens([]);
    setLoteBusca('');
    setLoteFeedback('');
    setLoteMetodoId('');
    setLoteUnidadeId('');
    setDrawerMode('lote');
    setIsDrawerOpen(true);
  }

  /** Marca ou desmarca um exercício. O clique é o mesmo nos dois sentidos. */
  function alternarNoLote(exercicio: LookupRecord) {
    const id = Number(exercicio.id);
    setLoteItens((atual) => {
      const jaEsta = atual.some((item) => item.idExercicio === id);
      if (jaEsta) return atual.filter((item) => item.idExercicio !== id);
      return [
        ...atual,
        {
          idExercicio: id,
          dsExercicio: getLookupLabel(exercicio, campoDoExercicio),
          // Os padrões entram no momento da escolha, e não na hora de salvar:
          // assim, mudar o padrão depois não reescreve o que já foi ajustado à
          // mão na pré-visualização.
          nrSeries: loteSeries,
          nrRepeticoes: loteRepeticoes,
          qtDescanso: loteDescanso,
        },
      ];
    });
  }

  function atualizarItemDoLote(idExercicio: number, campo: keyof ItemDoLote, valor: string) {
    setLoteItens((atual) =>
      atual.map((item) => (item.idExercicio === idExercicio ? { ...item, [campo]: valor } : item)),
    );
  }

  async function handleSalvarLote() {
    if (!selectedTrainingId) {
      setLoteFeedback('Selecione um treino.');
      return;
    }
    if (loteItens.length === 0) {
      setLoteFeedback('Escolha ao menos um exercício.');
      return;
    }

    // A ordem continua de onde o treino parou, em vez de recomeçar do 1 — senão
    // um lote adicionado a um treino que já tem exercícios embaralharia a
    // sequência que o aluno segue.
    const maiorOrdem = trainingRelatedRecords.reduce(
      (maior, registro) => Math.max(maior, Number(registro.nrOrdem ?? 0)),
      0,
    );

    try {
      setLoteFeedback('');
      let criados = 0;
      for (const [indice, item] of loteItens.entries()) {
        const response = await fetch(
          `${apiUrl}/trainings/${selectedTrainingId}/related/${trainingRelatedConfig.endpoint}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idExercicio: item.idExercicio,
              idEmpresa: selectedCompanyId || null,
              idMetodoTreino: loteMetodoId || null,
              idUnidadeMedida: loteUnidadeId || null,
              nrOrdem: maiorOrdem + indice + 1,
              nrSeries: Number(item.nrSeries || 0),
              nrRepeticoes: Number(item.nrRepeticoes || 0),
              qtDescanso: Number(item.qtDescanso || 0),
              boInativo: false,
            }),
          },
        );
        if (!response.ok) {
          // Para no primeiro erro e diz QUANTOS entraram. O laço não é
          // transação: sem esse número, a pessoa não saberia se recomeça do
          // zero ou continua de onde parou.
          await getApiError(
            response,
            `Não foi possível adicionar "${item.dsExercicio}". ${criados} de ${loteItens.length} foram salvos.`,
          );
        }
        criados += 1;
      }

      showToast(`${criados} exercício${criados !== 1 ? 's' : ''} adicionado${criados !== 1 ? 's' : ''}.`);
      setIsDrawerOpen(false);
      setLoteItens([]);
      await loadExercises();
    } catch (error) {
      setLoteFeedback(error instanceof Error ? error.message : 'Erro ao adicionar os exercícios.');
      // Recarrega mesmo com erro: parte do lote pode ter entrado, e a grade tem
      // de refletir o que existe de verdade.
      await loadExercises();
    }
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
      showToast('Treino salvo com sucesso.');
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
      setTrainingRelatedFeedback(`${trainingRelatedConfig.labelSingular ?? trainingRelatedConfig.label} salvo com sucesso.`);
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
              { label: 'Treino', render: (t) => t.dsTreino, tooltip: (t) => t.dsTreino, sortValue: (t) => t.dsTreino },
              { label: 'Nível', render: (t) => getLevelLabel(t.idNivel), tooltip: (t) => getLevelLabel(t.idNivel) },
              {
                label: 'Status',
                render: (t) => (
                  <span className={`status-badge ${t.boInativo === false ? 'active' : 'inactive'}`}>
                    {t.boInativo === false ? 'Ativo' : 'Inativo'}
                  </span>
                ),
                sortValue: (t) => (t.boInativo === false ? 0 : 1),
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
              acaoExtra={
                readOnly ? undefined : (
                  <button
                    className="secondary-button"
                    disabled={!selectedTrainingId}
                    onClick={handleAbrirLote}
                    type="button"
                  >
                    <LayoutList size={16} />
                    Em lote
                  </button>
                )
              }
              variant="child"
            />
          </section>
        ) : null}
      </div>

      {!readOnly ? (
        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={
            drawerMode === 'training'
              ? 'Cadastro de Treino'
              : drawerMode === 'lote'
                ? 'Montagem do treino'
                : trainingRelatedConfig.label
          }
          onClose={handleCloseDrawer}
        >
          {drawerMode === 'lote' ? (
            <div className="schedule-drawer-layout">
              <form className="schedule-drawer-form" onSubmit={envolver(handleSalvarLote)}>
                {loteFeedback ? (
                  <div className="form-feedback" style={{ gridColumn: '1 / -1' }}>{loteFeedback}</div>
                ) : null}

                <RegistrationField htmlFor="loteSeries" label="Séries" size="xs">
                  <input
                    id="loteSeries"
                    min={0}
                    onChange={(e) => setLoteSeries(e.target.value)}
                    type="number"
                    value={loteSeries}
                  />
                </RegistrationField>

                <RegistrationField htmlFor="loteRepeticoes" label="Repetições" size="xs">
                  <input
                    id="loteRepeticoes"
                    min={0}
                    onChange={(e) => setLoteRepeticoes(e.target.value)}
                    type="number"
                    value={loteRepeticoes}
                  />
                </RegistrationField>

                <RegistrationField htmlFor="loteDescanso" label="Descanso (s)" size="sm">
                  <input
                    id="loteDescanso"
                    min={0}
                    onChange={(e) => setLoteDescanso(e.target.value)}
                    type="number"
                    value={loteDescanso}
                  />
                </RegistrationField>

                <RegistrationField htmlFor="loteMetodo" label="Método de treino" size="md">
                  <select
                    id="loteMetodo"
                    onChange={(e) => setLoteMetodoId(e.target.value)}
                    value={loteMetodoId}
                  >
                    <option value="">Selecione</option>
                    {(trainingRelatedLookups['idMetodoTreino'] ?? []).map((option) => (
                      <option key={option.id} value={option.id}>
                        {getLookupLabel(option, { key: 'idMetodoTreino', label: '', lookupLabelKey: 'nmMetodoTreino' } as CompanyChildField)}
                      </option>
                    ))}
                  </select>
                </RegistrationField>

                <RegistrationField htmlFor="loteUnidade" label="Unidade" size="sm">
                  <select
                    id="loteUnidade"
                    onChange={(e) => setLoteUnidadeId(e.target.value)}
                    value={loteUnidadeId}
                  >
                    <option value="">Selecione</option>
                    {(trainingRelatedLookups['idUnidadeMedida'] ?? []).map((option) => (
                      <option key={option.id} value={option.id}>
                        {getLookupLabel(option, { key: 'idUnidadeMedida', label: '', lookupLabelKey: 'cnUnidade' } as CompanyChildField)}
                      </option>
                    ))}
                  </select>
                </RegistrationField>

                <p className="form-hint" style={{ gridColumn: '1 / -1' }}>
                  Os valores acima entram nos exercícios que você marcar a partir de agora. O que já
                  está na lista ao lado não muda — ajuste lá o que for diferente.
                </p>

                <div className="lote-escolha" style={{ gridColumn: '1 / -1' }}>
                  <label className="search-field">
                    <span>Exercícios</span>
                    <input
                      maxLength={100}
                      onChange={(e) => setLoteBusca(e.target.value)}
                      placeholder="Buscar exercício"
                      type="search"
                      value={loteBusca}
                    />
                  </label>

                  <div className="lote-opcoes" role="group" aria-label="Exercícios disponíveis">
                    {exerciciosDisponiveis.length === 0 ? (
                      <p className="form-hint">Nenhum exercício encontrado.</p>
                    ) : (
                      exerciciosDisponiveis.map((exercicio) => {
                        const marcado = loteItens.some((item) => item.idExercicio === Number(exercicio.id));
                        return (
                          <label className={`lote-opcao${marcado ? ' marcada' : ''}`} key={exercicio.id}>
                            <input
                              checked={marcado}
                              onChange={() => alternarNoLote(exercicio)}
                              type="checkbox"
                            />
                            <span>{getLookupLabel(exercicio, campoDoExercicio)}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                  <button className="secondary-button" onClick={handleCloseDrawer} type="button">
                    Cancelar
                  </button>
                  <button disabled={enviando || loteItens.length === 0} type="submit">
                    <Save size={16} />
                    {enviando
                      ? 'Adicionando...'
                      : `Adicionar ${loteItens.length || ''} ao treino`.trim()}
                  </button>
                </div>
              </form>

              <aside className="schedule-drawer-preview">
                <div className="activity-schedule-preview-header">
                  <div>
                    <p className="section-label">Pré-visualização</p>
                    <h4>Exercícios do treino</h4>
                  </div>
                  <strong>{loteItens.length}</strong>
                </div>

                {loteItens.length === 0 ? (
                  <div className="form-hint">
                    Marque os exercícios à esquerda. Eles aparecem aqui na ordem em que foram
                    escolhidos, e é essa a ordem em que o aluno vai executar.
                  </div>
                ) : (
                  <ol className="lote-previsao">
                    {loteItens.map((item, indice) => (
                      <li key={item.idExercicio}>
                        <div className="lote-previsao-topo">
                          <strong>
                            {indice + 1}. {item.dsExercicio}
                          </strong>
                          <button
                            aria-label={`Remover ${item.dsExercicio}`}
                            className="lote-remover"
                            onClick={() => alternarNoLote({ id: item.idExercicio } as LookupRecord)}
                            type="button"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="lote-previsao-numeros">
                          <label>
                            <span>Séries</span>
                            <input
                              min={0}
                              onChange={(e) =>
                                atualizarItemDoLote(item.idExercicio, 'nrSeries', e.target.value)
                              }
                              type="number"
                              value={item.nrSeries}
                            />
                          </label>
                          <label>
                            <span>Reps</span>
                            <input
                              min={0}
                              onChange={(e) =>
                                atualizarItemDoLote(item.idExercicio, 'nrRepeticoes', e.target.value)
                              }
                              type="number"
                              value={item.nrRepeticoes}
                            />
                          </label>
                          <label>
                            <span>Descanso</span>
                            <input
                              min={0}
                              onChange={(e) =>
                                atualizarItemDoLote(item.idExercicio, 'qtDescanso', e.target.value)
                              }
                              type="number"
                              value={item.qtDescanso}
                            />
                          </label>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </aside>
            </div>
          ) : drawerMode === 'training' ? (
            <form className="drawer-fields" onSubmit={envolver(handleSaveTraining)}>
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
                <button disabled={!isTrainingFormEnabled || enviando} type="submit">
                  <Save size={16} />
                  Salvar treino
                </button>
              </div>
            </form>
          ) : (
            <form className="drawer-fields" onSubmit={envolver(handleSaveExercise)}>
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
                      // `qtPeso` e Decimal(8,2): com o antigo `min` sozinho, o
                      // step=1 padrao do browser recusava 12,5 kg.
                      {...limitesDoCampo(field)}
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
                <button disabled={!isExerciseFormEnabled || enviando} type="submit">
                  <Save size={16} />
                  Salvar {trainingRelatedConfig.labelSingular ?? trainingRelatedConfig.label}
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
