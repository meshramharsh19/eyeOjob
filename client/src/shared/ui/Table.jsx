import React from 'react';

export const Table = ({
  columns,
  data = [],
  keyExtractor = (item, idx) => item.id || idx,
  emptyMessage = 'No records found.',
  emptyIcon: EmptyIcon,
  className = '',
  rowClassName = '',
  onRowClick,
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        {EmptyIcon ? (
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--background-alt)] text-[var(--text-muted)]">
            <EmptyIcon className="h-6 w-6" />
          </div>
        ) : (
          <div className="mb-2 text-2xl">📋</div>
        )}
        <p className="text-sm font-medium text-[var(--text-secondary)]">{emptyMessage}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          New entries will automatically appear here once detected.
        </p>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--background-alt)]/40 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {columns.map((col, idx) => (
              <th
                key={col.key || idx}
                className={`px-4 py-3.5 first:pl-6 last:pr-6 ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {data.map((item, rowIdx) => (
            <tr
              key={keyExtractor(item, rowIdx)}
              onClick={() => onRowClick?.(item)}
              className={`group transition-colors duration-150 hover:bg-[var(--surface-hover)] ${
                onRowClick ? 'cursor-pointer' : ''
              } ${rowClassName}`}
            >
              {columns.map((col, colIdx) => (
                <td
                  key={col.key || colIdx}
                  className={`px-4 py-3.5 first:pl-6 last:pr-6 align-middle ${col.cellClassName || ''}`}
                >
                  {col.render ? col.render(item, rowIdx) : item[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
