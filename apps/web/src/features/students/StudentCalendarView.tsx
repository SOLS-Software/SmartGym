'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type StudentCalendarViewProps = {
  studentId?: number | null;
  studentName?: string;
  employeeId?: number | null;
  employeeName?: string;
};

type NamedRecord = { id: number; [key: string]: unknown };

// ── Student calendar types ─────────────────────────────────────────────────

type CalendarCheckIn = {
  id: number;
  dtCadastro: string;
  alunoPlano?: { plano?: NamedRecord | null } | null;
  alunoTreinoSequencia?: {
    nrOrdem: number;
    alunoTreino?: { treino?: NamedRecord | null; funcionario?: NamedRecord | null } | null;
  } | null;
};

type CalendarAgendaSchedule = {
  id: number;
  dtInicial: string | null;
  dtFinal: string | null;
  qtAlunos?: number | null;
  atividade?: NamedRecord | null;
  categoria?: NamedRecord | null;
  empresa?: NamedRecord | null;
  funcionarioAtividadeAgendas?: Array<NamedRecord & { funcionario?: NamedRecord | null }>;
};

type CalendarActivityLink = {
  id: number;
  atividadeAgenda?: CalendarAgendaSchedule | null;
};

type CalendarPresence = {
  id: number;
  atividadeAgenda?: CalendarAgendaSchedule | null;
};

type StudentCalendarResponse = {
  checkIns: CalendarCheckIn[];
  activitySchedules: CalendarActivityLink[];
  activityPresences: CalendarPresence[];
};

// ── Employee calendar types ────────────────────────────────────────────────

type EmployeeSession = {
  id: number;
  atividadeAgenda?:
    | (CalendarAgendaSchedule & { alunoAtividadeAgendas?: Array<{ id: number }> })
    | null;
};

type EmployeeCalendarResponse = { sessions: EmployeeSession[] };

// ── Event types ────────────────────────────────────────────────────────────

type CalendarEventType = 'gym-check-in' | 'enrolled' | 'attended' | 'session';

type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  date: Date;
  title: string;
  time: string;
  details: string[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(value: Date) {
  return value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: Date) {
  return `${value.toLocaleDateString('pt-BR')} ${value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function parseEventDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getProfessionals(schedule: CalendarAgendaSchedule) {
  const names =
    schedule.funcionarioAtividadeAgendas?.map((item) => getText(item.funcionario, 'nmFuncionario', '')) ?? [];
  return Array.from(new Set(names.filter(Boolean)));
}

function getEventTypeLabel(type: CalendarEventType) {
  if (type === 'gym-check-in') return 'Check-in';
  if (type === 'enrolled') return 'Inscrito';
  if (type === 'attended') return 'Presente';
  return 'Aula';
}

function getEventBadgeClass(type: CalendarEventType) {
  return type === 'enrolled' ? 'pending' : 'active';
}

function buildAgendaDetails(
  schedule: CalendarAgendaSchedule,
  date: Date,
  extra?: string,
): string[] {
  const endDate = parseEventDate(schedule.dtFinal);
  const professionals = getProfessionals(schedule);
  return [
    `Atividade: ${getText(schedule.atividade, 'dsAtividade', 'Atividade')}`,
    `Início: ${formatDateTime(date)}`,
    `Fim: ${endDate ? formatDateTime(endDate) : '-'}`,
    `Categoria: ${getText(schedule.categoria, 'dsCategoria')}`,
    `Filial: ${getText(schedule.empresa, 'dsEmpresa')}`,
    `Profissionais: ${professionals.length > 0 ? professionals.join(', ') : '-'}`,
    ...(extra ? [extra] : []),
  ];
}

// ── Component ──────────────────────────────────────────────────────────────

export function StudentCalendarView({
  studentId,
  studentName,
  employeeId,
  employeeName,
}: StudentCalendarViewProps) {
  const isEmployee = !!employeeId;
  const userId = isEmployee ? employeeId : studentId;
  const userName = isEmployee ? (employeeName ?? '') : (studentName ?? '');

  const [month, setMonth] = useState(getCurrentMonthValue);
  const [studentData, setStudentData] = useState<StudentCalendarResponse>({
    checkIns: [],
    activitySchedules: [],
    activityPresences: [],
  });
  const [employeeData, setEmployeeData] = useState<EmployeeCalendarResponse>({ sessions: [] });
  const [selectedDateKey, setSelectedDateKey] = useState(getDateKey(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const events = useMemo<CalendarEvent[]>(() => {
    if (isEmployee) {
      return employeeData.sessions
        .flatMap((session) => {
          const schedule = session.atividadeAgenda;
          const date = parseEventDate(schedule?.dtInicial);
          if (!schedule || !date) return [];
          const activityName = getText(schedule.atividade, 'dsAtividade', 'Atividade');
          const enrolled = session.atividadeAgenda?.alunoAtividadeAgendas?.length ?? 0;
          return [
            {
              id: `session-${session.id}`,
              type: 'session' as const,
              date,
              title: activityName,
              time: formatTime(date),
              details: buildAgendaDetails(
                schedule,
                date,
                `Inscritos: ${enrolled}${schedule.qtAlunos ? `/${schedule.qtAlunos}` : ''}`,
              ),
            },
          ];
        })
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    // Student events
    const presenceAgendaIds = new Set(
      studentData.activityPresences
        .map((p) => p.atividadeAgenda?.id)
        .filter((id): id is number => id != null),
    );

    const gymCheckInEvents: CalendarEvent[] = studentData.checkIns.flatMap((checkIn) => {
      const date = parseEventDate(checkIn.dtCadastro);
      if (!date) return [];
      const sequence = checkIn.alunoTreinoSequencia;
      const trainingName = getText(sequence?.alunoTreino?.treino, 'dsTreino', 'Treino');
      return [
        {
          id: `gym-check-in-${checkIn.id}`,
          type: 'gym-check-in' as const,
          date,
          title: trainingName,
          time: formatTime(date),
          details: [
            `Treino: ${trainingName}`,
            sequence?.nrOrdem ? `Sequência ${sequence.nrOrdem}` : 'Sequência -',
            `Plano: ${getText(checkIn.alunoPlano?.plano, 'dsPlano')}`,
            `Profissional: ${getText(sequence?.alunoTreino?.funcionario, 'nmFuncionario')}`,
            `Realizado em: ${formatDateTime(date)}`,
          ],
        },
      ];
    });

    const enrolledAgendaIds = new Set(
      studentData.activitySchedules
        .map((l) => l.atividadeAgenda?.id)
        .filter((id): id is number => id != null),
    );

    const enrolledEvents: CalendarEvent[] = studentData.activitySchedules.flatMap((link) => {
      const schedule = link.atividadeAgenda;
      const date = parseEventDate(schedule?.dtInicial);
      if (!schedule || !date) return [];
      const isAttended = presenceAgendaIds.has(schedule.id);
      const activityName = getText(schedule.atividade, 'dsAtividade', 'Atividade');
      return [
        {
          id: `enrolled-${link.id}`,
          type: (isAttended ? 'attended' : 'enrolled') as CalendarEventType,
          date,
          title: activityName,
          time: formatTime(date),
          details: buildAgendaDetails(schedule, date),
        },
      ];
    });

    // Presences not matched to any enrollment record (edge case)
    const standalonePresences: CalendarEvent[] = studentData.activityPresences
      .filter((p) => p.atividadeAgenda && !enrolledAgendaIds.has(p.atividadeAgenda.id))
      .flatMap((presence) => {
        const schedule = presence.atividadeAgenda!;
        const date = parseEventDate(schedule.dtInicial);
        if (!date) return [];
        return [
          {
            id: `attended-${presence.id}`,
            type: 'attended' as const,
            date,
            title: getText(schedule.atividade, 'dsAtividade', 'Atividade'),
            time: formatTime(date),
            details: buildAgendaDetails(schedule, date),
          },
        ];
      });

    return [...gymCheckInEvents, ...enrolledEvents, ...standalonePresences].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [isEmployee, employeeData, studentData]);

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
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthNumber - 1, i + 1)),
    ];
  }, [month]);

  const selectedEvents = eventsByDay.get(selectedDateKey) ?? [];

  useEffect(() => {
    if (!userId) return;
    void loadCalendar();
  }, [userId, month]);

  async function loadCalendar() {
    if (!userId) return;
    try {
      setIsLoading(true);
      const endpoint = isEmployee
        ? `${apiUrl}/employees/${userId}/calendar?month=${month}`
        : `${apiUrl}/students/${userId}/calendar?month=${month}`;
      const response = await fetch(endpoint);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar o calendário.');
      const data = await response.json();
      if (isEmployee) {
        setEmployeeData(data as EmployeeCalendarResponse);
      } else {
        setStudentData(data as StudentCalendarResponse);
      }
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar calendário.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!userId) {
    return (
      <div className="form-view">
        <div className="form-heading">
          <p className="section-label">Calendário</p>
          <h2>Sem acesso</h2>
          <p>Faça login para visualizar seu calendário.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-view student-calendar-view">
      <div className="form-heading student-calendar-heading">
        <p className="section-label">
          {isEmployee ? 'Calendário do funcionário' : 'Calendário do aluno'}
        </p>
        <h2>{userName}</h2>
        <p>
          {isEmployee
            ? 'Visualize todas as suas aulas agendadas no mês.'
            : 'Visualize suas inscrições, presenças e check-ins do mês.'}
        </p>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      <section className="student-calendar-toolbar">
        <label className="field" htmlFor="calendarMonth">
          <span>Mês</span>
          <input
            id="calendarMonth"
            onChange={(e) => {
              setMonth(e.target.value);
              const year = Number(e.target.value.slice(0, 4));
              const monthNumber = Number(e.target.value.slice(5, 7));
              setSelectedDateKey(getDateKey(new Date(year, monthNumber - 1, 1)));
            }}
            type="month"
            value={month}
          />
        </label>

        <div className="student-calendar-legend" aria-label="Legenda">
          {isEmployee ? (
            <span className="session">Aula</span>
          ) : (
            <>
              <span className="gym-check-in">Check-in</span>
              <span className="enrolled">Inscrito</span>
              <span className="attended">Presente</span>
            </>
          )}
        </div>

        {isLoading ? <div className="form-hint">Carregando calendário...</div> : null}
      </section>

      <section className="student-calendar-layout">
        <div className="student-calendar-grid" role="grid" aria-label="Calendário mensal">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
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
                  <span className={`status-badge ${getEventBadgeClass(event.type)}`}>
                    {getEventTypeLabel(event.type)}
                  </span>
                  <h4>
                    {event.time} — {event.title}
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
