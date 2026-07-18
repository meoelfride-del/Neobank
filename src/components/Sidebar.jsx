import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Wallet, ArrowLeftRight, CreditCard, PieChart, MessageCircle,
  ShieldCheck, LogOut, Landmark,
} from 'lucide-react';
import useAuthStore from '../store/authStore';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/accounts', label: 'Comptes', icon: Wallet },
  { to: '/transfer', label: 'Virements', icon: ArrowLeftRight },
  { to: '/cards', label: 'Cartes', icon: CreditCard },
  { to: '/budget', label: 'Budget', icon: PieChart },
  { to: '/chatbot', label: 'Assistant', icon: MessageCircle },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <div className="flex flex-col w-64 h-full px-4 py-6">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-9 h-9 rounded-xl bg-mint-500 flex items-center justify-center">
          <Landmark size={18} className="text-ink-950" strokeWidth={2.5} />
        </div>
        <span className="font-display font-semibold text-lg text-white tracking-tight">NeoBank</span>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
            <ShieldCheck size={18} strokeWidth={2} />
            Back-Office
          </NavLink>
        )}
      </nav>

      <div className="border-t border-white/5 pt-4 mt-4">
        <div className="px-2 mb-3">
          <p className="text-sm font-medium text-white truncate">{user?.prenom} {user?.nom}</p>
          <p className="text-xs text-slate-250/50 truncate">{user?.email}</p>
        </div>
        <button onClick={logout} className="nav-link w-full text-coral-400 hover:text-coral-400 hover:bg-coral-500/10">
          <LogOut size={18} strokeWidth={2} />
          Déconnexion
        </button>
      </div>
    </div>
  );
}
