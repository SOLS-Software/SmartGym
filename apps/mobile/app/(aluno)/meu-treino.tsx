import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiUrl, getApiError, authFetch as fetch } from '../../lib/api/client';
import { ExerciseCard } from '../../lib/components/ExerciseCard';
import { Screen } from '../../lib/components/Screen';
import { estaAtivo } from '../../lib/utils/flags';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import type {
  StudentCheckIn,
  StudentTraining,
  TrainingExerciseWithCover,
} from '../../lib/types/training';
import { formatDateDisplay, formatDateTimeDisplay } from '../../lib/utils/format';

// Reaproveitado de MyTraining.tsx:9-15.
function formatExerciseMeta(link: TrainingExerciseWithCover) {
  const parts: string[] = [];
  if (link.nrSeries) parts.push(`${link.nrSeries}x${link.nrRepeticoes || 0}`);
  if (Number(link.qtPeso) > 0) parts.push(`${link.qtPeso}${link.cnUnidadeMedida || ''}`);
  if (link.qtDescanso) parts.push(`${link.qtDescanso}s descanso`);
  return parts.join(' · ');
}

/** O que o aluno anotou de um exercício na sessão de hoje. */
type Execucao = {
  id: number;
  idTreinoExercicio: number;
  nrSeriesFeitas: number | null;
  vlCarga: string | number | null;
  boConcluido: boolean;
};

export default function MeuTreinoScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const studentId = user?.idAluno ?? null;

  const [studentTrainings, setStudentTrainings] = useState<StudentTraining[]>([]);
  const [selectedStudentTraining, setSelectedStudentTraining] = useState<StudentTraining | null>(null);
  const [selectedSequenceId, setSelectedSequenceId] = useState('');
  const [selectedTrainingExercises, setSelectedTrainingExercises] = useState<TrainingExerciseWithCover[]>([]);
  const [checkIns, setCheckIns] = useState<StudentCheckIn[]>([]);
  const [isLoadingTrainings, setIsLoadingTrainings] = useState(false);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [isLoadingCheckIns, setIsLoadingCheckIns] = useState(false);
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  const [feedback, setFeedback] = useState('');
  // Registro do treino de hoje, por exercício. Chave é o idTreinoExercicio
  // porque é por ele que a rota faz upsert — reenviar corrige em vez de
  // duplicar, que é o que permite o aluno ajustar a carga depois de marcar.
  const [execucoes, setExecucoes] = useState<Record<number, Execucao>>({});
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const exercisesAbortRef = useRef<AbortController | null>(null);

  const lastCheckIn = checkIns[0] ?? null;
  const lastCheckInSequenceId = lastCheckIn?.idAlunoTreinosSequencia ?? null;
  const lastCheckInSequenceOrder = lastCheckIn?.alunoTreinoSequencia?.nrOrdem ?? null;

  // Sessão de hoje: é nela que as anotações são penduradas. Sem sessão aberta
  // não há onde registrar, e o aluno vê o botão de iniciar em vez dos campos.
  const sessaoDeHoje = (() => {
    if (!lastCheckIn) return null;
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    return new Date(lastCheckIn.dtCadastro) >= inicioDoDia ? lastCheckIn : null;
  })();

  // Ordenação idêntica ao web (MyTraining.tsx:54-68).
  const activeTrainings = studentTrainings
    .filter((st) => estaAtivo(st.boInativo))
    .sort((a, b) => {
      const aOrder = a.alunoTreinosSequencias?.[0]?.nrOrdem ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.alunoTreinosSequencias?.[0]?.nrOrdem ?? Number.MAX_SAFE_INTEGER;

      if (lastCheckInSequenceOrder) {
        const aAfterLast = aOrder > lastCheckInSequenceOrder ? 0 : 1;
        const bAfterLast = bOrder > lastCheckInSequenceOrder ? 0 : 1;
        if (aAfterLast !== bAfterLast) return aAfterLast - bAfterLast;
      }

      return aOrder !== bOrder ? aOrder - bOrder : a.id - b.id;
    });

  function getEmployeeName(st: StudentTraining) {
    return st.funcionario?.nmFuncionario ?? '-';
  }

  function getSequenceLabel(st: StudentTraining) {
    const seqs = st.alunoTreinosSequencias ?? [];
    return seqs.length > 0 ? seqs.map((s) => String(s.nrOrdem)).join(', ') : '-';
  }

  function getPrimarySequence(st: StudentTraining | null) {
    return st?.alunoTreinosSequencias?.[0] ?? null;
  }

  function getWorkoutStartTarget() {
    const training =
      activeTrainings.find((item) =>
        (item.alunoTreinosSequencias ?? []).some((sequence) => String(sequence.id) === selectedSequenceId),
      ) ??
      selectedStudentTraining ??
      activeTrainings[0] ??
      null;
    const sequence =
      training?.alunoTreinosSequencias?.find((item) => String(item.id) === selectedSequenceId) ??
      getPrimarySequence(training);
    return { training, sequence };
  }

  function isLastCheckInTraining(st: StudentTraining) {
    if (!lastCheckInSequenceId) return false;
    return (st.alunoTreinosSequencias ?? []).some((sequence) => sequence.id === lastCheckInSequenceId);
  }

  async function loadTrainings() {
    if (!studentId) return;
    try {
      setIsLoadingTrainings(true);
      const response = await fetch(`${apiUrl}/students/${studentId}/related/trainings`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os treinos.');
      const data = (await response.json()) as StudentTraining[];
      setStudentTrainings(data);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar treinos.');
    } finally {
      setIsLoadingTrainings(false);
    }
  }

  async function loadCheckIns() {
    if (!studentId) return;
    try {
      setIsLoadingCheckIns(true);
      const response = await fetch(`${apiUrl}/students/${studentId}/related/check-ins`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar o último treino.');
      setCheckIns((await response.json()) as StudentCheckIn[]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar último treino.');
    } finally {
      setIsLoadingCheckIns(false);
    }
  }

  async function loadExercises(trainingId: number | null) {
    if (!trainingId) {
      setSelectedTrainingExercises([]);
      return;
    }

    exercisesAbortRef.current?.abort();
    const controller = new AbortController();
    exercisesAbortRef.current = controller;

    try {
      setIsLoadingExercises(true);
      const response = await fetch(
        `${apiUrl}/trainings/${trainingId}/related/exercises?includeCover=true`,
        { signal: controller.signal },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os exercícios.');

      const trainingExercises = ((await response.json()) as TrainingExerciseWithCover[])
        .filter((te) => estaAtivo(te.boInativo))
        .sort((a, b) => (a.nrOrdem !== b.nrOrdem ? a.nrOrdem - b.nrOrdem : a.id - b.id));

      setSelectedTrainingExercises(trainingExercises);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setSelectedTrainingExercises([]);
    } finally {
      setIsLoadingExercises(false);
    }
  }

  useEffect(() => {
    void loadTrainings();
    void loadCheckIns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    if (selectedStudentTraining || activeTrainings.length === 0) return;
    const firstTraining = activeTrainings[0]!;
    setSelectedStudentTraining(firstTraining);
    setSelectedSequenceId(
      firstTraining.alunoTreinosSequencias?.[0]?.id
        ? String(firstTraining.alunoTreinosSequencias[0].id)
        : '',
    );
    void loadExercises(firstTraining.idTreino);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrainings, selectedStudentTraining]);

  function handleSelectTraining(st: StudentTraining) {
    setSelectedStudentTraining(st);
    setSelectedSequenceId(st.alunoTreinosSequencias?.[0]?.id ? String(st.alunoTreinosSequencias[0].id) : '');
    void loadExercises(st.idTreino);
  }

  // Reabrir a tela no meio do treino tem que trazer de volta o que já foi
  // marcado — senão o aluno remarca tudo, ou desiste de marcar.
  useEffect(() => {
    if (!sessaoDeHoje) {
      setExecucoes({});
      return;
    }
    void carregarExecucoes(sessaoDeHoje.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoDeHoje?.id]);

  async function carregarExecucoes(idSessao: number) {
    if (!studentId) return;
    try {
      const response = await fetch(
        `${apiUrl}/students/${studentId}/related/executions?idAlunoCheckIn=${idSessao}`,
      );
      if (!response.ok) return;
      const lista = (await response.json()) as Execucao[];
      setExecucoes(Object.fromEntries(lista.map((item) => [item.idTreinoExercicio, item])));
    } catch {
      // O registro é um extra da tela; falhar aqui não pode esconder o treino.
    }
  }

  /**
   * Grava o que foi feito num exercício. A rota é upsert por (sessão,
   * exercício): reenviar corrige, não duplica.
   */
  async function salvarExecucao(
    idTreinoExercicio: number,
    mudanca: Partial<Pick<Execucao, 'nrSeriesFeitas' | 'vlCarga' | 'boConcluido'>>,
  ) {
    if (!studentId || !sessaoDeHoje) return;
    const atual = execucoes[idTreinoExercicio];
    try {
      setSalvandoId(idTreinoExercicio);
      const response = await fetch(`${apiUrl}/students/${studentId}/related/executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idAlunoCheckIn: sessaoDeHoje.id,
          idTreinoExercicio,
          nrSeriesFeitas: mudanca.nrSeriesFeitas ?? atual?.nrSeriesFeitas ?? 0,
          vlCarga: mudanca.vlCarga ?? atual?.vlCarga ?? null,
          boConcluido: mudanca.boConcluido ?? atual?.boConcluido ?? false,
        }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível registrar.');
      const salva = (await response.json()) as Execucao;
      setExecucoes((atuais) => ({ ...atuais, [idTreinoExercicio]: salva }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao registrar execução.');
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleStartWorkout() {
    const { sequence } = getWorkoutStartTarget();
    if (!studentId || !sequence) {
      setFeedback('Nenhum treino com sequência disponível para iniciar.');
      return;
    }

    try {
      setIsStartingWorkout(true);
      const response = await fetch(`${apiUrl}/students/${studentId}/related/check-ins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAlunoTreinosSequencia: sequence.id, boInativo: 0 }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível iniciar o treino.');

      const checkIn = (await response.json()) as StudentCheckIn;

      // 200 = o servidor devolveu a sessão que já existia hoje — a da catraca,
      // ou a de um toque anterior. Sem filtrar por id, a mesma sessão entraria
      // duas vezes na lista e o aluno leria como dois treinos no mesmo dia.
      const retomada = response.status === 200;
      setCheckIns((current) => [checkIn, ...current.filter((item) => item.id !== checkIn.id)]);
      setFeedback(
        retomada
          ? 'Você já tinha uma sessão hoje. Continuando nela.'
          : 'Treino iniciado com sucesso.',
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao iniciar treino.');
    } finally {
      setIsStartingWorkout(false);
    }
  }

  const workoutStartTarget = getWorkoutStartTarget();

  return (
    <Screen sectionLabel="Treino" title="Meu Treino">
      {feedback ? (
        <View style={[styles.feedback, { backgroundColor: t.brandTintSoft, borderRadius: t.radius }]}>
          <Text style={[styles.feedbackText, { color: t.brand }]}>{feedback}</Text>
        </View>
      ) : null}

      {/* Último treino realizado */}
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
        <Text style={[styles.sectionLabel, { color: t.brand }]}>ÚLTIMO TREINO REALIZADO</Text>
        {isLoadingCheckIns ? (
          <Text style={[styles.hint, { color: t.textSubtle }]}>Carregando último treino...</Text>
        ) : lastCheckIn ? (
          <View style={styles.grid}>
            <Field label="Treino" value={lastCheckIn.alunoTreinoSequencia?.alunoTreino?.treino?.dsTreino ?? '-'} />
            <Field label="Sequência" value={lastCheckIn.alunoTreinoSequencia?.nrOrdem ? String(lastCheckIn.alunoTreinoSequencia.nrOrdem) : '-'} />
            <Field label="Plano" value={lastCheckIn.alunoPlano?.plano?.dsPlano ?? '-'} />
            <Field label="Realizado em" value={formatDateTimeDisplay(lastCheckIn.dtCadastro)} />
          </View>
        ) : (
          <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum treino iniciado ainda.</Text>
        )}
      </View>

      {/* Iniciar treino */}
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
        <Text style={[styles.sectionLabel, { color: t.brand }]}>INICIAR TREINO</Text>
        <Text style={[styles.cardTitle, { color: t.text }]}>
          {workoutStartTarget.training?.treino?.dsTreino ?? 'Nenhum treino disponível'}
        </Text>

        {activeTrainings.length > 0 ? (
          <View style={styles.chips}>
            {activeTrainings.flatMap((training) =>
              (training.alunoTreinosSequencias ?? []).map((sequence) => {
                const active = String(sequence.id) === (workoutStartTarget.sequence ? String(workoutStartTarget.sequence.id) : '');
                return (
                  <Pressable
                    key={sequence.id}
                    accessibilityLabel={`${training.treino?.dsTreino ?? 'Treino'}, sequência ${sequence.nrOrdem}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, checked: active }}
                    onPress={() => {
                      setSelectedSequenceId(String(sequence.id));
                      setSelectedStudentTraining(training);
                      void loadExercises(training.idTreino);
                    }}
                    style={[
                      styles.chip,
                      { borderColor: active ? t.brand : t.border, backgroundColor: active ? t.brandTintSoft : t.surface },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? t.brand : t.textMuted }]}>
                      {training.treino?.dsTreino ?? 'Treino'} · Seq {sequence.nrOrdem}
                    </Text>
                  </Pressable>
                );
              }),
            )}
          </View>
        ) : null}

        <Pressable
          accessibilityLabel="Iniciar treino"
          accessibilityRole="button"
          accessibilityState={{
            disabled: !workoutStartTarget.sequence || isStartingWorkout,
            busy: isStartingWorkout,
          }}
          disabled={!workoutStartTarget.sequence || isStartingWorkout}
          onPress={() => void handleStartWorkout()}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: t.brand,
              borderRadius: t.radius,
              opacity: !workoutStartTarget.sequence || isStartingWorkout ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {isStartingWorkout ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar treino</Text>
          )}
        </Pressable>
      </View>

      {/* Treinos ativos */}
      <View style={styles.section}>
        <Text style={[styles.groupTitle, { color: t.text }]}>Treinos ativos</Text>
        {isLoadingTrainings ? (
          <Text style={[styles.hint, { color: t.textSubtle }]}>Carregando treinos...</Text>
        ) : activeTrainings.length === 0 ? (
          <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum treino ativo encontrado.</Text>
        ) : (
          <View style={styles.trainingList}>
            {activeTrainings.map((st) => {
              const selected = st.id === selectedStudentTraining?.id;
              return (
                <Pressable
                  key={st.id}
                  accessibilityLabel={`Treino ${st.treino?.dsTreino ?? 'sem nome'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => handleSelectTraining(st)}
                  style={[
                    styles.trainingCard,
                    {
                      backgroundColor: t.surface,
                      borderColor: selected ? t.brand : t.border,
                      borderRadius: t.radius,
                    },
                  ]}
                >
                  <Text style={[styles.trainingTitle, { color: t.text }]}>{st.treino?.dsTreino ?? '-'}</Text>
                  <Text style={[styles.trainingMeta, { color: t.textSubtle }]}>
                    {getEmployeeName(st)} · Sequência {getSequenceLabel(st)}
                  </Text>
                  <Text style={[styles.trainingMeta, { color: t.textSubtle }]}>
                    Cadastro: {st.dtCadastro ? formatDateDisplay(st.dtCadastro) : '-'}
                  </Text>
                  {isLastCheckInTraining(st) ? (
                    <View style={[styles.badge, { backgroundColor: t.brandTintSoft }]}>
                      <Text style={[styles.badgeText, { color: t.brand }]}>Último check-in</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Exercícios do treino selecionado */}
      {selectedStudentTraining ? (
        <View style={styles.section}>
          <View style={styles.exercisesHead}>
            <Text style={[styles.groupTitle, { color: t.text }]}>
              Exercícios — {selectedStudentTraining.treino?.dsTreino ?? 'Treino'}
            </Text>
            {sessaoDeHoje && selectedTrainingExercises.length > 0 ? (
              <Text style={[styles.trainingMeta, { color: t.textSubtle }]}>
                {Object.values(execucoes).filter((e) => e.boConcluido).length} de{' '}
                {selectedTrainingExercises.length} concluídos hoje
              </Text>
            ) : null}
          </View>
          {isLoadingExercises ? (
            <Text style={[styles.hint, { color: t.textSubtle }]}>Carregando exercícios...</Text>
          ) : selectedTrainingExercises.length === 0 ? (
            <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum exercício vinculado a este treino.</Text>
          ) : (
            <View style={styles.exerciseList}>
              {selectedTrainingExercises
                .filter((te) => te.exercicio)
                .map((te) => (
                  <View key={te.id} style={styles.exerciseBlock}>
                    <ExerciseCard exercise={te.exercicio!} meta={formatExerciseMeta(te)} />
                    {/* Só com treino iniciado hoje: fora da sessão não há onde
                        pendurar o dado, e pedir carga para quem não está
                        treinando é ruído. */}
                    {sessaoDeHoje ? (
                      <RegistroDoExercicio
                        aoSalvar={(mudanca) => void salvarExecucao(te.id, mudanca)}
                        execucao={execucoes[te.id] ?? null}
                        salvando={salvandoId === te.id}
                      />
                    ) : null}
                  </View>
                ))}
            </View>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * Séries, carga e "feito" de um exercício.
 *
 * Grava ao sair do campo, e não a cada tecla: o aluno digita "12" com o
 * celular na mão entre uma série e outra — salvar no "1" gravaria uma carga
 * que nunca existiu.
 */
function RegistroDoExercicio({
  aoSalvar,
  execucao,
  salvando,
}: {
  aoSalvar: (mudanca: { nrSeriesFeitas?: number; vlCarga?: string; boConcluido?: boolean }) => void;
  execucao: Execucao | null;
  salvando: boolean;
}) {
  const t = useTokens();
  const [series, setSeries] = useState(
    execucao?.nrSeriesFeitas ? String(execucao.nrSeriesFeitas) : '',
  );
  const [carga, setCarga] = useState(
    execucao?.vlCarga !== null && execucao?.vlCarga !== undefined ? String(execucao.vlCarga) : '',
  );
  const concluido = execucao?.boConcluido ?? false;

  // O que veio do servidor manda: outra tela (ou o web) pode ter gravado.
  useEffect(() => {
    setSeries(execucao?.nrSeriesFeitas ? String(execucao.nrSeriesFeitas) : '');
    setCarga(
      execucao?.vlCarga !== null && execucao?.vlCarga !== undefined ? String(execucao.vlCarga) : '',
    );
  }, [execucao?.id, execucao?.nrSeriesFeitas, execucao?.vlCarga]);

  return (
    <View style={[styles.registro, { backgroundColor: t.inputBg, borderRadius: t.radius }]}>
      <View style={styles.registroCampo}>
        <Text style={[styles.registroRotulo, { color: t.textSubtle }]}>Séries</Text>
        <TextInput
          keyboardType="number-pad"
          onBlur={() => aoSalvar({ nrSeriesFeitas: Number(series) || 0 })}
          onChangeText={setSeries}
          placeholder="0"
          placeholderTextColor={t.placeholder}
          style={[styles.registroInput, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
          value={series}
        />
      </View>

      <View style={styles.registroCampo}>
        <Text style={[styles.registroRotulo, { color: t.textSubtle }]}>Carga (kg)</Text>
        <TextInput
          keyboardType="decimal-pad"
          onBlur={() => aoSalvar({ vlCarga: carga })}
          onChangeText={setCarga}
          placeholder="-"
          placeholderTextColor={t.placeholder}
          style={[styles.registroInput, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
          value={carga}
        />
      </View>

      <Pressable
        accessibilityLabel={concluido ? 'Marcar como não feito' : 'Marcar como feito'}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: concluido, busy: salvando }}
        disabled={salvando}
        onPress={() => aoSalvar({ boConcluido: !concluido })}
        style={({ pressed }) => [
          styles.registroFeito,
          {
            backgroundColor: concluido ? t.brand : t.surface,
            borderColor: concluido ? t.brand : t.border,
            borderRadius: t.radius,
            opacity: pressed || salvando ? 0.7 : 1,
          },
        ]}
      >
        <Text style={[styles.registroFeitoTexto, { color: concluido ? '#ffffff' : t.textMuted }]}>
          {concluido ? '✓ Feito' : 'Feito'}
        </Text>
      </Pressable>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: t.textSubtle }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: t.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  feedback: { padding: 12 },
  feedbackText: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { width: '45%' },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  fieldValue: { fontSize: 14, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '700' },
  button: { marginTop: 4, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  section: { gap: 12 },
  groupTitle: { fontSize: 16, fontWeight: '800' },
  trainingList: { gap: 10 },
  trainingCard: { borderWidth: 1, padding: 14, gap: 4 },
  trainingTitle: { fontSize: 15, fontWeight: '800' },
  trainingMeta: { fontSize: 12, fontWeight: '600' },
  badge: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  exerciseList: { gap: 12 },
  exerciseBlock: { gap: 6 },
  exercisesHead: { gap: 2 },
  registro: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10 },
  registroCampo: { flex: 1, gap: 4 },
  registroRotulo: { fontSize: 11, fontWeight: '700' },
  registroInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  registroFeito: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  registroFeitoTexto: { fontSize: 13, fontWeight: '800' },
});
