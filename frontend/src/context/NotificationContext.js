import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { notificationAPI } from '../services/api';
import { useAuth } from './AuthContext';
import { toastError } from '../utils/toast';

const POLL_MS = 30000;
const EMPTY = { notifications: [], total: 0, unread_count: 0 };

const NotificationContext = createContext(null);
export const useNotifications = () => useContext(NotificationContext);

/** Notifications come only from the API; counts are the API's `total` / `unread_count`. */
export function NotificationProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setData(EMPTY);
      return;
    }
    try {
      const res = await notificationAPI.getAll({ limit: 100 });
      setData({ ...EMPTY, ...res.data });
    } catch {
      // keep the last known list; the page shows its own error on manual refresh
    } finally {
      setLoaded(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchNotifications();
    if (!isAuthenticated) return undefined;
    const interval = setInterval(fetchNotifications, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications, isAuthenticated]);

  const mutate = useCallback(async (request) => {
    try {
      await request();
    } catch (err) {
      toastError(err);
    }
    await fetchNotifications(); // counts always come from the server
  }, [fetchNotifications]);

  const value = {
    notifications: data.notifications,
    total: data.total,
    unreadCount: data.unread_count,
    loaded,
    fetchNotifications,
    markRead: (id) => mutate(() => notificationAPI.markRead(id)),
    markAllRead: () => mutate(() => notificationAPI.markAllRead()),
    removeNotification: (id) => mutate(() => notificationAPI.delete(id)),
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
