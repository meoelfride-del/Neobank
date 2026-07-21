import { create } from 'zustand';
import api from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('neobank_user') || 'null');
  } catch {
    localStorage.removeItem('neobank_user');
    return null;
  }
}

const useAuthStore = create((set) => ({
  user: getStoredUser(),
  isAuthenticated: !!localStorage.getItem('neobank_access_token'),
  loading: false,
  error: null,
  mfaRequired: false,

  async login(email, password, otp) {
    set({ loading: true, error: null, mfaRequired: false });
    try {
      const { data, status } = await api.post('/auth/login', { email, password, otp });
      if (status === 206 && data?.mfaRequired) {
        set({ mfaRequired: true, loading: false });
        return { success: false, mfaRequired: true };
      }
      localStorage.setItem('neobank_access_token', data.accessToken);
      localStorage.setItem('neobank_refresh_token', data.refreshToken);
      localStorage.setItem('neobank_user', JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true, loading: false });
      connectSocket();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.error || 'Erreur de connexion.';
      set({ error: message, loading: false });
      return { success: false, error: message };
    }
  },

  async register(payload) {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/register', payload);
      localStorage.setItem('neobank_access_token', data.accessToken);
      localStorage.setItem('neobank_refresh_token', data.refreshToken);
      localStorage.setItem('neobank_user', JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true, loading: false });
      connectSocket();
      return { success: true, mfaSetup: data.mfaSetup };
    } catch (err) {
      const message = err.response?.data?.details?.join(' ') || err.response?.data?.error || "Erreur lors de l'inscription.";
      set({ error: message, loading: false });
      return { success: false, error: message };
    }
  },

  async refreshUser() {
    try {
      const { data } = await api.get('/auth/me');
      localStorage.setItem('neobank_user', JSON.stringify(data.user));
      set({ user: data.user });
    } catch {
      /* silencieux : l'intercepteur gère le refresh/logout */
    }
  },

  logout() {
    localStorage.removeItem('neobank_access_token');
    localStorage.removeItem('neobank_refresh_token');
    localStorage.removeItem('neobank_user');
    disconnectSocket();
    set({ user: null, isAuthenticated: false });
  },

  clearError() {
    set({ error: null, mfaRequired: false });
  },
}));

window.addEventListener('neobank:session-expired', () => {
  disconnectSocket();
  useAuthStore.setState({ user: null, isAuthenticated: false, error: 'Votre session a expiré.' });
});

export default useAuthStore;
