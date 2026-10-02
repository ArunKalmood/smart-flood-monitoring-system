import axios from 'axios';
import toast from 'react-hot-toast';

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

// Handle global errors
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const stored = localStorage.getItem('user');
      const storedUser = stored ? JSON.parse(stored) : null;
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login')) {
        const target = storedUser?.user_type === 'admin' ? '/admin/login' : '/login';
        window.location.href = target;
      }
    }
    if (error.response?.status === 403) {
      toast.error('Access denied. Insufficient permissions.');
    }
    if (error.response?.status === 500) {
      toast.error('Server error. Please try again.');
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login:           (data) => api.post('/auth/login', data),
  register:        (data) => api.post('/auth/register', data),
  adminLogin:      (data) => api.post('/auth/admin/login', data),
  adminRegister:   (data) => api.post('/auth/admin/register', data),
  verifyToken:     (data) => api.post('/auth/verify-admin-token', data),
  me:              ()     => api.get('/auth/me'),
  forgotPassword:  (data) => api.post('/auth/forgot-password', data),
  changePassword:  (data) => api.post('/auth/change-password', data),
};

// Dashboard APIs
export const dashboardAPI = {
  getStats:          () => api.get('/dashboard/stats'),
  getWaterTrend:     (h) => api.get(`/dashboard/water-level-trend?hours=${h}`),
  getRecentAlerts:   ()  => api.get('/dashboard/recent-alerts'),
  getSOSSummary:     ()  => api.get('/dashboard/sos-summary'),
};

// Sensor APIs
export const sensorAPI = {
  getAll:        ()      => api.get('/sensors/'),
  getDashboard:  ()      => api.get('/sensors/dashboard'),
  getById:       (id)    => api.get(`/sensors/${id}`),
  ingestData:    (data)  => api.post('/sensors/data', data),
  getHistory:    (h)     => api.get(`/sensors/data/history?hours=${h}`),
};

// Prediction APIs
export const predictionAPI = {
  predict:     (data)   => api.post('/predictions/predict', data),
  getLatest:   (n)      => api.get(`/predictions/latest?limit=${n || 10}`),
  getHistory:  ()       => api.get('/predictions/history'),
  getStats:    ()       => api.get('/predictions/stats'),
};

// SOS APIs
export const sosAPI = {
  submit:      (formData) => api.post('/sos/submit', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAll:      (params)   => api.get('/sos/', { params }),
  getMapData:  ()         => api.get('/sos/map-data'),
  getStats:    ()         => api.get('/sos/stats'),
  getById:     (id)       => api.get(`/sos/${id}`),
  updateStatus:(id, data) => api.patch(`/sos/${id}/status`, data),
};

// Feedback APIs
export const feedbackAPI = {
  submit:   (formData) => api.post('/feedback/submit', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAll:   (params)   => api.get('/feedback/', { params }),
  getById:  (id)       => api.get(`/feedback/${id}`),
  update:   (id, data) => api.patch(`/feedback/${id}`, data),
  getStats: ()         => api.get('/feedback/stats/summary'),
};

// Volunteer APIs
export const volunteerAPI = {
  register:      (data)       => api.post('/volunteers/register', data),
  getAll:        (params)     => api.get('/volunteers/', { params }),
  getStats:      ()           => api.get('/volunteers/stats'),
  updateStatus:  (id, status) => api.patch(`/volunteers/${id}/status?status=${status}`),
};

// Evacuation Center APIs
export const evacuationAPI = {
  getAll:     ()       => api.get('/evacuation-centers/'),
  getMapData: ()       => api.get('/evacuation-centers/map-data'),
  create:     (data)   => api.post('/evacuation-centers/', data),
  update:     (id, d)  => api.put(`/evacuation-centers/${id}`, d),
  delete:     (id)     => api.delete(`/evacuation-centers/${id}`),
};

// Resource APIs
export const resourceAPI = {
  getAll:   (type)    => api.get('/resources/', { params: type ? { type } : {} }),
  create:   (data)    => api.post('/resources/', data),
  update:   (id, d)   => api.put(`/resources/${id}`, d),
  delete:   (id)      => api.delete(`/resources/${id}`),
};

// Alert APIs
export const alertAPI = {
  getAll:      ()   => api.get('/alerts/'),
  create:      (d)  => api.post('/alerts/', d),
  deactivate:  (id) => api.patch(`/alerts/${id}/deactivate`),
};

// Notification APIs
export const notificationAPI = {
  getAll:       (params)  => api.get('/notifications/', { params }),
  markRead:     (id)      => api.patch(`/notifications/${id}/read`),
  markAllRead:  ()        => api.patch('/notifications/mark-all-read'),
  delete:       (id)      => api.delete(`/notifications/${id}`),
};

// Report APIs
export const reportAPI = {
  generate:     (type, days, format = 'json') =>
    api.get(`/reports/generate/${type}?days=${days || 30}&format=${format}`,
      format === 'pdf' || format === 'csv'
        ? { responseType: 'blob' }
        : {}
    ),
  generatePdf:  (type, days) =>
    api.get(`/reports/generate/${type}?days=${days || 30}&format=pdf`, { responseType: 'blob' }),
  generateCsv:  (type, days) =>
    api.get(`/reports/generate/${type}?days=${days || 30}&format=csv`, { responseType: 'blob' }),
  getSummary:   () => api.get('/reports/summary'),
};

/** Helper: trigger a browser download from a blob response */
export function downloadBlob(response, fallbackFilename) {
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackFilename;
  const url = URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// User APIs
export const userAPI = {
  getProfile:  ()     => api.get('/users/profile'),
  updateProfile:(d)   => api.put('/users/profile', d),
  getAllUsers:  (p)    => api.get('/users/admin/all-users', { params: p }),
};

export default api;
