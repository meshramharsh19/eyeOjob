import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import NotificationDropdown from './NotificationDropdown';

export const NotificationBell = ({ onSelectApplication }) => {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleItemClick = (notification) => {
    if (!notification.is_read) markRead(notification.id);
    if (notification.application_id) {
      onSelectApplication?.(notification.application_id);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm">
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/60" />
            <span className="relative">{unreadCount > 9 ? '9+' : unreadCount}</span>
          </span>
        )}
      </button>

      {open && (
        <NotificationDropdown
          notifications={notifications}
          unreadCount={unreadCount}
          loading={loading}
          onItemClick={handleItemClick}
          onMarkAllRead={markAllRead}
        />
      )}
    </div>
  );
};

export default NotificationBell;
