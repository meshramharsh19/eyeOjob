import React from 'react';
import { CalendarCheck, Code2, Award, XCircle, MessageCircle, AlertTriangle } from 'lucide-react';
import { relativeTime } from '../lib/relativeTime';

// event_type -> presentation, mirroring the backend's STATUS_EVENT_MAP
// (server/src/modules/notifications/notifications.service.js) so a given
// event always reads the same way everywhere it's shown.
const EVENT_META = {
  interview: { icon: CalendarCheck, accent: 'text-emerald-500 bg-emerald-500/10' },
  assessment: { icon: Code2, accent: 'text-indigo-500 bg-indigo-500/10' },
  offer: { icon: Award, accent: 'text-amber-500 bg-amber-500/10' },
  rejection: { icon: XCircle, accent: 'text-rose-500 bg-rose-500/10' },
  recruiter_followup: { icon: MessageCircle, accent: 'text-cyan-500 bg-cyan-500/10' },
  sync_alert: { icon: AlertTriangle, accent: 'text-amber-500 bg-amber-500/10' },
};

const DEFAULT_META = { icon: MessageCircle, accent: 'text-[var(--text-muted)] bg-[var(--surface-hover)]' };

export const NotificationItem = ({ notification, onClick }) => {
  const { icon: Icon, accent } = EVENT_META[notification.event_type] || DEFAULT_META;
  const isUnread = !notification.is_read;

  return (
    <button
      type="button"
      onClick={() => onClick?.(notification)}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)] ${
        isUnread ? 'bg-indigo-500/[0.04]' : 'opacity-75'
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
            {notification.title}
          </span>
          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
            {relativeTime(notification.created_at)}
          </span>
        </span>
        {notification.body && (
          <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">
            {notification.body}
          </span>
        )}
      </span>

      {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
    </button>
  );
};

export default NotificationItem;
