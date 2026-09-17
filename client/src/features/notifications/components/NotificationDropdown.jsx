import React from 'react';
import { CheckCheck, Sparkles } from 'lucide-react';
import NotificationItem from './NotificationItem';

export const NotificationDropdown = ({ notifications, unreadCount, loading, onItemClick, onMarkAllRead }) => (
  <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl backdrop-blur-lg sm:w-96">
    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        Notifications
        {unreadCount > 0 && (
          <span className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-500">
            {unreadCount}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onMarkAllRead}
        disabled={unreadCount === 0}
        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-500 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <CheckCheck className="h-3.5 w-3.5" />
        Mark all as read
      </button>
    </div>

    <div className="max-h-[380px] divide-y divide-[var(--border)]/50 overflow-y-auto">
      {!loading && notifications.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Sparkles className="h-6 w-6 text-[var(--text-muted)]" />
          <p className="text-xs font-medium text-[var(--text-muted)]">
            All caught up! No recent updates.
          </p>
        </div>
      )}

      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} onClick={onItemClick} />
      ))}
    </div>
  </div>
);

export default NotificationDropdown;
