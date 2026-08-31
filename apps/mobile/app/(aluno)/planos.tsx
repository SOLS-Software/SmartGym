import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiUrl, getApiError, authFetch as fetch } from '../../lib/api/client';
import { Screen } from '../../lib/components/Screen';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import type { PlanCatalogItem } from '../../lib/types/plan';

type PedidoDeTroca = { id: number; idPlanoDesejado: number | null; cnStatus: string };

function formatMoney(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  if (!num) return null;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PlanosScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const idAluno = user?.idAluno ?? null;
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  // A vitrine era só vitrine: o aluno via o plano melhor e não tinha o que
  // fazer com a vontade. O pedido vai para a recepção — trocar de plano mexe
  // em vigência e cobrança, então quem decide é a academia.
  const [pedidoAberto, setPedidoAberto] = useState<PedidoDeTroca | null>(null);
  const [enviandoId, setEnviandoId] = useState<number | null>(null);

  async function carregarPedidos() {
    if (!idAluno) return;
    try {
      const response = await fetch(`${apiUrl}/students/${idAluno}/related/plan-requests`);
      if (!response.ok) return;
      const lista = (await response.json()) as Array<PedidoDeTroca & { cnTipo: string }>;
      setPedidoAberto(
        lista.find((item) => item.cnTipo === 'troca' && item.cnStatus === 'pendente') ?? null,
      );
    } catch {
      // sem a lista, o botão continua disponível; o servidor recusa o repetido
    }
  }

  async function pedirPlano(plano: PlanCatalogItem) {
    if (!idAluno) return;
    try {
      setEnviandoId(plano.id);
      setFeedback('');
      const response = await fetch(`${apiUrl}/students/${idAluno}/related/plan-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnTipo: 'troca', idPlanoDesejado: plano.id }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível enviar o pedido.');
      setFeedback(`Pedido enviado. A recepção vai responder sobre o plano ${plano.dsPlano}.`);
      await carregarPedidos();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao enviar o pedido.');
    } finally {
      setEnviandoId(null);
    }
  }

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
    void carregarPedidos();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAluno]);

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

            {idAluno ? (
              pedidoAberto?.idPlanoDesejado === plan.id ? (
                <Text style={[styles.pedidoFeito, { color: t.brand }]}>
                  Pedido enviado · aguardando a recepção
                </Text>
              ) : pedidoAberto ? (
                <Text style={[styles.freq, { color: t.textSubtle }]}>
                  Você já tem um pedido de plano aguardando resposta.
                </Text>
              ) : (
                <Pressable
                  accessibilityLabel={`Quero o plano ${plan.dsPlano}`}
                  accessibilityRole="button"
                  disabled={enviandoId !== null}
                  onPress={() => void pedirPlano(plan)}
                  style={({ pressed }) => [
                    styles.botao,
                    {
                      backgroundColor: t.brand,
                      borderRadius: t.radius,
                      opacity: pressed || enviandoId === plan.id ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text style={styles.botaoTexto}>
                    {enviandoId === plan.id ? 'Enviando...' : 'Quero este plano'}
                  </Text>
                </Pressable>
              )
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
  botao: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  botaoTexto: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  pedidoFeito: { fontSize: 13, fontWeight: '700', marginTop: 4 },
});
