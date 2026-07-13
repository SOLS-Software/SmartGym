// Helpers de calendário/vagas — portados de StudentActivitiesView.tsx e
// registrationHelpers.getDefaultActivityDateRange (web).
import type {
  ActivitySchedule,
  ActivityView,
  CalendarDay,
  CalendarMonth,
  DayActivityGroup,
  NamedRecord,
} from '../types/activity';

export const calendarWeekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

export function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function formatTime(value: string | null) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function getDateKey(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getDefaultActivityDateRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const toInputValue = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { dateFrom: toInputValue(start), dateTo: toInputValue(end) };
}

export function getUnifiedCalendarMonths(
  activities: ActivityView[],
  dateFrom: string,
  dateTo: string,
): CalendarMonth[] {
  const groupsByDate = new Map<string, Map<number, DayActivityGroup>>();

  for (const activity of activities) {
    for (const schedule of activity.atividadeAgendas ?? []) {
      const dateKey = getDateKey(schedule.dtInicial);
      if (!dateKey) continue;

      if (!groupsByDate.has(dateKey)) groupsByDate.set(dateKey, new Map());
      const dayGroups = groupsByDate.get(dateKey)!;

      if (!dayGroups.has(activity.id)) {
        dayGroups.set(activity.id, {
          activityId: activity.id,
          activityName: activity.dsAtividade,
          schedules: [],
        });
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

export function getProfessionals(schedule: ActivitySchedule) {
  const names =
    schedule.funcionarioAtividadeAgendas?.map((item) => getText(item.funcionario, 'nmFuncionario', '')) ?? [];
  return Array.from(new Set(names.filter(Boolean)));
}

export function getActiveEnrollmentCount(schedule: ActivitySchedule) {
  return schedule.alunoAtividadeAgendas?.length ?? 0;
}

export function getAvailableSeats(schedule: ActivitySchedule) {
  if (schedule.qtAlunos === null) return null;
  return Math.max(schedule.qtAlunos - getActiveEnrollmentCount(schedule), 0);
}

export function isStudentEnrolled(schedule: ActivitySchedule, studentId: number | null) {
  if (!studentId) return false;
  return schedule.alunoAtividadeAgendas?.some((enrollment) => enrollment.idAluno === studentId) ?? false;
}
