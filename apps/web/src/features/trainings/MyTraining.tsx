'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDateDisplay } from '../../shared/registration/registrationHelpers';
import type { Exercise, StudentTraining, TrainingExercise, TrainingMethod } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, getApiError } from '../../shared/api/apiFetch';

type MyTrainingProps = {
    studentId: number | null;
    studentName: string;
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

function formatDateTimeDisplay(value: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return formatDateDisplay(value);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

export function MyTraining({ studentId, studentName }: MyTrainingProps) {
    const [studentTrainings, setStudentTrainings] = useState<StudentTraining[]>([]);
    const [selectedStudentTraining, setSelectedStudentTraining] = useState<StudentTraining | null>(null);
    const [selectedSequenceId, setSelectedSequenceId] = useState('');
    const [selectedTrainingExercises, setSelectedTrainingExercises] = useState<TrainingExercise[]>([]);
    const [checkIns, setCheckIns] = useState<StudentCheckIn[]>([]);
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [trainingMethods, setTrainingMethods] = useState<TrainingMethod[]>([]);
    const [isLoadingTrainings, setIsLoadingTrainings] = useState(false);
    const [isLoadingExercises, setIsLoadingExercises] = useState(false);
    const [isLoadingCheckIns, setIsLoadingCheckIns] = useState(false);
    const [isStartingWorkout, setIsStartingWorkout] = useState(false);
    const [feedback, setFeedback] = useState('');
    const exercisesAbortRef = useRef<AbortController | null>(null);
    const lastCheckIn = checkIns[0] ?? null;
    const lastCheckInSequenceId = lastCheckIn?.idAlunoTreinosSequencia ?? null;
    const lastCheckInSequenceOrder = lastCheckIn?.alunoTreinoSequencia?.nrOrdem ?? null;

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

    function getExerciseName(exerciseId: number | null) {
        return exercises.find((ex) => ex.id === exerciseId)?.dsExercicio ?? '-';
    }

    function getMethodName(methodId: number | null) {
        return trainingMethods.find((m) => m.id === methodId)?.nmMetodoTreino ?? '-';
    }

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
                await getApiError(response, 'Nao foi possivel carregar o ultimo treino.');
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
            const [exercisesResponse, methodsResponse] = await Promise.all([
                fetch(`/api/proxy/trainings/${trainingId}/related/exercises`, { signal }),
                exercises.length > 0 ? Promise.resolve(null) : fetch(`/api/proxy/exercises`, { signal }),
                trainingMethods.length > 0 ? Promise.resolve(null) : fetch(`/api/proxy/training-methods`, { signal }),
            ]);

            if (!exercisesResponse.ok) {
                await getApiError(exercisesResponse, 'Não foi possível carregar os exercícios.');
            }

            const trainingExercises = ((await exercisesResponse.json()) as TrainingExercise[])
                .filter((te) => te.boInativo === 0)
                .sort((a, b) => a.nrOrdem !== b.nrOrdem ? a.nrOrdem - b.nrOrdem : a.id - b.id);

            setSelectedTrainingExercises(trainingExercises);

            if (exercises.length === 0) {
                const [exResp, mtResp] = await Promise.all([
                    fetch('/api/proxy/exercises', { signal }),
                    fetch('/api/proxy/training-methods', { signal }),
                ]);
                if (exResp.ok) setExercises((await exResp.json()) as Exercise[]);
                if (mtResp.ok) setTrainingMethods((await mtResp.json()) as TrainingMethod[]);
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setSelectedTrainingExercises([]);
        } finally {
            setIsLoadingExercises(false);
        }
    }

    async function loadLookups() {
        if (exercises.length > 0 && trainingMethods.length > 0) return;

        const [exResp, mtResp] = await Promise.all([
            fetch('/api/proxy/exercises'),
            fetch('/api/proxy/training-methods'),
        ]);

        if (exResp.ok) setExercises((await exResp.json()) as Exercise[]);
        if (mtResp.ok) setTrainingMethods((await mtResp.json()) as TrainingMethod[]);
    }

    useEffect(() => {
        void loadTrainings();
        void loadCheckIns();
        void loadLookups();
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
    }, [activeTrainings, selectedStudentTraining]);

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
                    boInativo: 0,
                }),
            });

            if (!response.ok) {
                await getApiError(response, 'Nao foi possivel iniciar o treino.');
            }

            const checkIn = (await response.json()) as StudentCheckIn;
            setCheckIns((current) => [checkIn, ...current]);
            setFeedback('Treino iniciado com sucesso.');
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Erro ao iniciar treino.');
        } finally {
            setIsStartingWorkout(false);
        }
    }

    if (!studentId) {
        return (
            <div className="form-view">
                <div className="form-heading">
                    <p className="section-label">Meu Treino</p>
                    <h2>Sem acesso</h2>
                    <p>Faça login como aluno para visualizar seu treino.</p>
                </div>
            </div>
        );
    }

    const workoutStartTarget = getWorkoutStartTarget();

    return (
        <div className="form-view workout-assembly-view">
            <div className="form-heading">
                <p className="section-label">Meu Treino</p>
                <h2>{studentName}</h2>
                <p>Confira aqui seus treinos ativos e os exercícios de cada um.</p>
            </div>

            {feedback ? <div className="form-feedback">{feedback}</div> : null}

            <section className="my-training-start-panel" aria-label="Inicio do treino">
                <div className="my-training-last-card">
                    <p className="section-label">Ultimo treino realizado</p>
                    {isLoadingCheckIns ? (
                        <div className="form-hint">Carregando ultimo treino...</div>
                    ) : lastCheckIn ? (
                        <div className="my-training-last-grid">
                            <div>
                                <span>Treino</span>
                                <strong>{getLastWorkoutName()}</strong>
                            </div>
                            <div>
                                <span>Sequencia</span>
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
                        <label htmlFor="selectedWorkoutSequence">Treino - sequencia</label>
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

                <div className="product-table" role="table" aria-label="Meus treinos">
                    <div className="product-row my-training-row header" role="row">
                        <span role="columnheader">Treino</span>
                        <span role="columnheader">Profissional</span>
                        <span role="columnheader">Sequência</span>
                        <span role="columnheader">Cadastro</span>
                        <span role="columnheader">Ultimo</span>
                    </div>

                    {isLoadingTrainings ? (
                        <div className="empty-row">Carregando treinos...</div>
                    ) : null}

                    {!isLoadingTrainings && activeTrainings.length === 0 ? (
                        <div className="empty-row">Nenhum treino ativo encontrado.</div>
                    ) : null}

                    {!isLoadingTrainings
                        ? activeTrainings.map((st) => (
                            <button
                                className={`product-row my-training-row selectable ${st.id === selectedStudentTraining?.id ? 'selected' : ''} ${isLastCheckInTraining(st) ? 'last-check-in' : ''}`}
                                key={st.id}
                                onClick={() => handleSelectTraining(st)}
                                role="row"
                                type="button"
                            >
                                <span role="cell">{st.treino?.dsTreino ?? '-'}</span>
                                <span role="cell">{getEmployeeName(st)}</span>
                                <span role="cell">{getSequenceLabel(st)}</span>
                                <span role="cell">{st.dtCadastro ? formatDateDisplay(st.dtCadastro) : '-'}</span>
                                <span role="cell">
                                    {isLastCheckInTraining(st) ? (
                                        <span className="status-badge pending">Ultimo check-in</span>
                                    ) : (
                                        '-'
                                    )}
                                </span>
                            </button>
                        ))
                        : null}
                </div>
            </section>

            {selectedStudentTraining ? (
                <section className="training-exercises-grid exercise-grid-animated" key={selectedStudentTraining.id}>
                    <div className="grid-toolbar">
                        <h3>
                            Exercícios — {selectedStudentTraining.treino?.dsTreino ?? 'Treino'}
                        </h3>
                    </div>

                    <div className="product-table" role="table" aria-label="Exercícios do treino">
                        <div className="product-row training-exercise-row header" role="row">
                            <span role="columnheader">Ordem</span>
                            <span role="columnheader">Exercício</span>
                            <span role="columnheader">Método</span>
                            <span role="columnheader">Séries</span>
                            <span role="columnheader">Repetições</span>
                            <span role="columnheader">Descanso</span>
                        </div>

                        {isLoadingExercises ? (
                            <div className="empty-row">Carregando exercícios...</div>
                        ) : null}

                        {!isLoadingExercises && selectedTrainingExercises.length === 0 ? (
                            <div className="empty-row">Nenhum exercício vinculado a este treino.</div>
                        ) : null}

                        {!isLoadingExercises
                            ? selectedTrainingExercises.map((te) => (
                                <div className="product-row training-exercise-row" key={te.id} role="row">
                                    <span role="cell">{te.nrOrdem || '-'}</span>
                                    <span role="cell">{getExerciseName(te.idExercicio)}</span>
                                    <span role="cell">{getMethodName(te.idMetodoTreino)}</span>
                                    <span role="cell">{te.nrSeries}</span>
                                    <span role="cell">{te.nrRepeticoes}</span>
                                    <span role="cell">{te.qtDescanso}</span>
                                </div>
                            ))
                            : null}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
