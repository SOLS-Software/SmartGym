'use client';

import { useEffect, useState } from 'react';
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

function getActivityCalendarMonths(schedules: ActivitySchedule[]) {
  const validSchedules = schedules
    .filter((schedule) => getDateKey(schedule.dtInicial))
    .sort((first, second) => new Date(first.dtInicial ?? '').getTime() - new Date(second.dtInicial ?? '').getTime());

  if (validSchedules.length === 0) {
    return [];
  }

  const firstSchedule = validSchedules[0]!;
  const lastSchedule = validSchedules[validSchedules.length - 1]!;
  const firstDate = new Date(firstSchedule.dtInicial ?? '');
  const lastDate = new Date(lastSchedule.dtInicial ?? '');
  const schedulesByDate = validSchedules.reduce<Record<string, ActivitySchedule[]>>((current, schedule) => {
    const key = getDateKey(schedule.dtInicial);
    current[key] = [...(current[key] ?? []), schedule];
    return current;
  }, {});
  const months: Array<{
    key: string;
    label: string;
    days: Array<{ key: string; day: number | null; schedules: ActivitySchedule[] }>;
  }> = [];
  const current = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const lastMonth = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);

  while (current <= lastMonth) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstMonthDay = new Date(year, month, 1);
    const lastMonthDay = new Date(year, month + 1, 0);
    const leadingEmptyDays = (firstMonthDay.getDay() + 6) % 7;
    const days: Array<{ key: string; day: number | null; schedules: ActivitySchedule[] }> = [];

    for (let index = 0; index < leadingEmptyDays; index += 1) {
      days.push({ key: `empty-${year}-${month}-${index}`, day: null, schedules: [] });
    }

    for (let day = 1; day <= lastMonthDay.getDate(); day += 1) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        key: dateKey,
        day,
        schedules: schedulesByDate[dateKey] ?? [],
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
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    void loadActivities();
  }, []);

  async function loadActivities() {
    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/activities?includeDetails=true`);

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

  return (
    <div className="form-view student-activities-view">
      <div className="form-heading student-activities-heading">
        <p className="section-label">Atividades da academia</p>
        <h2>{studentName}</h2>
        <p>Veja as atividades disponiveis e acompanhe a agenda de cada uma.</p>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      <section className="student-activity-enroll-toolbar">
        <div>
          <span className="section-label">Inscricao em aula</span>
          <strong>{selectedScheduleIds.length} selecionada(s)</strong>
        </div>
        <button
          className="primary-button"
          disabled={isSubmitting || selectedScheduleIds.length === 0}
          onClick={handleEnroll}
          type="button"
        >
          {isSubmitting ? 'Inscrevendo...' : 'Inscrever nas aulas'}
        </button>
      </section>

      {isLoading ? <div className="form-hint">Carregando atividades...</div> : null}

      {!isLoading && activities.length === 0 ? (
        <div className="form-hint">Nenhuma atividade ativa encontrada.</div>
      ) : null}

      <section className="student-activity-list" aria-label="Atividades disponiveis">
        {activities.map((activity) => {
          const schedules = activity.atividadeAgendas ?? [];

          return (
            <article className="student-activity-card" key={activity.id}>
              <div className="student-activity-card-header">
                <div>
                  <span className="section-label">Atividade</span>
                  <h3>{activity.dsAtividade}</h3>
                </div>
                <span className="status-badge active">Disponivel</span>
              </div>

              <div className="student-activity-summary">
                <div>
                  <span>Esporte</span>
                  <strong>{getText(activity.esporte, 'dsEsporte')}</strong>
                </div>
                <div>
                  <span>Empresa</span>
                  <strong>{getText(activity.empresa, 'dsEmpresa')}</strong>
                </div>
                <div>
                  <span>Agendas</span>
                  <strong>{schedules.length}</strong>
                </div>
              </div>

              <section className="student-activity-schedules">
                <h4>Agenda da atividade</h4>
                {schedules.length === 0 ? (
                  <p>Nenhuma agenda ativa cadastrada.</p>
                ) : (
                  <div className="student-activity-calendar-list">
                    {getActivityCalendarMonths(schedules).map((month) => (
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
                              className={`student-activity-calendar-day ${day.day ? '' : 'empty'} ${day.schedules.length > 0 ? 'has-schedule' : ''}`}
                              key={day.key}
                            >
                              <strong>{day.day ?? ''}</strong>
                              {day.schedules.length > 0 ? (
                                <div className="student-activity-calendar-events">
                                  {day.schedules.map((schedule) => {
                                    const professionals = getProfessionals(schedule);
                                    const category = getText(schedule.categoria, 'dsCategoria');
                                    const availableSeats = getAvailableSeats(schedule);
                                    const enrolled = isStudentEnrolled(schedule, studentId);
                                    const isFull = availableSeats !== null && availableSeats <= 0;
                                    const isSelected = selectedScheduleIds.includes(schedule.id);

                                    return (
                                      <label
                                        className={`student-activity-calendar-event ${isSelected ? 'selected' : ''} ${enrolled ? 'enrolled' : ''}`}
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
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </article>
          );
        })}
      </section>
    </div>
  );
}
