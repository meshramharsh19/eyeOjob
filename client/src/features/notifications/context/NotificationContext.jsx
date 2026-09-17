import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth';
import {
  getNotifications,
  getUnreadCount,
  markAsRead as apiMarkAsRead,
  markAllAsRead as apiMarkAllAsRead,
} from '../api/notifications.api';

const NotificationContext = createContext();

const POLL_INTERVAL_MS = 45000;

export const NotificationProvider = ({ children }) => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const unreadCountRef = useRef(0);
  unreadCountRef.current = unreadCount;

  const refreshNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, count] = await Promise.all([getNotifications(), getUnreadCount()]);
      setNotifications(list);
      setUnreadCount(count);
    } catch {
      // Best-effort UI sugar — a failed fetch just leaves the last known state on screen.
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Cheap poll: just the count. Only re-fetches the full list when the count
  // actually moved, so a 45s tick with nothing new costs one tiny request.
  const pollUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const count = await getUnreadCount();
      if (count !== unreadCountRef.current) {
        setUnreadCount(count);
        const list = await getNotifications();
        setNotifications(list);
      }
    } catch {
      // Ignore — next poll or manual refresh will recover.
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    refreshNotifications();

    const interval = setInterval(pollUnreadCount, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') pollUnreadCount();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [token, refreshNotifications, pollUnreadCount]);

  const markRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.is_read ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(prev - 1, 0));
    try {
      await apiMarkAsRead(id);
    } catch {
      refreshNotifications();
    }
  }, [refreshNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await apiMarkAllAsRead();
    } catch {
      refreshNotifications();
    }
  }, [refreshNotifications]);

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loading, markRead, markAllRead, refreshNotifications }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
