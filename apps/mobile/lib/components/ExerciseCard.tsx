import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../theme/tokens';
import { ExerciseDetailModal } from './ExerciseDetailModal';
import type { ExerciseWithCover } from '../types/training';

type ExerciseCardProps = {
  exercise: ExerciseWithCover;
  meta?: string;
};

// Versão RN do ExerciseCard do web: foto de capa (fallback haltere), nome,
// meta (série·rep·peso·descanso), tags de áreas, equipamentos e instrução.
// Card empilhado; tocar abre a tela de detalhe com o passo a passo completo.
export function ExerciseCard({ exercise, meta }: ExerciseCardProps) {
  const t = useTokens();
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const equipamentos = (exercise.equipamentos ?? [])
    .map((equipamento) => equipamento.nmEquipamento)
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Pressable
        accessibilityHint="Abre as instruções completas do exercício"
        accessibilityLabel={`Ver detalhes de ${exercise.dsExercicio}`}
        accessibilityRole="button"
        onPress={() => setIsDetailOpen(true)}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: t.surface,
            borderColor: pressed ? t.brand : t.border,
            borderRadius: t.radius,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
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

          {equipamentos ? (
            <Text numberOfLines={1} style={[styles.equipment, { color: t.textSubtle }]}>
              {equipamentos}
            </Text>
          ) : null}

          {/* Sem numberOfLines a instrucao completa (descricao + 5 ou 6 passos)
              estica o card por varias telas. O texto inteiro fica no detalhe. */}
          {exercise.dsInstrucao ? (
            <Text numberOfLines={3} style={[styles.instruction, { color: t.textMuted }]}>
              {exercise.dsInstrucao}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {isDetailOpen ? (
        <ExerciseDetailModal
          exercise={exercise}
          meta={meta}
          onClose={() => setIsDetailOpen(false)}
          visible={isDetailOpen}
        />
      ) : null}
    </>
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
  equipment: { fontSize: 12, fontWeight: '600' },
  instruction: { fontSize: 13, lineHeight: 18 },
});
