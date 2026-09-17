import React, { useState, useMemo } from 'react';
import { Search, ArrowRight, Sliders } from 'lucide-react';
import { Table } from '../../../shared/ui';

export const RoleAliasesTable = ({ roleAliases = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm) return roleAliases;
    const term = searchTerm.toLowerCase();
    return roleAliases.filter(
      (a) =>
        a.raw_title?.toLowerCase().includes(term) ||
        a.canonical_title?.toLowerCase().includes(term)
    );
  }, [roleAliases, searchTerm]);

  const columns = [
    {
      header: 'Incoming Raw Title (Detected from Email)',
      key: 'raw_title',
      render: (item) => (
        <span className="font-mono text-xs text-[var(--text-secondary)]">
          {item.raw_title || '—'}
        </span>
      ),
    },
    {
      header: 'Mapping',
      key: 'arrow',
      render: () => <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />,
    },
    {
      header: 'Canonical Standard Title',
      key: 'canonical_title',
      render: (item) => (
        <span className="inline-flex items-center rounded-lg bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-500">
          {item.canonical_title || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search alias mapping..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-4 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {filtered.length} mappings active
        </span>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-[var(--shadow-xs)]">
        <Table
          columns={columns}
          data={filtered}
          emptyMessage="No role alias mappings recorded."
          emptyIcon={Sliders}
        />
      </div>
    </div>
  );
};

export default RoleAliasesTable;
