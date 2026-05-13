'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  GRID_PAGE_SIZE,
  GridPagination,
  formatDateDisplay,
  formatDateInput,
  paginateItems,
} from '../../shared/registration/registrationHelpers';
import type { Activity, Company, Employee, LookupRecord } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type ActivitySchedule = {
  id: number;
  idEmpresa: number | null;
  idAtividade: number | null;
  idCategoria: number | null;
  dtInicial: string | null;
  dtFinal: string | null;
  qtAlunos: number | null;
  dtCadastro: string;
  boInativo: number;
};

type ScheduleEmployee = {
  id: number;
  idEmpresa: number | null;
  idAtividadeAgenda: number | null;
  idFuncionario: number | null;
  boInativo: number;
};

type Category = LookupRecord & {
  idEmpresa?: number | null;
  idEsporte?: number | null;
  dsCategoria?: string;
  boInativo?: number;
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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [schedules, setSchedules] = useState<ActivitySchedule[]>([]);
  const [scheduleEmployees, setScheduleEmployees] = useState<ScheduleEmployee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [schedulesPage, setSchedulesPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleSearchTerm, setScheduleSearchTerm] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
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

  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId) ?? null;
  const isScheduleFormEnabled = Boolean(selectedActivityId) && (selectedScheduleId !== null || isCreatingSchedule);
  const filteredActivities = activities.filter((activity) => {
    const search = searchTerm.toLowerCase();
    return (
      activity.dsAtividade.toLowerCase().includes(search) ||
      getCompanyName(activity.idEmpresa).toLowerCase().includes(search) ||
      (activity.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const filteredSchedules = schedules.filter((schedule) => {
    const search = scheduleSearchTerm.toLowerCase();

    if (!showInactiveSchedules && schedule.boInativo !== 0) {
      return false;
    }

    return (
      getCompanyName(schedule.idEmpresa).toLowerCase().includes(search) ||
      getCategoryName(schedule.idCategoria).toLowerCase().includes(search) ||
      getScheduleEmployeeName(schedule.id).toLowerCase().includes(search) ||
      getWeekDayLabelFromSchedule(schedule).toLowerCase().includes(search) ||
      getScheduleTimeLabel(schedule).includes(search) ||
      String(schedule.qtAlunos ?? '').includes(search) ||
      (schedule.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const activitiesTotalPages = Math.max(1, Math.ceil(filteredActivities.length / GRID_PAGE_SIZE));
  const schedulesTotalPages = Math.max(1, Math.ceil(filteredSchedules.length / GRID_PAGE_SIZE));
  const paginatedActivities = paginateItems(filteredActivities, activitiesPage);
  const paginatedSchedules = paginateItems(filteredSchedules, schedulesPage);
  const previewScheduleDates = getScheduleDatesInPeriod();
  const previewCalendarMonths = getPreviewCalendarMonths(previewScheduleDates);

  async function loadActivities() {
    try {
      setIsLoadingActivities(true);
      const response = await fetch(`${apiUrl}/activities`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar as atividades.');
      }

      setActivities(((await response.json()) as Activity[]).filter((activity) => activity.boInativo === 0));
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar atividades.');
    } finally {
      setIsLoadingActivities(false);
    }
  }

  async function loadLookups() {
    try {
      const [companiesResponse, categoriesResponse, employeesResponse] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/categories`),
        fetch(`${apiUrl}/employees`),
      ]);

      const failedLookup = [companiesResponse, categoriesResponse, employeesResponse].find((response) => !response.ok);
      if (failedLookup) {
        await getApiError(failedLookup, 'Nao foi possivel carregar empresas e categorias.');
      }

      setCompanies(((await companiesResponse.json()) as Company[]).filter((company) => company.boInativo === 0));
      setCategories(((await categoriesResponse.json()) as Category[]).filter((category) => Number(category.boInativo ?? 0) === 0));
      setEmployees(((await employeesResponse.json()) as Employee[]).filter((employee) => employee.boInativo === 0));
    } catch (error) {
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadSchedules(activityId = selectedActivityId) {
    if (!activityId) {
      setSchedules([]);
      setIsLoadingSchedules(false);
      return;
    }

    try {
      setIsLoadingSchedules(true);
      const response = await fetch(`${apiUrl}/activities/${activityId}/related/schedules`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar a agenda da atividade.');
      }

      const data = (await response.json()) as ActivitySchedule[];
      setSchedules(data);
      await loadScheduleEmployees(activityId, data);
      setScheduleFeedback('');
    } catch (error) {
      setSchedules([]);
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao carregar agenda da atividade.');
    } finally {
      setIsLoadingSchedules(false);
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
    setSchedulesPage(1);
  }, [scheduleSearchTerm, selectedActivityId, showInactiveSchedules]);

  useEffect(() => {
    if (activitiesPage > activitiesTotalPages) {
      setActivitiesPage(activitiesTotalPages);
    }
  }, [activitiesPage, activitiesTotalPages]);

  useEffect(() => {
    if (schedulesPage > schedulesTotalPages) {
      setSchedulesPage(schedulesTotalPages);
    }
  }, [schedulesPage, schedulesTotalPages]);

  function getCompanyName(companyId: number | null) {
    return companies.find((company) => company.id === companyId)?.dsEmpresa ?? '-';
  }

  function getCategoryName(categoryId: number | null) {
    return String(categories.find((category) => category.id === categoryId)?.dsCategoria ?? '-');
  }

  function getEmployeeName(employeeId: number | null) {
    return employees.find((employee) => employee.id === employeeId)?.nmFuncionario ?? '-';
  }

  function getScheduleEmployeeName(scheduleId: number) {
    const employeeSchedule = scheduleEmployees.find(
      (record) => record.idAtividadeAgenda === scheduleId && record.boInativo === 0,
    );

    return getEmployeeName(employeeSchedule?.idFuncionario ?? null);
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
    return weekDays.find((day) => day.value === dayValue)?.label ?? '-';
  }

  function getScheduleTimeLabel(schedule: ActivitySchedule) {
    const initialTime = getTimeInputValue(schedule.dtInicial);
    const finalTime = getTimeInputValue(schedule.dtFinal);
    if (!initialTime && !finalTime) return '-';
    return `${initialTime || '--:--'} ate ${finalTime || '--:--'}`;
  }

  function combineDateTime(dateValue: string, timeValue: string) {
    if (!dateValue) return null;
    return `${dateValue}T${timeValue || '00:00'}:00`;
  }

  function getScheduleDatesInPeriod() {
    if (!startDate || !endDate) {
      return [];
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return [];
    }

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
    if (!startDate || !endDate) {
      return [];
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return [];
    }

    const selectedDates = new Set(scheduleDates);
    const months: Array<{
      key: string;
      label: string;
      days: Array<{ key: string; day: number | null; selected: boolean }>;
    }> = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= lastMonth) {
      const year = current.getFullYear();
      const month = current.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
      const days: Array<{ key: string; day: number | null; selected: boolean }> = [];

      for (let index = 0; index < leadingEmptyDays; index += 1) {
        days.push({ key: `empty-${year}-${month}-${index}`, day: null, selected: false });
      }

      for (let day = 1; day <= lastDay.getDate(); day += 1) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        days.push({
          key: dateKey,
          day,
          selected: selectedDates.has(dateKey),
        });
      }

      months.push({
        key: `${year}-${month}`,
        label: firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        days,
      });
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  async function loadScheduleEmployees(activityId = selectedActivityId, scheduleRecords = schedules) {
    if (!activityId) {
      setScheduleEmployees([]);
      return;
    }

    try {
      const records = await Promise.all(
        scheduleRecords.map(async (schedule) => {
          const response = await fetch(`${apiUrl}/activities/${activityId}/related/schedules/${schedule.id}/employees`);

          if (!response.ok) {
            await getApiError(response, 'Nao foi possivel carregar os profissionais da agenda.');
          }

          return (await response.json()) as ScheduleEmployee[];
        }),
      );

      setScheduleEmployees(records.flat());
    } catch (error) {
      setScheduleEmployees([]);
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao carregar profissionais da agenda.');
    }
  }

  function handleSelectActivity(activity: Activity) {
    setSelectedActivityId(activity.id);
    setSelectedScheduleId(null);
    setIsCreatingSchedule(false);
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
    setScheduleFeedback('');
  }

  function handleSelectSchedule(schedule: ActivitySchedule) {
    setSelectedScheduleId(schedule.id);
    setIsCreatingSchedule(false);
    setSelectedCompanyId(schedule.idEmpresa ? String(schedule.idEmpresa) : '');
    setSelectedCategoryId(schedule.idCategoria ? String(schedule.idCategoria) : '');
    setSelectedEmployeeId(
      String(
        scheduleEmployees.find((record) => record.idAtividadeAgenda === schedule.id && record.boInativo === 0)
          ?.idFuncionario ?? '',
      ),
    );
    setStartDate(getDateInputValue(schedule.dtInicial));
    setEndDate(getDateInputValue(schedule.dtFinal));
    setSelectedWeekDays(getWeekDayValue(schedule.dtInicial) ? [getWeekDayValue(schedule.dtInicial)] : []);
    setStartTime(getTimeInputValue(schedule.dtInicial));
    setEndTime(getTimeInputValue(schedule.dtFinal));
    setStudentLimit(schedule.qtAlunos ? String(schedule.qtAlunos) : '');
    setIsScheduleActive(schedule.boInativo === 0);
    setScheduleFeedback('');
  }

  function clearScheduleFields() {
    setSelectedCompanyId('');
    setSelectedCategoryId('');
    setSelectedEmployeeId('');
    setStartDate('');
    setEndDate('');
    setSelectedWeekDays([]);
    setStartTime('');
    setEndTime('');
    setStudentLimit('');
    setIsScheduleActive(true);
  }

  function handleToggleWeekDay(dayValue: string) {
    setSelectedWeekDays((current) =>
      current.includes(dayValue)
        ? current.filter((value) => value !== dayValue)
        : weekDays
          .filter((day) => [...current, dayValue].includes(day.value))
          .map((day) => day.value),
    );
  }

  async function saveScheduleEmployee(scheduleId: number) {
    if (!selectedActivityId || !selectedEmployeeId) {
      return;
    }

    const activeEmployeeRecords = scheduleEmployees.filter(
      (record) => record.idAtividadeAgenda === scheduleId && record.boInativo === 0,
    );
    const currentEmployeeRecord = activeEmployeeRecords[0];
    const payload = {
      idEmpresa: selectedCompanyId || null,
      idFuncionario: selectedEmployeeId,
      boInativo: 0,
    };

    if (currentEmployeeRecord) {
      const response = await fetch(
        `${apiUrl}/activities/${selectedActivityId}/related/schedules/${scheduleId}/employees/${currentEmployeeRecord.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel salvar o profissional da agenda.');
      }
    } else {
      const response = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules/${scheduleId}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel salvar o profissional da agenda.');
      }
    }
  }

  function clearScheduleForm() {
    setSelectedScheduleId(null);
    setIsCreatingSchedule(false);
    clearScheduleFields();
    setScheduleFeedback('');
  }

  async function handleToggleScheduleStatus(schedule: ActivitySchedule) {
    if (!selectedActivityId) return;
    const nextInactive = schedule.boInativo === 0 ? 1 : 0;

    try {
      const response = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules/${schedule.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextInactive }),
      });

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel alterar o status da agenda.');
      }

      await loadSchedules(selectedActivityId);
      setSelectedScheduleId(null);
      setIsCreatingSchedule(false);
      clearScheduleFields();
      setScheduleFeedback(nextInactive === 1 ? 'Agenda inativada.' : 'Agenda ativada.');
    } catch (error) {
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao alterar status da agenda.');
    }
  }

  async function handleSaveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedActivityId) {
      setScheduleFeedback('Selecione uma atividade antes de salvar.');
      return;
    }

    if (!startDate || !endDate) {
      setScheduleFeedback('Informe o periodo da agenda.');
      return;
    }

    if (!startTime || !endTime) {
      setScheduleFeedback('Informe o horario da agenda.');
      return;
    }

    if (isCreatingSchedule && selectedWeekDays.length === 0) {
      setScheduleFeedback('Selecione pelo menos um dia da semana.');
      return;
    }

    try {
      if (isCreatingSchedule) {
        const scheduleDates = getScheduleDatesInPeriod();

        if (scheduleDates.length === 0) {
          setScheduleFeedback('Nenhuma data encontrada para os dias selecionados no periodo.');
          return;
        }

        for (const scheduleDate of scheduleDates) {
          const response = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idEmpresa: selectedCompanyId || null,
              idCategoria: selectedCategoryId || null,
              dtInicial: combineDateTime(scheduleDate, startTime),
              dtFinal: combineDateTime(scheduleDate, endTime),
              qtAlunos: studentLimit || null,
              boInativo: isScheduleActive ? 0 : 1,
            }),
          });

          if (!response.ok) {
            await getApiError(response, 'Nao foi possivel salvar a agenda.');
          }

          const savedSchedule = (await response.json()) as ActivitySchedule;
          await saveScheduleEmployee(savedSchedule.id);
        }
      } else {
        if (!selectedScheduleId) {
          setScheduleFeedback('Selecione uma agenda antes de salvar.');
          return;
        }

        const response = await fetch(`${apiUrl}/activities/${selectedActivityId}/related/schedules/${selectedScheduleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idEmpresa: selectedCompanyId || null,
            idCategoria: selectedCategoryId || null,
            dtInicial: combineDateTime(startDate, startTime),
            dtFinal: combineDateTime(startDate, endTime),
            qtAlunos: studentLimit || null,
            boInativo: isScheduleActive ? 0 : 1,
          }),
        });

        if (!response.ok) {
          await getApiError(response, 'Nao foi possivel salvar a agenda.');
        }

        const savedSchedule = (await response.json()) as ActivitySchedule;
        await saveScheduleEmployee(savedSchedule.id);
      }

      await loadSchedules(selectedActivityId);
      setSelectedScheduleId(null);
      setIsCreatingSchedule(false);
      clearScheduleFields();
      if (isCreatingSchedule) {
        const scheduleDates = getScheduleDatesInPeriod();
        setScheduleFeedback(`${scheduleDates.length} agenda${scheduleDates.length > 1 ? 's' : ''} salva${scheduleDates.length > 1 ? 's' : ''} com sucesso.`);
      } else {
        setScheduleFeedback('Agenda salva com sucesso.');
      }
    } catch (error) {
      setScheduleFeedback(error instanceof Error ? error.message : 'Erro ao salvar agenda.');
    }
  }

  return (
    <div className="workout-assembly-view">
      <div className="form-heading">
        <div>
          <p className="section-label">Montagem</p>
          <h2>Montagem de Agenda</h2>
        </div>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      <section className="data-grid-section workout-students-grid">
        <div className="grid-toolbar">
          <div className="child-grid-toolbar-label">
            <p className="section-label">Atividades cadastradas</p>
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
          </div>
        </div>

        <div className="product-table" key={`activities-${searchTerm}-${activitiesPage}`} role="table" aria-label="Atividades cadastradas">
          <div className="product-row activity-schedule-activity-row header" role="row">
            <span role="columnheader">Atividade</span>
            <span role="columnheader">Empresa</span>
            <span role="columnheader">Status</span>
          </div>

          {isLoadingActivities ? <div className="empty-row">Carregando atividades...</div> : null}

          {!isLoadingActivities
            ? paginatedActivities.map((activity) => (
              <button
                className={`product-row activity-schedule-activity-row selectable ${activity.id === selectedActivityId ? 'selected' : ''}`}
                key={activity.id}
                onClick={() => handleSelectActivity(activity)}
                role="row"
                type="button"
              >
                <span role="cell">{activity.dsAtividade}</span>
                <span role="cell">{getCompanyName(activity.idEmpresa)}</span>
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

        <GridPagination
          onChange={setActivitiesPage}
          page={activitiesPage}
          totalItems={filteredActivities.length}
        />
      </section>

      {selectedActivity ? (
        <section className="workout-selected-area">
          <div className="workout-selected-header">
            <div>
              <p className="section-label">Atividade selecionada</p>
              <h3>{selectedActivity.dsAtividade}</h3>
            </div>
            <span>{getCompanyName(selectedActivity.idEmpresa)}</span>
          </div>

          <form className="registration-form activity-schedule-builder-form" onSubmit={handleSaveSchedule}>
            <div className="collapsible-panel-header">
              <div>
                <p className="section-label">Montagem da agenda</p>
              </div>
            </div>

            {scheduleFeedback ? <div className="form-feedback">{scheduleFeedback}</div> : null}

            {!isScheduleFormEnabled ? (
              <div className="form-hint">Selecione uma agenda no grid ou clique em Novo.</div>
            ) : null}

            <div className="activity-schedule-fields">
              <div className="field">
                <label htmlFor="activityScheduleStart">Periodo de</label>
                <input
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleStart"
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
              </div>

              <div className="field">
                <label htmlFor="activityScheduleEnd">Periodo ate</label>
                <input
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleEnd"
                  onChange={(event) => setEndDate(event.target.value)}
                  type="date"
                  value={endDate}
                />
              </div>

              <div className="field activity-week-days-field">
                <label>Dias da semana</label>
                <div className="week-day-choice-list">
                  {weekDays.map((day) => (
                    <label className="checkbox-field" key={day.value}>
                      <input
                        checked={selectedWeekDays.includes(day.value)}
                        disabled={!isScheduleFormEnabled}
                        onChange={() => handleToggleWeekDay(day.value)}
                        type="checkbox"
                      />
                      <span>{day.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="activityScheduleEmployee">Profissional</label>
                <select
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleEmployee"
                  onChange={(event) => setSelectedEmployeeId(event.target.value)}
                  value={selectedEmployeeId}
                >
                  <option value="">Selecione</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.nmFuncionario}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="activityScheduleStartTime">Horario de</label>
                <input
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleStartTime"
                  onChange={(event) => setStartTime(event.target.value)}
                  type="time"
                  value={startTime}
                />
              </div>

              <div className="field">
                <label htmlFor="activityScheduleEndTime">Horario ate</label>
                <input
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleEndTime"
                  onChange={(event) => setEndTime(event.target.value)}
                  type="time"
                  value={endTime}
                />
              </div>

              <div className="field">
                <label htmlFor="activityScheduleCategory">Categoria</label>
                <select
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleCategory"
                  onChange={(event) => setSelectedCategoryId(event.target.value)}
                  value={selectedCategoryId}
                >
                  <option value="">Selecione</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {String(category.dsCategoria ?? category.id)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="activityScheduleStudents">Quantidade de alunos</label>
                <input
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleStudents"
                  min="0"
                  onChange={(event) => setStudentLimit(event.target.value)}
                  type="number"
                  value={studentLimit}
                />
              </div>

              <div className="field">
                <label htmlFor="activityScheduleCompany">Empresa</label>
                <select
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleCompany"
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
              </div>

              <div className="field">
                <label htmlFor="activityScheduleStatus">Status</label>
                <button
                  aria-pressed={isScheduleActive}
                  className={`status-toggle ${isScheduleActive ? 'active' : ''}`}
                  disabled={!isScheduleFormEnabled}
                  id="activityScheduleStatus"
                  onClick={() => setIsScheduleActive((current) => !current)}
                  type="button"
                >
                  <span>{isScheduleActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </div>
            </div>

            <div className="form-actions">
              <button className="secondary-button" disabled={!selectedActivityId} onClick={clearScheduleForm} type="button">
                Limpar
              </button>
              <button disabled={!isScheduleFormEnabled} type="submit">
                Salvar montagem
              </button>
            </div>
          </form>

          <section className="activity-schedule-preview" aria-label="Previsualizacao da agenda">
            <div className="activity-schedule-preview-header">
              <div>
                <p className="section-label">Previsualizacao</p>
                <h4>Calendario da montagem</h4>
              </div>
              <strong>
                {previewScheduleDates.length} agenda{previewScheduleDates.length === 1 ? '' : 's'}
              </strong>
            </div>

            {previewCalendarMonths.length > 0 ? (
              <div className="activity-calendar-preview-grid">
                {previewCalendarMonths.map((month) => (
                  <div className="activity-calendar-month" key={month.key}>
                    <h5>{month.label}</h5>
                    <div className="activity-calendar-weekdays" aria-hidden="true">
                      {calendarWeekDays.map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>
                    <div className="activity-calendar-days">
                      {month.days.map((day) => (
                        <span
                          className={day.selected ? 'selected' : day.day ? '' : 'empty'}
                          key={day.key}
                        >
                          {day.day ?? ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="form-hint">
                Informe o periodo e selecione os dias da semana para visualizar a montagem.
              </div>
            )}

            {previewScheduleDates.length > 0 ? (
              <div className="activity-preview-summary">
                <span>{startTime || '--:--'} ate {endTime || '--:--'}</span>
                <span>{getCategoryName(selectedCategoryId ? Number(selectedCategoryId) : null)}</span>
                <span>{getEmployeeName(selectedEmployeeId ? Number(selectedEmployeeId) : null)}</span>
                <span>{studentLimit || '0'} aluno{studentLimit === '1' ? '' : 's'}</span>
              </div>
            ) : null}
          </section>

          <div className="activity-schedule-grid-layout">
            <section className="data-grid-section workout-training-grid">
              <div className="grid-toolbar">
                <div className="child-grid-toolbar-label">
                  <p className="section-label">Agenda da atividade</p>
                </div>
                <div className="child-grid-toolbar-actions activity-schedule-actions">
                  <label className="search-field">
                    <span>Pesquisar</span>
                    <input
                      onChange={(event) => setScheduleSearchTerm(event.target.value)}
                      placeholder="Buscar agenda"
                      type="search"
                      value={scheduleSearchTerm}
                    />
                  </label>
                  <label className="checkbox-field toolbar-checkbox-field">
                    <input
                      checked={showInactiveSchedules}
                      onChange={(event) => setShowInactiveSchedules(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Mostrar inativos</span>
                  </label>
                  <button className="new-button" onClick={handleNewSchedule} type="button">
                    Novo
                  </button>
                </div>
              </div>

              <div className="product-table" key={`activity-schedules-${scheduleSearchTerm}-${schedulesPage}-${showInactiveSchedules}`} role="table" aria-label="Agenda da atividade">
                <div className="product-row activity-schedule-row header" role="row">
                  <span role="columnheader">Empresa</span>
                  <span role="columnheader">Categoria</span>
                  <span role="columnheader">Profissional</span>
                  <span role="columnheader">Inicial</span>
                  <span role="columnheader">Final</span>
                  <span role="columnheader">Dias</span>
                  <span role="columnheader">Horario</span>
                  <span role="columnheader">Alunos</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Acao</span>
                </div>

                {isLoadingSchedules ? <div className="empty-row">Carregando agenda...</div> : null}

                {!isLoadingSchedules
                  ? paginatedSchedules.map((schedule) => (
                    <div
                      className={`product-row activity-schedule-row selectable ${schedule.id === selectedScheduleId ? 'selected' : ''}`}
                      key={schedule.id}
                      onClick={() => handleSelectSchedule(schedule)}
                      role="row"
                    >
                      <span role="cell">{getCompanyName(schedule.idEmpresa)}</span>
                      <span role="cell">{getCategoryName(schedule.idCategoria)}</span>
                      <span role="cell">{getScheduleEmployeeName(schedule.id)}</span>
                      <span role="cell">{schedule.dtInicial ? formatDateDisplay(schedule.dtInicial) : '-'}</span>
                      <span role="cell">{schedule.dtFinal ? formatDateDisplay(schedule.dtFinal) : '-'}</span>
                      <span role="cell">{getWeekDayLabelFromSchedule(schedule)}</span>
                      <span role="cell">{getScheduleTimeLabel(schedule)}</span>
                      <span role="cell">{schedule.qtAlunos ?? '-'}</span>
                      <span role="cell">
                        <span className={`status-badge ${schedule.boInativo === 0 ? 'active' : 'inactive'}`}>
                          {schedule.boInativo === 0 ? 'Ativo' : 'Inativo'}
                        </span>
                      </span>
                      <span role="cell">
                        <button
                          className={`grid-status-toggle ${schedule.boInativo === 0 ? 'active' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggleScheduleStatus(schedule);
                          }}
                          type="button"
                        >
                          {schedule.boInativo === 0 ? 'Inativar' : 'Ativar'}
                        </button>
                      </span>
                    </div>
                  ))
                  : null}

                {!isLoadingSchedules && filteredSchedules.length === 0 ? (
                  <div className="empty-row">Nenhuma agenda vinculada a esta atividade.</div>
                ) : null}
              </div>

              <GridPagination
                onChange={setSchedulesPage}
                page={schedulesPage}
                totalItems={filteredSchedules.length}
              />
            </section>

          </div>
        </section>
      ) : (
        <div className="form-hint workout-empty-selection">
          Selecione uma atividade no grid para visualizar a model AtividadeAgenda.
        </div>
      )}
    </div>
  );
}
