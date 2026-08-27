'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDateDisplay, formatDateTimeDisplay } from '../../shared/registration/registrationHelpers';
import { ExerciseCard } from '../../shared/registration/ExerciseCard';
import type { StudentTraining, TrainingExerciseWithCover } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

function formatExerciseMeta(link: TrainingExerciseWithCover) {
    const parts: string[] = [];
    if (link.nrSeries) parts.push(`${link.nrSeries}x${link.nrRepeticoes || 0}`);
    if (Number(link.qtPeso) > 0) parts.push(`${link.qtPeso}${link.unidadeMedida?.cnUnidade || ''}`);
    if (link.qtDescanso) parts.push(`${link.qtDescanso}s descanso`);
    return parts.join(' · ');
}

type MyTrainingProps = {
    studentId: number | null;
    studentName: string;
};

/** O que o aluno registrou ter feito num exercício da sessão de hoje. */
type Execution = {
    id: number;
    idTreinoExercicio: number;
    nrSeriesFeitas: number;
    nrRepeticoes: number;
    vlCarga: string | number | null;
    boConcluido: boolean;
};

type StudentCheckIn = {
    id: number;
    dtCadastro: string;
    idAlunoTreinosSequencia: number | null;
    alunoPlano?: {
        plano?: {
            dsPlano?: string;
        } | null;
    } | null;
    alunoTreinoSequencia?: {
        nrOrdem: number;
        alunoTreino?: StudentTraining | null;
    } | null;
};


export function MyTraining({ studentId, studentName }: MyTrainingProps) {
    const { showToast } = useToast();
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
    const [executions, setExecutions] = useState<Record<number, Execution>>({});
    const [savingExerciseId, setSavingExerciseId] = useState<number | null>(null);
    const lastCheckIn = checkIns[0] ?? null;
    const lastCheckInSequenceId = lastCheckIn?.idAlunoTreinosSequencia ?? null;
    const lastCheckInSequenceOrder = lastCheckIn?.alunoTreinoSequencia?.nrOrdem ?? null;

    // Sessão de hoje: o check-in mais recente, se for de hoje. É nele que as
    // execuções são penduradas — sem sessão aberta não há o que registrar, e o
    // aluno vê o botão de iniciar treino em vez dos campos.
    const todaySession = (() => {
        if (!lastCheckIn) return null;
        const inicioDoDia = new Date();
        inicioDoDia.setHours(0, 0, 0, 0);
        return new Date(lastCheckIn.dtCadastro) >= inicioDoDia ? lastCheckIn : null;
    })();

    const activeTrainings = studentTrainings
        .filter((st) => st.boInativo === false)
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

    function getLastWorkoutName() {
        return lastCheckIn?.alunoTreinoSequencia?.alunoTreino?.treino?.dsTreino ?? '-';
    }

    function getLastWorkoutSequence() {
        const sequence = lastCheckIn?.alunoTreinoSequencia?.nrOrdem;
        return sequence ? String(sequence) : '-';
    }

    function getLastWorkoutPlan() {
        return lastCheckIn?.alunoPlano?.plano?.dsPlano ?? '-';
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
        if (!studentId) {
            setStudentTrainings([]);
            return;
        }

        try {
            setIsLoadingTrainings(true);
            const response = await fetch(`/api/proxy/students/${studentId}/related/trainings`);

            if (!response.ok) {
                await getApiError(response, 'Não foi possível carregar os treinos.');
            }

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
        if (!studentId) {
            setCheckIns([]);
            return;
        }

        try {
            setIsLoadingCheckIns(true);
            const response = await fetch(`/api/proxy/students/${studentId}/related/check-ins`);

            if (!response.ok) {
                await getApiError(response, 'Não foi possível carregar o último treino.');
            }

            setCheckIns((await response.json()) as StudentCheckIn[]);
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Erro ao carregar ultimo treino.');
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
        const signal = controller.signal;

        try {
            setIsLoadingExercises(true);
            const exercisesResponse = await fetch(
                `/api/proxy/trainings/${trainingId}/related/exercises?includeCover=true`,
                { signal },
            );

            if (!exercisesResponse.ok) {
                await getApiError(exercisesResponse, 'Não foi possível carregar os exercícios.');
            }

            const trainingExercises = ((await exercisesResponse.json()) as TrainingExerciseWithCover[])
                .filter((te) => te.boInativo === false)
                .sort((a, b) => a.nrOrdem !== b.nrOrdem ? a.nrOrdem - b.nrOrdem : a.id - b.id);

            setSelectedTrainingExercises(trainingExercises);
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setSelectedTrainingExercises([]);
        } finally {
            setIsLoadingExercises(false);
        }
    }

    useEffect(() => {
        void loadTrainings();
        void loadCheckIns();
    }, [studentId]);

    // Carrega o que já foi registrado na sessão de hoje, para o aluno reabrir a
    // tela no meio do treino e encontrar as séries que já marcou.
    useEffect(() => {
        if (!todaySession) {
            setExecutions({});
            return;
        }
        void loadExecutions(todaySession.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todaySession?.id]);

    useEffect(() => {
        if (selectedStudentTraining || activeTrainings.length === 0) return;
        if (isLoadingTrainings || isLoadingCheckIns) return;
        const firstTraining = activeTrainings[0]!;
        setSelectedStudentTraining(firstTraining);
        setSelectedSequenceId(
            firstTraining.alunoTreinosSequencias?.[0]?.id
                ? String(firstTraining.alunoTreinosSequencias[0].id)
                : '',
        );
        void loadExercises(firstTraining.idTreino);
    }, [activeTrainings, selectedStudentTraining, isLoadingTrainings, isLoadingCheckIns]);

    async function loadExecutions(checkInId: number) {
        if (!studentId) return;
        try {
            const response = await fetch(
                `/api/proxy/students/${studentId}/related/executions?idAlunoCheckIn=${checkInId}`,
            );
            if (!response.ok) return;
            const data = (await response.json()) as Execution[];
            setExecutions(Object.fromEntries(data.map((item) => [item.idTreinoExercicio, item])));
        } catch {
            // O registro é um extra da tela; falhar aqui não pode esconder o treino.
        }
    }

    /**
     * Grava o que foi feito num exercício. A rota é upsert por (sessão,
     * exercício), então reenviar corrige em vez de duplicar — é o que permite o
     * aluno ajustar a carga depois de já ter marcado.
     */
    async function saveExecution(
        idTreinoExercicio: number,
        patch: Partial<Pick<Execution, 'nrSeriesFeitas' | 'vlCarga' | 'boConcluido'>>,
    ) {
        if (!studentId || !todaySession) return;
        const atual = executions[idTreinoExercicio];
        const proximo = {
            nrSeriesFeitas: patch.nrSeriesFeitas ?? atual?.nrSeriesFeitas ?? 0,
            vlCarga: patch.vlCarga ?? atual?.vlCarga ?? null,
            boConcluido: patch.boConcluido ?? atual?.boConcluido ?? false,
        };

        try {
            setSavingExerciseId(idTreinoExercicio);
            const response = await fetch(`/api/proxy/students/${studentId}/related/executions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idAlunoCheckIn: todaySession.id,
                    idTreinoExercicio,
                    nrSeriesFeitas: proximo.nrSeriesFeitas,
                    vlCarga: proximo.vlCarga === null || proximo.vlCarga === '' ? null : Number(proximo.vlCarga),
                    boConcluido: proximo.boConcluido,
                }),
            });
            if (!response.ok) await getApiError(response, 'Não foi possível registrar.');
            const saved = (await response.json()) as Execution;
            setExecutions((current) => ({ ...current, [idTreinoExercicio]: saved }));
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Erro ao registrar execução.');
        } finally {
            setSavingExerciseId(null);
        }
    }

    function handleSelectTraining(st: StudentTraining) {
        setSelectedStudentTraining(st);
        setSelectedSequenceId(st.alunoTreinosSequencias?.[0]?.id ? String(st.alunoTreinosSequencias[0].id) : '');
        void loadExercises(st.idTreino);
    }

    async function handleStartWorkout() {
        const { sequence } = getWorkoutStartTarget();

        if (!studentId || !sequence) {
            setFeedback('Nenhum treino com sequencia disponivel para iniciar.');
            return;
        }

        try {
            setIsStartingWorkout(true);
            const response = await fetch(`/api/proxy/students/${studentId}/related/check-ins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idAlunoTreinosSequencia: sequence.id,
                    boInativo: false,
                }),
            });

            if (!response.ok) {
                await getApiError(response, 'Nao foi possivel iniciar o treino.');
            }

            const checkIn = (await response.json()) as StudentCheckIn;
            setCheckIns((current) => [checkIn, ...current]);
            showToast('Treino iniciado com sucesso.');
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Erro ao iniciar treino.');
        } finally {
            setIsStartingWorkout(false);
        }
    }

    if (!studentId) {
        return (
            <>
            <header className="module-page-header">
                <p className="section-label">Treino</p>
                <h2 className="module-page-title">MEU TREINO</h2>
            </header>
            <div className="form-view">
                <p>Faça login como aluno para visualizar seu treino.</p>
            </div>
            </>
        );
    }

    const workoutStartTarget = getWorkoutStartTarget();

    return (
        <>
        <header className="module-page-header">
            <p className="section-label">Treino</p>
            <h2 className="module-page-title">MEU TREINO</h2>
        </header>
        <div className="form-view workout-assembly-view">

            {feedback ? <div className="form-feedback">{feedback}</div> : null}

            <section className="my-training-start-panel" aria-label="Inicio do treino">
                <div className="my-training-last-card">
                    <p className="section-label">Último treino realizado</p>
                    {isLoadingCheckIns ? (
                        <div className="form-hint">Carregando último treino...</div>
                    ) : lastCheckIn ? (
                        <div className="my-training-last-grid">
                            <div>
                                <span>Treino</span>
                                <strong>{getLastWorkoutName()}</strong>
                            </div>
                            <div>
                                <span>Sequência</span>
                                <strong>{getLastWorkoutSequence()}</strong>
                            </div>
                            <div>
                                <span>Plano</span>
                                <strong>{getLastWorkoutPlan()}</strong>
                            </div>
                            <div>
                                <span>Realizado em</span>
                                <strong>{formatDateTimeDisplay(lastCheckIn.dtCadastro)}</strong>
                            </div>
                        </div>
                    ) : (
                        <div className="form-hint">Nenhum treino iniciado ainda.</div>
                    )}
                </div>

                <div className="my-training-action-card">
                    <p className="section-label">Iniciar treino</p>
                    <h3>{workoutStartTarget.training?.treino?.dsTreino ?? 'Nenhum treino disponivel'}</h3>
                    <div className="field">
                        <label htmlFor="selectedWorkoutSequence">Treino - sequência</label>
                        <select
                            disabled={activeTrainings.length === 0 || isStartingWorkout}
                            id="selectedWorkoutSequence"
                            onChange={(event) => {
                                const nextSequenceId = event.target.value;
                                setSelectedSequenceId(nextSequenceId);
                                const nextTraining = activeTrainings.find((item) =>
                                    (item.alunoTreinosSequencias ?? []).some((sequence) => String(sequence.id) === nextSequenceId),
                                );
                                if (nextTraining) {
                                    setSelectedStudentTraining(nextTraining);
                                    void loadExercises(nextTraining.idTreino);
                                }
                            }}
                            value={workoutStartTarget.sequence ? String(workoutStartTarget.sequence.id) : ''}
                        >
                            <option value="">Selecione</option>
                            {activeTrainings.flatMap((training) =>
                                (training.alunoTreinosSequencias ?? []).map((sequence) => (
                                    <option key={sequence.id} value={sequence.id}>
                                        {training.treino?.dsTreino ?? 'Treino'} - Sequencia {sequence.nrOrdem}
                                    </option>
                                )),
                            )}
                        </select>
                    </div>
                    <button
                        className="new-button"
                        disabled={!workoutStartTarget.sequence || isStartingWorkout}
                        onClick={() => void handleStartWorkout()}
                        type="button"
                    >
                        {isStartingWorkout ? 'Iniciando...' : 'Iniciar treino'}
                    </button>
                </div>
            </section>

            <section className="data-grid-section workout-training-grid">
                <div className="grid-toolbar">
                    <h3>Treinos ativos</h3>
                </div>

                {isLoadingTrainings ? (
                    <div className="empty-row">Carregando treinos...</div>
                ) : null}

                {!isLoadingTrainings && activeTrainings.length === 0 ? (
                    <div className="empty-row">Nenhum treino ativo encontrado.</div>
                ) : null}

                {!isLoadingTrainings ? (
                    <div className="exercise-card-grid">
                        {activeTrainings.map((st) => (
                            <button
                                className={`training-card ${st.id === selectedStudentTraining?.id ? 'selected' : ''}`}
                                key={st.id}
                                onClick={() => handleSelectTraining(st)}
                                type="button"
                            >
                                <strong className="training-card-title">{st.treino?.dsTreino ?? '-'}</strong>
                                <span className="training-card-meta">
                                    {getEmployeeName(st)}
                                </span>
                                <span className="training-card-meta">
                                    Cadastro: {st.dtCadastro ? formatDateDisplay(st.dtCadastro) : '-'}
                                </span>
                                {isLastCheckInTraining(st) ? (
                                    <span className="status-badge pending">Último check-in</span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                ) : null}
            </section>

            {selectedStudentTraining ? (
                <section className="training-exercises-grid exercise-grid-animated" key={selectedStudentTraining.id}>
                    <div className="grid-toolbar">
                        <h3>
                            Exercícios — {selectedStudentTraining.treino?.dsTreino ?? 'Treino'}
                        </h3>
                    </div>

                    {isLoadingExercises ? (
                        <div className="empty-row">Carregando exercícios...</div>
                    ) : null}

                    {!isLoadingExercises && selectedTrainingExercises.length === 0 ? (
                        <div className="empty-row">Nenhum exercício vinculado a este treino.</div>
                    ) : null}

                    {!isLoadingExercises ? (
                        <div className="exercise-card-grid">
                            {selectedTrainingExercises
                                .filter((te) => te.exercicio)
                                .map((te) => (
                                    <ExerciseCard exercise={te.exercicio!} key={te.id} meta={formatExerciseMeta(te)} />
                                ))}
                        </div>
                    ) : null}

                    {/* Registro do que foi feito. Só aparece com treino iniciado
                        hoje: fora da sessão não há onde pendurar o dado, e pedir
                        carga para quem não está treinando é ruído. */}
                    {!isLoadingExercises && todaySession && selectedTrainingExercises.length > 0 ? (
                        <section className="workout-log" aria-label="Registro do treino de hoje">
                            <div className="workout-log-head">
                                <p className="section-label">Registro de hoje</p>
                                <span>
                                    {Object.values(executions).filter((e) => e.boConcluido).length} de{' '}
                                    {selectedTrainingExercises.length} concluídos
                                </span>
                            </div>

                            <ul className="workout-log-list">
                                {selectedTrainingExercises
                                    .filter((te) => te.exercicio)
                                    .map((te) => {
                                        const execucao = executions[te.id];
                                        const concluido = execucao?.boConcluido ?? false;
                                        return (
                                            <li
                                                className={`workout-log-item ${concluido ? 'done' : ''}`}
                                                key={te.id}
                                            >
                                                <div className="workout-log-name">
                                                    <strong>{te.exercicio!.dsExercicio}</strong>
                                                    <span>Prescrito: {formatExerciseMeta(te) || '-'}</span>
                                                </div>

                                                <label className="workout-log-field">
                                                    <span>Séries</span>
                                                    <input
                                                        defaultValue={execucao?.nrSeriesFeitas ?? ''}
                                                        min="0"
                                                        onBlur={(event) =>
                                                            void saveExecution(te.id, {
                                                                nrSeriesFeitas: Number(event.target.value || 0),
                                                            })
                                                        }
                                                        placeholder={String(te.nrSeries ?? 0)}
                                                        type="number"
                                                    />
                                                </label>

                                                <label className="workout-log-field">
                                                    <span>Carga</span>
                                                    <input
                                                        defaultValue={
                                                            execucao?.vlCarga === null || execucao?.vlCarga === undefined
                                                                ? ''
                                                                : String(execucao.vlCarga)
                                                        }
                                                        min="0"
                                                        onBlur={(event) =>
                                                            void saveExecution(te.id, {
                                                                vlCarga: event.target.value === '' ? null : event.target.value,
                                                            })
                                                        }
                                                        placeholder={String(te.qtPeso ?? 0)}
                                                        step="0.5"
                                                        type="number"
                                                    />
                                                </label>

                                                <button
                                                    className={`workout-log-done ${concluido ? 'active' : ''}`}
                                                    disabled={savingExerciseId === te.id}
                                                    onClick={() =>
                                                        void saveExecution(te.id, { boConcluido: !concluido })
                                                    }
                                                    type="button"
                                                >
                                                    {concluido ? 'Feito' : 'Marcar'}
                                                </button>
                                            </li>
                                        );
                                    })}
                            </ul>
                        </section>
                    ) : null}
                </section>
            ) : null}
        </div>
        </>
    );
}
