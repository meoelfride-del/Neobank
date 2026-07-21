import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD
    ? 'https://neobank-api-meoelfride.onrender.com/api'
    : 'http://localhost:4000/api');

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('neobank_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute = originalRequest?.url?.startsWith('/auth/');

    if (error.response?.status !== 401 || originalRequest?._retry || isAuthRoute) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem('neobank_refresh_token');
    if (!refreshToken) return Promise.reject(error);

    originalRequest._retry = true;
    try {
      refreshPromise ||= axios
        .post(`${API_BASE}/auth/refresh`, { refreshToken })
        .then(({ data }) => {
          localStorage.setItem('neobank_access_token', data.accessToken);
          return data.accessToken;
        })
        .finally(() => {
          refreshPromise = null;
        });

      const accessToken = await refreshPromise;
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      localStorage.removeItem('neobank_access_token');
      localStorage.removeItem('neobank_refresh_token');
      localStorage.removeItem('neobank_user');
      window.dispatchEvent(new Event('neobank:session-expired'));
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
