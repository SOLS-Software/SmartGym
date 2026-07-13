import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiUrl, getApiError } from '../../lib/api/client';
import { BottomSheet } from '../../lib/components/BottomSheet';
import { Screen } from '../../lib/components/Screen';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import type { ActivityView, DayActivityGroup } from '../../lib/types/activity';
import {
  calendarWeekDays,
  formatTime,
  getAvailableSeats,
  getDefaultActivityDateRange,
  getProfessionals,
  getText,
  getUnifiedCalendarMonths,
  isStudentEnrolled,
} from '../../lib/utils/activities';
import { formatDateDisplay } from '../../lib/utils/format';

export default function AtividadesScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const studentId = user?.idAluno ?? null;

  const range = getDefaultActivityDateRange();
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [monthIndex, setMonthIndex] = useState(0);
  const [openDay, setOpenDay] = useState<{ dateKey: string; group: DayActivityGroup } | null>(null);
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
      setOpenDay(null);
      await loadActivities();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao realizar inscrição.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const months = getUnifiedCalendarMonths(activities, range.dateFrom, range.dateTo);
  const month = months[monthIndex] ?? null;
  const selectedInSheet = openDay
    ? openDay.group.schedules.filter((s) => selectedScheduleIds.includes(s.id)).length
    : 0;

  return (
    <Screen sectionLabel="Agenda" title="Atividades">
      {feedback ? (
        <View style={[styles.feedback, { backgroundColor: t.brandTintSoft, borderRadius: t.radius }]}>
          <Text style={[styles.feedbackText, { color: t.brand }]}>{feedback}</Text>
        </View>
      ) : null}

      {/* Navegação de mês */}
      <View style={styles.monthNav}>
        <Pressable
          disabled={monthIndex === 0}
          hitSlop={8}
          onPress={() => setMonthIndex((i) => Math.max(0, i - 1))}
          style={[styles.navBtn, { opacity: monthIndex === 0 ? 0.3 : 1 }]}
        >
          <Text style={[styles.navText, { color: t.brand }]}>‹</Text>
        </Pressable>
        <Text style={[styles.monthLabel, { color: t.text }]}>{month?.label ?? '—'}</Text>
        <Pressable
          disabled={monthIndex >= months.length - 1}
          hitSlop={8}
          onPress={() => setMonthIndex((i) => Math.min(months.length - 1, i + 1))}
          style={[styles.navBtn, { opacity: monthIndex >= months.length - 1 ? 0.3 : 1 }]}
        >
          <Text style={[styles.navText, { color: t.brand }]}>›</Text>
        </Pressable>
      </View>

      {isLoading ? <ActivityIndicator color={t.brand} style={{ marginVertical: 12 }} /> : null}

      {/* Cabeçalho de dias da semana */}
      <View style={styles.weekRow}>
        {calendarWeekDays.map((d) => (
          <Text key={d} style={[styles.weekDay, { color: t.textSubtle }]}>
            {d}
          </Text>
        ))}
      </View>

      {/* Grade do mês */}
      {month ? (
        <View style={styles.grid}>
          {month.days.map((day) => {
            const hasSchedule = day.groups.length > 0;
            return (
              <View
                key={day.key}
                style={[
                  styles.cell,
                  hasSchedule
                    ? { backgroundColor: t.brandTintSoft, borderColor: t.brand }
                    : { borderColor: 'transparent' },
                ]}
              >
                {day.day ? (
                  hasSchedule ? (
                    <Pressable
                      onPress={() => setOpenDay({ dateKey: day.key, group: day.groups[0]! })}
                      style={styles.cellInner}
                    >
                      <Text style={[styles.cellDay, { color: t.brand, fontWeight: '800' }]}>{day.day}</Text>
                      <View style={[styles.dot, { backgroundColor: t.brand }]} />
                      {day.groups.length > 1 ? (
                        <Text style={[styles.cellCount, { color: t.brand }]}>{day.groups.length}</Text>
                      ) : null}
                    </Pressable>
                  ) : (
                    <View style={styles.cellInner}>
                      <Text style={[styles.cellDay, { color: t.text }]}>{day.day}</Text>
                    </View>
                  )
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={[styles.legend, { color: t.textSubtle }]}>Toque em um dia destacado para ver as aulas.</Text>

      {/* Bottom sheet do dia */}
      <BottomSheet
        onClose={() => setOpenDay(null)}
        title={openDay ? openDay.group.activityName : ''}
        visible={openDay !== null}
      >
        {openDay ? (
          <View style={{ gap: 12 }}>
            <Text style={[styles.sheetDate, { color: t.textSubtle }]}>{formatDateDisplay(openDay.dateKey)}</Text>

            {/* Se houver mais de um grupo no dia, permite alternar */}
            {(() => {
              const dayGroups = (months[monthIndex]?.days.find((d) => d.key === openDay.dateKey)?.groups) ?? [openDay.group];
              return dayGroups.length > 1 ? (
                <View style={styles.groupTabs}>
                  {dayGroups.map((g) => {
                    const active = g.activityId === openDay.group.activityId;
                    return (
                      <Pressable
                        key={g.activityId}
                        onPress={() => setOpenDay({ dateKey: openDay.dateKey, group: g })}
                        style={[styles.groupTab, { borderColor: active ? t.brand : t.border, backgroundColor: active ? t.brandTintSoft : t.surface }]}
                      >
                        <Text style={[styles.groupTabText, { color: active ? t.brand : t.textMuted }]}>{g.activityName}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null;
            })()}

            {openDay.group.schedules.map((schedule) => {
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
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isSelected ? t.brand : t.borderStrong,
                          backgroundColor: isSelected ? t.brand : 'transparent',
                        },
                      ]}
                    >
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

            <Pressable
              disabled={selectedScheduleIds.length === 0 || isSubmitting}
              onPress={() => void handleEnroll()}
              style={({ pressed }) => [
                styles.enrollBtn,
                {
                  backgroundColor: t.brand,
                  borderRadius: t.radius,
                  opacity: selectedScheduleIds.length === 0 || isSubmitting ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.enrollText}>
                  Inscrever nas aulas{selectedInSheet > 0 ? ` (${selectedInSheet})` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  feedback: { padding: 12 },
  feedbackText: { fontSize: 13, fontWeight: '700' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { paddingHorizontal: 16, paddingVertical: 4 },
  navText: { fontSize: 28, fontWeight: '800' },
  monthLabel: { fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row' },
  weekDay: { width: CELL, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, aspectRatio: 1, padding: 2, borderWidth: 1, borderRadius: 8 },
  cellInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cellDay: { fontSize: 13 },
  dot: { width: 5, height: 5, borderRadius: 999 },
  cellCount: { fontSize: 9, fontWeight: '800' },
  legend: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  sheetDate: { fontSize: 13, fontWeight: '600' },
  groupTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupTab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  groupTabText: { fontSize: 12, fontWeight: '700' },
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
