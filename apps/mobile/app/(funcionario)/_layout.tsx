import { Redirect, Tabs } from 'expo-router';
import { TabIcon } from '../../lib/components/TabIcon';
import { TravaSessao } from '../../lib/components/TravaSessao';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { podeFuncionario } from '../../lib/types/auth';

// Área da EQUIPE, irmã do grupo (aluno).
//
// Grupo separado, e não telas soltas dentro de (aluno), porque o guard é outro:
// lá se exige idAluno, aqui idFuncionario. Misturar os dois num layout só daria
// um `if` por tela, e a primeira tela nova esqueceria dele.
export default function FuncionarioLayout() {
  const { user, isLoaded } = useAuth();
  const t = useTokens();

  // Mesmo motivo do layout do aluno: renderizar <Tabs> antes de a sessão
  // carregar monta as telas filhas, que chamam a API sem token e tomam 401.
  if (!isLoaded) {
    return null;
  }

  if (!user?.idFuncionario) {
    return <Redirect href="/login" />;
  }

  /**
   * Esconde a aba que o perfil não alcança.
   *
   * Isto é ERGONOMIA, não segurança: a lista de permissões vem do login e o
   * servidor reavalia tudo a cada request, lendo o perfil do banco do cliente.
   * Quem editar o JSON da sessão no aparelho consegue fazer a aba aparecer — e
   * encontra 403 do outro lado. O que se ganha aqui é a recepcionista não ver
   * quatro abas e descobrir no toque que três não são dela.
   */
  /**
   * Uma aba pede TODAS as permissões que a tela dela usa, não só a principal.
   *
   * Venda escreve em `sales`, mas para montar a venda ela precisa listar
   * produtos e achar o aluno — sem `products.read` e `students.read` a tela
   * abriria com dois seletores vazios e nenhuma explicação. Meia permissão não
   * é meia tela: é uma tela que não funciona e parece quebrada.
   */
  const aba = (...permissoes: string[]): null | undefined =>
    permissoes.every((permissao) => podeFuncionario(user, permissao)) ? undefined : null;

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
        {/* Ponto não tem `aba()`: /time-clock/me é liberada a qualquer
            funcionário autenticado, então esta é a única que nunca some — e é
            por isso que o login manda a equipe para cá. */}
        <Tabs.Screen
          name="ponto"
          options={{
            title: 'Ponto',
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} nome="ponto" />,
          }}
        />
        <Tabs.Screen
          name="alunos"
          options={{
            title: 'Alunos',
            href: aba('students.read'),
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} nome="alunos" />,
          }}
        />
        <Tabs.Screen
          name="treinos"
          options={{
            title: 'Treinos',
            href: aba('trainings.write', 'students.read'),
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} nome="ficha" />,
          }}
        />
        <Tabs.Screen
          name="venda"
          options={{
            title: 'Venda',
            href: aba('sales.write', 'students.read', 'products.read'),
            tabBarIcon: ({ color, focused }) => <TabIcon color={color} focused={focused} nome="venda" />,
          }}
        />

        {/* Fora da barra: chega-se a ela pelo botão da tela de alunos. */}
        <Tabs.Screen name="aluno-novo" options={{ href: null }} />
      </Tabs>
    </TravaSessao>
  );
}
