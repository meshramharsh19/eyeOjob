import React, { useState, useMemo, useEffect } from 'react';
import { Search, Briefcase, Filter, Lock, Plus, Edit2, Trash2, AlertTriangle, Hourglass, CalendarDays, ChevronDown, GitBranch } from 'lucide-react';
import { Table, Badge, Button } from '../../../shared/ui';

const DATE_PRESETS = [
  { key: 'ALL', label: 'All Time' },
  { key: '7', label: 'Last 7 Days' },
  { key: '30', label: 'Last 30 Days' },
  { key: '90', label: 'Last 90 Days' },
  { key: 'CUSTOM', label: 'Custom Range' },
];

export const ApplicationsTable = ({
  applications = [],
  onAdd,
  onEdit,
  onDelete,
  onVerify,
  onViewJourney,
  needsReviewOnly = false,
  onNeedsReviewOnlyChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Falls back to local state when the parent doesn't control this filter
  // (e.g. the overview preview table), so the toggle still works standalone.
  const [localNeedsReviewOnly, setLocalNeedsReviewOnly] = useState(needsReviewOnly);
  const isNeedsReviewControlled = onNeedsReviewOnlyChange !== undefined;
  const needsReviewActive = isNeedsReviewControlled ? needsReviewOnly : localNeedsReviewOnly;
  const setNeedsReviewActive = isNeedsReviewControlled ? onNeedsReviewOnlyChange : setLocalNeedsReviewOnly;

  useEffect(() => {
    if (isNeedsReviewControlled) setLocalNeedsReviewOnly(needsReviewOnly);
  }, [needsReviewOnly, isNeedsReviewControlled]);

  const matchesDateFilter = (app) => {
    if (dateFilter === 'ALL') return true;

    const raw = app.applied_date || app.created_at;
    if (!raw) return false;
    const appDate = new Date(raw);
    if (Number.isNaN(appDate.getTime())) return false;

    if (dateFilter === 'CUSTOM') {
      if (customFrom && appDate < new Date(customFrom)) return false;
      if (customTo) {
        const to = new Date(customTo);
        to.setHours(23, 59, 59, 999);
        if (appDate > to) return false;
      }
      return true;
    }

    const days = Number(dateFilter);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return appDate >= cutoff;
  };

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch =
        !searchTerm ||
        app.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.notes?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' || app.status === statusFilter;

      const matchesNeedsReview = !needsReviewActive || app.needsReview?.isReviewRequired;

      return matchesSearch && matchesStatus && matchesNeedsReview && matchesDateFilter(app);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, searchTerm, statusFilter, needsReviewActive, dateFilter, customFrom, customTo]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set(applications.map((a) => a.status).filter(Boolean));
    return ['ALL', ...Array.from(set)];
  }, [applications]);

  const columns = [
    {
      header: 'Company',
      key: 'company',
      render: (app) => {
        const initial = (app.company || '?')[0].toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 font-display text-xs font-bold text-indigo-500">
              {initial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-primary)]">
                  {app.company || '—'}
                </span>
                {app.source === 'manual' && (
                  <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-indigo-500">
                    Manual
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                {app.platform && <span className="capitalize">via {app.platform}</span>}
                {app.location && <span>• {app.location}</span>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Role / Position',
      key: 'role',
      render: (app) => (
        <div className="space-y-0.5">
          <span className="font-medium text-[var(--text-secondary)]">
            {app.role || '—'}
          </span>
          {app.notes && (
            <p className="truncate max-w-[200px] text-[11px] text-[var(--text-muted)]" title={app.notes}>
              📝 {app.notes}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Status & Lock State',
      key: 'status',
      render: (app) => {
        const review = app.needsReview;
        const reasonText = review?.reasons?.join(' • ');
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge status={app.status} />
            {app.is_locked_by_user ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20 select-none"
                title="Status locked by user (automatic email updates disabled)"
              >
                <Lock className="h-2.5 w-2.5" />
                <span>Locked</span>
              </span>
            ) : null}
            {review?.isReviewRequired ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 border border-rose-500/20 select-none"
                title={reasonText}
              >
                {review.stuckInStatus ? (
                  <>
                    <Hourglass className="h-2.5 w-2.5" />
                    <span>{review.daysInStatus}d in {app.status}</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-2.5 w-2.5" />
                    <span>Verify Details</span>
                  </>
                )}
                {review.stuckInStatus && review.lowConfidence && (
                  <AlertTriangle className="h-2.5 w-2.5" />
                )}
              </span>
            ) : null}
            {review?.isReviewRequired && onVerify && (
              <button
                type="button"
                onClick={() => onVerify(app)}
                title="Confirm the AI-extracted details — applied date stays locked to the original email"
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700"
              >
                Verify Now
              </button>
            )}
          </div>
        );
      },
    },
    {
      // Hidden until a real desktop monitor width (2xl/1536px) — at 14"
      // laptop resolutions (1366/1440px) this 6th column was tight enough
      // to force the table into horizontal scroll; the count is also
      // visible in the journey drawer, so it's the safe one to drop first.
      header: 'Events',
      key: 'event_count',
      className: 'hidden 2xl:table-cell',
      cellClassName: 'hidden 2xl:table-cell',
      render: (app) => (
        <span className="inline-flex items-center rounded-lg bg-[var(--background-alt)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
          {app.event_count ?? 0} events
        </span>
      ),
    },
    {
      header: 'Last Updated',
      key: 'last_event_at',
      render: (app) => (
        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
          {/* The real-world date of the most recent email/event (application
              confirmed, interview invite, etc.) — not when the sync run
              happened to write the row, which is what updated_at reflects. */}
          {(app.last_event_at || app.updated_at)
            ? new Date(app.last_event_at || app.updated_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '—'}
        </span>
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      cellClassName: 'text-right',
      render: (app) => (
        <div className="flex items-center justify-end gap-1.5">
          {onViewJourney && (
            <button
              type="button"
              onClick={() => onViewJourney(app)}
              title="View application journey"
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--background-alt)] hover:text-indigo-500 transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(app)}
              title="Edit application"
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--background-alt)] hover:text-indigo-500 transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(app)}
              title="Delete application"
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Search + Add Button row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search company, role, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-4 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>

        {onAdd && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={onAdd}
            className="shrink-0 self-start sm:self-auto"
          >
            Add Application
          </Button>
        )}
      </div>

      {/* Filters row — wraps freely instead of clipping on narrower widths */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 hidden md:inline" />
        {uniqueStatuses.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all whitespace-nowrap ${
              statusFilter === status
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-[var(--background-alt)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            {status}
          </button>
        ))}

        <div className="relative inline-block shrink-0 w-fit">
          <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by applied date"
            className="appearance-none rounded-lg border-none bg-[var(--background-alt)] py-1 pl-7 pr-5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--border)] transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          >
            {DATE_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
        </div>

        {dateFilter === 'CUSTOM' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              max={customTo || undefined}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
            <span className="text-[var(--text-muted)]">–</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              min={customFrom || undefined}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setNeedsReviewActive(!needsReviewActive)}
          title="Show only applications flagged for review (low AI confidence or stuck in status)"
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
            needsReviewActive
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-[var(--background-alt)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Needs Review
        </button>
      </div>

      {/* Applications Data Table */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-[var(--shadow-xs)]">
        <Table
          columns={columns}
          data={filteredApplications}
          emptyMessage={
            searchTerm || statusFilter !== 'ALL' || needsReviewActive || dateFilter !== 'ALL'
              ? 'No applications match your search or filter.'
              : 'No job applications recorded yet.'
          }
          emptyIcon={Briefcase}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-2">
        <span>Showing {filteredApplications.length} of {applications.length} applications</span>
        {onAdd && applications.length === 0 && (
          <Button variant="ghost" size="xs" icon={Plus} onClick={onAdd}>
            Log Manual Application
          </Button>
        )}
      </div>
    </div>
  );
};

export default ApplicationsTable;
