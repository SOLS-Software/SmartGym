import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function AlunoLayout() {
  const { user, isLoaded } = useAuth();
  const t = useTokens();

  // Guard de sessão: só entra quem for aluno.
  if (isLoaded && !user?.idAluno) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.textSubtle,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
      }}
    >
      <Tabs.Screen
        name="meu-treino"
        options={{
          title: 'Meu Treino',
          tabBarIcon: ({ color }) => <TabIcon color={color} emoji="🏋️" />,
        }}
      />
      <Tabs.Screen
        name="exercicios"
        options={{
          title: 'Exercícios',
          tabBarIcon: ({ color }) => <TabIcon color={color} emoji="💪" />,
        }}
      />
      <Tabs.Screen
        name="treino"
        options={{
          title: 'Treino',
          tabBarIcon: ({ color }) => <TabIcon color={color} emoji="📋" />,
        }}
      />
      <Tabs.Screen
        name="atividades"
        options={{
          title: 'Atividades',
          tabBarIcon: ({ color }) => <TabIcon color={color} emoji="📅" />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <TabIcon color={color} emoji="👤" />,
        }}
      />
    </Tabs>
  );
}
