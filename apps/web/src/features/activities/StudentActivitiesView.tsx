'use client';

import { useEffect, useState } from 'react';
import { formatDateDisplay, getDefaultActivityDateRange } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type StudentActivitiesViewProps = {
  studentId: number | null;
  studentName: string;
};

type NamedRecord = {
  id: number;
  [key: string]: unknown;
};

type ActivitySchedule = {
  id: number;
  dtInicial: string | null;
  dtFinal: string | null;
  qtAlunos: number | null;
  empresa?: NamedRecord | null;
  categoria?: NamedRecord | null;
  alunoAtividadeAgendas?: Array<{
    id: number;
    idAluno: number | null;
  }>;
  funcionarioAtividadeAgendas?: Array<
    NamedRecord & {
      funcionario?: NamedRecord | null;
    }
  >;
};

type ActivityView = {
  id: number;
  dsAtividade: string;
  empresa?: NamedRecord | null;
  esporte?: NamedRecord | null;
  atividadeAgendas?: ActivitySchedule[];
};

type DayActivityGroup = {
  activityId: number;
  activityName: string;
  schedules: ActivitySchedule[];
};

type CalendarDay = {
  key: string;
  day: number | null;
  groups: DayActivityGroup[];
};

type CalendarMonth = {
  key: string;
  label: string;
  days: CalendarDay[];
};

const calendarWeekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function formatTime(value: string | null) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDateKey(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getUnifiedCalendarMonths(activities: ActivityView[], dateFrom: string, dateTo: string): CalendarMonth[] {
  const groupsByDate = new Map<string, Map<number, DayActivityGroup>>();

  for (const activity of activities) {
    for (const schedule of activity.atividadeAgendas ?? []) {
      const dateKey = getDateKey(schedule.dtInicial);
      if (!dateKey) continue;

      if (!groupsByDate.has(dateKey)) groupsByDate.set(dateKey, new Map());
      const dayGroups = groupsByDate.get(dateKey)!;

      if (!dayGroups.has(activity.id)) {
        dayGroups.set(activity.id, { activityId: activity.id, activityName: activity.dsAtividade, schedules: [] });
      }
      dayGroups.get(activity.id)!.schedules.push(schedule);
    }
  }

  if (!dateFrom && !dateTo) return [];

  const start = new Date(`${dateFrom || dateTo}T00:00:00`);
  const end = new Date(`${dateTo || dateFrom}T00:00:00`);
  const months: CalendarMonth[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= lastMonth) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstMonthDay = new Date(year, month, 1);
    const lastMonthDay = new Date(year, month + 1, 0);
    const leadingEmptyDays = (firstMonthDay.getDay() + 6) % 7;
    const days: CalendarDay[] = [];

    for (let index = 0; index < leadingEmptyDays; index += 1) {
      days.push({ key: `empty-${year}-${month}-${index}`, day: null, groups: [] });
    }

    for (let day = 1; day <= lastMonthDay.getDate(); day += 1) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayGroups = groupsByDate.get(dateKey);
      days.push({
        key: dateKey,
        day,
        groups: dayGroups
          ? Array.from(dayGroups.values()).sort((a, b) => a.activityName.localeCompare(b.activityName))
          : [],
      });
    }

    months.push({
      key: `${year}-${month}`,
      label: firstMonthDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      days,
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

function getProfessionals(schedule: ActivitySchedule) {
  const names =
    schedule.funcionarioAtividadeAgendas?.map((item) =>
      getText(item.funcionario, 'nmFuncionario', ''),
    ) ?? [];

  return Array.from(new Set(names.filter(Boolean)));
}

function getActiveEnrollmentCount(schedule: ActivitySchedule) {
  return schedule.alunoAtividadeAgendas?.length ?? 0;
}

function getAvailableSeats(schedule: ActivitySchedule) {
  if (schedule.qtAlunos === null) return null;
  return Math.max(schedule.qtAlunos - getActiveEnrollmentCount(schedule), 0);
}

function isStudentEnrolled(schedule: ActivitySchedule, studentId: number | null) {
  if (!studentId) return false;
  return schedule.alunoAtividadeAgendas?.some((enrollment) => enrollment.idAluno === studentId) ?? false;
}

export function StudentActivitiesView({ studentId, studentName }: StudentActivitiesViewProps) {
  const defaultDateRange = getDefaultActivityDateRange();
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState(defaultDateRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultDateRange.dateTo);
  const [openDayGroup, setOpenDayGroup] = useState<{ dateKey: string; group: DayActivityGroup } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    void loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  async function loadActivities() {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ includeDetails: 'true' });
      if (dateFrom) params.set('dtInicio', dateFrom);
      if (dateTo) params.set('dtFim', dateTo);
      const response = await fetch(`${apiUrl}/activities?${params.toString()}`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar as atividades.');
      }

      setActivities((await response.json()) as ActivityView[]);
      setSelectedScheduleIds([]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar atividades.');
    } finally {
      setIsLoading(false);
    }
  }

  function toggleSchedule(scheduleId: number) {
    setSelectedScheduleIds((current) =>
      current.includes(scheduleId)
        ? current.filter((id) => id !== scheduleId)
        : [...current, scheduleId],
    );
  }

  async function handleEnroll() {
    if (!studentId) {
      setFeedback('Faca login como aluno para se inscrever na aula.');
      return;
    }

    if (selectedScheduleIds.length === 0) {
      setFeedback('Selecione ao menos uma aula para se inscrever.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`${apiUrl}/students/${studentId}/activity-schedules/enroll`, {
        body: JSON.stringify({ scheduleIds: selectedScheduleIds }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel realizar a inscricao.');
      }

      setFeedback('Inscricao realizada com sucesso.');
      await loadActivities();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao realizar inscricao.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!studentId) {
    return (
      <div className="form-view">
        <div className="form-heading">
          <p className="section-label">Atividades da academia</p>
          <h2>Sem acesso</h2>
          <p>Faca login como aluno para se inscrever nas aulas.</p>
        </div>
      </div>
    );
  }

  const calendarMonths = getUnifiedCalendarMonths(activities, dateFrom, dateTo);
  const hasAnySchedule = calendarMonths.some((month) => month.days.some((day) => day.groups.length > 0));

  return (
    <div className="form-view student-activities-view">
      <div className="form-heading student-activities-heading">
        <p className="section-label">Atividades da academia</p>
        <h2>{studentName}</h2>
        <p>Veja as atividades disponiveis e acompanhe a agenda de cada uma.</p>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      <div className="drawer-fields" style={{ marginBottom: '1rem' }}>
        <div className="field field-size-sm">
          <label htmlFor="studentActivityDateFrom">Data de</label>
          <input
            id="studentActivityDateFrom"
            onChange={(e) => setDateFrom(e.target.value)}
            type="date"
            value={dateFrom}
          />
        </div>
        <div className="field field-size-sm">
          <label htmlFor="studentActivityDateTo">Data até</label>
          <input
            id="studentActivityDateTo"
            onChange={(e) => setDateTo(e.target.value)}
            type="date"
            value={dateTo}
          />
        </div>
      </div>

      <section className="student-activity-enroll-toolbar">
        <div>
          <span className="section-label">Inscricao em aula</span>
          <strong>{selectedScheduleIds.length} selecionada(s)</strong>
        </div>
        <button
          className="new-button"
          disabled={isSubmitting || selectedScheduleIds.length === 0}
          onClick={handleEnroll}
          type="button"
        >
          {isSubmitting ? 'Inscrevendo...' : 'Inscrever nas aulas'}
        </button>
      </section>

      {isLoading ? <div className="form-hint">Carregando atividades...</div> : null}

      {!isLoading && !hasAnySchedule ? (
        <div className="form-hint">Nenhuma atividade encontrada no periodo selecionado.</div>
      ) : null}

      <div className="student-activity-calendar-list">
        {calendarMonths.map((month) => (
          <div className="student-activity-calendar-month" key={month.key}>
            <h5>{month.label}</h5>
            <div className="student-activity-calendar-weekdays" aria-hidden="true">
              {calendarWeekDays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="student-activity-calendar-days">
              {month.days.map((day) => (
                <div
                  className={`student-activity-calendar-day ${day.day ? '' : 'empty'} ${day.groups.length > 0 ? 'has-schedule' : ''}`}
                  key={day.key}
                >
                  <strong>{day.day ?? ''}</strong>
                  {day.groups.length > 0 ? (
                    <div className="student-activity-calendar-events">
                      {day.groups.map((group) => (
                        <button
                          className="student-activity-day-group-card"
                          key={group.activityId}
                          onClick={() => setOpenDayGroup({ dateKey: day.key, group })}
                          type="button"
                        >
                          <b>{group.activityName}</b>
                          <span>
                            {group.schedules.length > 1
                              ? `${group.schedules.length} horários`
                              : formatTime(group.schedules[0]?.dtInicial ?? null)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <RegistrationDrawer
        isOpen={openDayGroup !== null}
        onClose={() => setOpenDayGroup(null)}
        title={openDayGroup ? openDayGroup.group.activityName : ''}
      >
        {openDayGroup ? (
          <div className="student-activity-day-detail">
            <p className="form-hint">{formatDateDisplay(openDayGroup.dateKey)}</p>
            <div className="student-activity-schedule-list">
              {openDayGroup.group.schedules.map((schedule) => {
                const professionals = getProfessionals(schedule);
                const category = getText(schedule.categoria, 'dsCategoria');
                const availableSeats = getAvailableSeats(schedule);
                const enrolled = isStudentEnrolled(schedule, studentId);
                const isFull = availableSeats !== null && availableSeats <= 0;
                const isSelected = selectedScheduleIds.includes(schedule.id);

                return (
                  <label
                    className={`student-activity-calendar-event student-activity-day-detail-event ${isSelected ? 'selected' : ''} ${enrolled ? 'enrolled' : ''}`}
                    key={schedule.id}
                  >
                    <input
                      checked={isSelected}
                      disabled={enrolled || isFull || isSubmitting}
                      onChange={() => toggleSchedule(schedule.id)}
                      type="checkbox"
                    />
                    <span>{formatTime(schedule.dtInicial)} ate {formatTime(schedule.dtFinal)}</span>
                    <b>{category}</b>
                    <small>
                      {professionals.length > 0 ? professionals.join(', ') : 'Profissional nao informado'}
                    </small>
                    <small>
                      {availableSeats === null
                        ? 'Vagas livres'
                        : `${availableSeats} de ${schedule.qtAlunos} vaga(s)`}
                      {' - '}
                      {getText(schedule.empresa, 'dsEmpresa')}
                    </small>
                    {enrolled ? <small>Voce ja esta inscrito</small> : null}
                    {!enrolled && isFull ? <small>Sem vagas</small> : null}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
      </RegistrationDrawer>
    </div>
  );
}
