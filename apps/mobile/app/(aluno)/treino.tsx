import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiUrl, getApiError } from '../../lib/api/client';
import { ExerciseCard } from '../../lib/components/ExerciseCard';
import { Screen } from '../../lib/components/Screen';
import { useInfiniteList } from '../../lib/hooks/useInfiniteList';
import { useTokens } from '../../lib/theme/tokens';
import type { Training, TrainingExerciseWithCover } from '../../lib/types/training';

const PAGE_SIZE = 10;

function formatExerciseMeta(link: TrainingExerciseWithCover) {
  const parts: string[] = [];
  if (link.nrSeries) parts.push(`${link.nrSeries}x${link.nrRepeticoes || 0}`);
  if (Number(link.qtPeso) > 0) parts.push(`${link.qtPeso}${link.cnUnidadeMedida || ''}`);
  if (link.qtDescanso) parts.push(`${link.qtDescanso}s descanso`);
  return parts.join(' · ');
}

export default function TreinoScreen() {
  const t = useTokens();
  const [previews, setPreviews] = useState<Record<number, TrainingExerciseWithCover[]>>({});
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  const [detailExercises, setDetailExercises] = useState<TrainingExerciseWithCover[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailFeedback, setDetailFeedback] = useState('');

  async function loadPreview(trainingId: number) {
    try {
      const response = await fetch(`${apiUrl}/trainings/${trainingId}/related/exercises`);
      if (!response.ok) return;
      const data = (await response.json()) as TrainingExerciseWithCover[];
      setPreviews((current) => ({ ...current, [trainingId]: data }));
    } catch {
      // preview best-effort; o detalhe recarrega com dados completos
    }
  }

  const onPageLoaded = useCallback((data: Training[]) => {
    data.forEach((training) => void loadPreview(training.id));
  }, []);

  const fetchPage = useCallback(async ({ offset, search }: { offset: number; search: string }) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (search) params.set('search', search);
    const response = await fetch(`${apiUrl}/trainings?${params.toString()}`);
    if (!response.ok) await getApiError(response, 'Não foi possível carregar os treinos.');
    return (await response.json()) as Training[];
  }, []);

  const { items, search, setSearch, hasMore, isLoading, feedback, loadMore } = useInfiniteList<Training>({
    fetchPage,
    pageSize: PAGE_SIZE,
    onPageLoaded,
  });

  async function loadDetail(training: Training) {
    setSelectedTraining(training);
    setDetailExercises([]);
    try {
      setIsLoadingDetail(true);
      const response = await fetch(`${apiUrl}/trainings/${training.id}/related/exercises?includeCover=true`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os exercícios do treino.');
      setDetailExercises((await response.json()) as TrainingExerciseWithCover[]);
      setDetailFeedback('');
    } catch (error) {
      setDetailFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios do treino.');
    } finally {
      setIsLoadingDetail(false);
    }
  }

  // --- Detalhe do treino ---
  if (selectedTraining) {
    const links = detailExercises.filter((link) => link.exercicio);
    return (
      <Screen scroll={false} sectionLabel="Treino" title={selectedTraining.dsTreino}>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={links}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            <View style={styles.header}>
              <Pressable
                onPress={() => setSelectedTraining(null)}
                style={[styles.backBtn, { borderColor: t.border, borderRadius: t.radius }]}
              >
                <Text style={[styles.backText, { color: t.textMuted }]}>‹ Voltar aos treinos</Text>
              </Pressable>
              {detailFeedback ? <Text style={[styles.feedback, { color: t.danger }]}>{detailFeedback}</Text> : null}
            </View>
          }
          ListEmptyComponent={
            !isLoadingDetail ? (
              <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum exercício vinculado a este treino.</Text>
            ) : null
          }
          ListFooterComponent={isLoadingDetail ? <ActivityIndicator color={t.brand} style={styles.footer} /> : null}
          renderItem={({ item }) => <ExerciseCard exercise={item.exercicio!} meta={formatExerciseMeta(item)} />}
          showsVerticalScrollIndicator={false}
        />
      </Screen>
    );
  }

  // --- Lista de treinos ---
  return (
    <Screen scroll={false} sectionLabel="Treino" title="Treinos">
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <TextInput
              autoCapitalize="none"
              onChangeText={setSearch}
              placeholder="Buscar treino"
              placeholderTextColor={t.placeholder}
              style={[styles.search, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius, color: t.text }]}
              value={search}
            />
            {feedback ? <Text style={[styles.feedback, { color: t.danger }]}>{feedback}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum treino encontrado.</Text> : null
        }
        ListFooterComponent={isLoading ? <ActivityIndicator color={t.brand} style={styles.footer} /> : null}
        onEndReached={() => {
          if (hasMore && !isLoading) void loadMore();
        }}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => {
          const links = previews[item.id];
          return (
            <Pressable
              onPress={() => void loadDetail(item)}
              style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}
            >
              <Text style={[styles.cardTitle, { color: t.text }]}>{item.dsTreino}</Text>
              {links ? (
                <View style={styles.previewList}>
                  {links.slice(0, 3).map((link) => (
                    <Text key={link.id} style={[styles.previewItem, { color: t.textMuted }]}>
                      • {link.exercicio?.dsExercicio ?? '-'}
                    </Text>
                  ))}
                  {links.length > 3 ? (
                    <Text style={[styles.previewMore, { color: t.brand }]}>+{links.length - 3} exercício(s)</Text>
                  ) : null}
                  {links.length === 0 ? (
                    <Text style={[styles.previewItem, { color: t.textSubtle }]}>Nenhum exercício vinculado.</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={[styles.cardMeta, { color: t.textSubtle }]}>Toque para ver os exercícios</Text>
              )}
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  header: { gap: 8, paddingBottom: 4 },
  search: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, minHeight: 46 },
  feedback: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 24 },
  footer: { marginVertical: 16 },
  backBtn: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  backText: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, padding: 16, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardMeta: { fontSize: 13, fontWeight: '600' },
  previewList: { gap: 3 },
  previewItem: { fontSize: 13 },
  previewMore: { fontSize: 12, fontWeight: '700', marginTop: 2 },
});
