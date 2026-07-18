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

export default apiClient;
