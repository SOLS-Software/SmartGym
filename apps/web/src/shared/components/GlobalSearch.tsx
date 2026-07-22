'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

type SearchItem = {
  label: string;
  group: string;
  icon?: React.ComponentType<{ size?: number }>;
};

type GlobalSearchProps = {
  items: SearchItem[];
  onSelect: (label: string) => void;
};

export function GlobalSearch({ items, onSelect }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  if (!open) return null;

  const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filtered = normalizedQuery
    ? items.filter((item) => {
        const normalized = item.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        return normalized.includes(normalizedQuery);
      })
    : items;

  const grouped = filtered.reduce<Record<string, SearchItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  function handleSelect(label: string) {
    setOpen(false);
    onSelect(label);
  }

  return (
    <>
      <div aria-hidden="true" className="global-search-backdrop" onClick={() => setOpen(false)} />
      <div className="global-search-dialog" role="dialog" aria-label="Busca rápida">
        <div className="global-search-input-wrap">
          <Search className="global-search-input-icon" size={16} />
          <input
            className="global-search-input"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulo..."
            ref={inputRef}
            type="text"
            value={query}
          />
          <kbd className="global-search-kbd">Esc</kbd>
          <button
            aria-label="Fechar"
            className="global-search-close"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
        <div className="global-search-results">
          {Object.keys(grouped).length === 0 ? (
            <div className="global-search-empty">Nenhum módulo encontrado.</div>
          ) : (
            Object.entries(grouped).map(([group, groupItems]) => (
              <div key={group}>
                <div className="global-search-group">{group}</div>
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="global-search-item"
                      key={item.label}
                      onClick={() => handleSelect(item.label)}
                      type="button"
                    >
                      {Icon ? <Icon size={16} /> : null}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
