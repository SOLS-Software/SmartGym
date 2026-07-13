import { Image, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../theme/tokens';
import type { ExerciseWithCover } from '../types/training';

type ExerciseCardProps = {
  exercise: ExerciseWithCover;
  meta?: string;
};

// Versão RN do ExerciseCard do web: foto de capa (fallback haltere), nome,
// meta (série·rep·peso·descanso), tags de áreas e instrução. Card empilhado.
export function ExerciseCard({ exercise, meta }: ExerciseCardProps) {
  const t = useTokens();

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
      <View style={[styles.photo, { backgroundColor: t.brandTintFaint }]}>
        {exercise.coverImageUrl ? (
          <Image
            accessibilityLabel={exercise.dsExercicio}
            resizeMode="cover"
            source={{ uri: exercise.coverImageUrl }}
            style={styles.photoImage}
          />
        ) : (
          <Text style={styles.photoFallback}>🏋️</Text>
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: t.text }]}>{exercise.dsExercicio}</Text>

        {meta ? <Text style={[styles.meta, { color: t.brand }]}>{meta}</Text> : null}

        {exercise.areas.length > 0 ? (
          <View style={styles.areas}>
            {exercise.areas.map((area) => (
              <View key={area.id} style={[styles.areaTag, { backgroundColor: t.brandTintSoft }]}>
                <Text style={[styles.areaTagText, { color: t.brand }]}>{area.dsAreaCorporal}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {exercise.dsInstrucao ? (
          <Text style={[styles.instruction, { color: t.textMuted }]}>{exercise.dsInstrucao}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    overflow: 'hidden',
  },
  photo: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: '100%' },
  photoFallback: { fontSize: 30 },
  body: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '700' },
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  areaTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  areaTagText: { fontSize: 11, fontWeight: '700' },
  instruction: { fontSize: 13, lineHeight: 18 },
});
