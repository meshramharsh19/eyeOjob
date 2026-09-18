import React, { useState } from 'react';
import {
  Clock, CheckCircle2, Briefcase, Calendar, Sparkles, Mail, Bot, Cpu, User,
  EyeOff, Loader2, X,
} from 'lucide-react';
import { getProcessedEmailFull } from '../api/home.api';

const SOURCE_META = {
  ai: { label: 'AI extracted', Icon: Bot },
  deterministic_parser: { label: 'Parser extracted', Icon: Cpu },
  manual: { label: 'Manually added', Icon: User },
};

const getEventIcon = (type = '') => {
  const lower = type.toLowerCase();
  if (lower.includes('interview')) return Calendar;
  if (lower.includes('offer')) return Sparkles;
  if (lower.includes('applied') || lower.includes('application')) return Briefcase;
  return CheckCircle2;
};

const formatDate = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

const humanizeEventType = (type = '') =>
  type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Full-email lazy-load viewer — fetched on demand from
// GET /records/processed-emails/:id, never bundled into the timeline
// response itself (which only ever carries lightweight fields).
const FullEmailViewer = ({ processedEmailId, onClose }) => {
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProcessedEmailFull(processedEmailId)
      .then((data) => { if (!cancelled) setEmail(data); })
      .catch(() => { if (!cancelled) setError('Could not load the original email.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [processedEmailId]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Original Email</span>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--background-alt)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(80vh-52px)] overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {error && <p className="text-sm text-rose-500">{error}</p>}
          {email && !loading && (
            <div className="space-y-3">
              <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                <p><strong className="text-[var(--text-secondary)]">Subject:</strong> {email.subject}</p>
                <p><strong className="text-[var(--text-secondary)]">From:</strong> {email.sender}</p>
                <p><strong className="text-[var(--text-secondary)]">Received:</strong> {formatDate(email.received_at)}</p>
              </div>
              {email.raw_html ? (
                <iframe
                  title="original-email"
                  sandbox=""
                  srcDoc={email.raw_html}
                  className="h-96 w-full rounded-lg border border-[var(--border)] bg-white"
                />
              ) : (
                <pre className="whitespace-pre-wrap rounded-lg bg-[var(--background-alt)] p-3 text-xs text-[var(--text-secondary)]">
                  {email.plain_text}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Phase 8: chronological (by event_date), granular journey view — distinct
// from the flat TimelineEventsList used on the dashboard's global "Timeline
// Events" tab. Shows email_received_at when it differs from event_date,
// event source (metadata.source), interview round metadata, a lazy-load
// "View Full Original Email" action, and a Dismiss control (soft-hide).
export const ApplicationJourneyTimeline = ({ events = [], onDismiss }) => {
  const [viewingEmailId, setViewingEmailId] = useState(null);
  const [dismissing, setDismissing] = useState(null);

  if (!events?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Clock className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
        <p className="text-sm font-medium text-[var(--text-secondary)]">No journey events yet</p>
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  return (
    <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[var(--border)]">
      {sorted.map((event, idx) => {
        const Icon = getEventIcon(event.event_type);
        let metadata = {};
        try { metadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : (event.metadata || {}); } catch { /* ignore */ }
        const source = metadata.source;
        const sourceMeta = source && SOURCE_META[source];
        const emailDate = event.email_received_at || event.email_received_at_full;
        const showEmailDate = emailDate && new Date(emailDate).getTime() !== new Date(event.event_date).getTime();

        return (
          <div key={event.id || idx} className="relative group">
            <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-indigo-600 text-white shadow-sm ring-4 ring-indigo-500/10">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-indigo-500" />
                  <span className="font-display text-xs font-bold text-[var(--text-primary)]">
                    {humanizeEventType(event.event_type)}
                  </span>
                  {metadata.round && (
                    <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-500">
                      Round {metadata.round}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {onDismiss && (
                    <button
                      type="button"
                      title="Dismiss event (hides it from the journey without deleting it)"
                      onClick={async () => {
                        setDismissing(event.id);
                        try { await onDismiss(event.id); } finally { setDismissing(null); }
                      }}
                      disabled={dismissing === event.id}
                      className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                    >
                      {dismissing === event.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                <span>{formatDate(event.event_date)}</span>
                {showEmailDate && <span>· Email received {formatDate(emailDate)}</span>}
                {sourceMeta && (
                  <span className="inline-flex items-center gap-1">
                    <sourceMeta.Icon className="h-3 w-3" /> {sourceMeta.label}
                  </span>
                )}
                {event.confidence != null && <span>· {Math.round(event.confidence)}% confidence</span>}
              </div>

              {event.description && (
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{event.description}</p>
              )}

              {event.processed_email_id && (
                <button
                  type="button"
                  onClick={() => setViewingEmailId(event.processed_email_id)}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:underline"
                >
                  <Mail className="h-3 w-3" /> View Full Original Email
                </button>
              )}
            </div>
          </div>
        );
      })}

      {viewingEmailId && (
        <FullEmailViewer processedEmailId={viewingEmailId} onClose={() => setViewingEmailId(null)} />
      )}
    </div>
  );
};

export default ApplicationJourneyTimeline;
