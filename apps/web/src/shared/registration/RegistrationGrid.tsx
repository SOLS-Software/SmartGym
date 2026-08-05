'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Inbox, Pencil, Plus, Search } from 'lucide-react';
import { GridPagination } from './registrationHelpers';

export type RegistrationGridColumn<T> = {
  label: string;
  render: (record: T) => ReactNode;
  tooltip?: (record: T) => string;
  sortValue?: (record: T) => string | number | boolean;
};

type SortState = { column: number; direction: 'asc' | 'desc' } | null;

type RegistrationGridProps<T extends { id: number }> = {
  ariaLabel: string;
  label: string;
  columns: RegistrationGridColumn<T>[];
  records: T[];
  isLoading?: boolean;
  selectedId: number | null;
  onSelect: (record: T) => void;
  rowSelectable?: boolean;
  searchTerm: string;
  onSearch: (term: string) => void;
  searchPlaceholder?: string;
  onNew: () => void;
  onEdit?: (record: T) => void;
  newDisabled?: boolean;
  showNewButton?: boolean;
  variant?: 'main' | 'child';
  emptyMessage?: string;
  page?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  gridTemplateColumns?: string;
};

export function RegistrationGrid<T extends { id: number }>({
  ariaLabel,
  label,
  columns,
  records,
  isLoading = false,
  selectedId,
  onSelect,
  rowSelectable = true,
  searchTerm,
  onSearch,
  searchPlaceholder = 'Buscar registro',
  onNew,
  onEdit,
  newDisabled = false,
  showNewButton = true,
  variant = 'main',
  emptyMessage,
  page,
  totalItems,
  onPageChange,
  gridTemplateColumns,
}: RegistrationGridProps<T>) {
  const [sort, setSort] = useState<SortState>(null);

  // Busca com debounce.
  //
  // `onSearch` disparava a cada tecla, e nas telas consumidoras ele refiltra a
  // lista inteira (ate 1000 registros) e re-renderiza a grade. Digitar "joao"
  // custava 4 ciclos completos de filtro+sort+render. O input continua
  // respondendo instantaneamente (estado local), mas a consulta pesada so roda
  // 250ms apos a ultima tecla.
  const [draftSearch, setDraftSearch] = useState(searchTerm);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  // Reflete mudancas vindas de fora (ex.: botao "Limpar busca" do estado vazio).
  useEffect(() => {
    setDraftSearch(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (draftSearch === searchTerm) return;
    const timer = setTimeout(() => onSearchRef.current(draftSearch), 250);
    return () => clearTimeout(timer);
  }, [draftSearch, searchTerm]);

  const sortedRecords = useMemo(() => {
    if (!sort) return records;
    const col = columns[sort.column];
    if (!col?.sortValue) return records;
    const extract = col.sortValue;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...records].sort((a, b) => {
      const va = extract(a);
      const vb = extract(b);
      if (va === vb) return 0;
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
      return (va < vb ? -1 : 1) * dir;
    });
  }, [records, sort, columns]);

  function handleSort(colIndex: number) {
    if (!columns[colIndex]?.sortValue) return;
    setSort((prev) => {
      if (prev?.column === colIndex) {
        return prev.direction === 'asc' ? { column: colIndex, direction: 'desc' } : null;
      }
      return { column: colIndex, direction: 'asc' };
    });
  }

  const isChild = variant === 'child';
  const editColWidth = onEdit ? ' 2.75rem' : '';
  const gridStyle = gridTemplateColumns
    ? { gridTemplateColumns: `${gridTemplateColumns}${editColWidth}` }
    : isChild
      ? { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))${editColWidth}` }
      : onEdit
        ? // A segunda coluna era 6.875rem (96px com root de 14px). CPF formatado
          // precisa de ate 110px, entao toda linha da grid de alunos quebrava o
          // CPF em duas linhas — o espaco extra sai da coluna de nome, que ficava
          // com centenas de pixels ociosos.
          { gridTemplateColumns: `minmax(0, 1fr) 8.5rem 6.875rem${editColWidth}` }
        : undefined;

  const tableClass = isChild
    ? 'product-table company-child-grid-table'
    : 'product-table';
  const headerClass = isChild
    ? 'product-row company-child-grid-row header'
    : 'product-row header';
  const rowBaseClass = isChild
    ? `product-row company-child-grid-row${rowSelectable ? ' selectable' : ''}`
    : 'product-row selectable';

  const defaultEmpty = isChild
    ? `Nenhum registro de ${label.toLowerCase()} encontrado.`
    : `Nenhum ${label.toLowerCase()} encontrado.`;

  return (
    <>
      <div className="grid-toolbar">
        <div className="child-grid-toolbar-label">
          <p className="section-label">{label}</p>
        </div>
        <div className="child-grid-toolbar-actions">
          <label className="search-field">
            <span>Pesquisar</span>
            <input
              maxLength={100}
              onChange={(e) => setDraftSearch(e.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={draftSearch}
            />
          </label>
          {showNewButton ? (
            <button className="new-button" disabled={newDisabled} onClick={onNew} type="button">
              <Plus size={16} />
              Novo
            </button>
          ) : null}
        </div>
      </div>

      <div aria-label={ariaLabel} className={tableClass} role="table">
        <div className={headerClass} role="row" style={gridStyle}>
          {columns.map((col, i) => {
            const isSortable = !!col.sortValue;
            const isActive = sort?.column === i;
            // Cabecalho ordenavel precisa ser operavel por teclado (WCAG 2.1.1):
            // antes era um <span onClick> — invisivel para Tab e para leitor de
            // tela, deixando a ordenacao inacessivel a quem nao usa mouse.
            return (
              <span
                aria-sort={isActive ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : isSortable ? 'none' : undefined}
                className={isSortable ? 'grid-header-sortable' : undefined}
                key={i}
                role="columnheader"
              >
                {isSortable ? (
                  <button
                    aria-label={`Ordenar por ${col.label}`}
                    className="grid-sort-button"
                    onClick={() => handleSort(i)}
                    type="button"
                  >
                    {col.label}
                    {isActive ? (
                      sort!.direction === 'asc' ? <ArrowUp className="grid-sort-icon" size={12} /> : <ArrowDown className="grid-sort-icon" size={12} />
                    ) : null}
                  </button>
                ) : (
                  col.label
                )}
              </span>
            );
          })}
          {onEdit ? <span role="columnheader" /> : null}
        </div>

        {isLoading
          ? Array.from({ length: 5 }, (_, i) => (
              <div className="skeleton-row" key={`sk-${i}`} role="row" style={gridStyle}>
                {columns.map((_, ci) => (
                  <span key={ci} role="cell">
                    <div className="skeleton-bar" style={{ width: `${55 + ((ci * 17 + i * 11) % 35)}%` }} />
                  </span>
                ))}
                {onEdit ? <span role="cell" /> : null}
              </div>
            ))
          : null}

        {!isLoading
          ? sortedRecords.map((record) =>
            onEdit ? (
              <div
                className={`${rowBaseClass}${record.id === selectedId ? ' selected' : ''}`}
                key={record.id}
                onClick={() => onSelect(record)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(record);
                  }
                }}
                role="row"
                style={gridStyle}
                tabIndex={0}
              >
                {columns.map((col, i) => (
                  // data-label alimenta o ::before do CSS mobile: sem o cabecalho
                  // (escondido abaixo de 760px) os valores empilhados ficariam
                  // sem nenhuma indicacao do que representam.
                  <span data-label={col.label} key={i} role="cell" title={col.tooltip?.(record)}>{col.render(record)}</span>
                ))}
                <span role="cell" className="grid-row-actions">
                  <button
                    aria-label="Editar registro"
                    className="grid-edit-button"
                    onClick={(e) => { e.stopPropagation(); onEdit(record); }}
                    type="button"
                  >
                    <Pencil size={13} />
                  </button>
                </span>
              </div>
            ) : (
              <button
                className={`${rowBaseClass}${record.id === selectedId ? ' selected' : ''}`}
                key={record.id}
                onClick={() => onSelect(record)}
                role="row"
                style={gridStyle}
                type="button"
              >
                {columns.map((col, i) => (
                  <span data-label={col.label} key={i} role="cell" title={col.tooltip?.(record)}>{col.render(record)}</span>
                ))}
              </button>
            ))
          : null}

      </div>

      {/* Fora do role="table": os filhos de uma tabela ARIA devem ser row/rowgroup,
          entao um bloco de estado vazio ali dentro era ignorado (ou lido de forma
          errada) por leitores de tela. */}
      {!isLoading && sortedRecords.length === 0 ? (
        searchTerm ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Search size={28} /></div>
            <p className="empty-state-title">Nenhum resultado para &ldquo;{searchTerm}&rdquo;</p>
            <p className="empty-state-description">Tente buscar com outros termos ou limpe a busca.</p>
            <button className="secondary-button" onClick={() => onSearch('')} type="button">
              Limpar busca
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><Inbox size={28} /></div>
            <p className="empty-state-title">{emptyMessage ?? defaultEmpty}</p>
            {showNewButton ? (
              <>
                {/* CTA no proprio vazio: antes o texto mandava "clique em Novo",
                    obrigando o usuario a procurar o botao na barra acima. */}
                <p className="empty-state-description">Comece criando o primeiro registro.</p>
                <button className="new-button" disabled={newDisabled} onClick={onNew} type="button">
                  <Plus size={16} />
                  Novo {label.toLowerCase()}
                </button>
              </>
            ) : null}
          </div>
        )
      ) : null}

      {page !== undefined && totalItems !== undefined && onPageChange ? (
        <GridPagination onChange={onPageChange} page={page} totalItems={totalItems} />
      ) : null}
    </>
  );
}
