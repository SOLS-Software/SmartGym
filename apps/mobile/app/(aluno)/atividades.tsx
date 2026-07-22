import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiUrl, getApiError, authFetch as fetch } from '../../lib/api/client';
import { CalendarViewToggle, DayNav, MonthGrid, WeekStrip } from '../../lib/components/CalendarNav';
import { Screen } from '../../lib/components/Screen';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import type { ActivityView, DayActivityGroup } from '../../lib/types/activity';
import {
  formatTime,
  getActivityGroupsByDate,
  getAvailableSeats,
  getDefaultActivityDateRange,
  getProfessionals,
  getText,
  isStudentEnrolled,
} from '../../lib/utils/activities';
import { addDays, addMonths, type CalendarViewMode, dateKeyOf, parseKey } from '../../lib/utils/calendar';
import { formatDateDisplay } from '../../lib/utils/format';

export default function AtividadesScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const studentId = user?.idAluno ?? null;

  const range = getDefaultActivityDateRange();
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedKey, setSelectedKey] = useState<string>(() => dateKeyOf(new Date()));
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function loadActivities() {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ includeDetails: 'true', dtInicio: range.dateFrom, dtFim: range.dateTo });
      const response = await fetch(`${apiUrl}/activities?${params.toString()}`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as atividades.');
      setActivities((await response.json()) as ActivityView[]);
      setSelectedScheduleIds([]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar atividades.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupsByDate = useMemo(() => getActivityGroupsByDate(activities), [activities]);
  const hasEvents = (key: string) => (groupsByDate.get(key)?.length ?? 0) > 0;

  const activeKey = viewMode === 'day' ? dateKeyOf(cursor) : selectedKey;
  const activeGroups: DayActivityGroup[] = groupsByDate.get(activeKey) ?? [];

  function selectDay(key: string) {
    setSelectedKey(key);
    setCursor(parseKey(key));
  }

  function toggleSchedule(scheduleId: number) {
    setSelectedScheduleIds((current) =>
      current.includes(scheduleId) ? current.filter((id) => id !== scheduleId) : [...current, scheduleId],
    );
  }

  async function handleEnroll() {
    if (!studentId || selectedScheduleIds.length === 0) return;
    try {
      setIsSubmitting(true);
      const response = await fetch(`${apiUrl}/students/${studentId}/activity-schedules/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleIds: selectedScheduleIds }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível realizar a inscrição.');
      setFeedback('Inscrição realizada com sucesso.');
      await loadActivities();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao realizar inscrição.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen sectionLabel="Agenda" title="Atividades">
      {feedback ? (
        <View style={[styles.feedback, { backgroundColor: t.brandTintSoft, borderRadius: t.radius }]}>
          <Text style={[styles.feedbackText, { color: t.brand }]}>{feedback}</Text>
        </View>
      ) : null}

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
        <DayNav
          date={cursor}
          onNext={() => setCursor((c) => addDays(c, 1))}
          onPrev={() => setCursor((c) => addDays(c, -1))}
        />
      ) : null}

      {isLoading ? <ActivityIndicator color={t.brand} style={{ marginVertical: 8 }} /> : null}

      {/* Atividades do dia ativo */}
      <View style={styles.dayPanel}>
        <Text style={[styles.dayTitle, { color: t.text }]}>Atividades de {formatDateDisplay(activeKey)}</Text>

        {activeGroups.length === 0 ? (
          <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhuma atividade neste dia.</Text>
        ) : (
          activeGroups.map((group) => (
            <View key={group.activityId} style={styles.group}>
              <Text style={[styles.groupName, { color: t.brand }]}>{group.activityName}</Text>
              {group.schedules.map((schedule) => {
                const professionals = getProfessionals(schedule);
                const category = getText(schedule.categoria, 'dsCategoria');
                const availableSeats = getAvailableSeats(schedule);
                const enrolled = isStudentEnrolled(schedule, studentId);
                const isFull = availableSeats !== null && availableSeats <= 0;
                const isSelected = selectedScheduleIds.includes(schedule.id);
                const disabled = enrolled || isFull || isSubmitting;

                return (
                  <Pressable
                    key={schedule.id}
                    disabled={disabled}
                    onPress={() => toggleSchedule(schedule.id)}
                    style={[
                      styles.scheduleCard,
                      {
                        backgroundColor: t.surface,
                        borderColor: isSelected ? t.brand : t.border,
                        borderRadius: t.radius,
                        opacity: disabled && !enrolled ? 0.55 : 1,
                      },
                    ]}
                  >
                    <View style={styles.scheduleHeader}>
                      <Text style={[styles.scheduleTime, { color: t.text }]}>
                        {formatTime(schedule.dtInicial)} até {formatTime(schedule.dtFinal)}
                      </Text>
                      <View style={[styles.checkbox, { borderColor: isSelected ? t.brand : t.borderStrong, backgroundColor: isSelected ? t.brand : 'transparent' }]}>
                        {isSelected ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                    </View>
                    <Text style={[styles.scheduleCategory, { color: t.textMuted }]}>{category}</Text>
                    <Text style={[styles.scheduleMeta, { color: t.textSubtle }]}>
                      {professionals.length > 0 ? professionals.join(', ') : 'Profissional não informado'}
                    </Text>
                    <Text style={[styles.scheduleMeta, { color: t.textSubtle }]}>
                      {availableSeats === null ? 'Vagas livres' : `${availableSeats} de ${schedule.qtAlunos} vaga(s)`}
                      {' · '}
                      {getText(schedule.empresa, 'dsEmpresa')}
                    </Text>
                    {enrolled ? <Text style={[styles.tag, { color: t.brand }]}>Você já está inscrito</Text> : null}
                    {!enrolled && isFull ? <Text style={[styles.tag, { color: t.danger }]}>Sem vagas</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}

        {selectedScheduleIds.length > 0 ? (
          <Pressable
            disabled={isSubmitting}
            onPress={() => void handleEnroll()}
            style={({ pressed }) => [
              styles.enrollBtn,
              { backgroundColor: t.brand, borderRadius: t.radius, opacity: isSubmitting ? 0.5 : pressed ? 0.85 : 1 },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.enrollText}>Inscrever nas aulas ({selectedScheduleIds.length})</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: { padding: 12 },
  feedbackText: { fontSize: 13, fontWeight: '700' },
  dayPanel: { gap: 12, marginTop: 4 },
  dayTitle: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 13 },
  group: { gap: 8 },
  groupName: { fontSize: 13, fontWeight: '800' },
  scheduleCard: { borderWidth: 1, padding: 14, gap: 4 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scheduleTime: { fontSize: 15, fontWeight: '800' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  scheduleCategory: { fontSize: 14, fontWeight: '700' },
  scheduleMeta: { fontSize: 12, fontWeight: '600' },
  tag: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  enrollBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  enrollText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
