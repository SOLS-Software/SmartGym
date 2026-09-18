import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useTokens } from '../theme/tokens';

/**
 * Faixa de identidade: de qual academia é este sistema.
 *
 * O rótulo embaixo do ícone continua "SOLSFIT" para todo mundo — o Android assa
 * o nome e o ícone no APK, e o mesmo binário atende todas as academias. Então a
 * identidade do cliente vive AQUI, onde ela pode mudar por sessão.
 *
 * Fica acima do cabeçalho de cada tela, e não dentro dele, porque não é sobre a
 * tela: é sobre onde a pessoa está. Sem tema — antes do login, ou academia sem
 * marca configurada — não renderiza nada, e o app fica como sempre foi.
 */
function FaixaDaMarca() {
  const t = useTokens();
  const tema = useTheme();
  // Uma URL assinada vencida devolve erro em vez de imagem. Escondendo o slot,
  // sobra o nome da academia; deixando, sobra um retângulo quebrado.
  const [logoFalhou, setLogoFalhou] = useState(false);

  const nome = tema?.dsCliente?.trim();
  const logo = !logoFalhou ? tema?.logoUrl : null;
  if (!nome && !logo) return null;

  return (
    <View style={[styles.marca, { borderBottomColor: t.border }]}>
      {logo ? (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setLogoFalhou(true)}
          resizeMode="contain"
          source={{ uri: logo }}
          style={styles.marcaLogo}
        />
      ) : null}
      <Text numberOfLines={1} style={[styles.marcaTexto, { color: t.textSubtle }]}>
        SOLSFIT{nome ? ` · ${nome}` : ''}
      </Text>
    </View>
  );
}

type ScreenProps = {
  sectionLabel?: string;
  title?: string;
  headerRight?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: object;
};

// Scaffold reutilizável: área segura + header (section-label + título) + corpo
// opcionalmente rolável. Base para as demais telas do aluno.
export function Screen({
  sectionLabel,
  title,
  headerRight,
  onBack,
  children,
  scroll = true,
  contentContainerStyle,
}: ScreenProps) {
  const t = useTokens();

  const header = (title || sectionLabel) ? (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityLabel="Voltar"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={styles.back}
        >
          <Text style={[styles.backChevron, { color: t.brand }]}>‹</Text>
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        {sectionLabel ? (
          <Text style={[styles.sectionLabel, { color: t.brand }]}>{sectionLabel.toUpperCase()}</Text>
        ) : null}
        {title ? <Text style={[styles.title, { color: t.text }]}>{title}</Text> : null}
      </View>
      {headerRight ? <View>{headerRight}</View> : null}
    </View>
  ) : null;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentContainerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: t.bg }]}>
      <FaixaDaMarca />
      {header}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  marcaLogo: { width: 22, height: 22, borderRadius: 4 },
  marcaTexto: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, flexShrink: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerText: { flex: 1 },
  back: { paddingRight: 12, paddingBottom: 2 },
  backChevron: { fontSize: 30, fontWeight: '800', lineHeight: 32 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
});
