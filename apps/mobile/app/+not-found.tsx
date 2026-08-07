import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../lib/theme/tokens';

// Sem este arquivo o expo-router cai na tela padrao dele: "Unmatched Route —
// Page could not be found", em ingles e com a URL crua. Um deep link errado
// (smartgym://algo, link velho de notificacao) levava o aluno para la.
export default function NotFound() {
  const t = useTokens();

  return (
    <>
      <Stack.Screen options={{ title: 'Página não encontrada' }} />
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <Text style={styles.emoji}>🧭</Text>
        <Text style={[styles.titulo, { color: t.text }]}>Página não encontrada</Text>
        <Text style={[styles.texto, { color: t.textMuted }]}>
          O endereço que você abriu não existe mais ou foi digitado errado.
        </Text>
        <Link
          accessibilityRole="button"
          href="/"
          style={[styles.botao, { backgroundColor: t.brand, borderRadius: t.radius }]}
        >
          <Text style={styles.botaoTexto}>Voltar ao início</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emoji: { fontSize: 44 },
  titulo: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  texto: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  botao: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 12 },
  botaoTexto: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
