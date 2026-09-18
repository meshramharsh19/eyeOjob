import api from '../../../shared/lib/axios';

// Applications ("/jobs")
export const getApplications = () => api.get('/jobs').then((res) => res.data.applications);
export const getApplicationStats = () => api.get('/jobs/meta/stats').then((res) => res.data);
export const createApplication = (data) => api.post('/jobs', data).then((res) => res.data);
export const updateApplication = (id, data) => api.patch(`/jobs/${id}`, data).then((res) => res.data);
export const deleteApplication = (id) => api.delete(`/jobs/${id}`).then((res) => res.data);

// Application Journey (Phase 7/8) — per-application detail with the
// journey timeline (email context joined in, no full body).
export const getApplicationDetail = (id) => api.get(`/jobs/${id}`).then((res) => res.data);
export const addApplicationMilestone = (id, data) =>
  api.post(`/jobs/${id}/milestones`, data).then((res) => res.data);
export const dismissTimelineEvent = (applicationId, eventId) =>
  api.patch(`/jobs/${applicationId}/timeline/${eventId}/dismiss`).then((res) => res.data);

// Lazy-loaded full email body — "View Full Original Email" action.
export const getProcessedEmailFull = (id) =>
  api.get(`/records/processed-emails/${id}`).then((res) => res.data.email);

// Records ("/records") — read-only, per-user
export const getProcessedEmails = (params) =>
  api.get('/records/processed-emails', { params }).then((res) => res.data.emails);

export const getSyncStatus = () =>
  api.get('/records/sync-status').then((res) => res.data.syncStatus);

export const getTimelineEvents = (params) =>
  api.get('/records/timeline-events', { params }).then((res) => res.data.events);

export const getRoleAliases = (params) =>
  api.get('/records/role-aliases', { params }).then((res) => res.data.roleAliases);

export const getSelf = () => api.get('/records/users/me').then((res) => res.data.user);
