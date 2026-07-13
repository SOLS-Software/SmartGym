import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { apiUrl, getApiError } from '../../lib/api/client';
import { CalendarViewToggle, DayNav, MonthGrid, WeekStrip } from '../../lib/components/CalendarNav';
import { Screen } from '../../lib/components/Screen';
import { useTokens } from '../../lib/theme/tokens';
import { addDays, addMonths, type CalendarViewMode, dateKeyOf, parseKey } from '../../lib/utils/calendar';
import { formatDateDisplay } from '../../lib/utils/format';

type NamedRecord = { id: number; [key: string]: unknown };

type ActivitySchedule = {
  id: number;
  dtInicial: string | null;
  dtFinal: string | null;
  qtAlunos?: number | null;
  atividade?: NamedRecord | null;
  categoria?: NamedRecord | null;
  empresa?: NamedRecord | null;
  funcionarioAtividadeAgendas?: Array<NamedRecord & { funcionario?: NamedRecord | null }>;
};

type ActivityView = { id: number; dsAtividade: string; atividadeAgendas?: ActivitySchedule[] };

type PromotionView = {
  id: number;
  dsPromocao: string;
  dtInicio: string | null;
  dtEncerramento: string | null;
  vlDesconto: number | string | null;
  pcDesconto: number | string | null;
  empresa?: NamedRecord | null;
};

type CalEvent = { id: string; type: 'activity' | 'promotion'; title: string; time: string; details: string[] };

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}
function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateTime(d: Date) {
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function getProfessionals(s: ActivitySchedule) {
  const names = s.funcionarioAtividadeAgendas?.map((i) => getText(i.funcionario, 'nmFuncionario', '')) ?? [];
  return Array.from(new Set(names.filter(Boolean)));
}
function discount(p: PromotionView) {
  const v = Number(p.vlDesconto ?? 0);
  const pc = Number(p.pcDesconto ?? 0);
  if (pc > 0) return `${pc}%`;
  if (v > 0) return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return '-';
}

export default function CalendarioEmpresaScreen() {
  const t = useTokens();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedKey, setSelectedKey] = useState<string>(() => dateKeyOf(new Date()));
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [promotions, setPromotions] = useState<PromotionView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setIsLoading(true);
        const [aRes, pRes] = await Promise.all([
          fetch(`${apiUrl}/activities?includeDetails=true`),
          fetch(`${apiUrl}/promotions?includeDetails=true`),
        ]);
        const failed = [aRes, pRes].find((r) => !r.ok);
        if (failed) await getApiError(failed, 'Não foi possível carregar o calendário da empresa.');
        if (!cancelled) {
          setActivities((await aRes.json()) as ActivityView[]);
          setPromotions((await pRes.json()) as PromotionView[]);
        }
      } catch (error) {
        if (!cancelled) setFeedback(error instanceof Error ? error.message : 'Erro ao carregar calendário.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Eventos por dia. Promoções (multi-dia) são geradas apenas dentro do mês do cursor.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    const push = (key: string, e: CalEvent) => map.set(key, [...(map.get(key) ?? []), e]);

    for (const activity of activities) {
      for (const s of activity.atividadeAgendas ?? []) {
        const date = parseDate(s.dtInicial);
        if (!date) continue;
        const name = getText(s.atividade, 'dsAtividade', activity.dsAtividade);
        const profs = getProfessionals(s);
        push(dateKeyOf(date), {
          id: `a-${s.id}`,
          type: 'activity',
          title: name,
          time: fmtTime(date),
          details: [
            `Categoria: ${getText(s.categoria, 'dsCategoria')}`,
            `Filial: ${getText(s.empresa, 'dsEmpresa')}`,
            `Profissionais: ${profs.length ? profs.join(', ') : '-'}`,
            `Vagas: ${s.qtAlunos ?? '-'}`,
          ],
        });
      }
    }

    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    for (const p of promotions) {
      const start = parseDate(p.dtInicio);
      if (!start) continue;
      const rawEnd = parseDate(p.dtEncerramento) ?? monthEnd;
      const from = start > monthStart ? start : monthStart;
      const to = rawEnd < monthEnd ? rawEnd : monthEnd;
      const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      while (cur <= to) {
        push(dateKeyOf(cur), {
          id: `p-${p.id}-${dateKeyOf(cur)}`,
          type: 'promotion',
          title: p.dsPromocao,
          time: 'Promo',
          details: [`Desconto: ${discount(p)}`, `Filial: ${getText(p.empresa, 'dsEmpresa')}`, `Fim: ${p.dtEncerramento ? fmtDateTime(rawEnd) : 'até o fim do mês'}`],
        });
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [activities, promotions, cursor]);

  const hasEvents = (key: string) => (eventsByDay.get(key)?.length ?? 0) > 0;
  const activeKey = viewMode === 'day' ? dateKeyOf(cursor) : selectedKey;
  const activeEvents = eventsByDay.get(activeKey) ?? [];

  function selectDay(key: string) {
    setSelectedKey(key);
    setCursor(parseKey(key));
  }

  return (
    <Screen onBack={() => router.back()} sectionLabel="Atividade" title="Calendário">
      {feedback ? <Text style={[styles.feedback, { color: t.danger }]}>{feedback}</Text> : null}

      <CalendarViewToggle onChange={setViewMode} value={viewMode} />

      {viewMode === 'month' ? (
        <MonthGrid
          hasEvents={hasEvents}
          monthDate={cursor}
          onNext={() => setCursor((c) => addMonths(c, 1))}
          onPrev={() => setCursor((c) => addMonths(c, -1))}
          onSelectDay={selectDay}
          selectedKey={selectedKey}
        />
      ) : null}

      {viewMode === 'week' ? (
        <WeekStrip
          date={cursor}
          hasEvents={hasEvents}
          onNext={() => setCursor((c) => addDays(c, 7))}
          onPrev={() => setCursor((c) => addDays(c, -7))}
          onSelectDay={selectDay}
          selectedKey={selectedKey}
        />
      ) : null}

      {viewMode === 'day' ? (
        <DayNav date={cursor} onNext={() => setCursor((c) => addDays(c, 1))} onPrev={() => setCursor((c) => addDays(c, -1))} />
      ) : null}

      {isLoading ? <ActivityIndicator color={t.brand} style={{ marginVertical: 8 }} /> : null}

      <Text style={[styles.detailsLabel, { color: t.text }]}>{formatDateDisplay(activeKey)}</Text>

      {activeEvents.length === 0 ? (
        <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum evento neste dia.</Text>
      ) : (
        <View style={styles.stack}>
          {activeEvents.map((e) => (
            <View key={e.id} style={[styles.eventCard, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
              <View style={styles.eventHeader}>
                <View style={[styles.badge, { backgroundColor: e.type === 'activity' ? t.brandTintSoft : '#fff3cd' }]}>
                  <Text style={[styles.badgeText, { color: e.type === 'activity' ? t.brand : '#856404' }]}>
                    {e.type === 'activity' ? 'Atividade' : 'Promoção'}
                  </Text>
                </View>
                <Text style={[styles.eventTime, { color: t.textSubtle }]}>{e.time}</Text>
              </View>
              <Text style={[styles.eventTitle, { color: t.text }]}>{e.title}</Text>
              {e.details.map((d) => (
                <Text key={d} style={[styles.eventDetail, { color: t.textSubtle }]}>{d}</Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: { fontSize: 13, fontWeight: '600' },
  detailsLabel: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  hint: { fontSize: 13 },
  stack: { gap: 10 },
  eventCard: { borderWidth: 1, padding: 14, gap: 4 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  eventTime: { fontSize: 12, fontWeight: '700' },
  eventTitle: { fontSize: 15, fontWeight: '800' },
  eventDetail: { fontSize: 12, fontWeight: '500' },
});
