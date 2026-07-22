import { useState } from 'react';
import { ChevronDown, ShieldAlert, ShieldCheck, Menu } from 'lucide-react';
import useAccountStore from '../store/accountStore';
import useAuthStore from '../store/authStore';
import NotificationCenter from './NotificationCenter';

export default function Navbar({ title, onMenuClick }) {
  const { accounts, selectedAccountId, selectAccount } = useAccountStore();
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a.id === selectedAccountId);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3.5 sm:px-5 md:px-8 py-3.5 sm:py-4 border-b border-white/5 bg-ink-900/80 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="md:hidden text-slate-250/70">
          <Menu size={22} />
        </button>
        <h1 className="text-base sm:text-lg md:text-xl font-display font-semibold text-white truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {user?.status_kyc !== 'verified' && (
          <span className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gold-500/10 text-gold-400 border border-gold-500/20">
            <ShieldAlert size={13} /> KYC {user?.status_kyc === 'in_review' ? 'en cours' : 'requis'}
          </span>
        )}
        {user?.status_kyc === 'verified' && (
          <span className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-mint-500/10 text-mint-400 border border-mint-500/20">
            <ShieldCheck size={13} /> Identité vérifiée
          </span>
        )}

        <NotificationCenter />

        {accounts.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white transition-colors"
            >
              <span className="font-medium max-w-20 sm:max-w-none truncate">{selected?.label || 'Compte'}</span>
              <span className="text-slate-250/50 font-mono text-xs">{selected?.currency}</span>
              <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-56 panel p-1.5 z-30">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => { selectAccount(acc.id); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center ${acc.id === selectedAccountId ? 'bg-mint-500/10 text-mint-400' : 'text-slate-250/80 hover:bg-white/5'}`}
                  >
                    <span>{acc.label}</span>
                    <span className="font-mono text-xs opacity-70">{acc.currency}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
