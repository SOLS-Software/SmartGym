import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { TravaSessao } from '../../lib/components/TravaSessao';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function AlunoLayout() {
  const { user, isLoaded } = useAuth();
  const t = useTokens();

  // Guard de sessão: só entra quem for aluno.
  //
  // Enquanto a sessão carrega não pode renderizar <Tabs>: as telas filhas
  // montam junto e o useEffect delas dispara busca na API antes do redirect.
  // Deslogado, 5 das 8 telas chamavam a API e levavam 401 — sem risco de
  // vazamento, mas gastando requisição do limite de 300/min a cada abertura e
  // podendo piscar "não foi possível carregar" antes de sair. No aparelho a
  // janela é maior que no navegador: ler o token do SecureStore é I/O nativo.
  if (!isLoaded) {
    return null;
  }

  if (!user?.idAluno) {
    return <Redirect href="/login" />;
  }

  return (
    <TravaSessao>
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
          name="mais"
          options={{
            title: 'Mais',
            tabBarIcon: ({ color }) => <TabIcon color={color} emoji="☰" />,
          }}
        />
        {/* Telas secundárias — acessíveis pelo menu Mais, fora da barra de abas */}
        <Tabs.Screen name="matricula" options={{ href: null }} />
        <Tabs.Screen name="pontos" options={{ href: null }} />
        <Tabs.Screen name="evolucao" options={{ href: null }} />
        <Tabs.Screen name="perfil" options={{ href: null }} />
        <Tabs.Screen name="avisos" options={{ href: null }} />
        <Tabs.Screen name="calendario-empresa" options={{ href: null }} />
        <Tabs.Screen name="planos" options={{ href: null }} />
      </Tabs>
    </TravaSessao>
  );
}
