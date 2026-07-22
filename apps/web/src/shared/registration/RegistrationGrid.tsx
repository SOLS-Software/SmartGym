'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
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
        ? { gridTemplateColumns: `minmax(0, 1fr) 6.875rem 6.875rem${editColWidth}` }
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
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={searchTerm}
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
            return (
              <span
                aria-sort={isActive ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                className={isSortable ? 'grid-header-sortable' : undefined}
                key={i}
                onClick={isSortable ? () => handleSort(i) : undefined}
                role="columnheader"
                style={isSortable ? { cursor: 'pointer', userSelect: 'none' } : undefined}
              >
                {col.label}
                {isActive ? (
                  sort!.direction === 'asc' ? <ArrowUp className="grid-sort-icon" size={12} /> : <ArrowDown className="grid-sort-icon" size={12} />
                ) : null}
              </span>
            );
          })}
          {onEdit ? <span role="columnheader" /> : null}
        </div>

        {isLoading ? (
          <div className="empty-row">Carregando {label.toLowerCase()}...</div>
        ) : null}

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
                  <span key={i} role="cell" title={col.tooltip?.(record)}>{col.render(record)}</span>
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
                  <span key={i} role="cell" title={col.tooltip?.(record)}>{col.render(record)}</span>
                ))}
              </button>
            ))
          : null}

        {!isLoading && sortedRecords.length === 0 ? (
          searchTerm ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Search size={28} /></div>
              <p className="empty-state-title">Nenhum resultado para &ldquo;{searchTerm}&rdquo;</p>
              <p className="empty-state-description">Tente buscar com outros termos.</p>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon"><Inbox size={28} /></div>
              <p className="empty-state-title">{emptyMessage ?? defaultEmpty}</p>
              <p className="empty-state-description">Clique em &ldquo;Novo&rdquo; para criar o primeiro registro.</p>
            </div>
          )
        ) : null}
      </div>

      {page !== undefined && totalItems !== undefined && onPageChange ? (
        <GridPagination onChange={onPageChange} page={page} totalItems={totalItems} />
      ) : null}
    </>
  );
}
