import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { TabIcon, type NomeDoIcone } from '../../lib/components/TabIcon';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';

type MenuItem = {
  icone: NomeDoIcone;
  title: string;
  subtitle: string;
  href: '/matricula' | '/pontos' | '/evolucao' | '/perfil' | '/calendario-empresa' | '/planos' | '/avisos' | '/consentimentos';
};

const MENU: MenuItem[] = [
  { icone: 'avisos', title: 'Avisos', subtitle: 'Cobranças, vencimentos e recados', href: '/avisos' },
  { icone: 'matricula', title: 'Matrícula', subtitle: 'Seu plano, cobranças e Pix', href: '/matricula' },
  { icone: 'pontos', title: 'Meus pontos', subtitle: 'Saldo e extrato da fidelidade', href: '/pontos' },
  { icone: 'evolucao', title: 'Minha evolução', subtitle: 'Avaliações físicas e medidas', href: '/evolucao' },
  { icone: 'perfil', title: 'Perfil', subtitle: 'Seus dados, plano e acessos', href: '/perfil' },
  { icone: 'privacidade', title: 'Privacidade', subtitle: 'Consentimentos e uso dos seus dados (LGPD)', href: '/consentimentos' },
  { icone: 'agenda', title: 'Calendário da empresa', subtitle: 'Atividades e promoções do mês', href: '/calendario-empresa' },
  { icone: 'planos', title: 'Planos', subtitle: 'Planos oferecidos pela academia', href: '/planos' },
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
            accessibilityHint={item.subtitle}
            accessibilityLabel={item.title}
            accessibilityRole="button"
            onPress={() => router.push(item.href)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            {/* `focused` fixo: aqui não há estado ativo — é uma lista, não uma
                aba. O preenchido pesa mais na linha e acompanha a cor da
                academia, que era o que o emoji não fazia. */}
            <TabIcon color={t.brand} focused nome={item.icone} />
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
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '800' },
  rowSubtitle: { fontSize: 13, fontWeight: '500' },
  chevron: { fontSize: 24, fontWeight: '800' },
});
