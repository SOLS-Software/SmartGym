import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiUrl, getApiError } from '../../lib/api/client';
import { Screen } from '../../lib/components/Screen';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import type { StudentFile, StudentProfile } from '../../lib/types/student';
import { formatCpf, formatDateDisplay, formatPhone, isImageFile } from '../../lib/utils/format';

export default function PerfilScreen() {
  const t = useTokens();
  const { user, signOut } = useAuth();
  const studentId = user?.idAluno ?? null;

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!studentId) return;

    let cancelled = false;

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

      // Foto (best-effort) — mesmo padrão de app/admin.tsx.
      try {
        const filesResponse = await fetch(`${apiUrl}/students/${studentId}/files`);
        if (!filesResponse.ok) return;
        const files = (await filesResponse.json()) as StudentFile[];
        const firstImage = files.find((file) => isImageFile(file.anCaminho));
        if (!firstImage) return;
        const urlResponse = await fetch(`${apiUrl}/students/${studentId}/files/${firstImage.id}/url`);
        if (!urlResponse.ok) return;
        const urlData = (await urlResponse.json()) as { url: string };
        if (!cancelled) setPhotoUrl(urlData.url);
      } catch {
        // sem foto: mantém o avatar de iniciais
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

  return (
    <Screen sectionLabel="Conta" title="Perfil">
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
  logoutBtn: { borderWidth: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  logoutText: { fontSize: 15, fontWeight: '800' },
});
