import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
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
  const { bindSocketListeners } = useAccountStore();
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = connectSocket();
    const handleConnect = () => bindSocketListeners();

    socket.on('connect', handleConnect);
    bindSocketListeners();

    return () => {
      socket.off('connect', handleConnect);
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
        <main className="px-5 md:px-8 py-6 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
