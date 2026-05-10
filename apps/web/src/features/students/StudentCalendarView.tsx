'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type StudentCalendarViewProps = {
  studentId: number | null;
  studentName: string;
};

type NamedRecord = {
  id: number;
  [key: string]: unknown;
};

type CalendarCheckIn = {
  id: number;
  dtCadastro: string;
  alunoPlano?: { plano?: NamedRecord | null } | null;
  alunoTreinoSequencia?: {
    nrOrdem: number;
    alunoTreino?: {
      treino?: NamedRecord | null;
      funcionario?: NamedRecord | null;
    } | null;
  } | null;
  atividadeAgenda?: CalendarActivitySchedule | null;
};

type CalendarActivitySchedule = {
  id: number;
  dtInicial: string | null;
  dtFinal: string | null;
  qtAlunos?: number | null;
  atividade?: NamedRecord | null;
  categoria?: NamedRecord | null;
  empresa?: NamedRecord | null;
  funcionarioAtividadeAgendas?: Array<
    NamedRecord & {
      funcionario?: NamedRecord | null;
    }
  >;
};

type CalendarActivityLink = {
  id: number;
  atividadeAgenda?: CalendarActivitySchedule | null;
};

type CalendarResponse = {
  checkIns: CalendarCheckIn[];
  activitySchedules: CalendarActivityLink[];
};

type CalendarEvent = {
  id: string;
  type: 'check-in' | 'agenda';
  date: Date;
  title: string;
  time: string;
  details: string[];
};

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function formatTime(value: Date) {
  return value.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(value: Date) {
  return value.toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function parseEventDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getProfessionals(schedule: CalendarActivitySchedule | null | undefined) {
  const names =
    schedule?.funcionarioAtividadeAgendas?.map((item) =>
      getText(item.funcionario, 'nmFuncionario', ''),
    ) ?? [];

  return Array.from(new Set(names.filter(Boolean)));
}

export function StudentCalendarView({ studentId, studentName }: StudentCalendarViewProps) {
  const [month, setMonth] = useState(getCurrentMonthValue);
  const [calendar, setCalendar] = useState<CalendarResponse>({ checkIns: [], activitySchedules: [] });
  const [selectedDateKey, setSelectedDateKey] = useState(getDateKey(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const events = useMemo<CalendarEvent[]>(() => {
    const checkInEvents = calendar.checkIns.flatMap((checkIn) => {
      const date = parseEventDate(checkIn.dtCadastro);
      if (!date) return [];

      const sequence = checkIn.alunoTreinoSequencia;
      const trainingName = getText(sequence?.alunoTreino?.treino, 'dsTreino', 'Treino');
      const sequenceLabel = sequence?.nrOrdem ? `Sequencia ${sequence.nrOrdem}` : 'Sequencia -';
      const planName = getText(checkIn.alunoPlano?.plano, 'dsPlano');
      const employee = getText(sequence?.alunoTreino?.funcionario, 'nmFuncionario');

      return [
        {
          id: `check-in-${checkIn.id}`,
          type: 'check-in' as const,
          date,
          title: `Check-in: ${trainingName}`,
          time: formatTime(date),
          details: [
            `Treino: ${trainingName}`,
            sequenceLabel,
            `Plano: ${planName}`,
            `Profissional: ${employee}`,
            `Realizado em: ${formatDateTime(date)}`,
          ],
        },
      ];
    });

    const agendaEvents = calendar.activitySchedules.flatMap((link) => {
      const schedule = link.atividadeAgenda;
      const date = parseEventDate(schedule?.dtInicial ?? null);
      if (!schedule || !date) return [];

      const endDate = parseEventDate(schedule.dtFinal);
      const activityName = getText(schedule.atividade, 'dsAtividade', 'Atividade');
      const professionals = getProfessionals(schedule);

      return [
        {
          id: `agenda-${link.id}`,
          type: 'agenda' as const,
          date,
          title: `Agenda: ${activityName}`,
          time: formatTime(date),
          details: [
            `Atividade: ${activityName}`,
            `Inicio: ${formatDateTime(date)}`,
            `Fim: ${endDate ? formatDateTime(endDate) : '-'}`,
            `Categoria: ${getText(schedule.categoria, 'dsCategoria')}`,
            `Filial: ${getText(schedule.empresa, 'dsEmpresa')}`,
            `Profissionais: ${professionals.length > 0 ? professionals.join(', ') : '-'}`,
          ],
        },
      ];
    });

    return [...checkInEvents, ...agendaEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [calendar]);

  const eventsByDay = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = getDateKey(event.date);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return groups;
  }, [events]);

  const calendarDays = useMemo(() => {
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const firstDay = new Date(year, monthNumber - 1, 1);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const leadingBlankDays = firstDay.getDay();

    return [
      ...Array.from({ length: leadingBlankDays }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, monthNumber - 1, index + 1)),
    ];
  }, [month]);

  const selectedEvents = eventsByDay.get(selectedDateKey) ?? [];

  useEffect(() => {
    if (!studentId) return;
    void loadCalendar();
  }, [studentId, month]);

  async function loadCalendar() {
    if (!studentId) return;

    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/students/${studentId}/calendar?month=${month}`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar o calendario.');
      }

      setCalendar((await response.json()) as CalendarResponse);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar calendario.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!studentId) {
    return (
      <div className="form-view">
        <div className="form-heading">
          <p className="section-label">Calendario</p>
          <h2>Sem acesso</h2>
          <p>Faca login como aluno para visualizar seu calendario.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-view student-calendar-view">
      <div className="form-heading student-calendar-heading">
        <p className="section-label">Calendario do aluno</p>
        <h2>{studentName}</h2>
        <p>Pesquise um mes para visualizar agendas e check-ins realizados.</p>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      <section className="student-calendar-toolbar">
        <label className="field" htmlFor="studentCalendarMonth">
          <span>Mes</span>
          <input
            id="studentCalendarMonth"
            onChange={(event) => {
              setMonth(event.target.value);
              const year = Number(event.target.value.slice(0, 4));
              const monthNumber = Number(event.target.value.slice(5, 7));
              setSelectedDateKey(getDateKey(new Date(year, monthNumber - 1, 1)));
            }}
            type="month"
            value={month}
          />
        </label>
        {isLoading ? <div className="form-hint">Carregando calendario...</div> : null}
      </section>

      <section className="student-calendar-layout">
        <div className="student-calendar-grid" role="grid" aria-label="Calendario mensal">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day) => (
            <div className="student-calendar-weekday" key={day}>
              {day}
            </div>
          ))}

          {calendarDays.map((day, index) => {
            if (!day) {
              return <div className="student-calendar-day empty" key={`empty-${index}`} />;
            }

            const dayKey = getDateKey(day);
            const dayEvents = eventsByDay.get(dayKey) ?? [];

            return (
              <button
                className={`student-calendar-day ${selectedDateKey === dayKey ? 'selected' : ''}`}
                key={dayKey}
                onClick={() => setSelectedDateKey(dayKey)}
                type="button"
              >
                <strong>{day.getDate()}</strong>
                <div>
                  {dayEvents.slice(0, 3).map((event) => (
                    <span className={event.type} key={event.id}>
                      {event.time} {event.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 ? <span>+{dayEvents.length - 3} evento(s)</span> : null}
                </div>
              </button>
            );
          })}
        </div>

        <aside className="student-calendar-details">
          <p className="section-label">Detalhes do dia</p>
          <h3>{selectedDateKey.split('-').reverse().join('/')}</h3>

          {selectedEvents.length === 0 ? (
            <div className="form-hint">Nenhum evento neste dia.</div>
          ) : (
            <div className="student-calendar-event-list">
              {selectedEvents.map((event) => (
                <article className="student-calendar-event-card" key={event.id}>
                  <span className={`status-badge ${event.type === 'check-in' ? 'active' : 'pending'}`}>
                    {event.type === 'check-in' ? 'Check-in' : 'Agenda'}
                  </span>
                  <h4>
                    {event.time} - {event.title}
                  </h4>
                  <ul>
                    {event.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
