'use client';

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { GridPagination } from './registrationHelpers';

export type RegistrationGridColumn<T> = {
  label: string;
  render: (record: T) => ReactNode;
};

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
  newDisabled?: boolean;
  showNewButton?: boolean;
  variant?: 'main' | 'child';
  emptyMessage?: string;
  page?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
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
  newDisabled = false,
  showNewButton = true,
  variant = 'main',
  emptyMessage,
  page,
  totalItems,
  onPageChange,
}: RegistrationGridProps<T>) {
  const isChild = variant === 'child';
  const gridStyle = isChild
    ? { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }
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
          {columns.map((col, i) => (
            <span key={i} role="columnheader">{col.label}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="empty-row">Carregando {label.toLowerCase()}...</div>
        ) : null}

        {!isLoading
          ? records.map((record) => (
            <button
              className={`${rowBaseClass}${record.id === selectedId ? ' selected' : ''}`}
              key={record.id}
              onClick={() => onSelect(record)}
              role="row"
              style={gridStyle}
              type="button"
            >
              {columns.map((col, i) => (
                <span key={i} role="cell">{col.render(record)}</span>
              ))}
            </button>
          ))
          : null}

        {!isLoading && records.length === 0 ? (
          <div className="empty-row">{emptyMessage ?? defaultEmpty}</div>
        ) : null}
      </div>

      {page !== undefined && totalItems !== undefined && onPageChange ? (
        <GridPagination onChange={onPageChange} page={page} totalItems={totalItems} />
      ) : null}
    </>
  );
}
