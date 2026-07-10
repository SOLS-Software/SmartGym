'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ExerciseCard } from '../../shared/registration/ExerciseCard';
import type { Training, TrainingExerciseWithCover } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

const PAGE_SIZE = 10;

function formatExerciseMeta(link: TrainingExerciseWithCover) {
  const parts: string[] = [];
  if (link.nrSeries) parts.push(`${link.nrSeries}x${link.nrRepeticoes || 0}`);
  if (Number(link.qtPeso) > 0) parts.push(`${link.qtPeso}${link.cnUnidadeMedida || ''}`);
  if (link.qtDescanso) parts.push(`${link.qtDescanso}s descanso`);
  return parts.join(' · ');
}

export function StudentTrainingsView() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [trainingExercises, setTrainingExercises] = useState<Record<number, TrainingExerciseWithCover[]>>({});
  const [selectedTrainingId, setSelectedTrainingId] = useState<number | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailFeedback, setDetailFeedback] = useState('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);

  const loadMore = useCallback(
    async (reset = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const nextOffset = reset ? 0 : offset;
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
        if (searchTerm.trim()) params.set('search', searchTerm.trim());

        const response = await fetch(`${apiUrl}/trainings?${params.toString()}`);
        if (!response.ok) await getApiError(response, 'Não foi possível carregar os treinos.');
        const data = (await response.json()) as Training[];

        setTrainings((current) => (reset ? data : [...current, ...data]));
        setOffset(nextOffset + data.length);
        setHasMore(data.length === PAGE_SIZE);
        setFeedback('');
        data.forEach((training) => void loadTrainingPreview(training.id));
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Erro ao carregar treinos.');
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [offset, searchTerm],
  );

  useEffect(() => {
    void loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || selectedTrainingId !== null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingRef.current) {
          void loadMore();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, selectedTrainingId]);

  async function loadTrainingPreview(trainingId: number) {
    try {
      const response = await fetch(`${apiUrl}/trainings/${trainingId}/related/exercises`);
      if (!response.ok) return;
      const data = (await response.json()) as TrainingExerciseWithCover[];
      setTrainingExercises((current) => ({ ...current, [trainingId]: data }));
    } catch {
      // preview is best-effort; detail view will retry with full data
    }
  }

  async function loadTrainingExercises(trainingId: number) {
    try {
      setIsLoadingDetail(true);
      const response = await fetch(`${apiUrl}/trainings/${trainingId}/related/exercises?includeCover=true`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os exercícios do treino.');
      const data = (await response.json()) as TrainingExerciseWithCover[];
      setTrainingExercises((current) => ({ ...current, [trainingId]: data }));
      setDetailFeedback('');
    } catch (error) {
      setDetailFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios do treino.');
    } finally {
      setIsLoadingDetail(false);
    }
  }

  function handleSelectTraining(training: Training) {
    setSelectedTrainingId(training.id);
    void loadTrainingExercises(training.id);
  }

  const selectedTraining = trainings.find((t) => t.id === selectedTrainingId) ?? null;

  if (selectedTraining) {
    const links = trainingExercises[selectedTraining.id] ?? [];

    return (
      <>
        <header className="module-page-header">
          <p className="section-label">Treino</p>
          <h2 className="module-page-title">{selectedTraining.dsTreino.toUpperCase()}</h2>
        </header>
        <div className="form-view">
          <button
            className="secondary-button"
            onClick={() => setSelectedTrainingId(null)}
            style={{ marginBottom: '1rem' }}
            type="button"
          >
            <ArrowLeft size={16} />
            Voltar aos treinos
          </button>

          {detailFeedback ? <div className="form-feedback">{detailFeedback}</div> : null}
          {isLoadingDetail ? <div className="empty-row">Carregando...</div> : null}

          <div className="exercise-card-grid">
            {links
              .filter((link) => link.exercicio)
              .map((link) => (
                <ExerciseCard exercise={link.exercicio!} key={link.id} meta={formatExerciseMeta(link)} />
              ))}
          </div>

          {!isLoadingDetail && links.length === 0 ? (
            <div className="empty-row">Nenhum exercício vinculado a este treino.</div>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Treino</p>
        <h2 className="module-page-title">TREINOS</h2>
      </header>
      <div className="form-view">
        <div className="grid-toolbar">
          <div className="child-grid-toolbar-label">
            <p className="section-label">Treinos cadastrados</p>
          </div>
          <div className="child-grid-toolbar-actions">
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar treino"
                type="search"
                value={searchTerm}
              />
            </label>
          </div>
        </div>

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        <div className="exercise-card-grid">
          {trainings.map((training) => {
            const links = trainingExercises[training.id];
            return (
              <button
                className="training-card"
                key={training.id}
                onClick={() => handleSelectTraining(training)}
                type="button"
              >
                <strong className="training-card-title">{training.dsTreino}</strong>
                {links ? (
                  <div className="training-card-exercise-list">
                    {links.slice(0, 3).map((link) => (
                      <span key={link.id}>{link.exercicio?.dsExercicio ?? '-'}</span>
                    ))}
                    {links.length > 3 ? <span>+{links.length - 3} exercício(s)</span> : null}
                    {links.length === 0 ? <span>Nenhum exercício vinculado.</span> : null}
                  </div>
                ) : (
                  <span className="training-card-meta">Toque para ver os exercícios</span>
                )}
              </button>
            );
          })}
        </div>

        {!isLoading && trainings.length === 0 ? (
          <div className="empty-row">Nenhum treino encontrado.</div>
        ) : null}

        {isLoading ? <div className="empty-row">Carregando...</div> : null}

        <div className="card-load-sentinel" ref={sentinelRef} />
      </div>
    </>
  );
}
