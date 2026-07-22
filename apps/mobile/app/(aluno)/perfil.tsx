import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiUrl, getApiError, authFetch as fetch } from '../../lib/api/client';
import { Screen } from '../../lib/components/Screen';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import type { StudentFile, StudentPlan, StudentProfile } from '../../lib/types/student';
import type { StudentCheckIn, StudentTraining } from '../../lib/types/training';
import { formatCpf, formatDateDisplay, formatDateTimeDisplay, formatPhone, isImageFile } from '../../lib/utils/format';

export default function PerfilScreen() {
  const t = useTokens();
  const { user, signOut } = useAuth();
  const studentId = user?.idAluno ?? null;

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [plans, setPlans] = useState<StudentPlan[]>([]);
  const [trainings, setTrainings] = useState<StudentTraining[]>([]);
  const [checkIns, setCheckIns] = useState<StudentCheckIn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    async function getJson<T>(path: string): Promise<T | null> {
      try {
        const response = await fetch(`${apiUrl}${path}`);
        if (!response.ok) return null;
        return (await response.json()) as T;
      } catch {
        return null;
      }
    }

    async function load() {
      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/students/${studentId}`);
        if (!response.ok) await getApiError(response, 'Não foi possível carregar o perfil.');
        const data = (await response.json()) as StudentProfile;
        if (!cancelled) setProfile(data);
      } catch (error) {
        if (!cancelled) setFeedback(error instanceof Error ? error.message : 'Erro ao carregar perfil.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }

      // Dados complementares (best-effort, em paralelo)
      const [plansData, trainingsData, checkInsData] = await Promise.all([
        getJson<StudentPlan[]>(`/students/${studentId}/related/plans`),
        getJson<StudentTraining[]>(`/students/${studentId}/related/trainings`),
        getJson<StudentCheckIn[]>(`/students/${studentId}/related/check-ins`),
      ]);
      if (!cancelled) {
        if (plansData) setPlans(plansData);
        if (trainingsData) setTrainings(trainingsData);
        if (checkInsData) setCheckIns(checkInsData);
      }

      // Foto (best-effort)
      const files = await getJson<StudentFile[]>(`/students/${studentId}/files`);
      const firstImage = files?.find((file) => isImageFile(file.anCaminho));
      if (firstImage) {
        const urlData = await getJson<{ url: string }>(`/students/${studentId}/files/${firstImage.id}/url`);
        if (urlData?.url && !cancelled) setPhotoUrl(urlData.url);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function handleLogout() {
    await signOut();
    router.replace('/login');
  }

  const initials = (profile?.nmAluno ?? user?.name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const activePlan = plans.find((p) => p.boInativo === 0) ?? plans[0] ?? null;
  const activeTrainings = trainings.filter((st) => st.boInativo === 0);
  const recentCheckIns = checkIns.slice(0, 5);

  return (
    <Screen onBack={() => router.back()} sectionLabel="Conta" title="Perfil">
      {feedback ? <Text style={[styles.feedback, { color: t.danger }]}>{feedback}</Text> : null}

      <View style={styles.avatarBlock}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={[styles.avatar, { borderColor: t.border }]} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: t.brandTintSoft, borderColor: t.border }]}>
            <Text style={[styles.avatarInitials, { color: t.brand }]}>{initials}</Text>
          </View>
        )}
        <Text style={[styles.name, { color: t.text }]}>{profile?.nmAluno ?? user?.name ?? '-'}</Text>
      </View>

      {isLoading && !profile ? (
        <ActivityIndicator color={t.brand} style={{ marginVertical: 16 }} />
      ) : (
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
          <Row label="CPF" value={profile?.caCPF ? formatCpf(profile.caCPF) : '-'} />
          <Row label="Nascimento" value={formatDateDisplay(profile?.dtNascimento)} />
          <Row
            label="Contato"
            value={
              profile?.nrContato
                ? `${profile.nrDDD ? `(${profile.nrDDD}) ` : ''}${formatPhone(profile.nrContato)}`
                : '-'
            }
          />
          <Row label="Email" value={profile?.anEmail || '-'} last />
        </View>
      )}

      {/* Plano atual */}
      <Section title="Plano atual">
        {activePlan ? (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
            <View style={styles.planHeader}>
              <Text style={[styles.planName, { color: t.text }]}>{activePlan.plano?.dsPlano ?? '-'}</Text>
              <View style={[styles.pill, { backgroundColor: activePlan.boInativo === 0 ? t.brandTintSoft : t.border }]}>
                <Text style={[styles.pillText, { color: activePlan.boInativo === 0 ? t.brand : t.textSubtle }]}>
                  {activePlan.boInativo === 0 ? 'Ativo' : 'Inativo'}
                </Text>
              </View>
            </View>
            <Text style={[styles.planMeta, { color: t.textSubtle }]}>
              {activePlan.empresa?.dsEmpresa ?? 'Filial não informada'}
              {activePlan.plano?.frequencia?.dsFrequencia ? ` · ${activePlan.plano.frequencia.dsFrequencia}` : ''}
            </Text>
          </View>
        ) : (
          <Empty text="Nenhum plano ativo." />
        )}
      </Section>

      {/* Meus treinos */}
      <Section title="Meus treinos">
        {activeTrainings.length > 0 ? (
          <View style={styles.stack}>
            {activeTrainings.map((st) => (
              <View key={st.id} style={[styles.lineCard, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
                <Text style={[styles.lineTitle, { color: t.text }]}>{st.treino?.dsTreino ?? '-'}</Text>
                <Text style={[styles.lineMeta, { color: t.textSubtle }]}>{st.funcionario?.nmFuncionario ?? 'Sem professor'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Empty text="Nenhum treino atribuído." />
        )}
      </Section>

      {/* Últimos acessos */}
      <Section title="Últimos acessos">
        {recentCheckIns.length > 0 ? (
          <View style={styles.stack}>
            {recentCheckIns.map((ci) => (
              <View key={ci.id} style={[styles.lineCard, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
                <Text style={[styles.lineTitle, { color: t.text }]}>
                  {ci.alunoTreinoSequencia?.alunoTreino?.treino?.dsTreino ?? 'Treino'}
                </Text>
                <Text style={[styles.lineMeta, { color: t.textSubtle }]}>{formatDateTimeDisplay(ci.dtCadastro)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Empty text="Nenhum acesso registrado." />
        )}
      </Section>

      <Pressable
        onPress={() => void handleLogout()}
        style={({ pressed }) => [
          styles.logoutBtn,
          { borderColor: t.danger, borderRadius: t.radius, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.logoutText, { color: t.danger }]}>Sair</Text>
      </Pressable>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const t = useTokens();
  return <Text style={[styles.emptyText, { color: t.textSubtle }]}>{text}</Text>;
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const t = useTokens();
  return (
    <View style={[styles.row, last ? null : { borderBottomColor: t.border, borderBottomWidth: 1 }]}>
      <Text style={[styles.rowLabel, { color: t.textSubtle }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: t.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  feedback: { fontSize: 13, fontWeight: '600' },
  avatarBlock: { alignItems: 'center', gap: 10, marginTop: 8 },
  avatar: { width: 96, height: 96, borderRadius: 999, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 32, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  card: { borderWidth: 1, paddingHorizontal: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowLabel: { fontSize: 13, fontWeight: '600' },
  rowValue: { fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  stack: { gap: 8 },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14 },
  planName: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  planMeta: { fontSize: 13, fontWeight: '600', paddingBottom: 14, paddingTop: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '800' },
  lineCard: { borderWidth: 1, padding: 14, gap: 3 },
  lineTitle: { fontSize: 14, fontWeight: '700' },
  lineMeta: { fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 13 },
  logoutBtn: { borderWidth: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { fontSize: 15, fontWeight: '800' },
});
