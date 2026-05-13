'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type CompanyCalendarViewProps = {
  userName: string;
};

type NamedRecord = {
  id: number;
  [key: string]: unknown;
};

type ActivitySchedule = {
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

type ActivityView = {
  id: number;
  dsAtividade: string;
  atividadeAgendas?: ActivitySchedule[];
};

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

type CompanyCalendarEvent = {
  id: string;
  type: 'activity' | 'promotion';
  date: Date;
  title: string;
  time: string;
  details: string[];
};

type CompanyOption = {
  id: string;
  name: string;
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

function getProfessionals(schedule: ActivitySchedule) {
  const names =
    schedule.funcionarioAtividadeAgendas?.map((item) =>
      getText(item.funcionario, 'nmFuncionario', ''),
    ) ?? [];

  return Array.from(new Set(names.filter(Boolean)));
}

function getPromotionItems(promotion: PromotionView) {
  const plans = promotion.promocaoPlanos?.map((item) => getText(item.plano, 'dsPlano', '')) ?? [];
  const products = promotion.promocaoProdutos?.map((item) => getText(item.produto, 'dsProduto', '')) ?? [];
  return [...plans, ...products].filter(Boolean);
}

function getPromotionDiscount(promotion: PromotionView) {
  const valueDiscount = Number(promotion.vlDesconto ?? 0);
  const percentDiscount = Number(promotion.pcDesconto ?? 0);

  if (percentDiscount > 0) return `${percentDiscount}%`;
  if (valueDiscount > 0) return valueDiscount.toLocaleString('pt-BR', { currency: 'BRL', style: 'currency' });
  return '-';
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

function getCompanyOption(record: NamedRecord | null | undefined): CompanyOption | null {
  if (!record?.id) return null;
  return {
    id: String(record.id),
    name: getText(record, 'dsEmpresa', `Empresa ${record.id}`),
  };
}

export function CompanyCalendarView({ userName }: CompanyCalendarViewProps) {
  const [month, setMonth] = useState(getCurrentMonthValue);
  const [companyFilter, setCompanyFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<'activity' | 'promotion' | ''>('');
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [promotions, setPromotions] = useState<PromotionView[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState(getDateKey(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const companyOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const activity of activities) {
      for (const schedule of activity.atividadeAgendas ?? []) {
        const company = getCompanyOption(schedule.empresa);
        if (company) options.set(company.id, company.name);
      }
    }

    for (const promotion of promotions) {
      const company = getCompanyOption(promotion.empresa);
      if (company) options.set(company.id, company.name);
    }

    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  }, [activities, promotions]);

  const events = useMemo<CompanyCalendarEvent[]>(() => {
    const activityEvents =
      eventTypeFilter === 'promotion'
        ? []
        : activities.flatMap((activity) =>
            (activity.atividadeAgendas ?? []).flatMap((schedule) => {
              const companyId = schedule.empresa?.id ? String(schedule.empresa.id) : '';
              if (companyFilter && companyId !== companyFilter) return [];

              const date = parseEventDate(schedule.dtInicial);
              if (!date) return [];

              const endDate = parseEventDate(schedule.dtFinal);
              const activityName = getText(schedule.atividade, 'dsAtividade', activity.dsAtividade);
              const professionals = getProfessionals(schedule);

              return [
                {
                  id: `activity-${schedule.id}`,
                  type: 'activity' as const,
                  date,
                  title: activityName,
                  time: formatTime(date),
                  details: [
                    `Atividade: ${activityName}`,
                    `Inicio: ${formatDateTime(date)}`,
                    `Fim: ${endDate ? formatDateTime(endDate) : '-'}`,
                    `Categoria: ${getText(schedule.categoria, 'dsCategoria')}`,
                    `Filial: ${getText(schedule.empresa, 'dsEmpresa')}`,
                    `Profissionais: ${professionals.length > 0 ? professionals.join(', ') : '-'}`,
                    `Vagas: ${schedule.qtAlunos ?? '-'}`,
                  ],
                },
              ];
            }),
          );

    const promotionEvents =
      eventTypeFilter === 'activity'
        ? []
        : promotions.flatMap((promotion) => {
            const companyId = promotion.empresa?.id ? String(promotion.empresa.id) : '';
            if (companyFilter && companyId !== companyFilter) return [];

            const startDate = parseEventDate(promotion.dtInicio);
            if (!startDate) return [];
            const endDate = parseEventDate(promotion.dtEncerramento) ?? getMonthEnd(month);
            const items = getPromotionItems(promotion);

            return getDateRange(startDate, endDate).map((date) => ({
              id: `promotion-${promotion.id}-${getDateKey(date)}`,
              type: 'promotion' as const,
              date,
              title: promotion.dsPromocao,
              time: 'Promo',
              details: [
                `Promocao: ${promotion.dsPromocao}`,
                `Inicio: ${formatDateTime(startDate)}`,
                `Encerramento: ${promotion.dtEncerramento ? formatDateTime(endDate) : 'Ate o fim do mes'}`,
                `Desconto: ${getPromotionDiscount(promotion)}`,
                `Filial: ${getText(promotion.empresa, 'dsEmpresa')}`,
                `Itens: ${items.length > 0 ? items.join(', ') : '-'}`,
              ],
            }));
          });

    return [...activityEvents, ...promotionEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [activities, companyFilter, eventTypeFilter, month, promotions]);

  const eventsByDay = useMemo(() => {
    const groups = new Map<string, CompanyCalendarEvent[]>();
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
    void loadCalendar();
  }, [month]);

  async function loadCalendar() {
    try {
      setIsLoading(true);
      const [activitiesResponse, promotionsResponse] = await Promise.all([
        fetch(`${apiUrl}/activities?includeDetails=true`),
        fetch(`${apiUrl}/promotions?includeDetails=true`),
      ]);

      const failedResponse = [activitiesResponse, promotionsResponse].find((response) => !response.ok);
      if (failedResponse) {
        await getApiError(failedResponse, 'Nao foi possivel carregar o calendario da empresa.');
      }

      setActivities((await activitiesResponse.json()) as ActivityView[]);
      setPromotions((await promotionsResponse.json()) as PromotionView[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar calendario da empresa.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="form-view student-calendar-view company-calendar-view">
      <div className="form-heading student-calendar-heading">
        <p className="section-label">Calendario da empresa</p>
        <h2>{userName}</h2>
        <p>Visualize atividades e promocoes cadastradas por mes.</p>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      <section className="student-calendar-toolbar">
        <label className="field" htmlFor="companyCalendarMonth">
          <span>Mes</span>
          <input
            id="companyCalendarMonth"
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
        <label className="field" htmlFor="companyCalendarCompany">
          <span>Empresa</span>
          <select
            id="companyCalendarCompany"
            onChange={(event) => setCompanyFilter(event.target.value)}
            value={companyFilter}
          >
            <option value="">Todas</option>
            {companyOptions.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <div className="company-calendar-legend" aria-label="Filtros de tipo de evento">
          <button
            className={`activity ${eventTypeFilter === 'activity' ? 'selected' : ''}`}
            onClick={() => setEventTypeFilter((current) => (current === 'activity' ? '' : 'activity'))}
            type="button"
          >
            Atividades
          </button>
          <button
            className={`promotion ${eventTypeFilter === 'promotion' ? 'selected' : ''}`}
            onClick={() => setEventTypeFilter((current) => (current === 'promotion' ? '' : 'promotion'))}
            type="button"
          >
            Promocoes
          </button>
        </div>
        {isLoading ? <div className="form-hint">Carregando calendario...</div> : null}
      </section>

      <section className="student-calendar-layout">
        <div className="student-calendar-grid" role="grid" aria-label="Calendario mensal da empresa">
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
                  {dayEvents.slice(0, 4).map((event) => (
                    <span className={event.type} key={event.id}>
                      {event.time} {event.title}
                    </span>
                  ))}
                  {dayEvents.length > 4 ? <span>+{dayEvents.length - 4} evento(s)</span> : null}
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
                  <span className={`status-badge ${event.type === 'activity' ? 'active' : 'pending'}`}>
                    {event.type === 'activity' ? 'Atividade' : 'Promocao'}
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
