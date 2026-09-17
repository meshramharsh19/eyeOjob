import React from 'react';
import { Clock, CheckCircle2, Briefcase, Calendar, Sparkles } from 'lucide-react';

export const TimelineEventsList = ({ events = [] }) => {
  if (!events?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--background-alt)] text-[var(--text-muted)]">
          <Clock className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-[var(--text-secondary)]">No timeline events yet</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Activity such as application submissions and interview invites will appear here.
        </p>
      </div>
    );
  }

  const getEventIcon = (type = '') => {
    const lower = type.toLowerCase();
    if (lower.includes('interview')) return Calendar;
    if (lower.includes('applied') || lower.includes('submission')) return Briefcase;
    if (lower.includes('offer')) return Sparkles;
    return CheckCircle2;
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[var(--border)]">
      {events.map((event, idx) => {
        const Icon = getEventIcon(event.event_type);
        return (
          <div key={event.id || idx} className="relative group">
            {/* Timeline dot */}
            <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-indigo-600 text-white shadow-sm ring-4 ring-indigo-500/10 transition-transform group-hover:scale-110">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)] transition-all group-hover:border-[var(--border-hover)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-indigo-500" />
                  <span className="font-display text-xs font-bold text-[var(--text-primary)]">
                    {event.event_type}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {event.event_date
                    ? new Date(event.event_date).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </div>

              {event.description && (
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TimelineEventsList;
