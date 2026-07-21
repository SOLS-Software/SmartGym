'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Save, UserCheck, Users } from 'lucide-react';
import { formatDateInput, getLookupLabel } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import { RegistrationTabs } from '../../shared/registration/RegistrationTabs';
import type { Activity, CompanyChildField, CompanyChildRecord, LookupRecord } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type DrawerMode = 'schedule' | 'scheduleEmployee' | 'scheduleStudent';

const scheduleTabIcons = {
  scheduleEmployees: Users,
  scheduleStudents: UserCheck,
};

const scheduleTabs = [
  { key: 'scheduleEmployees', label: 'Profissionais' },
  { key: 'scheduleStudents', label: 'Alunos' },
];

const scheduleFields: CompanyChildField[] = [
  { key: 'idEmpresa', label: 'Empresa', type: 'number', lookupEndpoint: 'companies', lookupLabelKey: 'dsEmpresa', size: 'lg' },
  { key: 'idCategoria', label: 'Categoria', type: 'number', lookupEndpoint: 'categories', lookupLabelKey: 'dsCategoria', size: 'md' },
  { key: 'dtInicial', label: 'Data inicial', type: 'date', size: 'sm' },
  { key: 'dtFinal', label: 'Data final', type: 'date', size: 'sm' },
  { key: 'qtAlunos', label: 'Qtd alunos', type: 'number', size: 'sm' },
];

export function ScheduleRegistration() {
  // Activities (filter dropdown only)
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState('scheduleEmployees');

  // Schedules
  const [schedules, setSchedules] = useState<CompanyChildRecord[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [scheduleSearchTerm, setScheduleSearchTerm] = useState('');
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [scheduleFormValues, setScheduleFormValues] = useState<Record<string, string>>({});
  const [isScheduleActive, setIsScheduleActive] = useState(true);
  const [scheduleFeedback, setScheduleFeedback] = useState('');

  // Schedule employees
  const [scheduleEmployees, setScheduleEmployees] = useState<CompanyChildRecord[]>([]);
  const [isLoadingScheduleEmployees, setIsLoadingScheduleEmployees] = useState(false);
  const [scheduleEmployeeSearchTerm, setScheduleEmployeeSearchTerm] = useState('');
  const [selectedScheduleEmployeeId, setSelectedScheduleEmployeeId] = useState<number | null>(null);
  const [isCreatingScheduleEmployee, setIsCreatingScheduleEmployee] = useState(false);
  const [scheduleEmployeeFormValues, setScheduleEmployeeFormValues] = useState<Record<string, string>>({});
  const [isScheduleEmployeeActive, setIsScheduleEmployeeActive] = useState(true);
  const [scheduleEmployeeFeedback, setScheduleEmployeeFeedback] = useState('');

  // Schedule students
  const [scheduleStudents, setScheduleStudents] = useState<CompanyChildRecord[]>([]);
  const [isLoadingScheduleStudents, setIsLoadingScheduleStudents] = useState(false);
  const [scheduleStudentSearchTerm, setScheduleStudentSearchTerm] = useState('');
  const [selectedScheduleStudentId, setSelectedScheduleStudentId] = useState<number | null>(null);
  const [isCreatingScheduleStudent, setIsCreatingScheduleStudent] = useState(false);
  const [scheduleStudentFormValues, setScheduleStudentFormValues] = useState<Record<string, string>>({});
  const [isScheduleStudentActive, setIsScheduleStudentActive] = useState(true);
  const [scheduleStudentFeedback, setScheduleStudentFeedback] = useState('');

  // Lookups
  const [lookups, setLookups] = useState<Record<string, LookupRecord[]>>({});

  // Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('schedule');

  const isScheduleFormEnabled = selectedScheduleId !== null || isCreatingSchedule;
  const isScheduleEmployeeFormEnabled = Boolean(selectedScheduleId) && (selectedScheduleEmployeeId !== null || isCreatingScheduleEmployee);
  const isScheduleStudentFormEnabled = Boolean(selectedScheduleId) && (selectedScheduleStudentId !== null || isCreatingScheduleStudent);

  const filteredSchedules = schedules.filter((r) => {
    const search = scheduleSearchTerm.toLowerCase();
    const company = lookups.idEmpresa?.find((i) => String(i.id) === String(r.idEmpresa));
    const category = lookups.idCategoria?.find((i) => String(i.id) === String(r.idCategoria));
    return (
      String(company?.dsEmpresa ?? r.idEmpresa ?? '').toLowerCase().includes(search) ||
      String(category?.dsCategoria ?? r.idCategoria ?? '').toLowerCase().includes(search) ||
      ((r.boInativo ?? false) === false ? 'ativo' : 'inativo').includes(search)
    );
  });

  const filteredScheduleEmployees = scheduleEmployees.filter((r) => {
    const search = scheduleEmployeeSearchTerm.toLowerCase();
    const company = lookups.idEmpresa?.find((i) => String(i.id) === String(r.idEmpresa));
    const employee = lookups.idFuncionario?.find((i) => String(i.id) === String(r.idFuncionario));
    return (
      String(company?.dsEmpresa ?? r.idEmpresa ?? '').toLowerCase().includes(search) ||
      String(employee?.nmFuncionario ?? r.idFuncionario ?? '').toLowerCase().includes(search) ||
      ((r.boInativo ?? false) === false ? 'ativo' : 'inativo').includes(search)
    );
  });

  const filteredScheduleStudents = scheduleStudents.filter((r) => {
    const search = scheduleStudentSearchTerm.toLowerCase();
    const company = lookups.idEmpresa?.find((i) => String(i.id) === String(r.idEmpresa));
    const student = lookups.idAluno?.find((i) => String(i.id) === String(r.idAluno));
    return (
      String(company?.dsEmpresa ?? r.idEmpresa ?? '').toLowerCase().includes(search) ||
      String(student?.nmAluno ?? r.idAluno ?? '').toLowerCase().includes(search) ||
      ((r.boInativo ?? false) === false ? 'ativo' : 'inativo').includes(search)
    );
  });

  // ── Loaders ────────────────────────────────────────────────────
  async function loadActivities() {
    try {
      const response = await fetch(`${apiUrl}/activities?includeInactive=true`);
      if (!response.ok) return;
      setActivities((await response.json()) as Activity[]);
    } catch { /* silent */ }
  }

  async function loadLookups() {
    try {
      const fields = [
        { key: 'idEmpresa', endpoint: 'companies' },
        { key: 'idCategoria', endpoint: 'categories' },
        { key: 'idFuncionario', endpoint: 'employees' },
        { key: 'idAluno', endpoint: 'students' },
      ];
      const results = await Promise.all(
        fields.map(async (f) => {
          const response = await fetch(`${apiUrl}/${f.endpoint}`);
          if (!response.ok) return [f.key, []] as [string, LookupRecord[]];
          return [f.key, (await response.json()) as LookupRecord[]] as [string, LookupRecord[]];
        }),
      );
      setLookups(Object.fromEntries(results));
    } catch { /* silent */ }
  }

  async function loadSchedules(activityId = selectedActivityId) {
    if (!activityId) { setSchedules([]); return; }
    try {
      setIsLoadingSchedules(true);
      const response = await fetch(`${apiUrl}/activities/${activityId}/related/schedules`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as agendas.');
      setSchedules((await response.json()) as CompanyChildRecord[]);
      setScheduleFeedback('');
    } catch (error) {
      setSchedules([]);
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao carregar agendas.');
    } finally {
      setIsLoadingSchedules(false);
    }
  }

  async function loadScheduleEmployees(activityId = selectedActivityId, scheduleId = selectedScheduleId) {
    if (!activityId || !scheduleId) { setScheduleEmployees([]); return; }
    try {
      setIsLoadingScheduleEmployees(true);
      const response = await fetch(`${apiUrl}/activities/${activityId}/related/schedules/${scheduleId}/employees`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os profissionais.');
      setScheduleEmployees((await response.json()) as CompanyChildRecord[]);
    } catch { setScheduleEmployees([]); } finally {
      setIsLoadingScheduleEmployees(false);
    }
  }

  async function loadScheduleStudents(activityId = selectedActivityId, scheduleId = selectedScheduleId) {
    if (!activityId || !scheduleId) { setScheduleStudents([]); return; }
    try {
      setIsLoadingScheduleStudents(true);
      const response = await fetch(`${apiUrl}/activities/${activityId}/related/schedules/${scheduleId}/students`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os alunos.');
      setScheduleStudents((await response.json()) as CompanyChildRecord[]);
    } catch { setScheduleStudents([]); } finally {
      setIsLoadingScheduleStudents(false);
    }
  }

  // ── Effects ────────────────────────────────────────────────────
  useEffect(() => { void loadActivities(); void loadLookups(); }, []);

  useEffect(() => {
    setSelectedScheduleId(null);
    setSchedules([]);
    setIsCreatingSchedule(false);
    setScheduleFormValues({});
    setScheduleSearchTerm('');
    setScheduleFeedback('');
    setScheduleEmployees([]);
    setScheduleStudents([]);
    void loadSchedules();
  }, [selectedActivityId]);

  useEffect(() => {
    setSelectedScheduleEmployeeId(null);
    setIsCreatingScheduleEmployee(false);
    setScheduleEmployeeFormValues({});
    setScheduleEmployeeFeedback('');
    setScheduleEmployees([]);
    setSelectedScheduleStudentId(null);
    setIsCreatingScheduleStudent(false);
    setScheduleStudentFormValues({});
    setScheduleStudentFeedback('');
    setScheduleStudents([]);
    void loadScheduleEmployees();
    void loadScheduleStudents();
  }, [selectedActivityId, selectedScheduleId]);

  // ── Handlers ───────────────────────────────────────────────────
  function handleNewSchedule() {
    setSelectedScheduleId(null);
    setIsCreatingSchedule(true);
    setScheduleFormValues({
      dtInicial: new Date().toISOString().slice(0, 10),
      dtFinal: new Date().toISOString().slice(0, 10),
    });
    setIsScheduleActive(true);
    setScheduleFeedback('');
    setIsDrawerOpen(true);
    setDrawerMode('schedule');
  }

  function handleSelectSchedule(record: CompanyChildRecord) {
    if (record.id === selectedScheduleId) return;
    setSelectedScheduleId(record.id);
    setIsCreatingSchedule(false);
    setScheduleFormValues(
      scheduleFields.reduce<Record<string, string>>((acc, field) => {
        const value = record[field.key];
        acc[field.key] = field.type === 'date' ? formatDateInput(String(value ?? '')) : String(value ?? '');
        return acc;
      }, {}),
    );
    setIsScheduleActive((record.boInativo ?? false) === false);
    setScheduleFeedback('');
  }

  function handleEditSchedule(record: CompanyChildRecord) {
    handleSelectSchedule(record);
    setIsDrawerOpen(true);
    setDrawerMode('schedule');
  }

  function handleNewScheduleEmployee() {
    setSelectedScheduleEmployeeId(null);
    setIsCreatingScheduleEmployee(true);
    setScheduleEmployeeFormValues({});
    setIsScheduleEmployeeActive(true);
    setScheduleEmployeeFeedback('');
    setIsDrawerOpen(true);
    setDrawerMode('scheduleEmployee');
  }

  function handleEditScheduleEmployee(record: CompanyChildRecord) {
    setSelectedScheduleEmployeeId(record.id);
    setIsCreatingScheduleEmployee(false);
    setScheduleEmployeeFormValues({
      idEmpresa: record.idEmpresa ? String(record.idEmpresa) : '',
      idFuncionario: record.idFuncionario ? String(record.idFuncionario) : '',
    });
    setIsScheduleEmployeeActive((record.boInativo ?? false) === false);
    setScheduleEmployeeFeedback('');
    setIsDrawerOpen(true);
    setDrawerMode('scheduleEmployee');
  }

  function handleNewScheduleStudent() {
    setSelectedScheduleStudentId(null);
    setIsCreatingScheduleStudent(true);
    setScheduleStudentFormValues({});
    setIsScheduleStudentActive(true);
    setScheduleStudentFeedback('');
    setIsDrawerOpen(true);
    setDrawerMode('scheduleStudent');
  }

  function handleEditScheduleStudent(record: CompanyChildRecord) {
    setSelectedScheduleStudentId(record.id);
    setIsCreatingScheduleStudent(false);
    setScheduleStudentFormValues({
      idEmpresa: record.idEmpresa ? String(record.idEmpresa) : '',
      idAluno: record.idAluno ? String(record.idAluno) : '',
    });
    setIsScheduleStudentActive((record.boInativo ?? false) === false);
    setScheduleStudentFeedback('');
    setIsDrawerOpen(true);
    setDrawerMode('scheduleStudent');
  }

  // ── Save handlers ──────────────────────────────────────────────
  async function handleToggleScheduleStatus() {
    const nextActive = !isScheduleActive;
    setIsScheduleActive(nextActive);
    if (!selectedActivityId || !selectedScheduleId) return;
    try {
      const response = await fetch(
        `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/status`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boInativo: nextActive ? false : true }) },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as CompanyChildRecord;
      setSchedules((current) => current.map((r) => (r.id === updated.id ? updated : r)));
    } catch (error) {
      setIsScheduleActive(!nextActive);
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedActivityId) { setScheduleFeedback('Selecione uma atividade.'); return; }
    try {
      const payload = scheduleFields.reduce<Record<string, string | number | boolean | null>>(
        (acc, field) => {
          const value = scheduleFormValues[field.key] ?? '';
          acc[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return acc;
        },
        { boInativo: isScheduleActive ? false : true },
      );
      const response = await fetch(
        selectedScheduleId
          ? `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}`
          : `${apiUrl}/activities/${selectedActivityId}/related/schedules`,
        { method: selectedScheduleId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar a agenda.');
      }
      const saved = (await response.json()) as CompanyChildRecord;
      await loadSchedules(selectedActivityId);
      setSelectedScheduleId(saved.id);
      setIsCreatingSchedule(false);
      setScheduleFeedback('Agenda salva com sucesso.');
    } catch (error) {
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao salvar agenda.');
    }
  }

  async function handleToggleScheduleEmployeeStatus() {
    const nextActive = !isScheduleEmployeeActive;
    setIsScheduleEmployeeActive(nextActive);
    if (!selectedActivityId || !selectedScheduleId || !selectedScheduleEmployeeId) return;
    try {
      const response = await fetch(
        `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/employees/${selectedScheduleEmployeeId}/status`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boInativo: nextActive ? false : true }) },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as CompanyChildRecord;
      setScheduleEmployees((current) => current.map((r) => (r.id === updated.id ? updated : r)));
    } catch (error) {
      setIsScheduleEmployeeActive(!nextActive);
      setScheduleEmployeeFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveScheduleEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedActivityId || !selectedScheduleId) { setScheduleEmployeeFeedback('Selecione uma agenda.'); return; }
    if (!scheduleEmployeeFormValues.idFuncionario) { setScheduleEmployeeFeedback('Informe o profissional.'); return; }
    try {
      const payload = {
        idEmpresa: scheduleEmployeeFormValues.idEmpresa ? Number(scheduleEmployeeFormValues.idEmpresa) : null,
        idFuncionario: Number(scheduleEmployeeFormValues.idFuncionario),
        boInativo: isScheduleEmployeeActive ? false : true,
      };
      const response = await fetch(
        selectedScheduleEmployeeId
          ? `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/employees/${selectedScheduleEmployeeId}`
          : `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/employees`,
        { method: selectedScheduleEmployeeId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o profissional.');
      }
      const saved = (await response.json()) as CompanyChildRecord;
      await loadScheduleEmployees(selectedActivityId, selectedScheduleId);
      setSelectedScheduleEmployeeId(saved.id);
      setIsCreatingScheduleEmployee(false);
      setScheduleEmployeeFeedback('Profissional salvo com sucesso.');
    } catch (error) {
      setScheduleEmployeeFeedback(error instanceof Error ? error.message : 'Erro ao salvar profissional.');
    }
  }

  async function handleToggleScheduleStudentStatus() {
    const nextActive = !isScheduleStudentActive;
    setIsScheduleStudentActive(nextActive);
    if (!selectedActivityId || !selectedScheduleId || !selectedScheduleStudentId) return;
    try {
      const response = await fetch(
        `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/students/${selectedScheduleStudentId}/status`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boInativo: nextActive ? false : true }) },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as CompanyChildRecord;
      setScheduleStudents((current) => current.map((r) => (r.id === updated.id ? updated : r)));
    } catch (error) {
      setIsScheduleStudentActive(!nextActive);
      setScheduleStudentFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveScheduleStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedActivityId || !selectedScheduleId) { setScheduleStudentFeedback('Selecione uma agenda.'); return; }
    if (!scheduleStudentFormValues.idAluno) { setScheduleStudentFeedback('Informe o aluno.'); return; }
    try {
      const payload = {
        idEmpresa: scheduleStudentFormValues.idEmpresa ? Number(scheduleStudentFormValues.idEmpresa) : null,
        idAluno: Number(scheduleStudentFormValues.idAluno),
        boInativo: isScheduleStudentActive ? false : true,
      };
      const response = await fetch(
        selectedScheduleStudentId
          ? `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/students/${selectedScheduleStudentId}`
          : `${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}/students`,
        { method: selectedScheduleStudentId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o aluno.');
      }
      const saved = (await response.json()) as CompanyChildRecord;
      await loadScheduleStudents(selectedActivityId, selectedScheduleId);
      setSelectedScheduleStudentId(saved.id);
      setIsCreatingScheduleStudent(false);
      setScheduleStudentFeedback('Aluno salvo com sucesso.');
    } catch (error) {
      setScheduleStudentFeedback(error instanceof Error ? error.message : 'Erro ao salvar aluno.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  const drawerTitle: Record<DrawerMode, string> = {
    schedule: isCreatingSchedule ? 'Nova Agenda' : 'Editar Agenda',
    scheduleEmployee: isCreatingScheduleEmployee ? 'Novo Profissional' : 'Editar Profissional',
    scheduleStudent: isCreatingScheduleStudent ? 'Novo Aluno' : 'Editar Aluno',
  };

  return (
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Atividades</p>
        <h2>Agendas</h2>
      </div>

      <div className={`activity-page-layout${selectedScheduleId !== null ? ' has-related' : ''}`}>
        {/* Col 1 — Schedules (with activity filter) */}
        <section className="data-grid-section">
          <label className="search-field" style={{ marginBottom: '0.5rem' }}>
            <span>Atividade</span>
            <select
              value={selectedActivityId ?? ''}
              onChange={(e) => setSelectedActivityId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todas as atividades</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>{a.dsAtividade}</option>
              ))}
            </select>
          </label>
          <RegistrationGrid<CompanyChildRecord>
            ariaLabel="Agendas"
            label="Agendas"
            columns={[
              { label: 'Empresa', render: (r) => String(lookups.idEmpresa?.find((i) => String(i.id) === String(r.idEmpresa))?.dsEmpresa ?? r.idEmpresa ?? '-'), sortValue: (r) => String(lookups.idEmpresa?.find((i) => String(i.id) === String(r.idEmpresa))?.dsEmpresa ?? r.idEmpresa ?? '-') },
              { label: 'Categoria', render: (r) => String(lookups.idCategoria?.find((i) => String(i.id) === String(r.idCategoria))?.dsCategoria ?? r.idCategoria ?? '-') },
              { label: 'Início', render: (r) => r.dtInicial ? formatDateInput(String(r.dtInicial)) : '-' },
              { label: 'Fim', render: (r) => r.dtFinal ? formatDateInput(String(r.dtFinal)) : '-' },
              { label: 'Status', render: (r) => <span className={`status-badge ${(r.boInativo ?? false) === false ? 'active' : 'inactive'}`}>{(r.boInativo ?? false) === false ? 'Ativo' : 'Inativo'}</span> },
            ]}
            records={filteredSchedules}
            isLoading={isLoadingSchedules}
            selectedId={selectedScheduleId}
            onSelect={handleSelectSchedule}
            onEdit={handleEditSchedule}
            searchTerm={scheduleSearchTerm}
            onSearch={setScheduleSearchTerm}
            onNew={handleNewSchedule}
            newDisabled={!selectedActivityId}
            showNewButton={true}
          />
        </section>

        {/* Col 2 — Employees / Students */}
        {selectedScheduleId !== null ? (
          <section className="data-grid-section">
            {activeTab === 'scheduleStudents' ? (
              <RegistrationGrid<CompanyChildRecord>
                ariaLabel="Alunos da agenda"
                label="Alunos da Agenda"
                columns={[
                  { label: 'Empresa', render: (r) => String(lookups.idEmpresa?.find((i) => String(i.id) === String(r.idEmpresa))?.dsEmpresa ?? r.idEmpresa ?? '-') },
                  { label: 'Aluno', render: (r) => String(lookups.idAluno?.find((i) => String(i.id) === String(r.idAluno))?.nmAluno ?? r.idAluno ?? '-') },
                  { label: 'Status', render: (r) => <span className={`status-badge ${(r.boInativo ?? false) === false ? 'active' : 'inactive'}`}>{(r.boInativo ?? false) === false ? 'Ativo' : 'Inativo'}</span> },
                ]}
                records={filteredScheduleStudents}
                isLoading={isLoadingScheduleStudents}
                selectedId={selectedScheduleStudentId}
                onSelect={handleEditScheduleStudent}
                onEdit={handleEditScheduleStudent}
                searchTerm={scheduleStudentSearchTerm}
                onSearch={setScheduleStudentSearchTerm}
                onNew={handleNewScheduleStudent}
                showNewButton={true}
                variant="child"
              />
            ) : (
              <RegistrationGrid<CompanyChildRecord>
                ariaLabel="Profissionais da agenda"
                label="Profissionais da Agenda"
                columns={[
                  { label: 'Empresa', render: (r) => String(lookups.idEmpresa?.find((i) => String(i.id) === String(r.idEmpresa))?.dsEmpresa ?? r.idEmpresa ?? '-') },
                  { label: 'Profissional', render: (r) => String(lookups.idFuncionario?.find((i) => String(i.id) === String(r.idFuncionario))?.nmFuncionario ?? r.idFuncionario ?? '-') },
                  { label: 'Status', render: (r) => <span className={`status-badge ${(r.boInativo ?? false) === false ? 'active' : 'inactive'}`}>{(r.boInativo ?? false) === false ? 'Ativo' : 'Inativo'}</span> },
                ]}
                records={filteredScheduleEmployees}
                isLoading={isLoadingScheduleEmployees}
                selectedId={selectedScheduleEmployeeId}
                onSelect={handleEditScheduleEmployee}
                onEdit={handleEditScheduleEmployee}
                searchTerm={scheduleEmployeeSearchTerm}
                onSearch={setScheduleEmployeeSearchTerm}
                onNew={handleNewScheduleEmployee}
                showNewButton={true}
                variant="child"
              />
            )}
          </section>
        ) : null}

        {/* Col 3 — Tabs */}
        {selectedScheduleId !== null ? (
          <RegistrationTabs
            tabs={scheduleTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            icons={scheduleTabIcons}
            ariaLabel="Abas de agenda"
          />
        ) : null}
      </div>

      <RegistrationDrawer
        isOpen={isDrawerOpen}
        title={drawerTitle[drawerMode]}
        onClose={() => setIsDrawerOpen(false)}
      >
        {/* Schedule form */}
        {drawerMode === 'schedule' ? (
          <form className="drawer-fields" onSubmit={handleSaveSchedule}>
            {scheduleFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{scheduleFeedback}</div> : null}
            {scheduleFields.map((field) => (
              <RegistrationField htmlFor={`sched-${field.key}`} key={field.key} label={field.label} required={field.required} size={field.size}>
                {field.lookupEndpoint ? (
                  <select disabled={!isScheduleFormEnabled} id={`sched-${field.key}`} onChange={(e) => setScheduleFormValues((c) => ({ ...c, [field.key]: e.target.value }))} required={field.required} value={scheduleFormValues[field.key] ?? ''}>
                    <option value="">Selecione</option>
                    {(lookups[field.key] ?? []).map((opt) => (
                      <option key={opt.id} value={opt.id}>{getLookupLabel(opt, field)}</option>
                    ))}
                  </select>
                ) : (
                  <input disabled={!isScheduleFormEnabled} id={`sched-${field.key}`} min={field.type === 'number' ? 0 : undefined} onChange={(e) => setScheduleFormValues((c) => ({ ...c, [field.key]: e.target.value }))} required={field.required} type={field.type} value={scheduleFormValues[field.key] ?? ''} />
                )}
              </RegistrationField>
            ))}
            <RegistrationField htmlFor="scheduleStatus" label="Status" size="sm">
              <button aria-pressed={isScheduleActive} className={`status-toggle ${isScheduleActive ? 'active' : ''}`} disabled={!isScheduleFormEnabled} id="scheduleStatus" onClick={handleToggleScheduleStatus} type="button">
                <span>{isScheduleActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              <button disabled={!isScheduleFormEnabled} type="submit"><Save size={16} />Salvar agenda</button>
            </div>
          </form>
        ) : null}

        {/* Schedule employee form */}
        {drawerMode === 'scheduleEmployee' ? (
          <form className="drawer-fields" onSubmit={handleSaveScheduleEmployee}>
            {scheduleEmployeeFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{scheduleEmployeeFeedback}</div> : null}
            {!selectedScheduleId ? <div className="form-hint" style={{ flex: '1 1 100%' }}>Selecione uma agenda antes de adicionar profissionais.</div> : null}
            <RegistrationField htmlFor="seCompany" label="Empresa" size="lg">
              <select disabled={!selectedScheduleId} id="seCompany" onChange={(e) => setScheduleEmployeeFormValues((c) => ({ ...c, idEmpresa: e.target.value }))} value={scheduleEmployeeFormValues.idEmpresa ?? ''}>
                <option value="">Selecione</option>
                {(lookups.idEmpresa ?? []).map((o) => <option key={o.id} value={o.id}>{String(o.dsEmpresa ?? o.id)}</option>)}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="seEmployee" label="Profissional" required size="lg">
              <select disabled={!selectedScheduleId} id="seEmployee" onChange={(e) => setScheduleEmployeeFormValues((c) => ({ ...c, idFuncionario: e.target.value }))} required value={scheduleEmployeeFormValues.idFuncionario ?? ''}>
                <option value="">Selecione</option>
                {(lookups.idFuncionario ?? []).map((o) => <option key={o.id} value={o.id}>{String(o.nmFuncionario ?? o.id)}</option>)}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="seStatus" label="Status" size="sm">
              <button aria-pressed={isScheduleEmployeeActive} className={`status-toggle ${isScheduleEmployeeActive ? 'active' : ''}`} disabled={!isScheduleEmployeeFormEnabled} id="seStatus" onClick={handleToggleScheduleEmployeeStatus} type="button">
                <span>{isScheduleEmployeeActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              <button disabled={!isScheduleEmployeeFormEnabled} type="submit"><Save size={16} />Salvar profissional</button>
            </div>
          </form>
        ) : null}

        {/* Schedule student form */}
        {drawerMode === 'scheduleStudent' ? (
          <form className="drawer-fields" onSubmit={handleSaveScheduleStudent}>
            {scheduleStudentFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{scheduleStudentFeedback}</div> : null}
            {!selectedScheduleId ? <div className="form-hint" style={{ flex: '1 1 100%' }}>Selecione uma agenda antes de adicionar alunos.</div> : null}
            <RegistrationField htmlFor="ssCompany" label="Empresa" size="lg">
              <select disabled={!selectedScheduleId} id="ssCompany" onChange={(e) => setScheduleStudentFormValues((c) => ({ ...c, idEmpresa: e.target.value }))} value={scheduleStudentFormValues.idEmpresa ?? ''}>
                <option value="">Selecione</option>
                {(lookups.idEmpresa ?? []).map((o) => <option key={o.id} value={o.id}>{String(o.dsEmpresa ?? o.id)}</option>)}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="ssStudent" label="Aluno" required size="lg">
              <select disabled={!selectedScheduleId} id="ssStudent" onChange={(e) => setScheduleStudentFormValues((c) => ({ ...c, idAluno: e.target.value }))} required value={scheduleStudentFormValues.idAluno ?? ''}>
                <option value="">Selecione</option>
                {(lookups.idAluno ?? []).map((o) => <option key={o.id} value={o.id}>{String(o.nmAluno ?? o.id)}</option>)}
              </select>
            </RegistrationField>
            <RegistrationField htmlFor="ssStatus" label="Status" size="sm">
              <button aria-pressed={isScheduleStudentActive} className={`status-toggle ${isScheduleStudentActive ? 'active' : ''}`} disabled={!isScheduleStudentFormEnabled} id="ssStatus" onClick={handleToggleScheduleStudentStatus} type="button">
                <span>{isScheduleStudentActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              <button disabled={!isScheduleStudentFormEnabled} type="submit"><Save size={16} />Salvar aluno</button>
            </div>
          </form>
        ) : null}
      </RegistrationDrawer>
    </div>
  );
}
