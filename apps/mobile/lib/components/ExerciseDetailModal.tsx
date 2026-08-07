import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseExerciseInstruction } from '@smartgym/shared';
import { useTokens } from '../theme/tokens';
import type { ExerciseWithCover } from '../types/training';

type ExerciseDetailModalProps = {
  exercise: ExerciseWithCover;
  meta?: string;
  visible: boolean;
  onClose: () => void;
};

// Versão RN do ExerciseDetailDrawer do web: capa, áreas, descrição, passo a
// passo numerado e equipamentos. Modal de tela cheia porque o conteúdo é longo
// (a maioria dos exercícios tem 5 ou 6 passos) e um bottom sheet curto
// obrigaria a rolar dentro de uma caixa pequena.
export function ExerciseDetailModal({ exercise, meta, visible, onClose }: ExerciseDetailModalProps) {
  const t = useTokens();
  const { descricao, passos } = parseExerciseInstruction(exercise.dsInstrucao);
  const equipamentos = exercise.equipamentos ?? [];

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={[styles.header, { borderBottomColor: t.border }]}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: t.text }]}>
            {exercise.dsExercicio}
          </Text>
          <Pressable
            accessibilityLabel="Fechar"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onClose}
            style={[styles.close, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <Text style={[styles.closeText, { color: t.textMuted }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.photo, { backgroundColor: t.brandTintFaint, borderColor: t.border, borderRadius: t.radius }]}>
            {exercise.coverImageUrl ? (
              <Image
                accessibilityLabel={exercise.dsExercicio}
                resizeMode="contain"
                source={{ uri: exercise.coverImageUrl }}
                style={styles.photoImage}
              />
            ) : (
              <Text style={styles.photoFallback}>🏋️</Text>
            )}
          </View>

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

          {descricao ? (
            <Text style={[styles.description, { color: t.textMuted }]}>{descricao}</Text>
          ) : null}

          {passos.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: t.brand }]}>COMO EXECUTAR</Text>
              {passos.map((passo, indice) => (
                <View key={indice} style={styles.step}>
                  <Text style={[styles.stepNumber, { color: t.brand }]}>{indice + 1}.</Text>
                  <Text style={[styles.stepText, { color: t.text }]}>{passo}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {equipamentos.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: t.brand }]}>EQUIPAMENTOS</Text>
              {equipamentos.map((equipamento) => (
                <View
                  key={equipamento.id}
                  style={[styles.equipment, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}
                >
                  <Text style={[styles.equipmentName, { color: t.text }]}>
                    {equipamento.nmEquipamento ?? 'Equipamento'}
                  </Text>
                  {equipamento.dsEquipamento ? (
                    <Text style={[styles.equipmentDescription, { color: t.textSubtle }]}>
                      {equipamento.dsEquipamento}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {!descricao && passos.length === 0 ? (
            <Text style={[styles.empty, { color: t.textSubtle }]}>
              Este exercício ainda não tem instruções cadastradas.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800' },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 40, gap: 10 },
  // 3/2 e a proporcao do gif da ilustracao: encaixa sem cortar e sem tarja.
  photo: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: '100%' },
  photoFallback: { fontSize: 40 },
  name: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  meta: { fontSize: 14, fontWeight: '700' },
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  areaTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  areaTagText: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 14, lineHeight: 21 },
  section: { gap: 8, marginTop: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  step: { flexDirection: 'row', gap: 8 },
  stepNumber: { fontSize: 14, fontWeight: '800', minWidth: 18 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21 },
  equipment: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  equipmentName: { fontSize: 14, fontWeight: '700' },
  equipmentDescription: { fontSize: 12, lineHeight: 17 },
  empty: { fontSize: 13, marginTop: 4 },
});
