import { useCallback, useEffect, useRef, useState } from 'react';

type FetchPageParams = { offset: number; search: string };

type UseInfiniteListOptions<T> = {
  fetchPage: (params: FetchPageParams) => Promise<T[]>;
  pageSize?: number;
  onPageLoaded?: (items: T[]) => void;
};

// Encapsula o padrão de scroll infinito (offset/hasMore/search) de
// StudentExercisesView.tsx / StudentTrainingsView.tsx.
export function useInfiniteList<T>({ fetchPage, pageSize = 10, onPageLoaded }: UseInfiniteListOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isLoadingRef = useRef(false);
  const offsetRef = useRef(0);

  const loadMore = useCallback(
    async (reset = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const nextOffset = reset ? 0 : offsetRef.current;
        const data = await fetchPage({ offset: nextOffset, search: search.trim() });

        setItems((current) => (reset ? data : [...current, ...data]));
        const newOffset = nextOffset + data.length;
        offsetRef.current = newOffset;
        setOffset(newOffset);
        setHasMore(data.length === pageSize);
        setFeedback('');
        onPageLoaded?.(data);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Erro ao carregar dados.');
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [fetchPage, pageSize, search, onPageLoaded],
  );

  // Recarrega do zero quando a busca muda.
  useEffect(() => {
    void loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return {
    items,
    search,
    setSearch,
    offset,
    hasMore,
    isLoading,
    feedback,
    loadMore,
    reload: () => loadMore(true),
  };
}
