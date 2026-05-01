declare module 'expo-router' {
  export const Stack: React.ComponentType<{
    screenOptions?: Record<string, unknown>;
  }>;
}

declare module 'expo-status-bar' {
  export const StatusBar: React.ComponentType<{
    style?: 'auto' | 'inverted' | 'light' | 'dark';
  }>;
}
