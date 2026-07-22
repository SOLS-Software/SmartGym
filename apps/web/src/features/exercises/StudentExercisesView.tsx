'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExerciseCard } from '../../shared/registration/ExerciseCard';
import type { ExerciseWithCover } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

const PAGE_SIZE = 10;

export function StudentExercisesView() {
  const [exercises, setExercises] = useState<ExerciseWithCover[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);

  const loadMore = useCallback(
    async (reset = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const nextOffset = reset ? 0 : offset;
        const params = new URLSearchParams({
          includeCover: 'true',
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        if (searchTerm.trim()) params.set('search', searchTerm.trim());

        const response = await fetch(`${apiUrl}/exercises?${params.toString()}`);
        if (!response.ok) await getApiError(response, 'Não foi possível carregar os exercícios.');
        const data = (await response.json()) as ExerciseWithCover[];

        setExercises((current) => (reset ? data : [...current, ...data]));
        setOffset(nextOffset + data.length);
        setHasMore(data.length === PAGE_SIZE);
        setFeedback('');
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios.');
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
    if (!sentinel) return;

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
  }, [hasMore, loadMore]);

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Treino</p>
        <h2 className="module-page-title">EXERCÍCIOS</h2>
      </header>
      <div className="form-view">
        <div className="grid-toolbar">
          <div className="child-grid-toolbar-label">
            <p className="section-label">Exercícios cadastrados</p>
          </div>
          <div className="child-grid-toolbar-actions">
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar exercício"
                type="search"
                value={searchTerm}
              />
            </label>
          </div>
        </div>

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        <div className="exercise-card-grid">
          {exercises.map((exercise) => (
            <ExerciseCard exercise={exercise} key={exercise.id} />
          ))}
        </div>

        {!isLoading && exercises.length === 0 ? (
          <div className="empty-row">Nenhum exercício encontrado.</div>
        ) : null}

        {isLoading && exercises.length === 0
          ? Array.from({ length: 6 }, (_, i) => (
              <div className="exercise-card skeleton-card" key={`sk-${i}`}>
                <div className="exercise-card-photo">
                  <div className="skeleton-bar" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
                </div>
                <div className="exercise-card-body">
                  <div className="skeleton-bar" style={{ width: `${60 + (i * 13) % 30}%`, height: '0.875rem' }} />
                  <div className="skeleton-bar" style={{ width: `${40 + (i * 7) % 25}%`, height: '0.625rem', marginTop: '0.25rem' }} />
                </div>
              </div>
            ))
          : null}

        <div className="card-load-sentinel" ref={sentinelRef} />
      </div>
    </>
  );
}
