import api from '../../../shared/lib/axios';

export const getNotifications = (params = { limit: 20, offset: 0 }) =>
  api.get('/notifications', { params }).then((res) => res.data.notifications);

export const getUnreadCount = () =>
  api.get('/notifications/unread-count').then((res) => res.data.count);

export const markAsRead = (id) =>
  api.patch(`/notifications/${id}/read`).then((res) => res.data);

export const markAllAsRead = () =>
  api.patch('/notifications/read-all').then((res) => res.data);
