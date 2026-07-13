// Helpers de calendário/vagas — portados de StudentActivitiesView.tsx e
// registrationHelpers.getDefaultActivityDateRange (web).
import type { ActivitySchedule, ActivityView, DayActivityGroup, NamedRecord } from '../types/activity';

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

// Agrupa os horários por dia (YYYY-MM-DD) -> grupos de atividade, para as
// visualizações Mês/Semana/Dia lerem de uma única fonte.
export function getActivityGroupsByDate(activities: ActivityView[]): Map<string, DayActivityGroup[]> {
  const byDate = new Map<string, Map<number, DayActivityGroup>>();

  for (const activity of activities) {
    for (const schedule of activity.atividadeAgendas ?? []) {
      const key = getDateKey(schedule.dtInicial);
      if (!key) continue;
      if (!byDate.has(key)) byDate.set(key, new Map());
      const dayGroups = byDate.get(key)!;
      if (!dayGroups.has(activity.id)) {
        dayGroups.set(activity.id, { activityId: activity.id, activityName: activity.dsAtividade, schedules: [] });
      }
      dayGroups.get(activity.id)!.schedules.push(schedule);
    }
  }

  const out = new Map<string, DayActivityGroup[]>();
  for (const [key, groups] of byDate) {
    out.set(key, Array.from(groups.values()).sort((a, b) => a.activityName.localeCompare(b.activityName)));
  }
  return out;
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
