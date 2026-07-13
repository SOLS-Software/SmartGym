import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../lib/contexts/AuthContext';
import { useTokens } from '../lib/theme/tokens';

// Gate de entrada: decide entre login do aluno e a área logada.
// O app admin permanece disponível na rota /admin.
export default function Index() {
  const { user, isLoaded } = useAuth();
  const t = useTokens();

  if (!isLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.brand} size="large" />
      </View>
    );
  }

  if (user?.idAluno) {
    return <Redirect href="/meu-treino" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
