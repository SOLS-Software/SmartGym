import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiUrl, getApiError } from '../../lib/api/client';
import { ExerciseCard } from '../../lib/components/ExerciseCard';
import { Screen } from '../../lib/components/Screen';
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
  const exercisesAbortRef = useRef<AbortController | null>(null);

  const lastCheckIn = checkIns[0] ?? null;
  const lastCheckInSequenceId = lastCheckIn?.idAlunoTreinosSequencia ?? null;
  const lastCheckInSequenceOrder = lastCheckIn?.alunoTreinoSequencia?.nrOrdem ?? null;

  // Ordenação idêntica ao web (MyTraining.tsx:54-68).
  const activeTrainings = studentTrainings
    .filter((st) => st.boInativo === 0)
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
        .filter((te) => te.boInativo === 0)
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
      setCheckIns((current) => [checkIn, ...current]);
      setFeedback('Treino iniciado com sucesso.');
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
          <Text style={[styles.groupTitle, { color: t.text }]}>
            Exercícios — {selectedStudentTraining.treino?.dsTreino ?? 'Treino'}
          </Text>
          {isLoadingExercises ? (
            <Text style={[styles.hint, { color: t.textSubtle }]}>Carregando exercícios...</Text>
          ) : selectedTrainingExercises.length === 0 ? (
            <Text style={[styles.hint, { color: t.textSubtle }]}>Nenhum exercício vinculado a este treino.</Text>
          ) : (
            <View style={styles.exerciseList}>
              {selectedTrainingExercises
                .filter((te) => te.exercicio)
                .map((te) => (
                  <ExerciseCard exercise={te.exercicio!} key={te.id} meta={formatExerciseMeta(te)} />
                ))}
            </View>
          )}
        </View>
      ) : null}
    </Screen>
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
});
