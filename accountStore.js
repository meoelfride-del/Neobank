import { create } from 'zustand';
import api from '../services/api';
import { getSocket } from '../services/socket';

const useAccountStore = create((set, get) => ({
  accounts: [],
  selectedAccountId: null,
  loading: false,
  error: null,
  realtimeFlash: null, // { accountId, direction: 'up' | 'down' } — pour l'animation de mise à jour

  async fetchAccounts() {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/accounts');
      set((state) => ({
        accounts: data.accounts,
        loading: false,
        selectedAccountId: state.selectedAccountId || data.accounts[0]?.id || null,
      }));
    } catch (err) {
      set({ error: err.response?.data?.error || 'Impossible de charger les comptes.', loading: false });
    }
  },

  selectAccount(id) {
    set({ selectedAccountId: id });
  },

  getSelectedAccount() {
    const { accounts, selectedAccountId } = get();
    return accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;
  },

  async createAccount(payload) {
    const { data } = await api.post('/accounts', payload);
    set((state) => ({ accounts: [...state.accounts, data.account] }));
    return data.account;
  },

  /** Applique une mise à jour de solde reçue via WebSocket, avec flash visuel. */
  applyBalanceUpdate(accountId, balance) {
    set((state) => {
      const prev = state.accounts.find((a) => a.id === accountId);
      const direction = prev && balance > prev.balance ? 'up' : 'down';
      return {
        accounts: state.accounts.map((a) => (a.id === accountId ? { ...a, balance } : a)),
        realtimeFlash: { accountId, direction, ts: Date.now() },
      };
    });
    setTimeout(() => {
      if (get().realtimeFlash?.accountId === accountId) set({ realtimeFlash: null });
    }, 1800);
  },

  /** Attache les écouteurs WebSocket — à appeler une fois après connexion du socket. */
  bindSocketListeners() {
    const socket = getSocket();
    if (!socket) return;
    socket.off('balance:update');
    socket.on('balance:update', ({ accountId, balance }) => {
      get().applyBalanceUpdate(accountId, balance);
    });
  },
}));

export default useAccountStore;
