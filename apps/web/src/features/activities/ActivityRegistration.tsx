'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  GRID_PAGE_SIZE,
  GridPagination,
  formatChildCell,
  formatChildSearchValue,
  formatDateInput,
  getLookupLabel,
  paginateItems,
} from '../../shared/registration/registrationHelpers';
import type { Activity, Company, CompanyChildRecord, CompanyChildTable, LookupRecord, Sport } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type ActivityRegistrationProps = {
  readOnly?: boolean;
};

const activityRelatedTables: CompanyChildTable[] = [
  {
    key: 'schedules',
    endpoint: 'schedules',
    label: 'Agendas',
    title: 'Agendas da atividade',
    columns: [
      { key: 'idEmpresa', label: 'Empresa', lookupLabelKey: 'dsEmpresa' },
      { key: 'idCategoria', label: 'Categoria', lookupLabelKey: 'dsCategoria' },
      { key: 'dtInicial', label: 'Inicial', type: 'date' },
      { key: 'dtFinal', label: 'Final', type: 'date' },
      { key: 'qtAlunos', label: 'Alunos' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' },
      { key: 'idCategoria', label: 'Categoria', type: 'number', lookupEndpoint: 'categories', lookupLabelKey: 'dsCategoria' },
      { key: 'dtInicial', label: 'Data inicial', type: 'date' },
      { key: 'dtFinal', label: 'Data final', type: 'date' },
      { key: 'qtAlunos', label: 'Qtd alunos', type: 'number' },
    ],
  },
];

const scheduleEmployeeTab = {
  key: 'scheduleEmployees',
  label: 'Profissionais da Agenda',
};

const scheduleStudentTab = {
  key: 'scheduleStudents',
  label: 'Alunos da Agenda',
};

export function ActivityRegistration({ readOnly = false }: ActivityRegistrationProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');
  const [activityName, setActivityName] = useState('');
  const [isActivityActive, setIsActivityActive] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [isActivityFieldsCollapsed, setIsActivityFieldsCollapsed] = useState(false);
  const [selectedRelatedTable, setSelectedRelatedTable] = useState('');
  const [selectedScheduleRecordId, setSelectedScheduleRecordId] = useState<number | null>(null);
  const [relatedRecords, setRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingRelatedRecords, setIsLoadingRelatedRecords] = useState(false);
  const [relatedSearchTerm, setRelatedSearchTerm] = useState('');
  const [selectedRelatedRecordId, setSelectedRelatedRecordId] = useState<number | null>(null);
  const [isCreatingRelated, setIsCreatingRelated] = useState(false);
  const [relatedFormValues, setRelatedFormValues] = useState<Record<string, string>>({});
  const [isRelatedActive, setIsRelatedActive] = useState(true);
  const [relatedFeedback, setRelatedFeedback] = useState('');
  const [relatedLookups, setRelatedLookups] = useState<Record<string, LookupRecord[]>>({});
  const [isRelatedFieldsCollapsed, setIsRelatedFieldsCollapsed] = useState(false);
  const [scheduleEmployees, setScheduleEmployees] = useState<CompanyChildRecord[]>([]);
  const [isLoadingScheduleEmployees, setIsLoadingScheduleEmployees] = useState(false);
  const [scheduleEmployeeSearchTerm, setScheduleEmployeeSearchTerm] = useState('');
  const [selectedScheduleEmployeeId, setSelectedScheduleEmployeeId] = useState<number | null>(null);
  const [isCreatingScheduleEmployee, setIsCreatingScheduleEmployee] = useState(false);
  const [scheduleEmployeeFormValues, setScheduleEmployeeFormValues] = useState<Record<string, string>>({});
  const [isScheduleEmployeeActive, setIsScheduleEmployeeActive] = useState(true);
  const [scheduleEmployeeFeedback, setScheduleEmployeeFeedback] = useState('');
  const [isScheduleEmployeeFieldsCollapsed, setIsScheduleEmployeeFieldsCollapsed] = useState(false);
  const [scheduleStudents, setScheduleStudents] = useState<CompanyChildRecord[]>([]);
  const [isLoadingScheduleStudents, setIsLoadingScheduleStudents] = useState(false);
  const [scheduleStudentSearchTerm, setScheduleStudentSearchTerm] = useState('');
  const [selectedScheduleStudentId, setSelectedScheduleStudentId] = useState<number | null>(null);
  const [isCreatingScheduleStudent, setIsCreatingScheduleStudent] = useState(false);
  const [scheduleStudentFormValues, setScheduleStudentFormValues] = useState<Record<string, string>>({});
  const [isScheduleStudentActive, setIsScheduleStudentActive] = useState(true);
  const [scheduleStudentFeedback, setScheduleStudentFeedback] = useState('');
  const [isScheduleStudentFieldsCollapsed, setIsScheduleStudentFieldsCollapsed] = useState(false);
  const isFormEnabled = !readOnly && (selectedActivityId !== null || isCreating);
  const isScheduleEmployeesTab = selectedRelatedTable === scheduleEmployeeTab.key;
  const isScheduleStudentsTab = selectedRelatedTable === scheduleStudentTab.key;
  const relatedConfig = isScheduleEmployeesTab
    ? null
    : isScheduleStudentsTab
      ? null
    : activityRelatedTables.find((table) => table.key === selectedRelatedTable) ?? null;
  const scheduleConfig = activityRelatedTables[0]!;
  const visibleRelatedConfig = relatedConfig ?? (
    isScheduleEmployeesTab || isScheduleStudentsTab ? scheduleConfig : null
  );
  const isRelatedFormEnabled =
    !readOnly && Boolean(selectedActivityId) && (selectedRelatedRecordId !== null || isCreatingRelated);
  const filteredRelatedRecords = relatedRecords.filter((record) =>
    visibleRelatedConfig
      ? visibleRelatedConfig.columns.some((column) =>
        formatChildSearchValue(record, column, relatedLookups[column.key]).includes(relatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const selectedScheduleId = selectedScheduleRecordId;
  const filteredScheduleEmployees = scheduleEmployees.filter((record) => {
    const search = scheduleEmployeeSearchTerm.toLowerCase();
    const company = relatedLookups.idEmpresa?.find((item) => String(item.id) === String(record.idEmpresa));
    const employee = relatedLookups.idFuncionario?.find((item) => String(item.id) === String(record.idFuncionario));

    return (
      String(company?.dsEmpresa ?? record.idEmpresa ?? '').toLowerCase().includes(search) ||
      String(employee?.nmFuncionario ?? record.idFuncionario ?? '').toLowerCase().includes(search) ||
      (Number(record.boInativo ?? 0) === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const filteredScheduleStudents = scheduleStudents.filter((record) => {
    const search = scheduleStudentSearchTerm.toLowerCase();
    const company = relatedLookups.idEmpresa?.find((item) => String(item.id) === String(record.idEmpresa));
    const student = relatedLookups.idAluno?.find((item) => String(item.id) === String(record.idAluno));

    return (
      String(company?.dsEmpresa ?? record.idEmpresa ?? '').toLowerCase().includes(search) ||
      String(student?.nmAluno ?? record.idAluno ?? '').toLowerCase().includes(search) ||
      (Number(record.boInativo ?? 0) === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const filteredActivities = activities.filter((activity) => {
    const search = searchTerm.toLowerCase();
    const company = companies.find((item) => item.id === activity.idEmpresa);
    const sport = sports.find((item) => item.id === activity.idEsporte);

    return (
      activity.dsAtividade.toLowerCase().includes(search) ||
      String(company?.dsEmpresa ?? '').toLowerCase().includes(search) ||
      String(sport?.dsEsporte ?? '').toLowerCase().includes(search) ||
      (activity.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const activitiesTotalPages = Math.max(1, Math.ceil(filteredActivities.length / GRID_PAGE_SIZE));
  const paginatedActivities = paginateItems(filteredActivities, activitiesPage);

  async function loadActivities() {
    try {
      setIsLoadingActivities(true);
      const response = await fetch(`${apiUrl}/activities?includeInactive=true`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar as atividades.');
      }

      setActivities((await response.json()) as Activity[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar atividades.');
    } finally {
      setIsLoadingActivities(false);
    }
  }

  async function loadLookups() {
    try {
      const [companiesResponse, sportsResponse] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/sports`),
      ]);

      const failedLookup = [companiesResponse, sportsResponse].find((response) => !response.ok);
      if (failedLookup) {
        await getApiError(failedLookup, 'Nao foi possivel carregar empresas e esportes.');
      }

      setCompanies(((await companiesResponse.json()) as Company[]).filter((company) => company.boInativo === 0));
      setSports(((await sportsResponse.json()) as Sport[]).filter((sport) => sport.boInativo === 0));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadRelatedRecords(activityId = selectedActivityId, config = visibleRelatedConfig) {
    if (!activityId || !config) {
      setRelatedRecords([]);
      setIsLoadingRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingRelatedRecords(true);
      const response = await fetch(`${apiUrl}/activities/${activityId}/related/${config.endpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar os registros relacionados.');
      }

      setRelatedRecords((await response.json()) as CompanyChildRecord[]);
      setRelatedFeedback('');
    } catch (error) {
      setRelatedRecords([]);
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.');
    } finally {
      setIsLoadingRelatedRecords(false);
    }
  }

  async function loadScheduleEmployees(activityId = selectedActivityId, scheduleId = selectedScheduleId) {
    if (!activityId || !scheduleId) {
      setScheduleEmployees([]);
      setIsLoadingScheduleEmployees(false);
      return;
    }

    try {
      setIsLoadingScheduleEmployees(true);
      const response = await fetch(
        `${apiUrl}/activities/${activityId}/related/schedules/${scheduleId}/employees`,
      );

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar os funcionarios da agenda.');
      }

      setScheduleEmployees((await response.json()) as CompanyChildRecord[]);
      setScheduleEmployeeFeedback('');
    } catch (error) {
      setScheduleEmployees([]);
      setScheduleEmployeeFeedback(error instanceof Error ? error.message : 'Erro ao carregar funcionarios da agenda.');
    } finally {
      setIsLoadingScheduleEmployees(false);
    }
  }

  async function loadScheduleStudents(activityId = selectedActivityId, scheduleId = selectedScheduleId) {
    if (!activityId || !scheduleId) {
      setScheduleStudents([]);
      setIsLoadingScheduleStudents(false);
      return;
    }

    try {
      setIsLoadingScheduleStudents(true);
      const response = await fetch(
        `${apiUrl}/activities/${activityId}/related/schedules/${scheduleId}/students`,
      );

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar os alunos da agenda.');
      }

      setScheduleStudents((await response.json()) as CompanyChildRecord[]);
      setScheduleStudentFeedback('');
    } catch (error) {
      setScheduleStudents([]);
      setScheduleStudentFeedback(error instanceof Error ? error.message : 'Erro ao carregar alunos da agenda.');
    } finally {
      setIsLoadingScheduleStudents(false);
    }
  }

  useEffect(() => {
    void loadActivities();
    void loadLookups();
  }, []);

  useEffect(() => {
    setActivitiesPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (activitiesPage > activitiesTotalPages) {
      setActivitiesPage(activitiesTotalPages);
    }
  }, [activitiesPage, activitiesTotalPages]);

  useEffect(() => {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(false);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    setRelatedSearchTerm('');
    setRelatedFeedback('');
    setScheduleEmployeeSearchTerm('');
    setScheduleStudentSearchTerm('');
    void loadRelatedRecords();
  }, [selectedActivityId, selectedRelatedTable]);

  useEffect(() => {
    setSelectedScheduleRecordId(null);
  }, [selectedActivityId]);

  useEffect(() => {
    setSelectedScheduleEmployeeId(null);
    setIsCreatingScheduleEmployee(false);
    setScheduleEmployeeFormValues({});
    setIsScheduleEmployeeActive(true);
    setScheduleEmployeeSearchTerm('');
    setScheduleEmployeeFeedback('');
    void loadScheduleEmployees();

    setSelectedScheduleStudentId(null);
    setIsCreatingScheduleStudent(false);
    setScheduleStudentFormValues({});
    setIsScheduleStudentActive(true);
    setScheduleStudentSearchTerm('');
    setScheduleStudentFeedback('');
    void loadScheduleStudents();
  }, [selectedActivityId, selectedScheduleId]);

  useEffect(() => {
    async function loadRelatedLookups() {
      const employeeField = { key: 'idFuncionario', label: 'Funcionario', type: 'number' as const, lookupEndpoint: 'employees', lookupLabelKey: 'nmFuncionario' };
      const studentField = { key: 'idAluno', label: 'Aluno', type: 'number' as const, lookupEndpoint: 'students', lookupLabelKey: 'nmAluno' };
      const companyField = { key: 'idEmpresa', label: 'Empresa', type: 'number' as const, lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa' };
      const lookupFields = visibleRelatedConfig
        ? visibleRelatedConfig.fields
          .filter((field) => field.lookupEndpoint)
          .concat(visibleRelatedConfig.key === 'schedules' ? [employeeField, studentField] : [])
        : isScheduleEmployeesTab
          ? [companyField, employeeField]
          : isScheduleStudentsTab
            ? [companyField, studentField]
            : [];
      if (lookupFields.length === 0) return;
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) return;
          const response = await fetch(`${apiUrl}/${field.lookupEndpoint}`);
          if (!response.ok) {
            await getApiError(response, `Nao foi possivel carregar ${field.label}.`);
          }
          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setRelatedLookups((current) => ({ ...current, ...nextLookups }));
    }

    void loadRelatedLookups().catch((error) => {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas relacionadas.');
    });
  }, [visibleRelatedConfig, isScheduleEmployeesTab, isScheduleStudentsTab]);

  function clearForm() {
    setSelectedActivityId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setSelectedSportId('');
    setActivityName('');
    setIsActivityActive(true);
    setFeedback('');
  }

  function clearRelatedForm() {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(false);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    if (relatedConfig?.key === 'schedules') {
      setSelectedScheduleRecordId(null);
    }
  }

  function clearScheduleEmployeeForm() {
    setSelectedScheduleEmployeeId(null);
    setIsCreatingScheduleEmployee(false);
    setScheduleEmployeeFormValues({});
    setIsScheduleEmployeeActive(true);
  }

  function clearScheduleStudentForm() {
    setSelectedScheduleStudentId(null);
    setIsCreatingScheduleStudent(false);
    setScheduleStudentFormValues({});
    setIsScheduleStudentActive(true);
  }

  function handleNewActivity() {
    clearForm();
    setIsCreating(true);
    setIsActivityFieldsCollapsed(false);
    setIsRelatedFieldsCollapsed(true);
    setIsScheduleEmployeeFieldsCollapsed(true);
    setIsScheduleStudentFieldsCollapsed(true);
  }

  function handleNewRelated() {
    setSelectedRelatedRecordId(null);
    setIsCreatingRelated(true);
    setRelatedFormValues({});
    setIsRelatedActive(true);
    setRelatedFeedback('');
    if (relatedConfig?.key === 'schedules') {
      setSelectedScheduleRecordId(null);
    }
    setIsActivityFieldsCollapsed(true);
    setIsRelatedFieldsCollapsed(false);
    setIsScheduleEmployeeFieldsCollapsed(true);
    setIsScheduleStudentFieldsCollapsed(true);
  }

  function handleNewScheduleEmployee() {
    setSelectedScheduleEmployeeId(null);
    setIsCreatingScheduleEmployee(true);
    setScheduleEmployeeFormValues({});
    setIsScheduleEmployeeActive(true);
    setScheduleEmployeeFeedback('');
    setIsActivityFieldsCollapsed(true);
    setIsRelatedFieldsCollapsed(true);
    setIsScheduleEmployeeFieldsCollapsed(false);
    setIsScheduleStudentFieldsCollapsed(true);
  }

  function handleNewScheduleStudent() {
    setSelectedScheduleStudentId(null);
    setIsCreatingScheduleStudent(true);
    setScheduleStudentFormValues({});
    setIsScheduleStudentActive(true);
    setScheduleStudentFeedback('');
    setIsActivityFieldsCollapsed(true);
    setIsRelatedFieldsCollapsed(true);
    setIsScheduleEmployeeFieldsCollapsed(true);
    setIsScheduleStudentFieldsCollapsed(false);
  }

  function handleSelectActivity(activity: Activity) {
    setSelectedActivityId(activity.id);
    setIsCreating(false);
    setSelectedCompanyId(activity.idEmpresa ? String(activity.idEmpresa) : '');
    setSelectedSportId(activity.idEsporte ? String(activity.idEsporte) : '');
    setActivityName(activity.dsAtividade);
    setIsActivityActive(activity.boInativo === 0);
    setFeedback('');
    setIsActivityFieldsCollapsed(false);
    setIsRelatedFieldsCollapsed(true);
    setIsScheduleEmployeeFieldsCollapsed(true);
    setIsScheduleStudentFieldsCollapsed(true);
  }

  function handleSelectRelatedRecord(record: CompanyChildRecord) {
    const config = visibleRelatedConfig;
    if (!config) return;
    const values = config.fields.reduce<Record<string, string>>((current, field) => {
      const value = record[field.key];
      current[field.key] = field.type === 'date' ? formatDateInput(String(value ?? '')) : String(value ?? '');
      return current;
    }, {});

    setSelectedRelatedRecordId(record.id);
    if (config.key === 'schedules') {
      setSelectedScheduleRecordId(record.id);
    }
    setIsCreatingRelated(false);
    setRelatedFormValues(values);
    setIsRelatedActive(Number(record.boInativo ?? 0) === 0);
    setRelatedFeedback('');
    setIsActivityFieldsCollapsed(true);
    setIsRelatedFieldsCollapsed(false);
    setIsScheduleEmployeeFieldsCollapsed(true);
    setIsScheduleStudentFieldsCollapsed(true);
  }

  function handleSelectScheduleEmployee(record: CompanyChildRecord) {
    setSelectedScheduleEmployeeId(record.id);
    setIsCreatingScheduleEmployee(false);
    setScheduleEmployeeFormValues({
      idEmpresa: record.idEmpresa ? String(record.idEmpresa) : '',
      idFuncionario: record.idFuncionario ? String(record.idFuncionario) : '',
    });
    setIsScheduleEmployeeActive(Number(record.boInativo ?? 0) === 0);
    setScheduleEmployeeFeedback('');
    setIsActivityFieldsCollapsed(true);
    setIsRelatedFieldsCollapsed(true);
    setIsScheduleEmployeeFieldsCollapsed(false);
    setIsScheduleStudentFieldsCollapsed(true);
  }

  function handleSelectScheduleStudent(record: CompanyChildRecord) {
    setSelectedScheduleStudentId(record.id);
    setIsCreatingScheduleStudent(false);
    setScheduleStudentFormValues({
      idEmpresa: record.idEmpresa ? String(record.idEmpresa) : '',
      idAluno: record.idAluno ? String(record.idAluno) : '',
    });
    setIsScheduleStudentActive(Number(record.boInativo ?? 0) === 0);
    setScheduleStudentFeedback('');
    setIsActivityFieldsCollapsed(true);
    setIsRelatedFieldsCollapsed(true);
    setIsScheduleEmployeeFieldsCollapsed(true);
    setIsScheduleStudentFieldsCollapsed(false);
  }

  function getSportLabel(sportId: number | null) {
    return sports.find((sport) => sport.id === sportId)?.dsEsporte ?? '-';
  }

  async function handleToggleActivityStatus() {
    const nextActive = !isActivityActive;
    setIsActivityActive(nextActive);

    if (!selectedActivityId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/activities/${selectedActivityId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
      });

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel alterar o status.');
      }

      const updated = (await response.json()) as Activity;
      setActivities((current) => current.map((activity) => (activity.id === updated.id ? updated : activity)));
      setFeedback('Status da atividade atualizado.');
    } catch (error) {
      setIsActivityActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activityName.trim()) {
      setFeedback('Informe a atividade.');
      return;
    }

    try {
      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        idEsporte: selectedSportId ? Number(selectedSportId) : null,
        dsAtividade: activityName.trim(),
        boInativo: isActivityActive ? 0 : 1,
      };
      const response = await fetch(
        selectedActivityId ? `${apiUrl}/activities/${selectedActivityId}` : `${apiUrl}/activities`,
        {
          method: selectedActivityId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar a atividade.');
      }

      const saved = (await response.json()) as Activity;
      await loadActivities();
      setSelectedActivityId(saved.id);
      setIsCreating(false);
      setFeedback('Atividade salva com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar atividade.');
    }
  }

  async function handleToggleRelatedStatus() {
    if (!relatedConfig) return;
    const nextActive = !isRelatedActive;
    setIsRelatedActive(nextActive);

    if (!selectedActivityId || !selectedRelatedRecordId) return;

    try {
      const response = await fetch(
        `${apiUrl}/activities/${selectedActivityId}/related/${relatedConfig.endpoint}/${selectedRelatedRecordId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
        },
      );

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel alterar o status.');
      }

      const updated = (await response.json()) as CompanyChildRecord;
      setRelatedRecords((current) => current.map((record) => (record.id === updated.id ? updated : record)));
    } catch (error) {
      setIsRelatedActive(!nextActive);
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveRelated(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!relatedConfig) {
      setRelatedFeedback('Selecione uma tabela relacionada antes de salvar.');
      return;
    }

    if (!selectedActivityId) {
      setRelatedFeedback('Selecione uma atividade antes de salvar.');
      return;
    }

    try {
      const payload = relatedConfig.fields.reduce<Record<string, string | number | null>>(
        (current, field) => {
          const value = relatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        { boInativo: isRelatedActive ? 0 : 1 },
      );

      const response = await fetch(
        selectedRelatedRecordId
          ? `${apiUrl}/activities/${selectedActivityId}/related/${relatedConfig.endpoint}/${selectedRelatedRecordId}`
          : `${apiUrl}/activities/${selectedActivityId}/related/${relatedConfig.endpoint}`,
        {
          method: selectedRelatedRecordId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar o registro relacionado.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadRelatedRecords(selectedActivityId, relatedConfig);
      setSelectedRelatedRecordId(saved.id);
      if (relatedConfig.key === 'schedules') {
        setSelectedScheduleRecordId(saved.id);
      }
      setIsCreatingRelated(false);
      setRelatedFeedback(`${relatedConfig.label} salvo com sucesso.`);
    } catch (error) {
      setRelatedFeedback(error instanceof Error ? error.message : 'Erro ao salvar registro relacionado.');
    }
  }

  async function handleToggleScheduleEmployeeStatus() {
    const nextActive = !isScheduleEmployeeActive;
    setIsScheduleEmployeeActive(nextActive);

    if (!selectedActivityId || !selectedScheduleId || !selectedScheduleEmployeeId) return;

    try {
      const response = await fetch(
        `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/employees/${selectedScheduleEmployeeId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
        },
      );

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel alterar o status.');
      }

      const updated = (await response.json()) as CompanyChildRecord;
      setScheduleEmployees((current) => current.map((record) => (record.id === updated.id ? updated : record)));
    } catch (error) {
      setIsScheduleEmployeeActive(!nextActive);
      setScheduleEmployeeFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveScheduleEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedActivityId || !selectedScheduleId) {
      setScheduleEmployeeFeedback('Selecione uma agenda antes de adicionar funcionarios.');
      return;
    }

    if (!scheduleEmployeeFormValues.idFuncionario) {
      setScheduleEmployeeFeedback('Informe o funcionario.');
      return;
    }

    try {
      const payload = {
        idEmpresa: scheduleEmployeeFormValues.idEmpresa ? Number(scheduleEmployeeFormValues.idEmpresa) : null,
        idFuncionario: scheduleEmployeeFormValues.idFuncionario ? Number(scheduleEmployeeFormValues.idFuncionario) : null,
        boInativo: isScheduleEmployeeActive ? 0 : 1,
      };
      const response = await fetch(
        selectedScheduleEmployeeId
          ? `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/employees/${selectedScheduleEmployeeId}`
          : `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/employees`,
        {
          method: selectedScheduleEmployeeId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar o funcionario da agenda.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadScheduleEmployees(selectedActivityId, selectedScheduleId);
      setSelectedScheduleEmployeeId(saved.id);
      setIsCreatingScheduleEmployee(false);
      setScheduleEmployeeFeedback('Funcionario da agenda salvo com sucesso.');
    } catch (error) {
      setScheduleEmployeeFeedback(error instanceof Error ? error.message : 'Erro ao salvar funcionario da agenda.');
    }
  }

  async function handleToggleScheduleStudentStatus() {
    const nextActive = !isScheduleStudentActive;
    setIsScheduleStudentActive(nextActive);

    if (!selectedActivityId || !selectedScheduleId || !selectedScheduleStudentId) return;

    try {
      const response = await fetch(
        `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/students/${selectedScheduleStudentId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
        },
      );

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel alterar o status.');
      }

      const updated = (await response.json()) as CompanyChildRecord;
      setScheduleStudents((current) => current.map((record) => (record.id === updated.id ? updated : record)));
    } catch (error) {
      setIsScheduleStudentActive(!nextActive);
      setScheduleStudentFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveScheduleStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedActivityId || !selectedScheduleId) {
      setScheduleStudentFeedback('Selecione uma agenda antes de adicionar alunos.');
      return;
    }

    if (!scheduleStudentFormValues.idAluno) {
      setScheduleStudentFeedback('Informe o aluno.');
      return;
    }

    try {
      const payload = {
        idEmpresa: scheduleStudentFormValues.idEmpresa ? Number(scheduleStudentFormValues.idEmpresa) : null,
        idAluno: scheduleStudentFormValues.idAluno ? Number(scheduleStudentFormValues.idAluno) : null,
        boInativo: isScheduleStudentActive ? 0 : 1,
      };
      const response = await fetch(
        selectedScheduleStudentId
          ? `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/students/${selectedScheduleStudentId}`
          : `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/students`,
        {
          method: selectedScheduleStudentId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar o aluno da agenda.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadScheduleStudents(selectedActivityId, selectedScheduleId);
      setSelectedScheduleStudentId(saved.id);
      setIsCreatingScheduleStudent(false);
      setScheduleStudentFeedback('Aluno da agenda salvo com sucesso.');
    } catch (error) {
      setScheduleStudentFeedback(error instanceof Error ? error.message : 'Erro ao salvar aluno da agenda.');
    }
  }

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Atividades</p>
      </div>

      <div className="registration-split-layout plan-split-layout">
        <section className="data-grid-section company-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Atividades</p>
            </div>
            <div className="child-grid-toolbar-actions">
              <label className="search-field">
                <span>Pesquisar</span>
                <input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar atividade"
                  type="search"
                  value={searchTerm}
                />
              </label>
              {!readOnly ? (
                <button className="new-button" onClick={handleNewActivity} type="button">
                  Novo
                </button>
              ) : null}
            </div>
          </div>

          <div className="product-table" key={`activities-${searchTerm}-${activitiesPage}`} role="table" aria-label="Atividades cadastradas">
            <div className="product-row header" role="row">
              <span role="columnheader">Atividade</span>
              <span role="columnheader">Esporte</span>
              <span role="columnheader">Status</span>
            </div>

            {isLoadingActivities ? <div className="empty-row">Carregando atividades...</div> : null}

            {!isLoadingActivities
              ? paginatedActivities.map((activity) => (
                <button
                  className={`product-row selectable ${activity.id === selectedActivityId ? 'selected' : ''}`}
                  key={activity.id}
                  onClick={() => handleSelectActivity(activity)}
                  role="row"
                  type="button"
                >
                  <span role="cell">{activity.dsAtividade}</span>
                  <span role="cell">{getSportLabel(activity.idEsporte)}</span>
                  <span role="cell">
                    <span className={`status-badge ${activity.boInativo === 0 ? 'active' : 'inactive'}`}>
                      {activity.boInativo === 0 ? 'Ativo' : 'Inativo'}
                    </span>
                  </span>
                </button>
              ))
              : null}

            {!isLoadingActivities && filteredActivities.length === 0 ? (
              <div className="empty-row">Nenhuma atividade encontrada.</div>
            ) : null}
          </div>

          <GridPagination onChange={setActivitiesPage} page={activitiesPage} totalItems={filteredActivities.length} />

          {visibleRelatedConfig ? (
            <section className="company-child-grid-section">
              {!selectedActivityId ? (
                <div className="form-hint">
                  Selecione uma atividade para visualizar os registros relacionados.
                </div>
              ) : (
                <>
                  <div className="grid-toolbar">
                    <div className="child-grid-toolbar-label">
                      <p className="section-label">{visibleRelatedConfig.label}</p>
                    </div>
                    <div className="child-grid-toolbar-actions">
                      <label className="search-field">
                        <span>Pesquisar</span>
                        <input
                          onChange={(event) => setRelatedSearchTerm(event.target.value)}
                          placeholder="Buscar registro"
                          type="search"
                          value={relatedSearchTerm}
                        />
                      </label>
                      {!readOnly ? (
                        <button className="new-button" disabled={!selectedActivityId} onClick={handleNewRelated} type="button">
                          Novo
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="product-table company-child-grid-table" key={`activity-related-${visibleRelatedConfig.key}-${relatedSearchTerm}-${selectedActivityId}`} role="table" aria-label={visibleRelatedConfig.title}>
                    <div
                      className="product-row company-child-grid-row header"
                      role="row"
                      style={{ gridTemplateColumns: `repeat(${visibleRelatedConfig.columns.length}, minmax(0, 1fr))` }}
                    >
                      {visibleRelatedConfig.columns.map((column) => (
                        <span key={column.key} role="columnheader">
                          {column.label}
                        </span>
                      ))}
                    </div>

                    {isLoadingRelatedRecords ? <div className="empty-row">Carregando {visibleRelatedConfig.label.toLowerCase()}...</div> : null}

                    {!isLoadingRelatedRecords
                      ? filteredRelatedRecords.map((record) => (
                        <button
                          className={`product-row company-child-grid-row selectable ${record.id === (selectedRelatedRecordId ?? selectedScheduleId) ? 'selected' : ''}`}
                          key={record.id}
                          onClick={() => handleSelectRelatedRecord(record)}
                          role="row"
                          style={{ gridTemplateColumns: `repeat(${visibleRelatedConfig.columns.length}, minmax(0, 1fr))` }}
                          type="button"
                        >
                          {visibleRelatedConfig.columns.map((column) => (
                            <span key={column.key} role="cell">
                              {formatChildCell(record, column, relatedLookups[column.key])}
                            </span>
                          ))}
                        </button>
                      ))
                      : null}

                    {!isLoadingRelatedRecords && filteredRelatedRecords.length === 0 ? (
                      <div className="empty-row">Nenhum registro de {visibleRelatedConfig.label.toLowerCase()} encontrado.</div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {isScheduleEmployeesTab ? (
            <section className="company-child-grid-section">
              {!selectedScheduleId ? (
                <div className="form-hint">
                  Selecione uma agenda na aba Agendas para vincular profissionais.
                </div>
              ) : null}
              <div className="grid-toolbar">
                <div className="child-grid-toolbar-label">
                  <p className="section-label">Profissionais da agenda</p>
                </div>
                <div className="child-grid-toolbar-actions">
                  <label className="search-field">
                    <span>Pesquisar</span>
                    <input
                      onChange={(event) => setScheduleEmployeeSearchTerm(event.target.value)}
                      placeholder="Buscar profissional"
                      type="search"
                      value={scheduleEmployeeSearchTerm}
                    />
                  </label>
                  {!readOnly ? (
                    <button className="new-button" disabled={!selectedScheduleId} onClick={handleNewScheduleEmployee} type="button">
                      Novo
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="product-table company-child-grid-table" key={`schedule-employees-${selectedScheduleId}-${scheduleEmployeeSearchTerm}`} role="table" aria-label="Profissionais da agenda">
                <div className="product-row company-child-grid-row header" role="row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  <span role="columnheader">Empresa</span>
                  <span role="columnheader">Profissional</span>
                  <span role="columnheader">Status</span>
                </div>

                {isLoadingScheduleEmployees ? <div className="empty-row">Carregando profissionais...</div> : null}

                {!isLoadingScheduleEmployees
                  ? filteredScheduleEmployees.map((record) => {
                    const company = relatedLookups.idEmpresa?.find((item) => String(item.id) === String(record.idEmpresa));
                    const employee = relatedLookups.idFuncionario?.find((item) => String(item.id) === String(record.idFuncionario));

                    return (
                      <button
                        className={`product-row company-child-grid-row selectable ${record.id === selectedScheduleEmployeeId ? 'selected' : ''}`}
                        key={record.id}
                        onClick={() => handleSelectScheduleEmployee(record)}
                        role="row"
                        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
                        type="button"
                      >
                        <span role="cell">{String(company?.dsEmpresa ?? record.idEmpresa ?? '-')}</span>
                        <span role="cell">{String(employee?.nmFuncionario ?? record.idFuncionario ?? '-')}</span>
                        <span role="cell">
                          <span className={`status-badge ${Number(record.boInativo ?? 0) === 0 ? 'active' : 'inactive'}`}>
                            {Number(record.boInativo ?? 0) === 0 ? 'Ativo' : 'Inativo'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                  : null}

                {!isLoadingScheduleEmployees && filteredScheduleEmployees.length === 0 ? (
                  <div className="empty-row">Nenhum profissional vinculado a esta agenda.</div>
                ) : null}
              </div>
            </section>
          ) : null}

          {isScheduleStudentsTab ? (
            <section className="company-child-grid-section">
              {!selectedScheduleId ? (
                <div className="form-hint">
                  Selecione uma agenda na aba Agendas para vincular alunos.
                </div>
              ) : null}
              <div className="grid-toolbar">
                <div className="child-grid-toolbar-label">
                  <p className="section-label">Alunos da agenda</p>
                </div>
                <div className="child-grid-toolbar-actions">
                  <label className="search-field">
                    <span>Pesquisar</span>
                    <input
                      onChange={(event) => setScheduleStudentSearchTerm(event.target.value)}
                      placeholder="Buscar aluno"
                      type="search"
                      value={scheduleStudentSearchTerm}
                    />
                  </label>
                  {!readOnly ? (
                    <button className="new-button" disabled={!selectedScheduleId} onClick={handleNewScheduleStudent} type="button">
                      Novo
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="product-table company-child-grid-table" key={`schedule-students-${selectedScheduleId}-${scheduleStudentSearchTerm}`} role="table" aria-label="Alunos da agenda">
                <div className="product-row company-child-grid-row header" role="row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  <span role="columnheader">Empresa</span>
                  <span role="columnheader">Aluno</span>
                  <span role="columnheader">Status</span>
                </div>

                {isLoadingScheduleStudents ? <div className="empty-row">Carregando alunos...</div> : null}

                {!isLoadingScheduleStudents
                  ? filteredScheduleStudents.map((record) => {
                    const company = relatedLookups.idEmpresa?.find((item) => String(item.id) === String(record.idEmpresa));
                    const student = relatedLookups.idAluno?.find((item) => String(item.id) === String(record.idAluno));

                    return (
                      <button
                        className={`product-row company-child-grid-row selectable ${record.id === selectedScheduleStudentId ? 'selected' : ''}`}
                        key={record.id}
                        onClick={() => handleSelectScheduleStudent(record)}
                        role="row"
                        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
                        type="button"
                      >
                        <span role="cell">{String(company?.dsEmpresa ?? record.idEmpresa ?? '-')}</span>
                        <span role="cell">{String(student?.nmAluno ?? record.idAluno ?? '-')}</span>
                        <span role="cell">
                          <span className={`status-badge ${Number(record.boInativo ?? 0) === 0 ? 'active' : 'inactive'}`}>
                            {Number(record.boInativo ?? 0) === 0 ? 'Ativo' : 'Inativo'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                  : null}

                {!isLoadingScheduleStudents && filteredScheduleStudents.length === 0 ? (
                  <div className="empty-row">Nenhum aluno vinculado a esta agenda.</div>
                ) : null}
              </div>
            </section>
          ) : null}
        </section>

        <div className="split-form-stack">
          <form className={`registration-form split-form-panel company-form-panel ${isActivityFieldsCollapsed ? 'collapsed' : ''}`} onSubmit={handleSaveActivity}>
            <div className="collapsible-panel-header">
              <div>
                <p className="section-label">Cadastro de Atividade</p>
              </div>
              <button aria-expanded={!isActivityFieldsCollapsed} className="secondary-button" onClick={() => setIsActivityFieldsCollapsed((current) => !current)} type="button">
                {isActivityFieldsCollapsed ? '+' : '-'}
              </button>
            </div>

            {!isActivityFieldsCollapsed ? (
              <>
                {!isFormEnabled ? <div className="form-hint">Selecione uma atividade acima ou clique em Novo.</div> : null}
                {readOnly ? <div className="form-hint">Consulta disponível apenas para visualização.</div> : null}
                {feedback ? <div className="form-feedback">{feedback}</div> : null}

                <div className="field">
                  <label htmlFor="activityCompany">Empresa</label>
                  <select disabled={!isFormEnabled} id="activityCompany" onChange={(event) => setSelectedCompanyId(event.target.value)} value={selectedCompanyId}>
                    <option value="">Selecione</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.dsEmpresa}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="activitySport">Esporte</label>
                  <select disabled={!isFormEnabled} id="activitySport" onChange={(event) => setSelectedSportId(event.target.value)} value={selectedSportId}>
                    <option value="">Selecione</option>
                    {sports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.dsEsporte}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="activityName">Atividade *</label>
                  <input
                    disabled={!isFormEnabled}
                    id="activityName"
                    maxLength={255}
                    onChange={(event) => setActivityName(event.target.value)}
                    required
                    type="text"
                    value={activityName}
                  />
                </div>

                <div className="field">
                  <label htmlFor="activityStatus">Status</label>
                  <button
                    aria-pressed={isActivityActive}
                    className={`status-toggle ${isActivityActive ? 'active' : ''}`}
                    disabled={!isFormEnabled}
                    id="activityStatus"
                    onClick={handleToggleActivityStatus}
                    type="button"
                  >
                    <span>{isActivityActive ? 'Ativo' : 'Inativo'}</span>
                  </button>
                </div>

                <div className="form-actions">
                  <button className="secondary-button" disabled={!isFormEnabled} onClick={clearForm} type="button">
                    Limpar
                  </button>
                  <button disabled={!isFormEnabled} type="submit">
                    Salvar atividade
                  </button>
                </div>
              </>
            ) : null}
          </form>

          {relatedConfig ? (
            <form className={`registration-form split-form-panel company-child-form-panel ${isRelatedFieldsCollapsed ? 'collapsed' : ''}`} onSubmit={handleSaveRelated}>
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">{relatedConfig.label}</p>
                </div>
                <button aria-expanded={!isRelatedFieldsCollapsed} className="secondary-button" onClick={() => setIsRelatedFieldsCollapsed((current) => !current)} type="button">
                  {isRelatedFieldsCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isRelatedFieldsCollapsed ? (
                <>
                  {relatedFeedback ? <div className="form-feedback">{relatedFeedback}</div> : null}

                  <div className="company-child-fields">
                    {relatedConfig.fields.map((field) => (
                      <div className="field" key={field.key}>
                        <label htmlFor={`activityRelated-${field.key}`}>
                          {field.label}
                          {field.required ? ' *' : ''}
                        </label>
                        {field.lookupEndpoint ? (
                          <select
                            disabled={!isRelatedFormEnabled}
                            id={`activityRelated-${field.key}`}
                            onChange={(event) => setRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))}
                            required={field.required}
                            value={relatedFormValues[field.key] ?? ''}
                          >
                            <option value="">Selecione</option>
                            {(relatedLookups[field.key] ?? []).map((option) => (
                              <option key={option.id} value={option.id}>
                                {getLookupLabel(option, field)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            disabled={!isRelatedFormEnabled}
                            id={`activityRelated-${field.key}`}
                            onChange={(event) => setRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))}
                            required={field.required}
                            type={field.type}
                            value={relatedFormValues[field.key] ?? ''}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {!isRelatedFormEnabled ? <div className="form-hint">Selecione um registro relacionado acima ou clique em Novo.</div> : null}

                  <div className="field">
                    <label htmlFor="activityRelatedStatus">Status</label>
                    <button
                      aria-pressed={isRelatedActive}
                      className={`status-toggle ${isRelatedActive ? 'active' : ''}`}
                      disabled={!isRelatedFormEnabled}
                      id="activityRelatedStatus"
                      onClick={handleToggleRelatedStatus}
                      type="button"
                    >
                      <span>{isRelatedActive ? 'Ativo' : 'Inativo'}</span>
                    </button>
                  </div>

                  <div className="form-actions">
                    <button className="secondary-button" disabled={!selectedActivityId || readOnly} onClick={clearRelatedForm} type="button">
                      Limpar
                    </button>
                    <button disabled={!isRelatedFormEnabled} type="submit">
                      Salvar {relatedConfig.label}
                    </button>
                  </div>
                </>
              ) : null}
            </form>
          ) : null}

          {isScheduleEmployeesTab ? (
            <form className={`registration-form split-form-panel company-child-form-panel ${isScheduleEmployeeFieldsCollapsed ? 'collapsed' : ''}`} onSubmit={handleSaveScheduleEmployee}>
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">Profissionais da agenda</p>
                </div>
                <button aria-expanded={!isScheduleEmployeeFieldsCollapsed} className="secondary-button" onClick={() => setIsScheduleEmployeeFieldsCollapsed((current) => !current)} type="button">
                  {isScheduleEmployeeFieldsCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isScheduleEmployeeFieldsCollapsed ? (
                <>
                  {scheduleEmployeeFeedback ? <div className="form-feedback">{scheduleEmployeeFeedback}</div> : null}
                  {!selectedScheduleId ? (
                    <div className="form-hint">Selecione uma agenda na aba Agendas antes de adicionar profissionais.</div>
                  ) : null}

                  <div className="company-child-fields">
                    <div className="field">
                      <label htmlFor="scheduleEmployeeCompany">Empresa</label>
                      <select
                        disabled={readOnly || (!selectedScheduleEmployeeId && !isCreatingScheduleEmployee)}
                        id="scheduleEmployeeCompany"
                        onChange={(event) => setScheduleEmployeeFormValues((current) => ({ ...current, idEmpresa: event.target.value }))}
                        value={scheduleEmployeeFormValues.idEmpresa ?? ''}
                      >
                        <option value="">Selecione</option>
                        {(relatedLookups.idEmpresa ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {String(option.dsEmpresa ?? option.id)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor="scheduleEmployeeEmployee">Profissional *</label>
                      <select
                        disabled={readOnly || (!selectedScheduleEmployeeId && !isCreatingScheduleEmployee)}
                        id="scheduleEmployeeEmployee"
                        onChange={(event) => setScheduleEmployeeFormValues((current) => ({ ...current, idFuncionario: event.target.value }))}
                        required
                        value={scheduleEmployeeFormValues.idFuncionario ?? ''}
                      >
                        <option value="">Selecione</option>
                        {(relatedLookups.idFuncionario ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {String(option.nmFuncionario ?? option.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!selectedScheduleEmployeeId && !isCreatingScheduleEmployee ? (
                    <div className="form-hint">Selecione um profissional acima ou clique em Novo.</div>
                  ) : null}

                  <div className="field">
                    <label htmlFor="scheduleEmployeeStatus">Status</label>
                    <button
                      aria-pressed={isScheduleEmployeeActive}
                      className={`status-toggle ${isScheduleEmployeeActive ? 'active' : ''}`}
                      disabled={readOnly || (!selectedScheduleEmployeeId && !isCreatingScheduleEmployee)}
                      id="scheduleEmployeeStatus"
                      onClick={handleToggleScheduleEmployeeStatus}
                      type="button"
                    >
                      <span>{isScheduleEmployeeActive ? 'Ativo' : 'Inativo'}</span>
                    </button>
                  </div>

                  <div className="form-actions">
                    <button className="secondary-button" disabled={readOnly || !selectedScheduleId} onClick={clearScheduleEmployeeForm} type="button">
                      Limpar
                    </button>
                    <button disabled={readOnly || (!selectedScheduleEmployeeId && !isCreatingScheduleEmployee)} type="submit">
                      Salvar profissionais
                    </button>
                  </div>
                </>
              ) : null}
            </form>
          ) : null}

          {isScheduleStudentsTab ? (
            <form className={`registration-form split-form-panel company-child-form-panel ${isScheduleStudentFieldsCollapsed ? 'collapsed' : ''}`} onSubmit={handleSaveScheduleStudent}>
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">Alunos da agenda</p>
                </div>
                <button aria-expanded={!isScheduleStudentFieldsCollapsed} className="secondary-button" onClick={() => setIsScheduleStudentFieldsCollapsed((current) => !current)} type="button">
                  {isScheduleStudentFieldsCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isScheduleStudentFieldsCollapsed ? (
                <>
                  {scheduleStudentFeedback ? <div className="form-feedback">{scheduleStudentFeedback}</div> : null}
                  {!selectedScheduleId ? (
                    <div className="form-hint">Selecione uma agenda na aba Agendas antes de adicionar alunos.</div>
                  ) : null}

                  <div className="company-child-fields">
                    <div className="field">
                      <label htmlFor="scheduleStudentCompany">Empresa</label>
                      <select
                        disabled={readOnly || (!selectedScheduleStudentId && !isCreatingScheduleStudent)}
                        id="scheduleStudentCompany"
                        onChange={(event) => setScheduleStudentFormValues((current) => ({ ...current, idEmpresa: event.target.value }))}
                        value={scheduleStudentFormValues.idEmpresa ?? ''}
                      >
                        <option value="">Selecione</option>
                        {(relatedLookups.idEmpresa ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {String(option.dsEmpresa ?? option.id)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor="scheduleStudentStudent">Aluno *</label>
                      <select
                        disabled={readOnly || (!selectedScheduleStudentId && !isCreatingScheduleStudent)}
                        id="scheduleStudentStudent"
                        onChange={(event) => setScheduleStudentFormValues((current) => ({ ...current, idAluno: event.target.value }))}
                        required
                        value={scheduleStudentFormValues.idAluno ?? ''}
                      >
                        <option value="">Selecione</option>
                        {(relatedLookups.idAluno ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {String(option.nmAluno ?? option.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!selectedScheduleStudentId && !isCreatingScheduleStudent ? (
                    <div className="form-hint">Selecione um aluno acima ou clique em Novo.</div>
                  ) : null}

                  <div className="field">
                    <label htmlFor="scheduleStudentStatus">Status</label>
                    <button
                      aria-pressed={isScheduleStudentActive}
                      className={`status-toggle ${isScheduleStudentActive ? 'active' : ''}`}
                      disabled={readOnly || (!selectedScheduleStudentId && !isCreatingScheduleStudent)}
                      id="scheduleStudentStatus"
                      onClick={handleToggleScheduleStudentStatus}
                      type="button"
                    >
                      <span>{isScheduleStudentActive ? 'Ativo' : 'Inativo'}</span>
                    </button>
                  </div>

                  <div className="form-actions">
                    <button className="secondary-button" disabled={readOnly || !selectedScheduleId} onClick={clearScheduleStudentForm} type="button">
                      Limpar
                    </button>
                    <button disabled={readOnly || (!selectedScheduleStudentId && !isCreatingScheduleStudent)} type="submit">
                      Salvar alunos
                    </button>
                  </div>
                </>
              ) : null}
            </form>
          ) : null}
        </div>

        <section className="company-child-tabs" aria-label="Tabelas relacionadas da atividade">
          <div className="company-child-tabs-list" role="tablist" aria-label="Tabelas relacionadas da atividade">
            {[...activityRelatedTables, scheduleEmployeeTab, scheduleStudentTab].map((table) => (
              <button
                aria-selected={selectedRelatedTable === table.key}
                className={selectedRelatedTable === table.key ? 'active' : ''}
                key={table.key}
                onClick={() => {
                  setSelectedRelatedTable(table.key);
                  setRelatedFeedback('');
                }}
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
