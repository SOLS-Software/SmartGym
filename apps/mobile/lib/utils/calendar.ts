// Utilitários de data para as visualizações de calendário (Mês/Semana/Dia).
// Semana começa no domingo (weekStartsOn=0) por padrão, estilo Google Agenda pt-BR.

const WEEKDAY_LABELS_SUN = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function dateKeyOf(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function startOfWeek(d: Date, weekStartsOn = 0) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export function weekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Células do mês com brancos iniciais até o primeiro dia da semana.
export function monthCells(monthDate: Date, weekStartsOn = 0): Array<Date | null> {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const lead = (new Date(y, m, 1).getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m, i + 1)),
  ];
}

export function weekdayLabels(weekStartsOn = 0) {
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS_SUN[(i + weekStartsOn) % 7]);
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function fullDateLabel(d: Date) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export function shortDateLabel(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export type CalendarViewMode = 'month' | 'week' | 'day';
