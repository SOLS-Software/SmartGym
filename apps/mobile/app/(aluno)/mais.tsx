import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';

type MenuItem = {
  emoji: string;
  title: string;
  subtitle: string;
  href: '/perfil' | '/calendario-empresa' | '/planos';
};

const MENU: MenuItem[] = [
  { emoji: '👤', title: 'Perfil', subtitle: 'Seus dados, plano e acessos', href: '/perfil' },
  { emoji: '🗓️', title: 'Calendário da empresa', subtitle: 'Atividades e promoções do mês', href: '/calendario-empresa' },
  { emoji: '💳', title: 'Planos', subtitle: 'Planos oferecidos pela academia', href: '/planos' },
];

export default function MaisScreen() {
  const t = useTokens();
  const { user } = useAuth();

  return (
    <Screen sectionLabel="Menu" title="Mais">
      {user?.name ? (
        <Text style={[styles.greeting, { color: t.textSubtle }]}>Olá, {user.name}</Text>
      ) : null}

      <View style={styles.list}>
        {MENU.map((item) => (
          <Pressable
            key={item.href}
            onPress={() => router.push(item.href)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.emoji}>{item.emoji}</Text>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: t.text }]}>{item.title}</Text>
              <Text style={[styles.rowSubtitle, { color: t.textSubtle }]}>{item.subtitle}</Text>
            </View>
            <Text style={[styles.chevron, { color: t.textSubtle }]}>›</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 14, fontWeight: '600' },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 16, gap: 14 },
  emoji: { fontSize: 24 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '800' },
  rowSubtitle: { fontSize: 13, fontWeight: '500' },
  chevron: { fontSize: 24, fontWeight: '800' },
});
