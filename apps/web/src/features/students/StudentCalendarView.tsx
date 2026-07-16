'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Users, XCircle } from 'lucide-react';
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
  alunoAtividadeAgendas?: Array<{ id: number; idAluno?: number | null }>;
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

// ── Company activity types ─────────────────────────────────────────────────

type CompanyActivityView = {
  id: number;
  dsAtividade: string;
  idEsporte?: number | null;
  esporte?: NamedRecord | null;
  atividadeAgendas?: CalendarAgendaSchedule[];
};

// ── Promotion types ───────────────────────────────────────────────────────

type PromotionView = {
  id: number;
  dsPromocao: string;
  dtInicio: string | null;
  dtEncerramento: string | null;
  vlDesconto: number | string | null;
  pcDesconto: number | string | null;
  empresa?: NamedRecord | null;
  promocaoPlanos?: Array<NamedRecord & { plano?: NamedRecord | null }>;
  promocaoProdutos?: Array<NamedRecord & { produto?: NamedRecord | null }>;
};

// ── Lookup types ──────────────────────────────────────────────────────────

type LookupItem = { id: number; label: string };

// ── Event types ────────────────────────────────────────────────────────────

type CalendarEventType = 'gym-check-in' | 'enrolled' | 'attended' | 'session' | 'promotion' | 'activity';

type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  date: Date;
  title: string;
  time: string;
  details: string[];
  sportId?: number | null;
  activityId?: number | null;
  categoryId?: number | null;
  // Agenda-style card data (for activity/enrolled/attended)
  scheduleId?: number;
  timeEnd?: string;
  categoryName?: string;
  companyName?: string;
  professionals?: string[];
  capacity?: number | null;
  enrolledCount?: number;
  isStudentEnrolled?: boolean;
  isStudentPresent?: boolean;
};

type StudentFilter = 'activities' | 'my-activities' | 'check-ins' | 'promotions';

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

function monthToDateFrom(month: string) {
  return `${month}-01`;
}

function monthToDateTo(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
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
  if (type === 'promotion') return 'Promoção';
  if (type === 'activity') return 'Atividade';
  return 'Aula';
}

function getEventBadgeClass(type: CalendarEventType) {
  if (type === 'gym-check-in' || type === 'attended') return 'success';
  if (type === 'enrolled') return 'enrolled';
  if (type === 'promotion') return 'promotion';
  return 'active';
}

function getPromotionDiscount(promotion: PromotionView) {
  const percentDiscount = Number(promotion.pcDesconto ?? 0);
  const valueDiscount = Number(promotion.vlDesconto ?? 0);
  if (percentDiscount > 0) return `${percentDiscount}%`;
  if (valueDiscount > 0) return valueDiscount.toLocaleString('pt-BR', { currency: 'BRL', style: 'currency' });
  return '-';
}

function getPromotionItems(promotion: PromotionView) {
  const plans = promotion.promocaoPlanos?.map((item) => getText(item.plano, 'dsPlano', '')) ?? [];
  const products = promotion.promocaoProdutos?.map((item) => getText(item.produto, 'dsProduto', '')) ?? [];
  return [...plans, ...products].filter(Boolean);
}

function getDateRange(startDate: Date, endDate: Date | null) {
  const dates: Date[] = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const last = endDate
    ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    : new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  while (current <= last) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getMonthEnd(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return new Date(year, monthNumber, 0);
}

// ── Component ──────────────────────────────────────────────────────────────

export function StudentCalendarView({
  studentId,
  employeeId,
}: StudentCalendarViewProps) {
  const isEmployee = !!employeeId;
  const userId = isEmployee ? employeeId : studentId;

  const [dateFrom, setDateFrom] = useState(() => monthToDateFrom(getCurrentMonthValue()));
  const [dateTo, setDateTo] = useState(() => monthToDateTo(getCurrentMonthValue()));
  const month = dateFrom.slice(0, 7);
  const [studentData, setStudentData] = useState<StudentCalendarResponse>({
    checkIns: [],
    activitySchedules: [],
    activityPresences: [],
  });
  const [employeeData, setEmployeeData] = useState<EmployeeCalendarResponse>({ sessions: [] });
  const [companyActivities, setCompanyActivities] = useState<CompanyActivityView[]>([]);
  const [promotions, setPromotions] = useState<PromotionView[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState(getDateKey(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const [activeFilters, setActiveFilters] = useState<Set<StudentFilter>>(new Set(['my-activities']));

  // Lookup filters
  const [filterSport, setFilterSport] = useState('');
  const [filterActivity, setFilterActivity] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Student plan — activity IDs allowed
  const [allowedActivityIds, setAllowedActivityIds] = useState<Set<number>>(new Set());
  const [planHasActivities, setPlanHasActivities] = useState(false);

  // Derive lookup options from loaded company activities
  const sportOptions = useMemo<LookupItem[]>(() => {
    const map = new Map<number, string>();
    for (const activity of companyActivities) {
      const sport = activity.esporte;
      if (sport?.id) map.set(sport.id, getText(sport, 'dsEsporte', ''));
    }
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [companyActivities]);

  const activityOptions = useMemo<LookupItem[]>(() => {
    return companyActivities
      .map((a) => ({ id: a.id, label: a.dsAtividade }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [companyActivities]);

  const categoryOptions = useMemo<LookupItem[]>(() => {
    const map = new Map<number, string>();
    for (const activity of companyActivities) {
      for (const schedule of activity.atividadeAgendas ?? []) {
        const cat = schedule.categoria;
        if (cat?.id) map.set(cat.id, getText(cat, 'dsCategoria', ''));
      }
    }
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [companyActivities]);

  function toggleFilter(filter: StudentFilter) {
    setActiveFilters((current) => {
      const next = new Set(current);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }

  // Build calendar grid from dateFrom/dateTo range
  const calendarMonths = useMemo(() => {
    if (!dateFrom || !dateTo) return [];
    const start = new Date(`${dateFrom}T00:00:00`);
    const end = new Date(`${dateTo}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

    const months: Array<{
      key: string;
      label: string;
      days: Array<Date | null>;
    }> = [];

    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= lastMonth) {
      const year = current.getFullYear();
      const m = current.getMonth();
      const firstDay = new Date(year, m, 1);
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      const leadingBlankDays = firstDay.getDay();

      months.push({
        key: `${year}-${String(m + 1).padStart(2, '0')}`,
        label: firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        days: [
          ...Array.from({ length: leadingBlankDays }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, m, i + 1)),
        ],
      });

      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }, [dateFrom, dateTo]);

  const events = useMemo<CalendarEvent[]>(() => {
    if (isEmployee) {
      return employeeData.sessions
        .flatMap((session) => {
          const schedule = session.atividadeAgenda;
          const date = parseEventDate(schedule?.dtInicial);
          if (!schedule || !date) return [];
          const endDate = parseEventDate(schedule.dtFinal);
          const activityName = getText(schedule.atividade, 'dsAtividade', 'Atividade');
          const enrolled = session.atividadeAgenda?.alunoAtividadeAgendas?.length ?? 0;
          const professionals = getProfessionals(schedule);
          return [
            {
              id: `session-${session.id}`,
              type: 'session' as const,
              date,
              title: activityName,
              time: formatTime(date),
              timeEnd: endDate ? formatTime(endDate) : undefined,
              details: [],
              scheduleId: schedule.id,
              categoryName: getText(schedule.categoria, 'dsCategoria', ''),
              companyName: getText(schedule.empresa, 'dsEmpresa', ''),
              professionals,
              capacity: schedule.qtAlunos ?? null,
              enrolledCount: enrolled,
            },
          ];
        })
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    const allEvents: CalendarEvent[] = [];

    // Build a set of schedule IDs the student is enrolled in (from student data)
    const studentEnrolledScheduleIds = new Set(
      studentData.activitySchedules
        .map((l) => l.atividadeAgenda?.id)
        .filter((id): id is number => id != null),
    );
    const studentPresentScheduleIds = new Set(
      studentData.activityPresences
        .map((p) => p.atividadeAgenda?.id)
        .filter((id): id is number => id != null),
    );

    const addedScheduleIds = new Set<number>();

    // ── Minhas Atividades (processadas primeiro para ter prioridade na deduplicação) ──
    if (activeFilters.has('my-activities')) {
      for (const link of studentData.activitySchedules) {
        const schedule = link.atividadeAgenda;
        const date = parseEventDate(schedule?.dtInicial);
        if (!schedule || !date) continue;

        if (filterActivity && schedule.atividade?.id !== Number(filterActivity)) continue;
        if (filterCategory && schedule.categoria?.id !== Number(filterCategory)) continue;

        const endDate = parseEventDate(schedule.dtFinal);
        const isAttended = studentPresentScheduleIds.has(schedule.id);
        const activityName = getText(schedule.atividade, 'dsAtividade', 'Atividade');
        const professionals = getProfessionals(schedule);

        addedScheduleIds.add(schedule.id);
        allEvents.push({
          id: `enrolled-${link.id}`,
          type: (isAttended ? 'attended' : 'enrolled') as CalendarEventType,
          date,
          title: activityName,
          time: formatTime(date),
          timeEnd: endDate ? formatTime(endDate) : undefined,
          details: [],
          activityId: schedule.atividade?.id as number | undefined,
          categoryId: schedule.categoria?.id as number | undefined,
          scheduleId: schedule.id,
          categoryName: getText(schedule.categoria, 'dsCategoria', ''),
          companyName: getText(schedule.empresa, 'dsEmpresa', ''),
          professionals,
          isStudentEnrolled: true,
          isStudentPresent: isAttended,
        });
      }

      for (const presence of studentData.activityPresences) {
        if (!presence.atividadeAgenda || studentEnrolledScheduleIds.has(presence.atividadeAgenda.id)) continue;
        const schedule = presence.atividadeAgenda;
        const date = parseEventDate(schedule.dtInicial);
        if (!date) continue;

        if (filterActivity && schedule.atividade?.id !== Number(filterActivity)) continue;
        if (filterCategory && schedule.categoria?.id !== Number(filterCategory)) continue;

        const endDate = parseEventDate(schedule.dtFinal);
        const professionals = getProfessionals(schedule);

        addedScheduleIds.add(schedule.id);
        allEvents.push({
          id: `attended-${presence.id}`,
          type: 'attended',
          date,
          title: getText(schedule.atividade, 'dsAtividade', 'Atividade'),
          time: formatTime(date),
          timeEnd: endDate ? formatTime(endDate) : undefined,
          details: [],
          activityId: schedule.atividade?.id as number | undefined,
          categoryId: schedule.categoria?.id as number | undefined,
          scheduleId: schedule.id,
          categoryName: getText(schedule.categoria, 'dsCategoria', ''),
          companyName: getText(schedule.empresa, 'dsEmpresa', ''),
          professionals,
          isStudentEnrolled: true,
          isStudentPresent: true,
        });
      }
    }

    // ── Atividades (todas da empresa, pulando as já adicionadas por Minhas Atividades) ──
    if (activeFilters.has('activities')) {
      for (const activity of companyActivities) {
        if (filterActivity && activity.id !== Number(filterActivity)) continue;
        if (filterSport && activity.idEsporte !== Number(filterSport)) continue;

        for (const schedule of activity.atividadeAgendas ?? []) {
          if (addedScheduleIds.has(schedule.id)) continue;
          if (filterCategory && schedule.categoria?.id !== Number(filterCategory)) continue;

          const date = parseEventDate(schedule.dtInicial);
          if (!date) continue;

          const isEnrolled = studentId != null && (
            schedule.alunoAtividadeAgendas?.some((a) => a.idAluno === studentId) ||
            studentEnrolledScheduleIds.has(schedule.id)
          );
          const isPresent = studentPresentScheduleIds.has(schedule.id);

          // Hide past activities where the student wasn't enrolled or present
          const scheduleDay = new Date(date);
          scheduleDay.setHours(0, 0, 0, 0);
          const todayMidnight = new Date();
          todayMidnight.setHours(0, 0, 0, 0);
          if (scheduleDay.getTime() < todayMidnight.getTime() && !isEnrolled && !isPresent) continue;

          const endDate = parseEventDate(schedule.dtFinal);
          const activityName = getText(schedule.atividade, 'dsAtividade', activity.dsAtividade);
          const professionals = getProfessionals(schedule);
          const enrolledCount = schedule.alunoAtividadeAgendas?.length ?? 0;

          allEvents.push({
            id: `company-activity-${schedule.id}`,
            type: 'activity',
            date,
            title: activityName,
            time: formatTime(date),
            timeEnd: endDate ? formatTime(endDate) : undefined,
            details: [],
            sportId: activity.idEsporte,
            activityId: activity.id,
            categoryId: schedule.categoria?.id as number | undefined,
            scheduleId: schedule.id,
            categoryName: getText(schedule.categoria, 'dsCategoria', ''),
            companyName: getText(schedule.empresa, 'dsEmpresa', ''),
            professionals,
            capacity: schedule.qtAlunos ?? null,
            enrolledCount,
            isStudentEnrolled: isEnrolled,
            isStudentPresent: isPresent,
          });
        }
      }
    }

    // ── Check-ins ──
    if (activeFilters.has('check-ins')) {
      for (const checkIn of studentData.checkIns) {
        const date = parseEventDate(checkIn.dtCadastro);
        if (!date) continue;
        const sequence = checkIn.alunoTreinoSequencia;
        const trainingName = getText(sequence?.alunoTreino?.treino, 'dsTreino', 'Treino');
        allEvents.push({
          id: `gym-check-in-${checkIn.id}`,
          type: 'gym-check-in',
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
        });
      }
    }

    // ── Promoções ──
    if (activeFilters.has('promotions')) {
      for (const promotion of promotions) {
        const startDate = parseEventDate(promotion.dtInicio);
        if (!startDate) continue;
        const endDate = parseEventDate(promotion.dtEncerramento) ?? getMonthEnd(month);
        const items = getPromotionItems(promotion);
        for (const date of getDateRange(startDate, endDate)) {
          allEvents.push({
            id: `promotion-${promotion.id}-${getDateKey(date)}`,
            type: 'promotion',
            date,
            title: promotion.dsPromocao,
            time: 'Promo',
            details: [
              `Promoção: ${promotion.dsPromocao}`,
              `Início: ${formatDateTime(startDate)}`,
              `Encerramento: ${promotion.dtEncerramento ? formatDateTime(endDate) : 'Até o fim do mês'}`,
              `Desconto: ${getPromotionDiscount(promotion)}`,
              `Filial: ${getText(promotion.empresa, 'dsEmpresa')}`,
              `Itens: ${items.length > 0 ? items.join(', ') : '-'}`,
            ],
          });
        }
      }
    }

    return allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [isEmployee, employeeData, studentData, companyActivities, promotions, activeFilters, month, filterSport, filterActivity, filterCategory, studentId]);

  const eventsByDay = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = getDateKey(event.date);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return groups;
  }, [events]);

  const selectedEvents = eventsByDay.get(selectedDateKey) ?? [];

  useEffect(() => {
    if (!userId) return;
    void loadCalendar();
  }, [userId, dateFrom, dateTo]);

  useEffect(() => {
    if (!isEmployee && studentId) void loadStudentPlan(studentId);
  }, [isEmployee, studentId]);

  async function loadStudentPlan(idAluno: number) {
    try {
      const response = await fetch(`${apiUrl}/students/${idAluno}/related/plans`);
      if (!response.ok) return;
      const plans = (await response.json()) as Array<{
        plano: { planoAtividades: Array<{ idAtividade: number | null; boInativo: boolean }> } | null;
      }>;
      const ids = new Set<number>();
      for (const alunoPlano of plans) {
        for (const pa of alunoPlano.plano?.planoAtividades ?? []) {
          if (pa.boInativo === false && pa.idAtividade !== null) ids.add(pa.idAtividade);
        }
      }
      setAllowedActivityIds(ids);
      setPlanHasActivities(ids.size > 0);
    } catch {
      // silent
    }
  }

  async function loadCalendar() {
    if (!userId) return;
    try {
      setIsLoading(true);
      if (isEmployee) {
        const response = await fetch(`${apiUrl}/employees/${userId}/calendar?month=${month}`);
        if (!response.ok) await getApiError(response, 'Não foi possível carregar o calendário.');
        setEmployeeData((await response.json()) as EmployeeCalendarResponse);
      } else {
        const [calendarResponse, activitiesResponse, promotionsResponse] = await Promise.all([
          fetch(`${apiUrl}/students/${userId}/calendar?month=${month}`),
          fetch(`${apiUrl}/activities?includeDetails=true&dtInicio=${dateFrom}&dtFim=${dateTo}`),
          fetch(`${apiUrl}/promotions?currentOnly=true&includeDetails=true`),
        ]);
        if (!calendarResponse.ok) await getApiError(calendarResponse, 'Não foi possível carregar o calendário.');
        if (!activitiesResponse.ok) await getApiError(activitiesResponse, 'Não foi possível carregar as atividades.');
        if (!promotionsResponse.ok) await getApiError(promotionsResponse, 'Não foi possível carregar as promoções.');
        setStudentData((await calendarResponse.json()) as StudentCalendarResponse);
        setCompanyActivities((await activitiesResponse.json()) as CompanyActivityView[]);
        setPromotions((await promotionsResponse.json()) as PromotionView[]);
      }
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar calendário.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleEnroll(scheduleId: number) {
    if (!studentId) return;
    try {
      setSubmittingId(scheduleId);
      setFeedback('');
      const response = await fetch(`${apiUrl}/agenda-sessions/${scheduleId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAluno: studentId }),
      });
      if (!response.ok) await getApiError(response, 'Erro ao realizar inscrição.');
      setFeedback('Inscrição realizada com sucesso.');
      await loadCalendar();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao realizar inscrição.');
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleUnenroll(scheduleId: number) {
    if (!studentId) return;
    try {
      setSubmittingId(scheduleId);
      setFeedback('');
      const response = await fetch(`${apiUrl}/agenda-sessions/${scheduleId}/unenroll`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAluno: studentId }),
      });
      if (!response.ok) await getApiError(response, 'Erro ao cancelar inscrição.');
      setFeedback('Inscrição cancelada com sucesso.');
      await loadCalendar();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao cancelar inscrição.');
    } finally {
      setSubmittingId(null);
    }
  }

  function isActivityEvent(type: CalendarEventType) {
    return type === 'activity' || type === 'enrolled' || type === 'attended' || type === 'session';
  }

  function renderActivityCard(event: CalendarEvent) {
    const isEnrolled = event.isStudentEnrolled ?? false;
    const isPresent = event.isStudentPresent ?? false;
    const isFull = event.capacity !== null && event.capacity !== undefined && (event.enrolledCount ?? 0) >= event.capacity;
    const isWorking = submittingId === event.scheduleId;
    const isAllowed = !planHasActivities || (event.activityId != null && allowedActivityIds.has(event.activityId));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDay = new Date(event.date);
    eventDay.setHours(0, 0, 0, 0);
    const isPast = eventDay.getTime() <= today.getTime();

    return (
      <div className={`agenda-session-card ${isPresent ? 'present' : isEnrolled ? 'enrolled' : ''} ${isFull && !isEnrolled ? 'full' : ''}`} key={event.id}>
        <div className="agenda-session-card-header">
          <div>
            <strong className="agenda-session-activity">{event.title}</strong>
            {event.categoryName ? <span className="agenda-session-category">{event.categoryName}</span> : null}
          </div>
          {event.capacity !== undefined && (
            <div className="agenda-session-capacity">
              <Users size={13} />
              <strong>
                {event.capacity !== null
                  ? `${event.enrolledCount ?? 0}/${event.capacity}`
                  : `${event.enrolledCount ?? 0} inscritos`}
              </strong>
            </div>
          )}
        </div>

        <div className="agenda-session-meta">
          <span>
            <Clock size={12} />
            {event.time}{event.timeEnd ? ` — ${event.timeEnd}` : ''}
          </span>
          {(event.professionals?.length ?? 0) > 0 ? (
            <span>{event.professionals!.join(', ')}</span>
          ) : null}
          {event.companyName && event.companyName !== '-' ? <span>{event.companyName}</span> : null}
        </div>

        {!isEmployee && event.scheduleId && (
          <div className="agenda-session-actions">
            {isPresent ? (
              <span className="agenda-present-badge">
                <CheckCircle size={13} /> Presente
              </span>
            ) : isEnrolled ? (
              <>
                <span className="agenda-enrolled-badge">
                  <CheckCircle size={13} /> Inscrito
                </span>
                {!isPast && (
                  <button
                    className="ghost-button danger"
                    disabled={isWorking}
                    onClick={() => void handleUnenroll(event.scheduleId!)}
                    type="button"
                  >
                    {isWorking ? 'Cancelando...' : 'Cancelar inscrição'}
                  </button>
                )}
              </>
            ) : isPast ? (
              null
            ) : isFull ? (
              <span className="agenda-full-badge">
                <XCircle size={13} /> Lotado
              </span>
            ) : !isAllowed ? (
              <span className="agenda-full-badge" title="Esta atividade não está incluída no seu plano">
                <XCircle size={13} /> Não incluso no plano
              </span>
            ) : (
              <button
                className="new-button"
                disabled={isWorking}
                onClick={() => void handleEnroll(event.scheduleId!)}
                type="button"
              >
                {isWorking ? 'Inscrevendo...' : 'Inscrever-se'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderGenericCard(event: CalendarEvent) {
    return (
      <article className={`student-calendar-event-card ${event.type}`} key={event.id}>
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
    );
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
    <>
    <header className="module-page-header">
      <p className="section-label">Atividade</p>
      <h2 className="module-page-title">CALENDÁRIO</h2>
    </header>
    <div className="form-view student-calendar-view">
      <p className="form-hint">
        {isEmployee
          ? 'Visualize todas as suas aulas agendadas.'
          : 'Visualize suas inscrições, presenças, check-ins e promoções.'}
      </p>

      {feedback ? <div className={`form-feedback ${feedback.toLowerCase().includes('sucesso') ? 'success' : ''}`}>{feedback}</div> : null}

      <section className="student-calendar-toolbar">
        <div className="student-calendar-filters">
          <label className="field" htmlFor="calendarDateFrom">
            <span>Data de</span>
            <input
              id="calendarDateFrom"
              onChange={(e) => setDateFrom(e.target.value)}
              type="date"
              value={dateFrom}
            />
          </label>
          <label className="field" htmlFor="calendarDateTo">
            <span>Data até</span>
            <input
              id="calendarDateTo"
              onChange={(e) => setDateTo(e.target.value)}
              type="date"
              value={dateTo}
            />
          </label>
          {!isEmployee && (
            <>
              <label className="field" htmlFor="calendarFilterActivity">
                <span>Atividade</span>
                <select
                  id="calendarFilterActivity"
                  onChange={(e) => setFilterActivity(e.target.value)}
                  value={filterActivity}
                >
                  <option value="">Todas</option>
                  {activityOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label className="field" htmlFor="calendarFilterSport">
                <span>Esporte</span>
                <select
                  id="calendarFilterSport"
                  onChange={(e) => setFilterSport(e.target.value)}
                  value={filterSport}
                >
                  <option value="">Todos</option>
                  {sportOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="field" htmlFor="calendarFilterCategory">
                <span>Categoria</span>
                <select
                  id="calendarFilterCategory"
                  onChange={(e) => setFilterCategory(e.target.value)}
                  value={filterCategory}
                >
                  <option value="">Todas</option>
                  {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </>
          )}
        </div>

        <div className="student-calendar-legend" aria-label="Filtros">
          {isEmployee ? (
            <span className="session">Aula</span>
          ) : (
            <>
              <button
                className={`activity ${activeFilters.has('activities') ? 'selected' : ''}`}
                onClick={() => toggleFilter('activities')}
                type="button"
              >
                Atividades
              </button>
              <button
                className={`enrolled ${activeFilters.has('my-activities') ? 'selected' : ''}`}
                onClick={() => toggleFilter('my-activities')}
                type="button"
              >
                Minhas Atividades
              </button>
              <button
                className={`gym-check-in ${activeFilters.has('check-ins') ? 'selected' : ''}`}
                onClick={() => toggleFilter('check-ins')}
                type="button"
              >
                Check-ins
              </button>
              <button
                className={`promotion ${activeFilters.has('promotions') ? 'selected' : ''}`}
                onClick={() => toggleFilter('promotions')}
                type="button"
              >
                Promoções
              </button>
            </>
          )}
        </div>

        {isLoading ? <div className="form-hint">Carregando calendário...</div> : null}
      </section>

      <section className="student-calendar-layout">
        <div className="student-calendar-months">
          {calendarMonths.map((calMonth) => (
            <div key={calMonth.key}>
              {calendarMonths.length > 1 && (
                <h4 className="student-calendar-month-label">{calMonth.label}</h4>
              )}
              <div className="student-calendar-grid" role="grid" aria-label={`Calendário ${calMonth.label}`}>
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                  <div className="student-calendar-weekday" key={`${calMonth.key}-${day}`}>
                    {day}
                  </div>
                ))}

                {calMonth.days.map((day, index) => {
                  if (!day) {
                    return <div className="student-calendar-day empty" key={`${calMonth.key}-empty-${index}`} />;
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
            </div>
          ))}
        </div>

        <aside className="student-calendar-details">
          <p className="section-label">Detalhes do dia</p>
          <h3>{selectedDateKey.split('-').reverse().join('/')}</h3>

          {selectedEvents.length === 0 ? (
            <div className="form-hint">Nenhum evento neste dia.</div>
          ) : (
            <div className="student-calendar-event-list">
              {selectedEvents.map((event) =>
                isActivityEvent(event.type)
                  ? renderActivityCard(event)
                  : renderGenericCard(event),
              )}
            </div>
          )}
        </aside>
      </section>
    </div>
    </>
  );
}
