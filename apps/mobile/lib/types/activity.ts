// Tipos de atividade/agenda — espelham StudentActivitiesView.tsx (web).

export type NamedRecord = {
  id: number;
  [key: string]: unknown;
};

export type ActivitySchedule = {
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

export type ActivityView = {
  id: number;
  dsAtividade: string;
  empresa?: NamedRecord | null;
  esporte?: NamedRecord | null;
  atividadeAgendas?: ActivitySchedule[];
};

export type DayActivityGroup = {
  activityId: number;
  activityName: string;
  schedules: ActivitySchedule[];
};

export type CalendarDay = {
  key: string;
  day: number | null;
  groups: DayActivityGroup[];
};

export type CalendarMonth = {
  key: string;
  label: string;
  days: CalendarDay[];
};
