import React, { useState, useMemo } from 'react';
import { Mail, Search } from 'lucide-react';
import { Table } from '../../../shared/ui';
import { toConfidencePct } from '../../../shared/lib/confidence';

export const ProcessedEmailsTable = ({ emails = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEmails = useMemo(() => {
    if (!searchTerm) return emails;
    const term = searchTerm.toLowerCase();
    return emails.filter(
      (e) =>
        e.subject?.toLowerCase().includes(term) ||
        e.sender?.toLowerCase().includes(term) ||
        e.classification?.toLowerCase().includes(term)
    );
  }, [emails, searchTerm]);

  const columns = [
    {
      header: 'Subject & Sender',
      key: 'subject',
      cellClassName: 'max-w-md',
      render: (email) => (
        <div className="space-y-0.5">
          <p
            className="truncate font-medium text-[var(--text-primary)]"
            title={email.subject}
          >
            {email.subject || '(No subject)'}
          </p>
          <p
            className="truncate text-xs text-[var(--text-muted)]"
            title={email.sender}
          >
            {email.sender || 'Unknown Sender'}
          </p>
        </div>
      ),
    },
    {
      header: 'Classification',
      key: 'classification',
      render: (email) => {
        const isJob = email.is_job_related;
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-semibold ${
              isJob
                ? 'bg-indigo-500/10 text-indigo-500'
                : 'bg-[var(--background-alt)] text-[var(--text-muted)]'
            }`}
          >
            {email.classification || 'Unclassified'}
          </span>
        );
      },
    },
    {
      header: 'AI Confidence',
      key: 'confidence',
      render: (email) => {
        const pct = toConfidencePct(email.confidence);
        if (pct == null) return <span className="text-xs text-[var(--text-muted)]">—</span>;
        const isHigh = pct >= 80;
        const isMed = pct >= 50 && pct < 80;

        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className={`h-full rounded-full ${
                  isHigh ? 'bg-emerald-500' : isMed ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              {pct}%
            </span>
          </div>
        );
      },
    },
    {
      header: 'Received',
      key: 'received_at',
      render: (email) => (
        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
          {email.received_at
            ? new Date(email.received_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
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
            placeholder="Search email subject, sender..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-4 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>

        <span className="text-xs text-[var(--text-muted)] shrink-0">
          {filteredEmails.length} logged
        </span>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-[var(--shadow-xs)]">
        <Table
          columns={columns}
          data={filteredEmails}
          emptyMessage="No processed emails in pipeline history."
          emptyIcon={Mail}
        />
      </div>
    </div>
  );
};

export default ProcessedEmailsTable;
