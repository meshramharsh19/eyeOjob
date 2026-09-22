import api from '../../../shared/lib/axios';

export const getProviderCatalog = () => api.get('/ai/providers').then((res) => res.data);

export const getConnectedProviders = () => api.get('/ai/providers/connected').then((res) => res.data);

export const getSetupInfo = (providerId) =>
  api.get(`/ai/providers/${providerId}/setup`).then((res) => res.data);

export const validateProviderKey = (providerId, apiKey, model) =>
  api.post(`/ai/providers/${providerId}/validate`, { apiKey, model }).then((res) => res.data);

export const connectProvider = (providerId, apiKey, model) =>
  api.post(`/ai/providers/${providerId}/connect`, { apiKey, model }).then((res) => res.data);

export const updateProviderModel = (id, model) =>
  api.patch(`/ai/providers/${id}`, { model }).then((res) => res.data);

export const testStoredProvider = (id) => api.post(`/ai/providers/${id}/test`).then((res) => res.data);

export const setProviderPriorities = (providerIds) =>
  api.put('/ai/providers/priorities', { providerIds }).then((res) => res.data);

export const disconnectProvider = (id) => api.delete(`/ai/providers/${id}`).then((res) => res.data);

export const getMonthlyUsage = () => api.get('/ai/usage/monthly').then((res) => res.data);

export const getUsageSummary = (days = 30) =>
  api.get('/ai/usage', { params: { days } }).then((res) => res.data);
