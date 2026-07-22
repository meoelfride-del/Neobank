import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Bell, X } from 'lucide-react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import useAccountStore from '../store/accountStore';
import useAuthStore from '../store/authStore';
import { connectSocket } from '../services/socket';

const TITLES = {
  '/dashboard': 'Tableau de bord',
  '/accounts': 'Comptes',
  '/transfer': 'Virements',
  '/cards': 'Cartes',
  '/budget': 'Budget',
  '/chatbot': 'Assistant',
  '/admin': 'Back-Office',
};

export default function AppLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const { bindSocketListeners } = useAccountStore();
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = connectSocket();
    const handleConnect = () => bindSocketListeners();
    const handleNotification = (notification) => {
      const id = notification.id || `${Date.now()}-${Math.random()}`;
      setNotifications((items) => [...items.slice(-2), { ...notification, id }]);
      window.setTimeout(() => {
        setNotifications((items) => items.filter((item) => item.id !== id));
      }, 8000);
    };

    socket.on('connect', handleConnect);
    socket.on('transaction:notification', handleNotification);
    socket.on('admin:notification', handleNotification);
    bindSocketListeners();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('transaction:notification', handleNotification);
      socket.off('admin:notification', handleNotification);
    };
  }, [isAuthenticated, bindSocketListeners]);

  const title = TITLES[location.pathname] || 'NeoBank';

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:block shrink-0 h-screen sticky top-0 border-r border-white/5 bg-ink-950/60 backdrop-blur-sm">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-ink-950">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 text-slate-250/60"><X size={20} /></button>
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <Navbar title={title} onMenuClick={() => setMobileOpen(true)} />
        <main className="px-3.5 sm:px-5 md:px-8 py-4 sm:py-6 max-w-7xl mx-auto">{children}</main>
      </div>

      <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-5 sm:w-96 z-[60] space-y-2" aria-live="polite">
        {notifications.map((notification) => (
          <div key={notification.id} className="panel p-4 flex items-start gap-3 shadow-2xl border-mint-500/20">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${notification.kind === 'security' ? 'bg-coral-500/10 text-coral-400' : notification.direction === 'incoming' || notification.kind === 'success' ? 'bg-mint-500/10 text-mint-400' : 'bg-gold-500/10 text-gold-400'}`}>
              {notification.kind ? <Bell size={18} /> : notification.direction === 'incoming' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              {notification.title && <p className="text-sm font-semibold text-white">{notification.title}</p>}
              <p className={notification.title ? 'text-xs text-slate-250/70 mt-1' : 'text-sm font-medium text-white'}>{notification.message}</p>
              {notification.action_url && <button onClick={() => navigate(notification.action_url)} className="text-xs text-mint-400 hover:underline mt-2">Ouvrir</button>}
              {Number.isFinite(Number(notification.amount)) && <p className="amount-mono text-xs text-slate-250/60 mt-1">{Number(notification.amount).toFixed(2)} €</p>}
            </div>
            <button onClick={() => setNotifications((items) => items.filter((item) => item.id !== notification.id))} className="text-slate-250/40"><X size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
