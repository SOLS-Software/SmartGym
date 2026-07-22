import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { apiUrl, getApiError, authFetch as fetch } from '../../lib/api/client';
import { Screen } from '../../lib/components/Screen';
import { useTokens } from '../../lib/theme/tokens';
import type { PlanCatalogItem } from '../../lib/types/plan';

function formatMoney(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  if (!num) return null;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PlanosScreen() {
  const t = useTokens();
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/plans?includeDetails=true`);
        if (!response.ok) await getApiError(response, 'Não foi possível carregar os planos.');
        const data = (await response.json()) as PlanCatalogItem[];
        if (!cancelled) setPlans(data);
      } catch (error) {
        if (!cancelled) setFeedback(error instanceof Error ? error.message : 'Erro ao carregar planos.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen onBack={() => router.back()} sectionLabel="Academia" title="Planos">
      {feedback ? <Text style={[styles.feedback, { color: t.danger }]}>{feedback}</Text> : null}
      {isLoading ? <ActivityIndicator color={t.brand} style={{ marginVertical: 16 }} /> : null}

      {!isLoading && plans.length === 0 ? (
        <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum plano disponível.</Text>
      ) : null}

      {plans.map((plan) => {
        const price = formatMoney(plan.planoValores?.[0]?.vlVenda);
        const activities = (plan.planoAtividades ?? [])
          .map((pa) => pa.atividade?.dsAtividade)
          .filter(Boolean) as string[];
        return (
          <View key={plan.id} style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.planName, { color: t.text }]}>{plan.dsPlano}</Text>
              {price ? <Text style={[styles.price, { color: t.brand }]}>{price}</Text> : null}
            </View>
            {plan.frequencia?.dsFrequencia ? (
              <Text style={[styles.freq, { color: t.textSubtle }]}>{plan.frequencia.dsFrequencia}</Text>
            ) : null}
            {activities.length > 0 ? (
              <View style={styles.tags}>
                {activities.map((name, i) => (
                  <View key={`${plan.id}-${i}`} style={[styles.tag, { backgroundColor: t.brandTintSoft }]}>
                    <Text style={[styles.tagText, { color: t.brand }]}>{name}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 24 },
  card: { borderWidth: 1, padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planName: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  price: { fontSize: 15, fontWeight: '800' },
  freq: { fontSize: 13, fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: '700' },
});
