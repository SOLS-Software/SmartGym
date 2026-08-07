// react-native-safe-area-context depende de medicao nativa, que nao existe no
// ambiente de teste. O mock publicado pelo pacote nao traz SafeAreaView, e sem
// ele o ExerciseDetailModal renderiza `undefined` como componente.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  return {
    SafeAreaProvider: View,
    SafeAreaView: View,
    SafeAreaConsumer: ({ children }) => children(inset),
    SafeAreaInsetsContext: {
      Provider: View,
      Consumer: ({ children }) => children(inset),
    },
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets: inset, frame },
  };
});
