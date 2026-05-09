'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GRID_PAGE_SIZE, GridPagination, formatCpf, formatDateDisplay, paginateItems } from './registration-helpers';
import type { Employee, Exercise, Student, StudentTraining, Training, TrainingExercise, TrainingMethod } from './registration-types';
import { apiFetch as fetch, apiUrl } from './api-fetch';

type StudentTrainingAssemblyProps = {
  loggedEmployeeId: number | null;
  loggedEmployeeName: string;
};

export function StudentTrainingAssembly({
  loggedEmployeeId,
  loggedEmployeeName,
}: StudentTrainingAssemblyProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentTrainings, setStudentTrainings] = useState<StudentTraining[]>([]);
  const [selectedTrainingExercises, setSelectedTrainingExercises] = useState<TrainingExercise[]>([]);
  const [groupedTrainingExercises, setGroupedTrainingExercises] = useState<Record<number, TrainingExercise[]>>({});
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [trainingMethods, setTrainingMethods] = useState<TrainingMethod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [studentsPage, setStudentsPage] = useState(1);
  const [studentTrainingsPage, setStudentTrainingsPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [studentTrainingSearchTerm, setStudentTrainingSearchTerm] = useState('');
  const [trainingOptionSearchTerm, setTrainingOptionSearchTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedStudentTrainingId, setSelectedStudentTrainingId] = useState<number | null>(null);
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<string[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isStudentTrainingActive, setIsStudentTrainingActive] = useState(true);
  const [shouldCreateSequence, setShouldCreateSequence] = useState(true);
  const [showInactiveStudentTrainings, setShowInactiveStudentTrainings] = useState(false);
  const [isCreatingStudentTraining, setIsCreatingStudentTraining] = useState(false);
  const [isReorderingSequence, setIsReorderingSequence] = useState(false);
  const [sequenceDraftIds, setSequenceDraftIds] = useState<number[]>([]);
  const [draggedSequenceId, setDraggedSequenceId] = useState<number | null>(null);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isLoadingStudentTrainings, setIsLoadingStudentTrainings] = useState(false);
  const [isLoadingSelectedTrainingExercises, setIsLoadingSelectedTrainingExercises] = useState(false);
  const [isLoadingGroupedTrainingExercises, setIsLoadingGroupedTrainingExercises] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [studentTrainingFeedback, setStudentTrainingFeedback] = useState('');
  const studentTrainingsAbortRef = useRef<AbortController | null>(null);
  const selectedExercisesAbortRef = useRef<AbortController | null>(null);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const isStudentTrainingFormEnabled = Boolean(selectedStudentId) && isCreatingStudentTraining;
  const isSaveEnabled = isStudentTrainingFormEnabled && Boolean(loggedEmployeeId) && selectedTrainingIds.length > 0;
  const filteredStudents = students.filter((student) => {
    const search = searchTerm.toLowerCase();

    return (
      student.nmAluno.toLowerCase().includes(search) ||
      student.caCPF.includes(searchTerm.replace(/\D/g, '')) ||
      student.anEmail.toLowerCase().includes(search) ||
      (student.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const filteredStudentTrainings = studentTrainings
    .filter((studentTraining) => {
      const search = studentTrainingSearchTerm.toLowerCase();
      const trainingName = studentTraining.treino?.dsTreino ?? getTrainingName(studentTraining.idTreino);
      const employeeName = studentTraining.funcionario?.nmFuncionario ?? getEmployeeName(studentTraining.idFuncionario);
      const sequenceLabel = getStudentTrainingSequenceLabel(studentTraining);
      const status = studentTraining.boInativo === 0 ? 'ativo' : 'inativo';

      if (!showInactiveStudentTrainings && studentTraining.boInativo !== 0) {
        return false;
      }

      return (
        trainingName.toLowerCase().includes(search) ||
        employeeName.toLowerCase().includes(search) ||
        sequenceLabel.toLowerCase().includes(search) ||
        status.includes(search)
      );
    })
    .sort(compareStudentTrainingAsc);
  const filteredTrainingOptions = trainings.filter((training) => {
    const search = trainingOptionSearchTerm.toLowerCase();

    return (
      selectedTrainingIds.includes(String(training.id)) ||
      training.dsTreino.toLowerCase().includes(search)
    );
  });
  const lastActiveSequence = studentTrainings.reduce((maxSequence, studentTraining) => {
    if (studentTraining.boInativo !== 0) {
      return maxSequence;
    }

    const sequence = getSequenceSortValue(studentTraining);

    return Number.isFinite(sequence) && sequence !== Number.MAX_SAFE_INTEGER
      ? Math.max(maxSequence, sequence)
      : maxSequence;
  }, 0);
  const temporaryStudentTrainings: StudentTraining[] = selectedTrainingIds.map((trainingId, index) => ({
    id: -Number(trainingId),
    idAluno: selectedStudentId,
    idFuncionario: loggedEmployeeId,
    idTreino: Number(trainingId),
    dtCadastro: '',
    dtAlteracao: '',
    boInativo: 0,
    funcionario: null,
    treino: trainings.find((training) => String(training.id) === trainingId) ?? null,
    alunoTreinosSequencias: shouldCreateSequence
      ? [
        {
          id: -(index + 1),
          idAlunoTreino: -Number(trainingId),
          nrOrdem: lastActiveSequence + index + 1,
          boInativo: 0,
        },
      ]
      : [],
  }));
  const displayedStudentTrainings = [...filteredStudentTrainings, ...temporaryStudentTrainings].sort(
    compareStudentTrainingAsc,
  );
  const selectedStudentTraining =
    displayedStudentTrainings.find((studentTraining) => studentTraining.id === selectedStudentTrainingId) ?? null;
  const studentsTotalPages = Math.max(1, Math.ceil(filteredStudents.length / GRID_PAGE_SIZE));
  const studentTrainingsTotalPages = Math.max(1, Math.ceil(displayedStudentTrainings.length / GRID_PAGE_SIZE));
  const paginatedStudents = paginateItems(filteredStudents, studentsPage);
  const paginatedStudentTrainings = paginateItems(displayedStudentTrainings, studentTrainingsPage);
  const activeStudentTrainings = studentTrainings
    .filter((studentTraining) => studentTraining.boInativo === 0)
    .sort(compareStudentTrainingAsc);
  const sequenceDraftRecords = sequenceDraftIds
    .map((id) => studentTrainings.find((studentTraining) => studentTraining.id === id))
    .filter((studentTraining): studentTraining is StudentTraining => Boolean(studentTraining));
  const visibleStudentTrainingRows = isReorderingSequence ? sequenceDraftRecords : paginatedStudentTrainings;

  async function loadStudents() {
    try {
      setIsLoadingStudents(true);
      const response = await fetch(`${apiUrl}/students`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar os alunos.');
      }

      setStudents((await response.json()) as Student[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar alunos.');
    } finally {
      setIsLoadingStudents(false);
    }
  }

  async function loadLookups() {
    try {
      const [trainingsResponse, employeesResponse, exercisesResponse, trainingMethodsResponse] = await Promise.all([
        fetch(`${apiUrl}/trainings`),
        fetch(`${apiUrl}/employees`),
        fetch(`${apiUrl}/exercises`),
        fetch(`${apiUrl}/training-methods`),
      ]);

      if (!trainingsResponse.ok || !employeesResponse.ok || !exercisesResponse.ok || !trainingMethodsResponse.ok) {
        throw new Error('Não foi possível carregar treinos, profissionais e exercícios.');
      }

      setTrainings(((await trainingsResponse.json()) as Training[]).filter((training) => training.boInativo === 0));
      setEmployees(((await employeesResponse.json()) as Employee[]).filter((employee) => employee.boInativo === 0));
      setExercises(((await exercisesResponse.json()) as Exercise[]).filter((exercise) => exercise.boInativo === 0));
      setTrainingMethods((await trainingMethodsResponse.json()) as TrainingMethod[]);
    } catch (error) {
      setStudentTrainingFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadStudentTrainings(studentId = selectedStudentId) {
    if (!studentId) {
      setStudentTrainings([]);
      setGroupedTrainingExercises({});
      setIsLoadingStudentTrainings(false);
      return;
    }

    studentTrainingsAbortRef.current?.abort();
    const controller = new AbortController();
    studentTrainingsAbortRef.current = controller;

    try {
      setIsLoadingStudentTrainings(true);
      const response = await fetch(`${apiUrl}/students/${studentId}/related/trainings`, { signal: controller.signal });

      if (!response.ok) {
        throw new Error('Não foi possível carregar os treinos do aluno.');
      }

      const data = (await response.json()) as StudentTraining[];
      setStudentTrainings(data);
      void loadGroupedTrainingExercises(data);
      setStudentTrainingFeedback('');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStudentTrainings([]);
      setGroupedTrainingExercises({});
      setStudentTrainingFeedback(error instanceof Error ? error.message : 'Erro ao carregar treinos do aluno.');
    } finally {
      setIsLoadingStudentTrainings(false);
    }
  }

  async function loadGroupedTrainingExercises(records: StudentTraining[]) {
    const trainingIds = Array.from(
      new Set(
        records
          .filter((studentTraining) => studentTraining.boInativo === 0 && studentTraining.idTreino)
          .map((studentTraining) => Number(studentTraining.idTreino)),
      ),
    );

    if (trainingIds.length === 0) {
      setGroupedTrainingExercises({});
      setIsLoadingGroupedTrainingExercises(false);
      return;
    }

    try {
      setIsLoadingGroupedTrainingExercises(true);
      const entries = await Promise.all(
        trainingIds.map(async (trainingId) => {
          const response = await fetch(`${apiUrl}/trainings/${trainingId}/related/exercises`);

          if (!response.ok) {
            throw new Error('Não foi possível carregar os exercícios dos treinos.');
          }

          const records = ((await response.json()) as TrainingExercise[])
            .filter((trainingExercise) => trainingExercise.boInativo === 0)
            .sort(compareTrainingExerciseAsc);

          return [trainingId, records] as const;
        }),
      );

      setGroupedTrainingExercises(Object.fromEntries(entries));
    } catch (error) {
      setGroupedTrainingExercises({});
      setStudentTrainingFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios dos treinos.');
    } finally {
      setIsLoadingGroupedTrainingExercises(false);
    }
  }

  async function loadTrainingExercisesIntoGroup(trainingId: number) {
    if (groupedTrainingExercises[trainingId]) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/trainings/${trainingId}/related/exercises`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar os exercícios do treino.');
      }

      const records = ((await response.json()) as TrainingExercise[])
        .filter((trainingExercise) => trainingExercise.boInativo === 0)
        .sort(compareTrainingExerciseAsc);

      setGroupedTrainingExercises((current) => ({
        ...current,
        [trainingId]: records,
      }));
    } catch (error) {
      setStudentTrainingFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios do treino.');
    }
  }

  async function loadSelectedTrainingExercises(trainingId: number | null) {
    if (!trainingId) {
      setSelectedTrainingExercises([]);
      setIsLoadingSelectedTrainingExercises(false);
      return;
    }

    selectedExercisesAbortRef.current?.abort();
    const controller = new AbortController();
    selectedExercisesAbortRef.current = controller;
    const signal = controller.signal;

    try {
      setIsLoadingSelectedTrainingExercises(true);
      const [trainingExercisesResponse, exercisesResponse, trainingMethodsResponse] = await Promise.all([
        fetch(`${apiUrl}/trainings/${trainingId}/related/exercises`, { signal }),
        exercises.length > 0 ? Promise.resolve(null) : fetch(`${apiUrl}/exercises`, { signal }),
        trainingMethods.length > 0 ? Promise.resolve(null) : fetch(`${apiUrl}/training-methods`, { signal }),
      ]);

      if (!trainingExercisesResponse.ok) {
        throw new Error('Não foi possível carregar os exercícios do treino.');
      }

      if (exercisesResponse && !exercisesResponse.ok) {
        throw new Error('Não foi possível carregar a lista de exercícios.');
      }

      if (trainingMethodsResponse && !trainingMethodsResponse.ok) {
        throw new Error('Não foi possível carregar métodos de treino.');
      }

      setSelectedTrainingExercises(
        ((await trainingExercisesResponse.json()) as TrainingExercise[])
          .filter((trainingExercise) => trainingExercise.boInativo === 0)
          .sort(compareTrainingExerciseAsc),
      );

      if (exercisesResponse) {
        setExercises(((await exercisesResponse.json()) as Exercise[]).filter((exercise) => exercise.boInativo === 0));
      }

      if (trainingMethodsResponse) {
        setTrainingMethods((await trainingMethodsResponse.json()) as TrainingMethod[]);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setSelectedTrainingExercises([]);
      setStudentTrainingFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios do treino.');
    } finally {
      setIsLoadingSelectedTrainingExercises(false);
    }
  }

  useEffect(() => {
    void loadStudents();
    void loadLookups();
  }, []);

  useEffect(() => {
    setStudentsPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (studentsPage > studentsTotalPages) {
      setStudentsPage(studentsTotalPages);
    }
  }, [studentsPage, studentsTotalPages]);

  useEffect(() => {
    setStudentTrainingsPage(1);
  }, [studentTrainingSearchTerm, selectedStudentId, showInactiveStudentTrainings, selectedTrainingIds]);

  useEffect(() => {
    if (studentTrainingsPage > studentTrainingsTotalPages) {
      setStudentTrainingsPage(studentTrainingsTotalPages);
    }
  }, [studentTrainingsPage, studentTrainingsTotalPages]);

  function getTrainingName(trainingId: number | null) {
    return trainings.find((training) => training.id === trainingId)?.dsTreino ?? '-';
  }

  function getEmployeeName(employeeId: number | null) {
    return employees.find((employee) => employee.id === employeeId)?.nmFuncionario ?? '-';
  }

  function getExerciseName(exerciseId: number | null) {
    return exercises.find((exercise) => exercise.id === exerciseId)?.dsExercicio ?? '-';
  }

  function getTrainingMethodName(trainingMethodId: number | null) {
    return trainingMethods.find((trainingMethod) => trainingMethod.id === trainingMethodId)?.nmMetodoTreino ?? '-';
  }

  function handleSelectStudent(student: Student) {
    setSelectedStudentId(student.id);
    setSelectedStudentTrainingId(null);
    setSelectedTrainingExercises([]);
    setSelectedTrainingIds([]);
    setTrainingOptionSearchTerm('');
    setSelectedEmployeeId(loggedEmployeeId ? String(loggedEmployeeId) : '');
    setIsCreatingStudentTraining(false);
    setIsReorderingSequence(false);
    setSequenceDraftIds([]);
    setIsStudentTrainingActive(true);
    setShouldCreateSequence(true);
    setStudentTrainingSearchTerm('');
    setFeedback('');
    setStudentTrainingFeedback('');
    void loadStudentTrainings(student.id);
  }

  function handleNewStudentTraining() {
    setSelectedStudentTrainingId(null);
    setSelectedTrainingExercises([]);
    setSelectedTrainingIds([]);
    setTrainingOptionSearchTerm('');
    setSelectedEmployeeId(loggedEmployeeId ? String(loggedEmployeeId) : '');
    setIsCreatingStudentTraining(true);
    setIsReorderingSequence(false);
    setIsStudentTrainingActive(true);
    setShouldCreateSequence(true);
    setStudentTrainingFeedback(loggedEmployeeId ? '' : 'Entre como profissional para montar treino.');
  }

  function handleSelectStudentTraining(studentTraining: StudentTraining) {
    if (selectedStudentTrainingId === studentTraining.id) {
      setSelectedStudentTrainingId(null);
      setTrainingOptionSearchTerm('');
      setSelectedEmployeeId(loggedEmployeeId ? String(loggedEmployeeId) : '');
      setIsStudentTrainingActive(true);
      setShouldCreateSequence(true);
      setSelectedTrainingExercises([]);
      setStudentTrainingFeedback('');
      return;
    }

    setSelectedStudentTrainingId(studentTraining.id);
    setTrainingOptionSearchTerm('');
    setSelectedEmployeeId(studentTraining.idFuncionario ? String(studentTraining.idFuncionario) : '');
    if (studentTraining.id < 0) {
      setIsCreatingStudentTraining(true);
    }
    setIsStudentTrainingActive(studentTraining.boInativo === 0);
    setStudentTrainingFeedback('');
    void loadSelectedTrainingExercises(studentTraining.idTreino);
  }

  function clearStudentTrainingForm() {
    setSelectedStudentTrainingId(null);
    setSelectedTrainingExercises([]);
    setSelectedTrainingIds([]);
    setTrainingOptionSearchTerm('');
    setSelectedEmployeeId(loggedEmployeeId ? String(loggedEmployeeId) : '');
    setIsCreatingStudentTraining(false);
    setIsReorderingSequence(false);
    setSequenceDraftIds([]);
    setIsStudentTrainingActive(true);
    setShouldCreateSequence(true);
    setStudentTrainingFeedback('');
  }

  function handleToggleTrainingOption(trainingId: number) {
    const nextTrainingId = String(trainingId);

    if (!isCreatingStudentTraining) {
      setSelectedTrainingIds([nextTrainingId]);
      void loadTrainingExercisesIntoGroup(trainingId);
      return;
    }

    setSelectedTrainingIds((current) =>
      current.includes(nextTrainingId)
        ? current.filter((currentTrainingId) => currentTrainingId !== nextTrainingId)
        : [...current, nextTrainingId],
    );
    void loadTrainingExercisesIntoGroup(trainingId);
  }

  function getSequenceSortValue(studentTraining: StudentTraining) {
    const firstSequence = studentTraining.alunoTreinosSequencias?.[0];

    return firstSequence ? firstSequence.nrOrdem : Number.MAX_SAFE_INTEGER;
  }

  function compareStudentTrainingAsc(first: StudentTraining, second: StudentTraining) {
    const firstOrder = getSequenceSortValue(first);
    const secondOrder = getSequenceSortValue(second);

    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    const firstName = first.treino?.dsTreino ?? getTrainingName(first.idTreino);
    const secondName = second.treino?.dsTreino ?? getTrainingName(second.idTreino);
    const nameComparison = firstName.localeCompare(secondName, 'pt-BR');

    return nameComparison || first.id - second.id;
  }

  function compareTrainingExerciseAsc(first: TrainingExercise, second: TrainingExercise) {
    if (first.nrOrdem !== second.nrOrdem) {
      return first.nrOrdem - second.nrOrdem;
    }

    const firstName = getExerciseName(first.idExercicio);
    const secondName = getExerciseName(second.idExercicio);
    const nameComparison = firstName.localeCompare(secondName, 'pt-BR');

    return nameComparison || first.id - second.id;
  }

  function handleStartReorderSequence() {
    const orderedIds = [...activeStudentTrainings]
      .sort((first, second) => {
        const firstOrder = getSequenceSortValue(first);
        const secondOrder = getSequenceSortValue(second);

        if (firstOrder !== secondOrder) {
          return firstOrder - secondOrder;
        }

        return first.id - second.id;
      })
      .map((studentTraining) => studentTraining.id);

    if (orderedIds.length === 0) {
      setStudentTrainingFeedback('Nenhum treino ativo para ordenar.');
      return;
    }

    setSequenceDraftIds(orderedIds);
    setIsReorderingSequence(true);
    setSelectedStudentTrainingId(null);
    setIsCreatingStudentTraining(false);
    setStudentTrainingFeedback('');
  }

  function moveSequenceDraftItem(sourceId: number, targetId: number) {
    if (sourceId === targetId) {
      return;
    }

    setSequenceDraftIds((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(sourceId);
      const targetIndex = next.indexOf(targetId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, sourceId);
      return next;
    });
  }

  async function handleSaveSequenceOrder() {
    if (!selectedStudentId) {
      setStudentTrainingFeedback('Selecione um aluno antes de salvar a sequência.');
      return;
    }

    if (sequenceDraftRecords.length === 0) {
      setStudentTrainingFeedback('Nenhum treino para ordenar.');
      return;
    }

    try {
      await persistSequenceOrder(sequenceDraftRecords);
      await loadStudentTrainings(selectedStudentId);
      setIsReorderingSequence(false);
      setSequenceDraftIds([]);
      setDraggedSequenceId(null);
      setStudentTrainingFeedback('Sequencia atualizada com sucesso.');
    } catch (error) {
      setStudentTrainingFeedback(error instanceof Error ? error.message : 'Erro ao salvar sequência.');
    }
  }

  async function persistSequenceOrder(records: StudentTraining[]) {
    if (!selectedStudentId) {
      throw new Error('Selecione um aluno antes de salvar a sequência.');
    }

    const responses = await Promise.all(
      records.map((studentTraining, index) =>
        fetch(`${apiUrl}/students/${selectedStudentId}/related/trainings/${studentTraining.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idFuncionario: studentTraining.idFuncionario ?? loggedEmployeeId,
            idTreino: studentTraining.idTreino,
            nrOrdemSequencia: index + 1,
            boInativo: studentTraining.boInativo,
          }),
        }),
      ),
    );
    const failedResponse = responses.find((response) => !response.ok);

    if (failedResponse) {
      const errorBody = (await failedResponse.json()) as { message?: string };
      throw new Error(errorBody.message ?? 'Não foi possível salvar a sequência.');
    }
  }

  function getStudentTrainingSequenceLabel(studentTraining: StudentTraining) {
    const sequences = studentTraining.alunoTreinosSequencias ?? [];

    if (sequences.length === 0) {
      return '-';
    }

    return sequences.map((sequence) => String(sequence.nrOrdem)).join(', ');
  }

  async function handleToggleStudentTrainingStatus(studentTraining: StudentTraining) {
    if (!selectedStudentId || studentTraining.id < 0) {
      return;
    }

    const nextInactive = studentTraining.boInativo === 0 ? 1 : 0;

    try {
      const response = await fetch(
        `${apiUrl}/students/${selectedStudentId}/related/trainings/${studentTraining.id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            boInativo: nextInactive,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível alterar o status.');
      }

      const activeRecordsAfterToggle =
        nextInactive === 1
          ? activeStudentTrainings.filter((record) => record.id !== studentTraining.id)
          : [...activeStudentTrainings, { ...studentTraining, boInativo: 0 }].sort(compareStudentTrainingAsc);

      if (activeRecordsAfterToggle.length > 0) {
        await persistSequenceOrder(activeRecordsAfterToggle);
      }

      await loadStudentTrainings(selectedStudentId);
      setSelectedStudentTrainingId(null);
      setSelectedTrainingExercises([]);
      setStudentTrainingFeedback(
        nextInactive === 1
          ? 'Treino inativado e sequência reorganizada.'
          : 'Treino ativado e sequência reorganizada.',
      );
    } catch (error) {
      setStudentTrainingFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveStudentTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedStudentId) {
      setStudentTrainingFeedback('Selecione um aluno antes de salvar.');
      return;
    }

    if (!loggedEmployeeId) {
      setStudentTrainingFeedback('Entre como profissional para montar treino.');
      return;
    }

    if (selectedTrainingIds.length === 0) {
      setStudentTrainingFeedback('Selecione pelo menos um treino.');
      return;
    }

    try {
      const endpoint = `${apiUrl}/students/${selectedStudentId}/related/trainings`;
      const trainingIdsToSave = selectedTrainingIds;
      const responses = await Promise.all(
        trainingIdsToSave.map((trainingId, index) => fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idFuncionario: loggedEmployeeId,
            idTreino: Number(trainingId),
            nrOrdemSequencia: shouldCreateSequence ? lastActiveSequence + index + 1 : null,
            boInativo: 0,
          }),
        })),
      );

      const failedResponse = responses.find((response) => !response.ok);

      if (failedResponse) {
        const errorBody = (await failedResponse.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o treino do aluno.');
      }

      const savedRecord = (await responses[0]?.json()) as StudentTraining | undefined;

      if (!savedRecord) {
        throw new Error('Não foi possível salvar o treino do aluno.');
      }

      await loadStudentTrainings(selectedStudentId);
      setSelectedStudentTrainingId(null);
      setIsCreatingStudentTraining(false);
      setSelectedTrainingIds([]);
      setSelectedTrainingExercises([]);
      setSelectedEmployeeId(loggedEmployeeId ? String(loggedEmployeeId) : '');
      setStudentTrainingFeedback(
        trainingIdsToSave.length > 1
          ? `${trainingIdsToSave.length} treinos do aluno salvos com sucesso.`
          : 'Treino do aluno salvo com sucesso.',
      );
    } catch (error) {
      setStudentTrainingFeedback(error instanceof Error ? error.message : 'Erro ao salvar treino do aluno.');
    }
  }

  return (
    <div className="form-view workout-assembly-view">
      <div className="form-heading">
        <p className="section-label">Montagem de treino</p>
      </div>

      <section className="workout-students-grid data-grid-section">
        <div className="grid-toolbar">
          <div className="child-grid-toolbar-label">
            <p className="section-label">Alunos cadastrados</p>
          </div>
          <div className="child-grid-toolbar-actions">
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar aluno"
                type="search"
                value={searchTerm}
              />
            </label>
          </div>
        </div>

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        <div className="product-table workout-students-table" key={`workout-students-${searchTerm}-${studentsPage}`} role="table" aria-label="Alunos cadastrados">
          <div className="product-row workout-student-row header" role="row">
            <span role="columnheader">Aluno</span>
            <span role="columnheader">CPF</span>
            <span role="columnheader">Email</span>
            <span role="columnheader">Status</span>
          </div>

          {isLoadingStudents ? <div className="empty-row">Carregando alunos...</div> : null}

          {!isLoadingStudents
            ? paginatedStudents.map((student) => (
              <button
                className={`product-row workout-student-row selectable ${student.id === selectedStudentId ? 'selected' : ''}`}
                key={student.id}
                onClick={() => handleSelectStudent(student)}
                role="row"
                type="button"
              >
                <span role="cell">{student.nmAluno}</span>
                <span role="cell">{formatCpf(student.caCPF)}</span>
                <span role="cell">{student.anEmail || '-'}</span>
                <span role="cell">
                  <span className={`status-badge ${student.boInativo === 0 ? 'active' : 'inactive'}`}>
                    {student.boInativo === 0 ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
              </button>
            ))
            : null}

          {!isLoadingStudents && filteredStudents.length === 0 ? (
            <div className="empty-row">Nenhum aluno encontrado.</div>
          ) : null}
        </div>

        <GridPagination
          onChange={setStudentsPage}
          page={studentsPage}
          totalItems={filteredStudents.length}
        />
      </section>

      {selectedStudent ? (
        <section className="workout-selected-area">
          <div className="workout-selected-header">
            <div>
              <p className="section-label">Aluno selecionado</p>
              <h3>{selectedStudent.nmAluno}</h3>
            </div>
            <span>{formatCpf(selectedStudent.caCPF)}</span>
          </div>

          <div className="workout-training-layout">
            <section className="data-grid-section workout-training-grid">
              <div className="grid-toolbar">
                <div className="child-grid-toolbar-label">
                  <p className="section-label">Treinos do aluno</p>
                </div>
                <div className="child-grid-toolbar-actions">
                  <label className="search-field">
                    <span>Pesquisar</span>
                    <input
                      onChange={(event) => setStudentTrainingSearchTerm(event.target.value)}
                      placeholder="Buscar treino"
                      type="search"
                      value={studentTrainingSearchTerm}
                    />
                  </label>
                  <label className="checkbox-field toolbar-checkbox-field">
                    <input
                      checked={showInactiveStudentTrainings}
                      onChange={(event) => setShowInactiveStudentTrainings(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Mostrar inativos</span>
                  </label>
                  <button
                    className="new-button"
                    disabled={!loggedEmployeeId}
                    onClick={handleNewStudentTraining}
                    type="button"
                  >
                    Novo
                  </button>
                  <button
                    className="secondary-button"
                    disabled={activeStudentTrainings.length === 0 || isReorderingSequence}
                    onClick={handleStartReorderSequence}
                    type="button"
                  >
                    {isReorderingSequence ? 'Reordenando' : 'Redefinir ordem'}
                  </button>
                  {isReorderingSequence ? (
                    <>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setIsReorderingSequence(false);
                          setSequenceDraftIds([]);
                          setDraggedSequenceId(null);
                        }}
                        type="button"
                      >
                        Cancelar
                      </button>
                      <button className="new-button" onClick={handleSaveSequenceOrder} type="button">
                        Salvar ordem
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="product-table" key={`student-trainings-${studentTrainingSearchTerm}-${studentTrainingsPage}-${showInactiveStudentTrainings}-${isReorderingSequence}`} role="table" aria-label="Treinos do aluno">
                <div className="product-row workout-training-row header" role="row">
                  <span role="columnheader">Treino</span>
                  <span role="columnheader">Profissional</span>
                  <span role="columnheader">Sequência</span>
                  <span role="columnheader">Cadastro</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Acao</span>
                </div>

                {isLoadingStudentTrainings ? <div className="empty-row">Carregando treinos...</div> : null}

                {!isLoadingStudentTrainings
                  ? visibleStudentTrainingRows.map((studentTraining, index) => (
                    <div
                      className={`product-row workout-training-row selectable ${studentTraining.id === selectedStudentTrainingId ? 'selected' : ''} ${isReorderingSequence ? 'draggable' : ''}`}
                      draggable={isReorderingSequence}
                      key={studentTraining.id}
                      onClick={() => handleSelectStudentTraining(studentTraining)}
                      onDragEnd={() => setDraggedSequenceId(null)}
                      onDragOver={(event) => {
                        if (isReorderingSequence) {
                          event.preventDefault();
                        }
                      }}
                      onDragStart={() => {
                        if (isReorderingSequence) {
                          setDraggedSequenceId(studentTraining.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (isReorderingSequence && draggedSequenceId) {
                          moveSequenceDraftItem(draggedSequenceId, studentTraining.id);
                        }
                      }}
                      role="row"
                    >
                      <span role="cell">{studentTraining.treino?.dsTreino ?? getTrainingName(studentTraining.idTreino)}</span>
                      <span role="cell">
                        {studentTraining.funcionario?.nmFuncionario ?? getEmployeeName(studentTraining.idFuncionario)}
                      </span>
                      <span role="cell">{isReorderingSequence ? index + 1 : getStudentTrainingSequenceLabel(studentTraining)}</span>
                      <span role="cell">{studentTraining.dtCadastro ? formatDateDisplay(studentTraining.dtCadastro) : '-'}</span>
                      <span role="cell">
                        <span className={`status-badge ${studentTraining.id < 0 ? 'pending' : studentTraining.boInativo === 0 ? 'active' : 'inactive'}`}>
                          {studentTraining.id < 0 ? 'Pendente' : studentTraining.boInativo === 0 ? 'Ativo' : 'Inativo'}
                        </span>
                      </span>
                      <span role="cell">
                        {studentTraining.id < 0 ? (
                          <span className="field-hint">Não salvo</span>
                        ) : (
                          <button
                            className={`grid-status-toggle ${studentTraining.boInativo === 0 ? 'active' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleToggleStudentTrainingStatus(studentTraining);
                            }}
                            type="button"
                          >
                            {studentTraining.boInativo === 0 ? 'Inativar' : 'Ativar'}
                          </button>
                        )}
                      </span>
                    </div>
                  ))
                  : null}

                {!isLoadingStudentTrainings && displayedStudentTrainings.length === 0 ? (
                  <div className="empty-row">Nenhum treino vinculado a este aluno.</div>
                ) : null}
              </div>

              {!isReorderingSequence ? (
                <GridPagination
                  onChange={setStudentTrainingsPage}
                  page={studentTrainingsPage}
                  totalItems={displayedStudentTrainings.length}
                />
              ) : null}

              {selectedStudentTraining ? (
                <section className="training-exercises-grid">
                  <div className="grid-toolbar">
                    <div className="child-grid-toolbar-label">
                      <p className="section-label">
                        Exercícios de {selectedStudentTraining.treino?.dsTreino ?? getTrainingName(selectedStudentTraining.idTreino)}
                      </p>
                    </div>
                  </div>

                  <div className="product-table exercise-grid-animated" key={selectedStudentTrainingId ?? 'empty'} role="table" aria-label="Exercícios vinculados ao treino">
                    <div className="product-row training-exercise-row header" role="row">
                      <span role="columnheader">Ordem</span>
                      <span role="columnheader">Exercicio</span>
                      <span role="columnheader">Método</span>
                      <span role="columnheader">Series</span>
                      <span role="columnheader">Repeticoes</span>
                      <span role="columnheader">Descanso</span>
                    </div>

                    {isLoadingSelectedTrainingExercises ? (
                      <div className="empty-row">Carregando exercícios...</div>
                    ) : null}

                    {!isLoadingSelectedTrainingExercises
                      ? selectedTrainingExercises.map((trainingExercise) => (
                        <div className="product-row training-exercise-row" key={trainingExercise.id} role="row">
                          <span role="cell">{trainingExercise.nrOrdem || '-'}</span>
                          <span role="cell">{getExerciseName(trainingExercise.idExercicio)}</span>
                          <span role="cell">{getTrainingMethodName(trainingExercise.idMetodoTreino)}</span>
                          <span role="cell">{trainingExercise.nrSeries}</span>
                          <span role="cell">{trainingExercise.nrRepeticoes}</span>
                          <span role="cell">{trainingExercise.qtDescanso} s</span>
                        </div>
                      ))
                      : null}

                    {!isLoadingSelectedTrainingExercises && selectedTrainingExercises.length === 0 ? (
                      <div className="empty-row">Nenhum exercicio vinculado a este treino.</div>
                    ) : null}
                  </div>
                </section>
              ) : selectedStudentId ? (
                <section className="training-exercises-grid">
                  <div className="grid-toolbar">
                    <div className="child-grid-toolbar-label">
                      <p className="section-label">Exercícios dos treinos</p>
                    </div>
                  </div>

                  {isLoadingGroupedTrainingExercises ? (
                    <div className="form-hint">Carregando exercícios dos treinos...</div>
                  ) : null}

                  {!isLoadingGroupedTrainingExercises ? (
                    <div className="product-table" key={`grouped-exercises-${studentTrainingSearchTerm}-${displayedStudentTrainings.length}`} role="table" aria-label="Exercícios agrupados por treino">
                      <div className="product-row training-exercise-row header" role="row">
                        <span role="columnheader">Ordem</span>
                        <span role="columnheader">Exercicio</span>
                        <span role="columnheader">Método</span>
                        <span role="columnheader">Series</span>
                        <span role="columnheader">Repeticoes</span>
                        <span role="columnheader">Descanso</span>
                      </div>

                      {displayedStudentTrainings.map((studentTraining) => {
                        const trainingId = Number(studentTraining.idTreino);
                        const trainingExercises = groupedTrainingExercises[trainingId] ?? [];

                        return (
                          <div className="training-exercise-table-group" key={studentTraining.id} role="rowgroup">
                            <div className="product-row training-exercise-separator-row" role="row">
                              <span role="cell">
                                {studentTraining.treino?.dsTreino ?? getTrainingName(studentTraining.idTreino)}
                              </span>
                            </div>

                            {trainingExercises.map((trainingExercise) => (
                              <div className="product-row training-exercise-row" key={trainingExercise.id} role="row">
                                <span role="cell">{trainingExercise.nrOrdem || '-'}</span>
                                <span role="cell">{getExerciseName(trainingExercise.idExercicio)}</span>
                                <span role="cell">{getTrainingMethodName(trainingExercise.idMetodoTreino)}</span>
                                <span role="cell">{trainingExercise.nrSeries}</span>
                                <span role="cell">{trainingExercise.nrRepeticoes}</span>
                                <span role="cell">{trainingExercise.qtDescanso} s</span>
                              </div>
                            ))}

                            {trainingExercises.length === 0 ? (
                              <div className="empty-row">Nenhum exercicio vinculado a este treino.</div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {!isLoadingGroupedTrainingExercises && displayedStudentTrainings.length === 0 ? (
                    <div className="form-hint">Nenhum treino ativo para mostrar exercícios.</div>
                  ) : null}
                </section>
              ) : null}
            </section>

            <form className="registration-form workout-training-form" onSubmit={handleSaveStudentTraining}>
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">AlunoTreino</p>
                </div>
              </div>

              {studentTrainingFeedback ? <div className="form-feedback">{studentTrainingFeedback}</div> : null}

              {!isStudentTrainingFormEnabled ? (
                <div className="form-hint">
                  {loggedEmployeeId
                    ? 'Selecione um treino do aluno ou clique em Novo.'
                    : 'Entre como profissional para montar treino.'}
                </div>
              ) : null}

              {isCreatingStudentTraining ? (
              <div className="field">
                <label htmlFor="studentTrainingTraining">Treino *</label>
                <input
                  disabled={!isStudentTrainingFormEnabled}
                  onChange={(event) => setTrainingOptionSearchTerm(event.target.value)}
                  placeholder="Pesquisar treino"
                  type="search"
                  value={trainingOptionSearchTerm}
                />
                <div
                  className="training-option-list"
                  key={`training-options-${trainingOptionSearchTerm}-${selectedTrainingIds.join('-')}`}
                  id="studentTrainingTraining"
                  role="listbox"
                  aria-label="Treinos"
                  aria-multiselectable="true"
                >
                  {filteredTrainingOptions.map((training) => {
                    const isSelected = selectedTrainingIds.includes(String(training.id));

                    return (
                      <button
                        aria-selected={isSelected}
                        className={isSelected ? 'selected' : ''}
                        disabled={!isStudentTrainingFormEnabled}
                        key={training.id}
                        onClick={() => handleToggleTrainingOption(training.id)}
                        role="option"
                        type="button"
                      >
                        <span>{training.dsTreino}</span>
                        <strong>
                          {isSelected
                            ? `Ordem ${selectedTrainingIds.indexOf(String(training.id)) + 1}`
                            : 'Selecionar'}
                        </strong>
                      </button>
                    );
                  })}
                </div>
                {isCreatingStudentTraining && selectedTrainingIds.length > 0 ? (
                  <span className="field-hint">
                    {selectedTrainingIds.length} treino{selectedTrainingIds.length > 1 ? 's' : ''} selecionado{selectedTrainingIds.length > 1 ? 's' : ''}.
                  </span>
                ) : null}
                {filteredTrainingOptions.length === 0 ? (
                  <span className="field-hint">Nenhum treino encontrado.</span>
                ) : null}
              </div>
              ) : null}

              {isCreatingStudentTraining ? (
                <label className="checkbox-field">
                  <input
                    checked={shouldCreateSequence}
                    disabled={!isStudentTrainingFormEnabled}
                    onChange={(event) => setShouldCreateSequence(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Montar sequência automaticamente</span>
                </label>
              ) : null}

              <div className="form-actions">
                <button
                  className="secondary-button"
                  disabled={!selectedStudentId}
                  onClick={clearStudentTrainingForm}
                  type="button"
                >
                  Limpar
                </button>
                <button disabled={!isSaveEnabled} type="submit">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : (
        <div className="form-hint workout-empty-selection">
          Selecione um aluno no grid para visualizar a model AlunoTreino.
        </div>
      )}
    </div>
  );
}
