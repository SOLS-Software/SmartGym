import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTokens } from '../theme/tokens';

type ScreenProps = {
  sectionLabel?: string;
  title?: string;
  headerRight?: ReactNode;
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
  children,
  scroll = true,
  contentContainerStyle,
}: ScreenProps) {
  const t = useTokens();

  const header = (title || sectionLabel) ? (
    <View style={styles.header}>
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
      {header}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerText: { flexShrink: 1 },
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
