import React from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

// Same data source as NotificationBell/NotificationDropdown — deliberately
// no separate fetch here (Reaad.md §5: "Do not create separate notification
// logic for the dashboard").
const HIGH_PRIORITY_TYPES = new Set(['interview', 'assessment', 'offer']);

export const ImportantUpdatesBanner = ({ onViewApplication }) => {
  const { notifications, markRead } = useNotifications();

  const importantUnread = notifications.filter(
    (n) => !n.is_read && HIGH_PRIORITY_TYPES.has(n.event_type)
  );

  if (importantUnread.length === 0) return null;

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--text-primary)]">
          🚨 {importantUnread.length} Important Update{importantUnread.length > 1 ? 's' : ''}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {importantUnread.slice(0, 4).map((n) => (
          <div
            key={n.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)]/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{n.body || n.title}</p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">{n.title}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {n.application_id && (
                <button
                  type="button"
                  onClick={() => {
                    markRead(n.id);
                    onViewApplication?.(n.application_id);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                >
                  View <ArrowRight className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => markRead(n.id)}
                title="Dismiss"
                className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImportantUpdatesBanner;
