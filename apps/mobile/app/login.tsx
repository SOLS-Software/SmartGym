import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiUrl } from '../lib/api/client';
import { useAuth } from '../lib/contexts/AuthContext';
import { useTokens } from '../lib/theme/tokens';
import type { AuthenticatedUser } from '../lib/types/auth';
import { formatCpf, isValidCpf, onlyDigits } from '../lib/utils/format';

export default function LoginScreen() {
  const t = useTokens();
  const { signIn } = useAuth();
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin() {
    setFeedback('');

    const digits = onlyDigits(cpf);
    if (digits.length !== 11 || !isValidCpf(digits)) {
      setFeedback('Informe um CPF válido.');
      return;
    }
    if (!password) {
      setFeedback('Informe sua senha.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: digits, password }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível entrar.');
      }

      const user = (await response.json()) as AuthenticatedUser;

      if (user.type !== 'student' || !user.idAluno) {
        setFeedback('Este acesso é exclusivo para alunos.');
        return;
      }

      await signIn(user);
      router.replace('/meu-treino');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao entrar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.brandBlock}>
            <Text style={[styles.brandMark, { color: t.brand }]}>SmartGym</Text>
            <Text style={[styles.subtitle, { color: t.textSubtle }]}>Acesso do aluno</Text>
          </View>

          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
            <Text style={[styles.label, { color: t.textMuted }]}>CPF</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="number-pad"
              onChangeText={(value) => setCpf(formatCpf(value))}
              placeholder="000.000.000-00"
              placeholderTextColor={t.placeholder}
              style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, borderRadius: t.radius, color: t.text }]}
              value={cpf}
            />

            <Text style={[styles.label, { color: t.textMuted }]}>Senha</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Sua senha"
              placeholderTextColor={t.placeholder}
              secureTextEntry
              style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.border, borderRadius: t.radius, color: t.text }]}
              value={password}
            />

            {feedback ? <Text style={[styles.feedback, { color: t.danger }]}>{feedback}</Text> : null}

            <Pressable
              disabled={isSubmitting}
              onPress={() => void handleLogin()}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: t.brand, borderRadius: t.radius, opacity: pressed || isSubmitting ? 0.85 : 1 },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Entrar</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 28 },
  brandBlock: { alignItems: 'center', gap: 4 },
  brandMark: { fontSize: 32, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { fontSize: 14, fontWeight: '600' },
  card: { borderWidth: 1, padding: 20, gap: 8 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 8 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 48 },
  feedback: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  button: {
    marginTop: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
