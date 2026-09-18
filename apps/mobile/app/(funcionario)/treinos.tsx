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
import { apiGet, apiPost } from '../../lib/api/client';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { formatCpf, onlyDigits } from '../../lib/utils/format';

// Montar treino pelo celular.
//
// O professor monta o treino ao lado do aluno, no salão — que é onde a decisão
// acontece. Fazer isso pelo site significa terminar o atendimento, subir até a
// recepção e lembrar do que foi combinado.
//
// São três passos, e eles existem separados porque a API os separa: o treino é
// um MODELO (nome + unidade), os exercícios são filhos dele, e a atribuição a
// um aluno é outra coisa ainda — o mesmo treino serve várias pessoas. Juntar
// tudo numa tela só faria parecer que cada aluno tem um treino exclusivo, e
// editar um mexeria em todos sem avisar.

type Treino = { id: number; dsTreino: string; boInativo: boolean };
type Exercicio = { id: number; dsExercicio: string };
type TreinoExercicio = {
  id: number;
  nrOrdem: number;
  nrSeries: number;
  nrRepeticoes: number;
  exercicio: Exercicio | null;
};
type Aluno = { id: number; nmAluno: string; caCPF: string | null };

export default function TreinosScreen() {
  const t = useTokens();
  const { user } = useAuth();

  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [treino, setTreino] = useState<Treino | null>(null);
  const [itens, setItens] = useState<TreinoExercicio[]>([]);
  const [exercicios, setExercicios] = useState<Exercicio[]>([]);

  const [nomeNovo, setNomeNovo] = useState('');
  const [exercicioEscolhido, setExercicioEscolhido] = useState<Exercicio | null>(null);
  const [series, setSeries] = useState('3');
  const [repeticoes, setRepeticoes] = useState('12');

  const [buscaAluno, setBuscaAluno] = useState('');
  const [alunos, setAlunos] = useState<Aluno[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSalvando, setIsSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const [listaTreinos, listaExercicios] = await Promise.all([
        apiGet<Treino[]>('/trainings'),
        apiGet<Exercicio[]>('/exercises'),
      ]);
      setTreinos(listaTreinos);
      setExercicios(listaExercicios);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar os treinos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function abrirTreino(item: Treino) {
    if (treino?.id === item.id) {
      setTreino(null);
      setItens([]);
      return;
    }
    setTreino(item);
    setErro('');
    try {
      setItens(await apiGet<TreinoExercicio[]>(`/trainings/${item.id}/related/exercises`));
    } catch (error) {
      setItens([]);
      setErro(error instanceof Error ? error.message : 'Não foi possível abrir o treino.');
    }
  }

  async function criarTreino() {
    if (!nomeNovo.trim()) return setErro('Informe o nome do treino.');
    setIsSalvando(true);
    setErro('');
    setOk('');
    try {
      // A unidade vem da sessão: o treino pertence a uma filial, e quem o monta
      // está trabalhando nela.
      const novo = await apiPost<Treino>('/trainings', {
        dsTreino: nomeNovo.trim(),
        idEmpresa: user?.idEmpresa ?? null,
      });
      setNomeNovo('');
      setOk(`Treino "${novo.dsTreino}" criado.`);
      await carregar();
      await abrirTreino(novo);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível criar o treino.');
    } finally {
      setIsSalvando(false);
    }
  }

  async function adicionarExercicio() {
    if (!treino) return;
    if (!exercicioEscolhido) return setErro('Selecione o exercício.');

    setIsSalvando(true);
    setErro('');
    try {
      await apiPost(`/trainings/${treino.id}/related/exercises`, {
        idExercicio: exercicioEscolhido.id,
        // A ordem é o tamanho da lista + 1: o exercício entra no fim, que é o
        // que "adicionar" significa para quem está montando de cima para baixo.
        nrOrdem: itens.length + 1,
        nrSeries: Number(onlyDigits(series) || 0),
        nrRepeticoes: Number(onlyDigits(repeticoes) || 0),
        idEmpresa: user?.idEmpresa ?? null,
      });
      setExercicioEscolhido(null);
      setItens(await apiGet<TreinoExercicio[]>(`/trainings/${treino.id}/related/exercises`));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível adicionar o exercício.');
    } finally {
      setIsSalvando(false);
    }
  }

  async function buscarAlunos() {
    if (!buscaAluno.trim()) return;
    setErro('');
    try {
      setAlunos(await apiGet<Aluno[]>(`/students?search=${encodeURIComponent(buscaAluno.trim())}`));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível buscar alunos.');
    }
  }

  async function atribuir(aluno: Aluno) {
    if (!treino) return;
    setIsSalvando(true);
    setErro('');
    setOk('');
    try {
      // `idFuncionario` é quem PRESCREVEU. A API exige e confere que a pessoa é
      // do tenant: a ficha do aluno guarda quem montou o treino dele, e isso é
      // registro profissional, não metadado.
      await apiPost(`/students/${aluno.id}/related/trainings`, {
        idTreino: treino.id,
        idFuncionario: user?.idFuncionario,
      });
      setOk(`"${treino.dsTreino}" atribuído a ${aluno.nmAluno}.`);
      setAlunos([]);
      setBuscaAluno('');
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível atribuir o treino.');
    } finally {
      setIsSalvando(false);
    }
  }

  const estiloInput = {
    backgroundColor: t.inputBg,
    borderColor: t.border,
    borderRadius: t.radius,
    color: t.text,
  };

  return (
    <Screen sectionLabel="Equipe" title="Treinos">
      {erro ? (
        <View style={[styles.aviso, { backgroundColor: '#fdeceb', borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.danger }]}>{erro}</Text>
        </View>
      ) : null}

      {ok ? (
        <View style={[styles.aviso, { backgroundColor: t.brandTintSoft, borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.text }]}>{ok}</Text>
        </View>
      ) : null}

      <Text style={[styles.secao, { color: t.textMuted }]}>NOVO TREINO</Text>
      <View style={styles.buscaLinha}>
        <TextInput
          onChangeText={setNomeNovo}
          placeholder="Ex.: Treino A - Superiores"
          placeholderTextColor={t.placeholder}
          style={[styles.input, styles.inputFlex, estiloInput]}
          value={nomeNovo}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSalvando}
          onPress={criarTreino}
          style={[styles.buscar, { backgroundColor: t.brand, borderRadius: t.radius }]}
        >
          <Text style={styles.buscarTexto}>Criar</Text>
        </Pressable>
      </View>

      <Text style={[styles.secao, { color: t.textMuted }]}>TREINOS DA ACADEMIA</Text>
      {isLoading ? (
        <ActivityIndicator color={t.brand} style={styles.carregando} />
      ) : treinos.length === 0 ? (
        <Text style={[styles.vazio, { color: t.textSubtle }]}>
          Nenhum treino montado ainda. Crie o primeiro acima.
        </Text>
      ) : (
        treinos.map((item) => (
          <View key={item.id}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void abrirTreino(item)}
              style={[
                styles.opcao,
                {
                  backgroundColor: treino?.id === item.id ? t.brandTintSoft : t.surface,
                  borderColor: treino?.id === item.id ? t.brand : t.border,
                  borderRadius: t.radius,
                },
              ]}
            >
              <Text style={[styles.opcaoTitulo, { color: t.text }]}>{item.dsTreino}</Text>
            </Pressable>

            {treino?.id === item.id ? (
              <View style={[styles.painel, { borderColor: t.border, borderRadius: t.radius }]}>
                {itens.length === 0 ? (
                  <Text style={[styles.vazio, { color: t.textSubtle }]}>
                    Sem exercícios ainda.
                  </Text>
                ) : (
                  itens.map((ex) => (
                    <View key={ex.id} style={styles.linha}>
                      <Text style={[styles.linhaTexto, { color: t.text }]}>
                        {ex.nrOrdem}. {ex.exercicio?.dsExercicio ?? 'Exercício'}
                      </Text>
                      <Text style={[styles.linhaDetalhe, { color: t.textMuted }]}>
                        {ex.nrSeries}x{ex.nrRepeticoes}
                      </Text>
                    </View>
                  ))
                )}

                <Text style={[styles.secao, { color: t.textMuted }]}>ADICIONAR EXERCÍCIO</Text>
                <View style={styles.listaExercicios}>
                  {exercicios.slice(0, 40).map((ex) => (
                    <Pressable
                      accessibilityRole="button"
                      key={ex.id}
                      onPress={() => setExercicioEscolhido(ex)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            exercicioEscolhido?.id === ex.id ? t.brand : t.surface,
                          borderColor: exercicioEscolhido?.id === ex.id ? t.brand : t.border,
                          borderRadius: t.radius,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: exercicioEscolhido?.id === ex.id ? '#fff' : t.textMuted,
                          fontSize: 13,
                        }}
                      >
                        {ex.dsExercicio}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.linhaDupla}>
                  <View style={styles.meio}>
                    <Text style={[styles.rotulo, { color: t.textMuted }]}>Séries</Text>
                    <TextInput
                      keyboardType="number-pad"
                      maxLength={2}
                      onChangeText={(v) => setSeries(onlyDigits(v))}
                      style={[styles.input, estiloInput]}
                      value={series}
                    />
                  </View>
                  <View style={styles.meio}>
                    <Text style={[styles.rotulo, { color: t.textMuted }]}>Repetições</Text>
                    <TextInput
                      keyboardType="number-pad"
                      maxLength={3}
                      onChangeText={(v) => setRepeticoes(onlyDigits(v))}
                      style={[styles.input, estiloInput]}
                      value={repeticoes}
                    />
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={isSalvando}
                  onPress={adicionarExercicio}
                  style={[
                    styles.acao,
                    { backgroundColor: t.brand, borderRadius: t.radius, opacity: isSalvando ? 0.6 : 1 },
                  ]}
                >
                  <Text style={styles.acaoTexto}>Adicionar ao treino</Text>
                </Pressable>

                <Text style={[styles.secao, { color: t.textMuted }]}>ATRIBUIR A UM ALUNO</Text>
                <View style={styles.buscaLinha}>
                  <TextInput
                    onChangeText={setBuscaAluno}
                    onSubmitEditing={buscarAlunos}
                    placeholder="Nome ou CPF completo"
                    placeholderTextColor={t.placeholder}
                    returnKeyType="search"
                    style={[styles.input, styles.inputFlex, estiloInput]}
                    value={buscaAluno}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={buscarAlunos}
                    style={[styles.buscar, { backgroundColor: t.brand, borderRadius: t.radius }]}
                  >
                    <Text style={styles.buscarTexto}>Buscar</Text>
                  </Pressable>
                </View>

                {alunos.map((aluno) => (
                  <Pressable
                    accessibilityRole="button"
                    key={aluno.id}
                    onPress={() => void atribuir(aluno)}
                    style={[
                      styles.opcao,
                      { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
                    ]}
                  >
                    <Text style={[styles.opcaoTitulo, { color: t.text }]}>{aluno.nmAluno}</Text>
                    <Text style={[styles.opcaoDetalhe, { color: t.textMuted }]}>
                      {aluno.caCPF ? formatCpf(aluno.caCPF) : 'sem CPF'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  aviso: { padding: 12, marginBottom: 12 },
  avisoTexto: { fontSize: 14 },
  secao: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  carregando: { marginTop: 16 },
  vazio: { fontSize: 14, lineHeight: 20 },
  buscaLinha: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  inputFlex: { flex: 1 },
  buscar: { paddingHorizontal: 16, justifyContent: 'center' },
  buscarTexto: { color: '#fff', fontWeight: '600' },
  opcao: { borderWidth: 1, padding: 12, marginBottom: 8 },
  opcaoTitulo: { fontSize: 15, fontWeight: '600' },
  opcaoDetalhe: { fontSize: 13, marginTop: 2 },
  painel: { borderWidth: 1, padding: 12, marginBottom: 12 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  linhaTexto: { fontSize: 14, flexShrink: 1 },
  linhaDetalhe: { fontSize: 14, fontWeight: '600' },
  listaExercicios: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  rotulo: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  linhaDupla: { flexDirection: 'row', gap: 8 },
  meio: { flex: 1 },
  acao: { paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  acaoTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
