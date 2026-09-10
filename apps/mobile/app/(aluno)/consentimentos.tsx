import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { apiGet, apiPost } from '../../lib/api/client';
import { Screen } from '../../lib/components/Screen';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { formatDateDisplay } from '../../lib/utils/format';

// Captura de consentimento LGPD (art. 8 e art. 11), lado do titular. O backend
// (GET/POST /students/:id/consents) e append-only e ja aceita estas 3
// finalidades; esta tela e a captura que faltava para o gate (CONSENT_ENFORCEMENT)
// poder ficar ligado sem bloquear todo mundo por falta de onde consentir.
//
// As CHAVES precisam bater com CONSENT_PURPOSES da API (biometria_facial, push,
// comunicacao_email). O texto e generico v1 — refinar com o juridico depois; a
// versao vai gravada em dsVersaoTermo para provar O QUE foi consentido.
const TERM_VERSION = 'v1';

type Purpose = { key: string; title: string; desc: string; sensivel?: boolean };

const PURPOSES: Purpose[] = [
  {
    key: 'biometria_facial',
    title: 'Biometria facial',
    desc: 'Usar o reconhecimento do seu rosto para liberar a catraca. É um dado sensível: você pode recusar e continuar acessando por outra forma.',
    sensivel: true,
  },
  {
    key: 'push',
    title: 'Notificações no celular',
    desc: 'Receber avisos push (treino, cobranças, recados da academia) neste aparelho.',
  },
  {
    key: 'comunicacao_email',
    title: 'Comunicação por email',
    desc: 'Receber comunicações, avisos e novidades da academia por email.',
  },
];

type ConsentState = { concedido: boolean; em: string; versao: string | null };
type ConsentsResponse = {
  idAluno: number;
  atual: Record<string, ConsentState>;
  historico: unknown[];
};

export default function ConsentimentosScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const studentId = user?.idAluno ?? null;

  const [atual, setAtual] = useState<Record<string, ConsentState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const data = await apiGet<ConsentsResponse>(`/students/${studentId}/consents`);
        if (!cancelled) setAtual(data.atual ?? {});
      } catch (error) {
        if (!cancelled) setErro(error instanceof Error ? error.message : 'Não foi possível carregar seus consentimentos.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function toggle(key: string, proximo: boolean) {
    if (!studentId || saving) return;
    setSaving(key);
    setFeedback('');
    setErro('');
    // Otimista, com rollback se o servidor recusar — a UI reflete a ultima
    // palavra do servidor, que e quem registra a prova (data, IP, versao).
    const anterior = atual[key];
    setAtual((s) => ({ ...s, [key]: { concedido: proximo, em: new Date().toISOString(), versao: TERM_VERSION } }));
    try {
      await apiPost(`/students/${studentId}/consents`, {
        cnFinalidade: key,
        boConcedido: proximo,
        dsVersaoTermo: TERM_VERSION,
      });
      setFeedback(proximo ? 'Consentimento registrado.' : 'Consentimento revogado.');
    } catch (error) {
      // Reverte para o estado anterior conhecido.
      setAtual((s) => {
        const copia = { ...s };
        if (anterior) copia[key] = anterior;
        else delete copia[key];
        return copia;
      });
      setErro(error instanceof Error ? error.message : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Screen onBack={() => router.back()} sectionLabel="Privacidade" title="Consentimentos">
      <Text style={[styles.intro, { color: t.textMuted }]}>
        Você decide como seus dados são usados. Ligue ou desligue cada finalidade quando quiser —
        a mudança vale a partir de agora e fica registrada.
      </Text>

      {erro ? <Text style={[styles.feedback, { color: t.danger }]}>{erro}</Text> : null}
      {feedback ? <Text style={[styles.feedback, { color: t.brand }]}>{feedback}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={t.brand} style={{ marginVertical: 24 }} />
      ) : (
        <View style={styles.list}>
          {PURPOSES.map((p) => {
            const estado = atual[p.key];
            const concedido = estado?.concedido === true;
            return (
              <View
                key={p.key}
                style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}
              >
                <View style={styles.cardHead}>
                  <View style={styles.cardHeadText}>
                    <Text style={[styles.cardTitle, { color: t.text }]}>{p.title}</Text>
                    {p.sensivel ? (
                      <View style={[styles.tag, { backgroundColor: t.brandTintSoft }]}>
                        <Text style={[styles.tagText, { color: t.brand }]}>Dado sensível</Text>
                      </View>
                    ) : null}
                  </View>
                  <Switch
                    accessibilityLabel={`${concedido ? 'Revogar' : 'Autorizar'} ${p.title}`}
                    disabled={saving === p.key}
                    ios_backgroundColor={t.border}
                    onValueChange={(v) => void toggle(p.key, v)}
                    thumbColor="#ffffff"
                    trackColor={{ false: t.borderStrong, true: t.brand }}
                    value={concedido}
                  />
                </View>
                <Text style={[styles.cardDesc, { color: t.textSubtle }]}>{p.desc}</Text>
                <Text style={[styles.state, { color: concedido ? t.brand : t.textSubtle }]}>
                  {concedido
                    ? `Autorizado${estado?.em ? ` em ${formatDateDisplay(estado.em)}` : ''}`
                    : 'Não autorizado'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={[styles.footer, { color: t.textSubtle }]}>
        Revogar a biometria ou as notificações pode limitar recursos ligados a elas (por exemplo,
        liberar a catraca pelo rosto). Você pode reautorizar a qualquer momento. Termo {TERM_VERSION}.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  feedback: { fontSize: 13, fontWeight: '700' },
  list: { gap: 12 },
  card: { borderWidth: 1, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardHeadText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontSize: 10, fontWeight: '800' },
  cardDesc: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
  state: { fontSize: 12, fontWeight: '700' },
  footer: { fontSize: 12, fontWeight: '500', lineHeight: 18, marginTop: 4 },
});
