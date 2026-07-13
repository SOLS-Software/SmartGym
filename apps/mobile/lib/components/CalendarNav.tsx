import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../theme/tokens';
import {
  addDays,
  type CalendarViewMode,
  dateKeyOf,
  fullDateLabel,
  monthCells,
  monthLabel,
  startOfWeek,
  weekdayLabels,
  weekDays,
} from '../utils/calendar';

const WEEK_STARTS_ON = 0; // domingo

// --- Seletor Mês / Semana / Dia ---
export function CalendarViewToggle({
  value,
  onChange,
}: {
  value: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
}) {
  const t = useTokens();
  const options: Array<{ key: CalendarViewMode; label: string }> = [
    { key: 'month', label: 'Mês' },
    { key: 'week', label: 'Semana' },
    { key: 'day', label: 'Dia' },
  ];
  return (
    <View style={[styles.toggle, { backgroundColor: t.inputBg, borderColor: t.border, borderRadius: t.radius }]}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.toggleItem, { backgroundColor: active ? t.brand : 'transparent', borderRadius: t.radius - 2 }]}
          >
            <Text style={[styles.toggleText, { color: active ? '#fff' : t.textMuted }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NavHeader({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  const t = useTokens();
  return (
    <View style={styles.navHeader}>
      <Pressable hitSlop={8} onPress={onPrev} style={styles.navBtn}>
        <Text style={[styles.navChevron, { color: t.brand }]}>‹</Text>
      </Pressable>
      <Text style={[styles.navLabel, { color: t.text }]}>{label}</Text>
      <Pressable hitSlop={8} onPress={onNext} style={styles.navBtn}>
        <Text style={[styles.navChevron, { color: t.brand }]}>›</Text>
      </Pressable>
    </View>
  );
}

type DayPickerProps = {
  selectedKey: string;
  hasEvents: (key: string) => boolean;
  onSelectDay: (key: string) => void;
};

// --- Grade do mês ---
export function MonthGrid({
  monthDate,
  onPrev,
  onNext,
  selectedKey,
  hasEvents,
  onSelectDay,
}: DayPickerProps & { monthDate: Date; onPrev: () => void; onNext: () => void }) {
  const t = useTokens();
  const cells = monthCells(monthDate, WEEK_STARTS_ON);
  return (
    <View style={styles.block}>
      <NavHeader label={monthLabel(monthDate)} onNext={onNext} onPrev={onPrev} />
      <View style={styles.weekRow}>
        {weekdayLabels(WEEK_STARTS_ON).map((d) => (
          <Text key={d} style={[styles.weekDay, { color: t.textSubtle }]}>{d}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`e-${index}`} style={styles.cell} />;
          const key = dateKeyOf(day);
          const has = hasEvents(key);
          const selected = key === selectedKey;
          return (
            <View key={key} style={styles.cell}>
              <Pressable
                disabled={!has}
                onPress={() => onSelectDay(key)}
                style={[styles.cellInner, { borderRadius: 8, backgroundColor: selected ? t.brand : has ? t.brandTintSoft : 'transparent' }]}
              >
                <Text style={[styles.cellDay, { color: selected ? '#fff' : has ? t.brand : t.text, fontWeight: has || selected ? '800' : '500' }]}>
                  {day.getDate()}
                </Text>
                {has ? <View style={[styles.dot, { backgroundColor: selected ? '#fff' : t.brand }]} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// --- Tira da semana ---
export function WeekStrip({
  date,
  onPrev,
  onNext,
  selectedKey,
  hasEvents,
  onSelectDay,
}: DayPickerProps & { date: Date; onPrev: () => void; onNext: () => void }) {
  const t = useTokens();
  const start = startOfWeek(date, WEEK_STARTS_ON);
  const days = weekDays(start);
  const end = addDays(start, 6);
  const label = `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
  const labels = weekdayLabels(WEEK_STARTS_ON);
  return (
    <View style={styles.block}>
      <NavHeader label={label} onNext={onNext} onPrev={onPrev} />
      <View style={styles.stripRow}>
        {days.map((day, i) => {
          const key = dateKeyOf(day);
          const has = hasEvents(key);
          const selected = key === selectedKey;
          return (
            <Pressable
              key={key}
              onPress={() => onSelectDay(key)}
              style={[styles.stripItem, { backgroundColor: selected ? t.brand : has ? t.brandTintSoft : 'transparent', borderColor: t.border, borderRadius: t.radius }]}
            >
              <Text style={[styles.stripWeekday, { color: selected ? '#fff' : t.textSubtle }]}>{labels[i]}</Text>
              <Text style={[styles.stripDay, { color: selected ? '#fff' : has ? t.brand : t.text }]}>{day.getDate()}</Text>
              {has ? <View style={[styles.dot, { backgroundColor: selected ? '#fff' : t.brand }]} /> : <View style={styles.dotSpacer} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// --- Navegação de dia ---
export function DayNav({ date, onPrev, onNext }: { date: Date; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={styles.block}>
      <NavHeader label={fullDateLabel(date)} onNext={onNext} onPrev={onPrev} />
    </View>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', borderWidth: 1, padding: 3, gap: 3 },
  toggleItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  toggleText: { fontSize: 13, fontWeight: '800' },
  block: { gap: 8 },
  navHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { paddingHorizontal: 16, paddingVertical: 4 },
  navChevron: { fontSize: 28, fontWeight: '800' },
  navLabel: { fontSize: 15, fontWeight: '800', textTransform: 'capitalize', flexShrink: 1, textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  weekDay: { width: CELL, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, aspectRatio: 1, padding: 2 },
  cellInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cellDay: { fontSize: 13 },
  dot: { width: 5, height: 5, borderRadius: 999 },
  dotSpacer: { height: 5 },
  stripRow: { flexDirection: 'row', gap: 4 },
  stripItem: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 3, borderWidth: 1 },
  stripWeekday: { fontSize: 10, fontWeight: '700' },
  stripDay: { fontSize: 16, fontWeight: '800' },
});
