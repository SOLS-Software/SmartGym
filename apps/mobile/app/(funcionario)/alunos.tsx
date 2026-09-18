import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { apiGet } from '../../lib/api/client';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { podeFuncionario } from '../../lib/types/auth';
import { formatCpf, formatPhone } from '../../lib/utils/format';

// Consulta de aluno no balcão.
//
// A pergunta que a recepção faz não é "quais são os dados dele?", é "ele pode
// treinar hoje?". Por isso o cartão aberto mostra `studentAccess` em primeiro
// lugar: ele vem da MESMA função que a catraca usa, então a tela nunca discorda
// da porta. Mostrar só nome e CPF obrigaria a pessoa a abrir o site para
// responder a única coisa que ela precisava responder.
//
// A busca por CPF é por HASH no servidor (o CPF está cifrado em repouso), então
// ela só funciona com os 11 dígitos completos — meio CPF não encontra ninguém.
// Por nome, é `contains`.

type Aluno = {
  id: number;
  nmAluno: string;
  caCPF: string | null;
  anEmail: string | null;
  nrDDD: number | null;
  nrContato: string | null;
  boInativo: boolean;
};

type AcessoAluno = {
  canAccess: boolean;
  reason: string | null;
  hasPlan: boolean;
  planActive: boolean;
  planPaused: boolean;
  paymentOverdue: boolean;
};

type Ficha = Aluno & { studentAccess: AcessoAluno | null };

export default function AlunosScreen() {
  const t = useTokens();
  const { user } = useAuth();

  const [busca, setBusca] = useState('');
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAbrindo, setIsAbrindo] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async (termo: string) => {
    setIsLoading(true);
    try {
      setErro('');
      const query = termo.trim() ? `?search=${encodeURIComponent(termo.trim())}` : '';
      setAlunos(await apiGet<Aluno[]>(`/students${query}`));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível buscar alunos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar('');
  }, [carregar]);

  async function abrirFicha(aluno: Aluno) {
    // Segundo toque no mesmo aluno fecha o cartão.
    if (ficha?.id === aluno.id) {
      setFicha(null);
      return;
    }
    setIsAbrindo(true);
    setErro('');
    try {
      // A unidade vai junto: a situação de acesso depende de o plano cobrir
      // ESTA filial. Sem ela a tela diria "liberado" e a catraca da unidade
      // recusaria — a discordância que esta rota existe para evitar.
      const query = user?.idEmpresa ? `?idEmpresa=${user.idEmpresa}` : '';
      setFicha(await apiGet<Ficha>(`/students/${aluno.id}${query}`));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível abrir a ficha.');
    } finally {
      setIsAbrindo(false);
    }
  }

  const podeCadastrar = podeFuncionario(user, 'students.write');

  return (
    <Screen sectionLabel="Equipe" title="Alunos">
      <View style={styles.buscaLinha}>
        <TextInput
          onChangeText={setBusca}
          onSubmitEditing={() => void carregar(busca)}
          placeholder="Nome ou CPF completo"
          placeholderTextColor={t.placeholder}
          returnKeyType="search"
          style={[
            styles.input,
            {
              backgroundColor: t.inputBg,
              borderColor: t.border,
              borderRadius: t.radius,
              color: t.text,
            },
          ]}
          value={busca}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => void carregar(busca)}
          style={[styles.buscar, { backgroundColor: t.brand, borderRadius: t.radius }]}
        >
          <Text style={styles.buscarTexto}>Buscar</Text>
        </Pressable>
      </View>

      {podeCadastrar ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/aluno-novo')}
          style={[styles.novo, { borderColor: t.brand, borderRadius: t.radius }]}
        >
          <Text style={[styles.novoTexto, { color: t.brand }]}>+ Cadastrar aluno</Text>
        </Pressable>
      ) : null}

      {erro ? (
        <View style={[styles.aviso, { backgroundColor: '#fdeceb', borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.danger }]}>{erro}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={t.brand} style={styles.carregando} />
      ) : alunos.length === 0 ? (
        <Text style={[styles.vazio, { color: t.textSubtle }]}>
          Nenhum aluno encontrado. Para buscar por CPF, informe os 11 dígitos — a busca é por
          documento inteiro porque o CPF fica cifrado no banco.
        </Text>
      ) : (
        alunos.map((aluno) => {
          const aberto = ficha?.id === aluno.id;
          return (
            <Pressable
              accessibilityRole="button"
              key={aluno.id}
              onPress={() => void abrirFicha(aluno)}
              style={[
                styles.cartao,
                { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
              ]}
            >
              <View style={styles.cartaoTopo}>
                <Text style={[styles.nome, { color: t.text }]}>{aluno.nmAluno}</Text>
                {aluno.boInativo ? (
                  <Text style={[styles.tagInativo, { color: t.danger }]}>inativo</Text>
                ) : null}
              </View>
              <Text style={[styles.detalhe, { color: t.textMuted }]}>
                {aluno.caCPF ? formatCpf(aluno.caCPF) : 'sem CPF'}
              </Text>

              {aberto ? (
                isAbrindo ? (
                  <ActivityIndicator color={t.brand} style={styles.carregandoFicha} />
                ) : (
                  <View style={[styles.ficha, { borderTopColor: t.border }]}>
                    {ficha?.studentAccess ? (
                      <View
                        style={[
                          styles.selo,
                          {
                            backgroundColor: ficha.studentAccess.canAccess
                              ? t.brandTintSoft
                              : '#fdeceb',
                            borderRadius: t.radius,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.seloTexto,
                            { color: ficha.studentAccess.canAccess ? t.text : t.danger },
                          ]}
                        >
                          {ficha.studentAccess.canAccess
                            ? 'Pode treinar hoje'
                            : (ficha.studentAccess.reason ?? 'Acesso bloqueado')}
                        </Text>
                      </View>
                    ) : null}

                    {ficha?.studentAccess?.paymentOverdue ? (
                      <Text style={[styles.detalhe, { color: t.danger }]}>Pagamento em atraso</Text>
                    ) : null}
                    {ficha?.studentAccess?.planPaused ? (
                      <Text style={[styles.detalhe, { color: t.textMuted }]}>
                        Matrícula trancada — o contrato não acabou
                      </Text>
                    ) : null}

                    <Text style={[styles.detalhe, { color: t.textMuted }]}>
                      {ficha?.anEmail || 'sem e-mail'}
                    </Text>
                    <Text style={[styles.detalhe, { color: t.textMuted }]}>
                      {ficha?.nrContato
                        ? `(${ficha.nrDDD ?? ''}) ${formatPhone(ficha.nrContato)}`
                        : 'sem telefone'}
                    </Text>
                  </View>
                )
              ) : null}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  buscaLinha: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  buscar: { paddingHorizontal: 16, justifyContent: 'center' },
  buscarTexto: { color: '#fff', fontWeight: '600' },
  novo: { borderWidth: 1, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  novoTexto: { fontSize: 15, fontWeight: '600' },
  aviso: { padding: 12, marginBottom: 12 },
  avisoTexto: { fontSize: 14 },
  carregando: { marginTop: 32 },
  carregandoFicha: { marginTop: 12 },
  vazio: { fontSize: 14, marginTop: 24, lineHeight: 20 },
  cartao: { borderWidth: 1, padding: 14, marginBottom: 10 },
  cartaoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nome: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  tagInativo: { fontSize: 12, fontWeight: '700' },
  detalhe: { fontSize: 13, marginTop: 4 },
  ficha: { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  selo: { padding: 10, marginBottom: 8 },
  seloTexto: { fontSize: 14, fontWeight: '600' },
});
