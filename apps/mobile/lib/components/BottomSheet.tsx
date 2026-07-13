import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../theme/tokens';

type BottomSheetProps = {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

// Sheet de baixo baseado em Modal — substitui o RegistrationDrawer do web.
export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps) {
  const t = useTokens();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Fechar" onPress={onClose} style={styles.backdropTouch} />
        <View style={[styles.sheet, { backgroundColor: t.bg }]}>
          <View style={[styles.handle, { backgroundColor: t.borderStrong }]} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Text style={[styles.close, { color: t.textSubtle }]}>Fechar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdropTouch: { flex: 1 },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { flexShrink: 1, fontSize: 18, fontWeight: '800' },
  close: { fontSize: 14, fontWeight: '700' },
  content: { paddingBottom: 8, gap: 12 },
});
