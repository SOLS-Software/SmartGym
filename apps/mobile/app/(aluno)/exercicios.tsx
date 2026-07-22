import { useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiUrl, getApiError, authFetch as fetch } from '../../lib/api/client';
import { ExerciseCard } from '../../lib/components/ExerciseCard';
import { Screen } from '../../lib/components/Screen';
import { useInfiniteList } from '../../lib/hooks/useInfiniteList';
import { useTokens } from '../../lib/theme/tokens';
import type { ExerciseWithCover } from '../../lib/types/training';

const PAGE_SIZE = 10;

export default function ExerciciosScreen() {
  const t = useTokens();

  const fetchPage = useCallback(async ({ offset, search }: { offset: number; search: string }) => {
    const params = new URLSearchParams({
      includeCover: 'true',
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (search) params.set('search', search);
    const response = await fetch(`${apiUrl}/exercises?${params.toString()}`);
    if (!response.ok) await getApiError(response, 'Não foi possível carregar os exercícios.');
    return (await response.json()) as ExerciseWithCover[];
  }, []);

  const { items, search, setSearch, hasMore, isLoading, feedback, loadMore } = useInfiniteList<ExerciseWithCover>({
    fetchPage,
    pageSize: PAGE_SIZE,
  });

  return (
    <Screen scroll={false} sectionLabel="Treino" title="Exercícios">
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <TextInput
              autoCapitalize="none"
              onChangeText={setSearch}
              placeholder="Buscar exercício"
              placeholderTextColor={t.placeholder}
              style={[styles.search, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius, color: t.text }]}
              value={search}
            />
            {feedback ? <Text style={[styles.feedback, { color: t.danger }]}>{feedback}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum exercício encontrado.</Text>
          ) : null
        }
        ListFooterComponent={
          isLoading ? <ActivityIndicator color={t.brand} style={styles.footer} /> : null
        }
        onEndReached={() => {
          if (hasMore && !isLoading) void loadMore();
        }}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => <ExerciseCard exercise={item} />}
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
});
