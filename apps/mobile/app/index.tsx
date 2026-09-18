import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../lib/contexts/AuthContext';
import { useTokens } from '../lib/theme/tokens';

// Gate de entrada: decide entre o login, a área do aluno e a área da equipe.
//
// A ordem importa. Quem é aluno E funcionário cai na área do aluno, porque é
// esse o papel que a API põe no token (`role: user.idAluno ? 'student' : ...`).
// Mandar essa pessoa para a área da equipe daria uma tela que o servidor recusa
// — o token diria "aluno" e as rotas de equipe responderiam 403.
//
// O app admin antigo permanece disponível na rota /admin.
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

  // Ponto é a primeira tela da equipe de propósito: é a única que não depende
  // de permissão de perfil, então ninguém entra e encontra uma área vazia.
  if (user?.idFuncionario) {
    return <Redirect href="/ponto" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
