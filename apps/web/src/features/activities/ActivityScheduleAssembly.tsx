'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Clock, Pencil, Plus, Save, Users } from 'lucide-react';
import {
  GRID_PAGE_SIZE,
  GridPagination,
  formatDateDisplay,
  formatDateInput,
  paginateItems,
} from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import type { Activity, Company, Employee, Localidade, LookupRecord, Sport } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type ActivitySchedule = {
  id: number;
  idEmpresa: number | null;
  idAtividade: number | null;
  idCategoria: number | null;
  idLocalidade: number | null;
  dtInicial: string | null;
  dtFinal: string | null;
  qtAlunos: number | null;
  dtCadastro: string;
  boInativo: boolean;
};

type ScheduleEmployee = {
  id: number;
  idEmpresa: number | null;
  idAtividadeAgenda: number | null;
  idFuncionario: number | null;
  boInativo: boolean;
};

type Category = LookupRecord & {
  idEmpresa?: number | null;
  idEsporte?: number | null;
  dsCategoria?: string;
  boInativo?: boolean;
};

const weekDays = [
  { value: '1', label: 'Seg' },
  { value: '2', label: 'Ter' },
  { value: '3', label: 'Qua' },
  { value: '4', label: 'Qui' },
  { value: '5', label: 'Sex' },
  { value: '6', label: 'Sab' },
  { value: '0', label: 'Dom' },
];

const calendarWeekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

export function ActivityScheduleAssembly() {
  const scheduleStartInputRef = useRef<HTMLInputElement | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [schedules, setSchedules] = useState<ActivitySchedule[]>([]);
  const [scheduleEmployees, setScheduleEmployees] = useState<ScheduleEmployee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [localities, setLocalities] = useState<Localidade[]>([]);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [schedulesPage, setSchedulesPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleSearchTerm, setScheduleSearchTerm] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedFilialId, setSelectedFilialId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedLocalityId, setSelectedLocalityId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedWeekDays, setSelectedWeekDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [studentLimit, setStudentLimit] = useState('');
  const [isScheduleActive, setIsScheduleActive] = useState(true);
  const [showInactiveSchedules, setShowInactiveSchedules] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [scheduleFeedback, setScheduleFeedback] = useState('');

  const selectedActivity = activities.find((a) => a.id === selectedActivityId) ?? null;

  const filteredActivities = activities.filter((activity) => {
    if (!selectedFilialId) return false;
    if (activity.idEmpresa !== null && activity.idEmpresa !== Number(selectedFilialId)) return false;
    const search = searchTerm.toLowerCase();
    return (
      activity.dsAtividade.toLowerCase().includes(search) ||
      getCompanyName(activity.idEmpresa).toLowerCase().includes(search) ||
      getSportName(activity.idEsporte).toLowerCase().includes(search) ||
      (activity.boInativo === false ? 'ativo' : 'inativo').includes(search)
    );
  });

  const filteredSchedules = schedules.filter((schedule) => {
    const search = scheduleSearchTerm.toLowerCase();
    if (!showInactiveSchedules && schedule.boInativo !== false) return false;
    return (
      getCompanyName(schedule.idEmpresa).toLowerCase().includes(search) ||
      getCategoryName(schedule.idCategoria).toLowerCase().includes(search) ||
      getLocalityName(schedule.idLocalidade).toLowerCase().includes(search) ||
      getScheduleEmployeeName(schedule.id).toLowerCase().includes(search) ||
      getWeekDayLabelFromSchedule(schedule).toLowerCase().includes(search) ||
      getScheduleTimeLabel(schedule).includes(search) ||
      String(schedule.qtAlunos ?? '').includes(search) ||
      (schedule.boInativo === false ? 'ativo' : 'inativo').includes(search)
    );
  });

  const paginatedActivities = paginateItems(filteredActivities, activitiesPage);
  const paginatedSchedules = paginateItems(filteredSchedules, schedulesPage);

  // ── Loaders ────────────────────────────────────────────────────

  async function loadActivities() {
    try {
      setIsLoadingActivities(true);
      const response = await fetch(`${apiUrl}/activities`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as atividades.');
      setActivities(((await response.json()) as Activity[]).filter((a) => a.boInativo === false));
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar atividades.');
    } finally {
      setIsLoadingActivities(false);
    }
  }

  async function loadLookups() {
    try {
      const [companiesRes, categoriesRes, employeesRes, sportsRes, localitiesRes] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/categories`),
        fetch(`${apiUrl}/employees`),
        fetch(`${apiUrl}/sports`),
        fetch(`${apiUrl}/localities`),
      ]);
      setCompanies(((await companiesRes.json()) as Company[]).filter((c) => c.boInativo === false));
      setCategories(((await categoriesRes.json()) as Category[]).filter((c) => (c.boInativo ?? false) === false));
      setEmployees(((await employeesRes.json()) as Employee[]).filter((e) => e.boInativo === false));
      if (sportsRes.ok) setSports(((await sportsRes.json()) as Sport[]).filter((s) => s.boInativo === false));
      if (localitiesRes.ok) setLocalities(((await localitiesRes.json()) as Localidade[]).filter((l) => l.boInativo === false));
    } catch (error) {
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadSchedules(activityId = selectedActivityId) {
    if (!activityId) { setSchedules([]); setIsLoadingSchedules(false); return; }
    try {
      setIsLoadingSchedules(true);
      const response = await fetch(`${apiUrl}/activities/${activityId}/related/schedules`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar a agenda.');
      const data = (await response.json()) as ActivitySchedule[];
      setSchedules(data);
      await loadScheduleEmployees(activityId, data);
      setScheduleFeedback('');
    } catch (error) {
      setSchedules([]);
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao carregar agenda.');
    } finally {
      setIsLoadingSchedules(false);
    }
  }

  async function loadScheduleEmployees(activityId = selectedActivityId, scheduleRecords = schedules) {
    if (!activityId) { setScheduleEmployees([]); return; }
    try {
      const records = await Promise.all(
        scheduleRecords.map(async (s) => {
          const res = await fetch(`${apiUrl}/activities/${activityId}/related/schedules/${s.id}/employees`);
          if (!res.ok) await getApiError(res, 'Não foi possível carregar os profissionais.');
          return (await res.json()) as ScheduleEmployee[];
        }),
      );
      setScheduleEmployees(records.flat());
    } catch {
      setScheduleEmployees([]);
    }
  }

  // ── Effects ────────────────────────────────────────────────────

  useEffect(() => { void loadActivities(); void loadLookups(); }, []);
  useEffect(() => { setActivitiesPage(1); }, [searchTerm]);
  useEffect(() => { setSchedulesPage(1); }, [scheduleSearchTerm, selectedActivityId, showInactiveSchedules]);

  // Em modo edição, sincroniza os dias da semana com o período selecionado
  useEffect(() => {
    if (isCreatingSchedule || !startDate || !endDate) return;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
    const days = new Set<string>();
    const current = new Date(start);
    while (current <= end) {
      days.add(String(current.getDay()));
      current.setDate(current.getDate() + 1);
    }
    setSelectedWeekDays(
      weekDays.filter((d) => days.has(d.value)).map((d) => d.value),
    );
  }, [isCreatingSchedule, startDate, endDate]);

  // ── Helpers ────────────────────────────────────────────────────

  function getCompanyName(id: number | null) {
    return companies.find((c) => c.id === id)?.dsEmpresa ?? '-';
  }

  function getSportName(id: number | null) {
    return sports.find((s) => s.id === id)?.dsEsporte ?? '-';
  }

  function getCategoryName(id: number | null) {
    return String(categories.find((c) => c.id === id)?.dsCategoria ?? '-');
  }

  function getLocalityName(id: number | null) {
    return localities.find((l) => l.id === id)?.nmLocalidade ?? '-';
  }

  function getEmployeeName(id: number | null) {
    return employees.find((e) => e.id === id)?.nmFuncionario ?? '-';
  }

  function getScheduleEmployeeName(scheduleId: number) {
    const rec = scheduleEmployees.find((r) => r.idAtividadeAgenda === scheduleId && r.boInativo === false);
    return getEmployeeName(rec?.idFuncionario ?? null);
  }

  function getDateInputValue(value: string | null) {
    return value ? formatDateInput(value) : '';
  }

  function getTimeInputValue(value: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function getWeekDayValue(value: string | null) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : String(date.getDay());
  }

  function getWeekDayLabelFromSchedule(schedule: ActivitySchedule) {
    const dayValue = getWeekDayValue(schedule.dtInicial);
    return weekDays.find((d) => d.value === dayValue)?.label ?? '-';
  }

  function getScheduleTimeLabel(schedule: ActivitySchedule) {
    const ini = getTimeInputValue(schedule.dtInicial);
    const fin = getTimeInputValue(schedule.dtFinal);
    if (!ini && !fin) return '-';
    return `${ini || '--:--'} ate ${fin || '--:--'}`;
  }

  function combineDateTime(dateValue: string, timeValue: string) {
    if (!dateValue) return null;
    return `${dateValue}T${timeValue || '00:00'}:00`;
  }

  function getScheduleDatesInPeriod() {
    if (!startDate || !endDate) return [];
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
    const selectedDays = new Set(selectedWeekDays);
    const dates: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      if (selectedDays.has(String(current.getDay()))) {
        dates.push(
          `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`,
        );
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  function getPreviewCalendarMonths(scheduleDates: string[]) {
    if (!startDate || !endDate) return [];
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
    const selectedDates = new Set(scheduleDates);
    const months: Array<{ key: string; label: string; days: Array<{ key: string; day: number | null; selected: boolean }> }> = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (current <= lastMonth) {
      const year = current.getFullYear();
      const month = current.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const leadingEmpty = (firstDay.getDay() + 6) % 7;
      const days: Array<{ key: string; day: number | null; selected: boolean }> = [];
      for (let i = 0; i < leadingEmpty; i += 1) days.push({ key: `empty-${year}-${month}-${i}`, day: null, selected: false });
      for (let d = 1; d <= lastDay.getDate(); d += 1) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({ key: dateKey, day: d, selected: selectedDates.has(dateKey) });
      }
      months.push({ key: `${year}-${month}`, label: firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), days });
      current.setMonth(current.getMonth() + 1);
    }
    return months;
  }

  // ── Handlers ───────────────────────────────────────────────────

  function handleSelectFilial(filialId: string) {
    setSelectedFilialId(filialId);
    setSelectedActivityId(null);
    setSelectedScheduleId(null);
    setIsCreatingSchedule(false);
    setIsDrawerOpen(false);
    setSchedules([]);
    setScheduleEmployees([]);
    clearScheduleFields();
    setFeedback('');
    setScheduleFeedback('');
  }

  function handleSelectActivity(activity: Activity) {
    setSelectedActivityId(activity.id);
    setSelectedScheduleId(null);
    setIsCreatingSchedule(false);
    setIsDrawerOpen(false);
    setScheduleEmployees([]);
    clearScheduleFields();
    setFeedback('');
    setScheduleFeedback('');
    void loadSchedules(activity.id);
  }

  function handleNewSchedule() {
    setSelectedScheduleId(null);
    setIsCreatingSchedule(true);
    clearScheduleFields();
    setSelectedCompanyId(selectedFilialId);
    setScheduleFeedback('');
    setIsDrawerOpen(true);
    setTimeout(() => scheduleStartInputRef.current?.focus(), 50);
  }

  function handleEditSchedule(schedule: ActivitySchedule) {
    setSelectedScheduleId(schedule.id);
    setIsCreatingSchedule(false);
    setSelectedCompanyId(schedule.idEmpresa ? String(schedule.idEmpresa) : '');
    setSelectedCategoryId(schedule.idCategoria ? String(schedule.idCategoria) : '');
    setSelectedLocalityId(schedule.idLocalidade ? String(schedule.idLocalidade) : '');
    setSelectedEmployeeId(
      String(scheduleEmployees.find((r) => r.idAtividadeAgenda === schedule.id && r.boInativo === false)?.idFuncionario ?? ''),
    );
    setStartDate(getDateInputValue(schedule.dtInicial));
    setEndDate(getDateInputValue(schedule.dtFinal));
    setSelectedWeekDays(getWeekDayValue(schedule.dtInicial) ? [getWeekDayValue(schedule.dtInicial)] : []);
    setStartTime(getTimeInputValue(schedule.dtInicial));
    setEndTime(getTimeInputValue(schedule.dtFinal));
    setStudentLimit(schedule.qtAlunos ? String(schedule.qtAlunos) : '');
    setIsScheduleActive(schedule.boInativo === false);
    setScheduleFeedback('');
    setIsDrawerOpen(true);
  }

  function clearScheduleFields() {
    setSelectedCompanyId('');
    setSelectedCategoryId('');
    setSelectedLocalityId('');
    setSelectedEmployeeId('');
    setStartDate('');
    setEndDate('');
    setSelectedWeekDays([]);
    setStartTime('');
    setEndTime('');
    setStudentLimit('');
    setIsScheduleActive(true);
  }

  function handleCloseDrawer() {
    setIsDrawerOpen(false);
    setSelectedScheduleId(null);
    setIsCreatingSchedule(false);
    clearScheduleFields();
    setScheduleFeedback('');
  }

  function handleToggleWeekDay(dayValue: string) {
    setSelectedWeekDays((current) =>
      current.includes(dayValue)
        ? current.filter((v) => v !== dayValue)
        : weekDays.filter((d) => [...current, dayValue].includes(d.value)).map((d) => d.value),
    );
  }

  async function saveScheduleEmployee(scheduleId: number) {
    if (!selectedActivityId || !selectedEmployeeId) return;
    const activeRec = scheduleEmployees.find((r) => r.idAtividadeAgenda === scheduleId && r.boInativo === false);
    const payload = { idEmpresa: selectedCompanyId || null, idFuncionario: selectedEmployeeId, boInativo: false };
    if (activeRec) {
      const res = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules/${scheduleId}/employees/${activeRec.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) await getApiError(res, 'Não foi possível salvar o profissional.');
    } else {
      const res = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules/${scheduleId}/employees`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) await getApiError(res, 'Não foi possível salvar o profissional.');
    }
  }

  async function handleToggleScheduleStatus(schedule: ActivitySchedule) {
    if (!selectedActivityId) return;
    const nextInactive = schedule.boInativo === false ? true : false;
    try {
      const res = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules/${schedule.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boInativo: nextInactive }),
      });
      if (!res.ok) await getApiError(res, 'Não foi possível alterar o status.');
      await loadSchedules(selectedActivityId);
      setScheduleFeedback(nextInactive ? 'Agenda inativada.' : 'Agenda ativada.');
    } catch (error) {
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedActivityId) { setScheduleFeedback('Selecione uma atividade.'); return; }
    if (!selectedCompanyId) { setScheduleFeedback('Selecione a filial.'); return; }
    if (!startDate || !endDate) { setScheduleFeedback('Informe o período da agenda.'); return; }
    if (!startTime || !endTime) { setScheduleFeedback('Informe o horário da agenda.'); return; }
    if (isCreatingSchedule && selectedWeekDays.length === 0) { setScheduleFeedback('Selecione pelo menos um dia da semana.'); return; }

    try {
      if (isCreatingSchedule) {
        const scheduleDates = getScheduleDatesInPeriod();
        if (scheduleDates.length === 0) { setScheduleFeedback('Nenhuma data encontrada para os dias selecionados.'); return; }
        for (const date of scheduleDates) {
          const res = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idEmpresa: selectedCompanyId || null,
              idCategoria: selectedCategoryId || null,
              idLocalidade: selectedLocalityId || null,
              dtInicial: combineDateTime(date, startTime),
              dtFinal: combineDateTime(date, endTime),
              qtAlunos: studentLimit || null,
              boInativo: isScheduleActive ? false : true,
            }),
          });
          if (!res.ok) await getApiError(res, 'Não foi possível salvar a agenda.');
          const saved = (await res.json()) as ActivitySchedule;
          await saveScheduleEmployee(saved.id);
        }
        const count = getScheduleDatesInPeriod().length;
        setScheduleFeedback(`${count} agenda${count !== 1 ? 's' : ''} salva${count !== 1 ? 's' : ''} com sucesso.`);
      } else {
        if (!selectedScheduleId) { setScheduleFeedback('Selecione uma agenda.'); return; }
        const res = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idEmpresa: selectedCompanyId || null,
            idCategoria: selectedCategoryId || null,
            idLocalidade: selectedLocalityId || null,
            dtInicial: combineDateTime(startDate, startTime),
            dtFinal: combineDateTime(startDate, endTime),
            qtAlunos: studentLimit || null,
            boInativo: isScheduleActive ? false : true,
          }),
        });
        if (!res.ok) await getApiError(res, 'Não foi possível salvar a agenda.');
        const saved = (await res.json()) as ActivitySchedule;
        await saveScheduleEmployee(saved.id);
        setScheduleFeedback('Agenda salva com sucesso.');
      }

      await loadSchedules(selectedActivityId);
      handleCloseDrawer();
    } catch (error) {
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao salvar agenda.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  const previewScheduleDates = getScheduleDatesInPeriod();
  const previewCalendarMonths = getPreviewCalendarMonths(previewScheduleDates);

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Atividade</p>
        <h2 className="module-page-title">MONTAGEM DE AGENDA</h2>
      </header>

      <div className="workout-assembly-view">
        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        <div className="field field-size-md" style={{ marginBottom: '1rem' }}>
          <label htmlFor="scheduleFilial">Filial</label>
          <select
            id="scheduleFilial"
            onChange={(e) => handleSelectFilial(e.target.value)}
            required
            value={selectedFilialId}
          >
            <option value="">Selecione a filial</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.dsEmpresa}</option>)}
          </select>
        </div>

        <div className="schedule-assembly-layout">
          {/* Grid de atividades */}
          <section className="data-grid-section workout-students-grid">
            <div className="grid-toolbar">
              <div className="child-grid-toolbar-label">
                <p className="section-label">Atividades</p>
              </div>
              <div className="child-grid-toolbar-actions">
                <label className="search-field">
                  <span>Pesquisar</span>
                  <input
                    disabled={!selectedFilialId}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar atividade"
                    type="search"
                    value={searchTerm}
                  />
                </label>
              </div>
            </div>

            {!selectedFilialId ? (
              <div className="form-hint">Selecione a filial para ver as atividades disponíveis.</div>
            ) : (
            <div className="product-table" role="table" aria-label="Atividades">
              <div className="product-row activity-schedule-activity-row header" role="row">
                <span role="columnheader">Atividade</span>
                <span role="columnheader">Esporte</span>
                <span role="columnheader">Status</span>
              </div>
              {isLoadingActivities ? <div className="empty-row">Carregando...</div> : null}
              {!isLoadingActivities ? paginatedActivities.map((activity) => (
                <button
                  className={`product-row activity-schedule-activity-row selectable ${activity.id === selectedActivityId ? 'selected' : ''}`}
                  key={activity.id}
                  onClick={() => handleSelectActivity(activity)}
                  role="row"
                  type="button"
                >
                  <span role="cell">{activity.dsAtividade}</span>
                  <span role="cell">{getSportName(activity.idEsporte)}</span>
                  <span role="cell">
                    <span className={`status-badge ${activity.boInativo === false ? 'active' : 'inactive'}`}>
                      {activity.boInativo === false ? 'Ativo' : 'Inativo'}
                    </span>
                  </span>
                </button>
              )) : null}
              {!isLoadingActivities && filteredActivities.length === 0 ? (
                <div className="empty-row">Nenhuma atividade encontrada.</div>
              ) : null}
            </div>
            )}

            {selectedFilialId ? (
              <GridPagination onChange={setActivitiesPage} page={activitiesPage} totalItems={filteredActivities.length} />
            ) : null}
          </section>

          {/* Grid de agendas da atividade */}
          {selectedActivity ? (
            <section className="data-grid-section">
              <div className="grid-toolbar schedule-agenda-toolbar">
                <div className="schedule-agenda-header">
                  <p className="section-label">Agenda</p>
                  <strong>{selectedActivity.dsAtividade}</strong>
                </div>
                <div className="child-grid-toolbar-actions activity-schedule-actions">
                  <label className="search-field">
                    <span>Pesquisar</span>
                    <input
                      onChange={(e) => setScheduleSearchTerm(e.target.value)}
                      placeholder="Buscar"
                      type="search"
                      value={scheduleSearchTerm}
                    />
                  </label>
                  <label className="checkbox-field toolbar-checkbox-field">
                    <input
                      checked={showInactiveSchedules}
                      onChange={(e) => setShowInactiveSchedules(e.target.checked)}
                      type="checkbox"
                    />
                    <span>Inativos</span>
                  </label>
                  <button className="new-button schedule-novo-button" onClick={handleNewSchedule} type="button">
                    <Plus size={16} />
                    Novo
                  </button>
                </div>
              </div>

              {scheduleFeedback ? <div className="form-feedback">{scheduleFeedback}</div> : null}

              <div className="product-table" role="table" aria-label="Agenda da atividade">
                <div className="product-row activity-schedule-row header" role="row">
                  <span role="columnheader">Categoria</span>
                  <span role="columnheader">Localidade</span>
                  <span role="columnheader">Profissional</span>
                  <span role="columnheader">Data</span>
                  <span role="columnheader">Horário</span>
                  <span role="columnheader">Alunos</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Ação</span>
                </div>

                {isLoadingSchedules ? <div className="empty-row">Carregando...</div> : null}

                {!isLoadingSchedules ? paginatedSchedules.map((schedule) => (
                  <div
                    className="product-row activity-schedule-row selectable"
                    key={schedule.id}
                    role="row"
                  >
                    <span role="cell">{getCategoryName(schedule.idCategoria)}</span>
                    <span role="cell">{getLocalityName(schedule.idLocalidade)}</span>
                    <span role="cell">{getScheduleEmployeeName(schedule.id)}</span>
                    <span role="cell">{schedule.dtInicial ? formatDateDisplay(schedule.dtInicial) : '-'}</span>
                    <span role="cell">{getScheduleTimeLabel(schedule)}</span>
                    <span role="cell">{schedule.qtAlunos ?? '-'}</span>
                    <span role="cell">
                      <span className={`status-badge ${schedule.boInativo === false ? 'active' : 'inactive'}`}>
                        {schedule.boInativo === false ? 'Ativo' : 'Inativo'}
                      </span>
                    </span>
                    <span role="cell" className="grid-row-actions">
                      <button
                        aria-label="Editar agenda"
                        className="grid-edit-button"
                        onClick={() => handleEditSchedule(schedule)}
                        type="button"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className={`grid-status-toggle ${schedule.boInativo === false ? 'active' : ''}`}
                        onClick={() => void handleToggleScheduleStatus(schedule)}
                        type="button"
                      >
                        {schedule.boInativo === false ? 'Inativar' : 'Ativar'}
                      </button>
                    </span>
                  </div>
                )) : null}

                {!isLoadingSchedules && filteredSchedules.length === 0 ? (
                  <div className="empty-row">Nenhuma agenda cadastrada.</div>
                ) : null}
              </div>

              <GridPagination onChange={setSchedulesPage} page={schedulesPage} totalItems={filteredSchedules.length} />
            </section>
          ) : (
            <div className="form-hint workout-empty-selection">
              Selecione uma atividade para ver as agendas.
            </div>
          )}
        </div>
      </div>

      {/* Drawer de montagem */}
      <RegistrationDrawer
        isOpen={isDrawerOpen}
        title={isCreatingSchedule ? 'Nova Agenda' : 'Editar Agenda'}
        onClose={handleCloseDrawer}
      >
        <div className="schedule-drawer-layout">
          {/* Formulário */}
          <form className="schedule-drawer-form" onSubmit={handleSaveSchedule}>
            {scheduleFeedback ? <div className="form-feedback" style={{ gridColumn: '1 / -1' }}>{scheduleFeedback}</div> : null}

            <div className="field">
              <label htmlFor="scheduleStart">Período de</label>
              <input
                id="scheduleStart"
                onChange={(e) => setStartDate(e.target.value)}
                ref={scheduleStartInputRef}
                type="date"
                value={startDate}
              />
            </div>

            <div className="field">
              <label htmlFor="scheduleEnd">Período até</label>
              <input
                id="scheduleEnd"
                onChange={(e) => setEndDate(e.target.value)}
                type="date"
                value={endDate}
              />
            </div>

            <div className="field schedule-weekdays-field">
              <label>Dias da semana</label>
              <div className="week-day-choice-list">
                {weekDays.map((day) => (
                  <label className="checkbox-field" key={day.value}>
                    <input
                      checked={selectedWeekDays.includes(day.value)}
                      disabled={!isCreatingSchedule}
                      onChange={() => handleToggleWeekDay(day.value)}
                      type="checkbox"
                    />
                    <span>{day.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="scheduleStartTime">Horário de</label>
              <input
                id="scheduleStartTime"
                onChange={(e) => setStartTime(e.target.value)}
                type="time"
                value={startTime}
              />
            </div>

            <div className="field">
              <label htmlFor="scheduleEndTime">Horário até</label>
              <input
                id="scheduleEndTime"
                onChange={(e) => setEndTime(e.target.value)}
                type="time"
                value={endTime}
              />
            </div>

            <div className="field">
              <label htmlFor="scheduleEmployee">Profissional</label>
              <select id="scheduleEmployee" onChange={(e) => setSelectedEmployeeId(e.target.value)} value={selectedEmployeeId}>
                <option value="">Selecione</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.nmFuncionario}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="scheduleCategory">Categoria</label>
              <select id="scheduleCategory" onChange={(e) => setSelectedCategoryId(e.target.value)} value={selectedCategoryId}>
                <option value="">Selecione</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{String(c.dsCategoria ?? c.id)}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="scheduleLocality">Localidade</label>
              <select id="scheduleLocality" onChange={(e) => setSelectedLocalityId(e.target.value)} value={selectedLocalityId}>
                <option value="">Selecione</option>
                {localities.map((l) => <option key={l.id} value={l.id}>{l.nmLocalidade}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="scheduleStudents">Qtd. alunos</label>
              <input
                id="scheduleStudents"
                min="0"
                onChange={(e) => setStudentLimit(e.target.value)}
                type="number"
                value={studentLimit}
              />
            </div>

            <div className="field">
              <label htmlFor="scheduleCompany">Empresa</label>
              <select id="scheduleCompany" onChange={(e) => setSelectedCompanyId(e.target.value)} required value={selectedCompanyId}>
                <option value="">Selecione</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.dsEmpresa}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="scheduleStatus">Status</label>
              <button
                aria-pressed={isScheduleActive}
                className={`status-toggle ${isScheduleActive ? 'active' : ''}`}
                id="scheduleStatus"
                onClick={() => setIsScheduleActive((v) => !v)}
                type="button"
              >
                <span>{isScheduleActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </div>

            <div className="form-actions schedule-drawer-actions">
              <button className="secondary-button" onClick={handleCloseDrawer} type="button">Cancelar</button>
              <button type="submit"><Save size={16} />Salvar montagem</button>
            </div>
          </form>

          {/* Pré-visualização */}
          <aside className="activity-schedule-preview schedule-drawer-preview">
            <div className="activity-schedule-preview-header">
              <div>
                <p className="section-label">Pré-visualização</p>
                <h4>Calendário da montagem</h4>
              </div>
              <strong>
                {previewScheduleDates.length} agenda{previewScheduleDates.length !== 1 ? 's' : ''}
              </strong>
            </div>

            {previewCalendarMonths.length > 0 ? (
              <div className="activity-calendar-preview-grid">
                {previewCalendarMonths.map((month) => (
                  <div className="activity-calendar-month" key={month.key}>
                    <h5>{month.label}</h5>
                    <div className="activity-calendar-weekdays" aria-hidden="true">
                      {calendarWeekDays.map((d) => <span key={d}>{d}</span>)}
                    </div>
                    <div className="activity-calendar-days">
                      {month.days.map((day) => (
                        <span className={day.selected ? 'selected' : day.day ? '' : 'empty'} key={day.key}>
                          {day.day ?? ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="form-hint">
                Informe o período e selecione os dias da semana para visualizar.
              </div>
            )}

            {previewScheduleDates.length > 0 ? (
              <div className="agenda-session-card preview-session-card">
                <div className="agenda-session-card-header">
                  <div>
                    <strong className="agenda-session-activity">{selectedActivity?.dsAtividade ?? '-'}</strong>
                    {selectedCategoryId ? (
                      <span className="agenda-session-category">{getCategoryName(Number(selectedCategoryId))}</span>
                    ) : null}
                  </div>
                  {studentLimit ? (
                    <div className="agenda-session-capacity">
                      <Users size={13} />
                      <strong>0/{studentLimit}</strong>
                    </div>
                  ) : null}
                </div>
                <div className="agenda-session-meta">
                  <span>
                    <Clock size={12} />
                    {startTime || '--:--'} — {endTime || '--:--'}
                  </span>
                  {selectedEmployeeId ? (
                    <span>{getEmployeeName(Number(selectedEmployeeId))}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </RegistrationDrawer>
    </>
  );
}
