'use client';

import { useEffect, useState } from 'react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type StudentActivitiesViewProps = {
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

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getProfessionals(schedule: ActivitySchedule) {
  const names =
    schedule.funcionarioAtividadeAgendas?.map((item) =>
      getText(item.funcionario, 'nmFuncionario', ''),
    ) ?? [];

  return Array.from(new Set(names.filter(Boolean)));
}

export function StudentActivitiesView({ studentName }: StudentActivitiesViewProps) {
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar atividades.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="form-view student-activities-view">
      <div className="form-heading student-activities-heading">
        <p className="section-label">Atividades da academia</p>
        <h2>{studentName}</h2>
        <p>Veja as atividades disponiveis e acompanhe a agenda de cada uma.</p>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

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
                  <div className="student-activity-schedule-list">
                    {schedules.map((schedule) => {
                      const professionals = getProfessionals(schedule);

                      return (
                        <div className="student-activity-schedule-card" key={schedule.id}>
                          <div>
                            <span>Inicio</span>
                            <strong>{formatDateTime(schedule.dtInicial)}</strong>
                          </div>
                          <div>
                            <span>Fim</span>
                            <strong>{formatDateTime(schedule.dtFinal)}</strong>
                          </div>
                          <div>
                            <span>Categoria</span>
                            <strong>{getText(schedule.categoria, 'dsCategoria')}</strong>
                          </div>
                          <div>
                            <span>Vagas</span>
                            <strong>{schedule.qtAlunos ?? '-'}</strong>
                          </div>
                          <div>
                            <span>Filial</span>
                            <strong>{getText(schedule.empresa, 'dsEmpresa')}</strong>
                          </div>
                          <div className="student-activity-professionals">
                            <span>Profissionais</span>
                            {professionals.length > 0 ? (
                              <div>
                                {professionals.map((professional) => (
                                  <strong key={professional}>{professional}</strong>
                                ))}
                              </div>
                            ) : (
                              <strong>-</strong>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
