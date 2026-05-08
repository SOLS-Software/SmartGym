'use client';

import { useEffect, useState } from 'react';
import { formatDateDisplay } from './registration-helpers';
import type { Exercise, StudentTraining, TrainingExercise, TrainingMethod } from './registration-types';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

type MyTrainingProps = {
  studentId: number | null;
  studentName: string;
};

export function MyTraining({ studentId, studentName }: MyTrainingProps) {
  const [studentTrainings, setStudentTrainings] = useState<StudentTraining[]>([]);
  const [selectedStudentTraining, setSelectedStudentTraining] = useState<StudentTraining | null>(null);
  const [selectedTrainingExercises, setSelectedTrainingExercises] = useState<TrainingExercise[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [trainingMethods, setTrainingMethods] = useState<TrainingMethod[]>([]);
  const [isLoadingTrainings, setIsLoadingTrainings] = useState(false);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [feedback, setFeedback] = useState('');

  const activeTrainings = studentTrainings
    .filter((st) => st.boInativo === 0)
    .sort((a, b) => {
      const aOrder = a.alunoTreinosSequencias?.[0]?.nrOrdem ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.alunoTreinosSequencias?.[0]?.nrOrdem ?? Number.MAX_SAFE_INTEGER;
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

  async function loadTrainings() {
    if (!studentId) {
      setStudentTrainings([]);
      return;
    }

    try {
      setIsLoadingTrainings(true);
      const response = await fetch(`${apiUrl}/students/${studentId}/related/trainings`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar os treinos.');
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

  async function loadExercises(trainingId: number | null) {
    if (!trainingId) {
      setSelectedTrainingExercises([]);
      return;
    }

    try {
      setIsLoadingExercises(true);
      const [exercisesResponse, methodsResponse] = await Promise.all([
        fetch(`${apiUrl}/trainings/${trainingId}/related/exercises`),
        exercises.length > 0 ? Promise.resolve(null) : fetch(`${apiUrl}/exercises`),
        trainingMethods.length > 0 ? Promise.resolve(null) : fetch(`${apiUrl}/training-methods`),
      ]);

      if (!exercisesResponse.ok) {
        throw new Error('Não foi possível carregar os exercícios.');
      }

      const trainingExercises = ((await exercisesResponse.json()) as TrainingExercise[])
        .filter((te) => te.boInativo === 0)
        .sort((a, b) => a.nrOrdem !== b.nrOrdem ? a.nrOrdem - b.nrOrdem : a.id - b.id);

      setSelectedTrainingExercises(trainingExercises);

      if (exercisesResponse && !exercisesResponse.ok) return;

      if (exercises.length === 0) {
        const [exResp, mtResp] = await Promise.all([
          fetch(`${apiUrl}/exercises`),
          fetch(`${apiUrl}/training-methods`),
        ]);
        if (exResp.ok) setExercises((await exResp.json()) as Exercise[]);
        if (mtResp.ok) setTrainingMethods((await mtResp.json()) as TrainingMethod[]);
      }
    } catch (error) {
      setSelectedTrainingExercises([]);
    } finally {
      setIsLoadingExercises(false);
    }
  }

  async function loadLookups() {
    if (exercises.length > 0 && trainingMethods.length > 0) return;

    const [exResp, mtResp] = await Promise.all([
      fetch(`${apiUrl}/exercises`),
      fetch(`${apiUrl}/training-methods`),
    ]);

    if (exResp.ok) setExercises((await exResp.json()) as Exercise[]);
    if (mtResp.ok) setTrainingMethods((await mtResp.json()) as TrainingMethod[]);
  }

  useEffect(() => {
    void loadTrainings();
    void loadLookups();
  }, [studentId]);

  function handleSelectTraining(st: StudentTraining) {
    if (selectedStudentTraining?.id === st.id) {
      setSelectedStudentTraining(null);
      setSelectedTrainingExercises([]);
      return;
    }

    setSelectedStudentTraining(st);
    void loadExercises(st.idTreino);
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

  return (
    <div className="form-view workout-assembly-view">
      <div className="form-heading">
        <p className="section-label">Meu Treino</p>
        <h2>{studentName}</h2>
        <p>Confira aqui seus treinos ativos e os exercícios de cada um.</p>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

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
                className={`product-row my-training-row selectable ${st.id === selectedStudentTraining?.id ? 'selected' : ''}`}
                key={st.id}
                onClick={() => handleSelectTraining(st)}
                role="row"
                type="button"
              >
                <span role="cell">{st.treino?.dsTreino ?? '-'}</span>
                <span role="cell">{getEmployeeName(st)}</span>
                <span role="cell">{getSequenceLabel(st)}</span>
                <span role="cell">{st.dtCadastro ? formatDateDisplay(st.dtCadastro) : '-'}</span>
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
