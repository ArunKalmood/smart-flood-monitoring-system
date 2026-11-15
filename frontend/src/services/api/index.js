import axios from 'axios';
import toast from '../../utils/toast';
import { translate } from '../../i18n';
import { utcOffsetMinutes } from '../../utils/datetime';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const AUTH_PAGES = ['/login', '/admin/login', '/register', '/admin/register', '/forgot-password'];

// Session expiry and server errors are handled once, here. Pages show the
// specific message for everything else via getErrorMessage().
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const onAuthPage = AUTH_PAGES.includes(window.location.pathname);
    if (status === 401 && !onAuthPage && localStorage.getItem('access_token')) {
      let wasAdmin = false;
      try {
        wasAdmin = JSON.parse(localStorage.getItem('user') || 'null')?.user_type === 'admin';
      } catch {
        wasAdmin = false;
      }
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      window.location.href = wasAdmin ? '/admin/login' : '/login';
    }
    if (status === 403) toast.error(translate('error_forbidden'), { id: 'api-403' });
    if (status >= 500) toast.error(translate('error_server'), { id: 'api-500' });
    return Promise.reject(error);
  }
);

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const authAPI = {
  login:             (data) => api.post('/auth/login', data),
  register:          (data) => api.post('/auth/register', data),
  adminLogin:        (data) => api.post('/auth/admin/login', data),
  adminRegister:     (data) => api.post('/auth/admin/register', data),
  verifyToken:       (data) => api.post('/auth/verify-admin-token', data),
  me:                ()     => api.get('/auth/me'),
  forgotPassword:    (data) => api.post('/auth/forgot-password', data),
  changePassword:    (data) => api.post('/auth/change-password', data),
  googleLogin:       (credential) => api.post('/auth/google', { credential }),
};

// Public (no login): aggregated, non-personal numbers for the home page
export const publicAPI = {
  summary: () => api.get('/public/summary'),
};

export const dashboardAPI = {
  getStats:        ()      => api.get('/dashboard/stats'),
  getWaterTrend:   (hours) => api.get('/dashboard/water-level-trend', { params: { hours } }),
  getRecentAlerts: ()      => api.get('/dashboard/recent-alerts'),
};

export const sensorAPI = {
  getAll:     ()                => api.get('/sensors/'),
  getHistory: (sensorId, hours) => api.get('/sensors/data/history', { params: { sensor_id: sensorId, hours } }),
  getLive:    (sensorId)        => api.get('/sensors/live', { params: sensorId ? { sensor_id: sensorId } : {} }),
};

export const predictionAPI = {
  simulate:   (data)  => api.post('/predictions/predict', data),
  getHistory: (hours) => api.get('/predictions/history', { params: { hours } }),
  getDaily:   (days)  => api.get('/predictions/daily', { params: { days, utc_offset_minutes: utcOffsetMinutes() } }),
  getStats:   (days)  => api.get('/predictions/stats', { params: { days } }),
};

export const aiAPI = {
  analyzeFlood:   (data)    => api.post('/ai/analyze-flood', data),
  getFloodStatus: ()        => api.get('/ai/flood-status'),
  chat:           (data)    => api.post('/ai/chat', data),
  translate:      (data)    => api.post('/ai/translate', data),
  getGeminiStatus:()        => api.get('/ai/gemini-status'),
  getLanguages:   ()        => api.get('/ai/languages'),
  getHistory:     (params)  => api.get('/ai/history', { params }),
};

export const evacuationHelperAPI = {
  getNearby:      (params)  => api.get('/evacuation/nearby-centres', { params }),
  recommendRoute: (data)    => api.post('/evacuation/recommend-route', data),
};

export const sosAPI = {
  submit:       (formData) => api.post('/sos/submit', formData, multipart),
  getAll:       (params)   => api.get('/sos/', { params }),
  getMapData:   ()         => api.get('/sos/map-data'),
  getStats:     ()         => api.get('/sos/stats'),
  getHistory:   (id)       => api.get(`/sos/${id}/history`),
  updateStatus: (id, data) => api.patch(`/sos/${id}/status`, data),
};

export const feedbackAPI = {
  submit:   (formData) => api.post('/feedback/submit', formData, multipart),
  getAll:   (params)   => api.get('/feedback/', { params }),
  update:   (id, data) => api.patch(`/feedback/${id}`, data),
  getStats: ()         => api.get('/feedback/stats/summary'),
};

export const volunteerAPI = {
  register:     (data)       => api.post('/volunteers/register', data),
  getAll:       (params)     => api.get('/volunteers/', { params }),
  getStats:     ()           => api.get('/volunteers/stats'),
  updateStatus: (id, status) => api.patch(`/volunteers/${id}/status`, null, { params: { status } }),
};

export const evacuationAPI = {
  getAll:     ()         => api.get('/evacuation-centers/'),
  getMapData: ()         => api.get('/evacuation-centers/map-data'),
  create:     (data)     => api.post('/evacuation-centers/', data),
  update:     (id, data) => api.put(`/evacuation-centers/${id}`, data),
  delete:     (id)       => api.delete(`/evacuation-centers/${id}`),
};

export const resourceAPI = {
  getAll: ()         => api.get('/resources/'),
  create: (data)     => api.post('/resources/', data),
  update: (id, data) => api.put(`/resources/${id}`, data),
  delete: (id)       => api.delete(`/resources/${id}`),
};

export const alertAPI = {
  getAll: () => api.get('/alerts/'),
};

export const notificationAPI = {
  getAll:      (params) => api.get('/notifications/', { params }),
  markRead:    (id)     => api.patch(`/notifications/${id}/read`),
  markAllRead: ()       => api.patch('/notifications/mark-all-read'),
  delete:      (id)     => api.delete(`/notifications/${id}`),
};

export const reportAPI = {
  generate: (type, days, format = 'json') =>
    api.get(`/reports/generate/${type}`, {
      params: { days, format },
      ...(format === 'json' ? {} : { responseType: 'blob' }),
    }),
};

/** Trigger a browser download from a blob response. */
export function downloadBlob(response, fallbackFilename) {
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const url = URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : fallbackFilename;
  a.click();
  URL.revokeObjectURL(url);
}

export const auditAPI = {
  getAll:     (params) => api.get('/audit/', { params }),
  getActions: ()       => api.get('/audit/actions'),
  getStats:   (days)   => api.get('/audit/stats', { params: { days } }),
};

/** Dam LSTM water-level forecast (completely separate from rule-based predictions). */
export const lstmAPI = {
  predict: () => api.get('/lstm/predict'),
  status:  () => api.get('/lstm/status'),
};

export const userAPI = {
  getProfile:    ()     => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
};

export default api;
