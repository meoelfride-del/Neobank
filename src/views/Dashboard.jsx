import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, PieChart as PieIcon, Sparkles } from 'lucide-react';
import useAccountStore from '../store/accountStore';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import TransactionRow from '../components/TransactionRow';
import BudgetChart from '../components/BudgetChart';

export default function Dashboard() {
  const { accounts, selectedAccountId, fetchAccounts, getSelectedAccount, realtimeFlash } = useAccountStore();
  const { user } = useAuthStore();
  const [transactions, setTransactions] = useState([]);
  const [budget, setBudget] = useState(null);
  const account = getSelectedAccount();

  useEffect(() => { fetchAccounts(); }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    api.get(`/transactions/account/${selectedAccountId}`).then(({ data }) => setTransactions(data.transactions.slice(0, 6)));
    api.get(`/budget/${selectedAccountId}`).then(({ data }) => setBudget(data));
  }, [selectedAccountId, realtimeFlash]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const isFlashing = realtimeFlash?.accountId === selectedAccountId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-mint-400" />
        <p className="text-sm text-slate-250/60">Bonjour {user?.prenom}, voici votre situation en temps réel.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Solde principal */}
        <div className="lg:col-span-2 panel p-7 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-mint-500/10 blur-3xl" />
          <p className="text-sm text-slate-250/50 mb-2 relative z-10">Solde total ({accounts.length} compte{accounts.length > 1 ? 's' : ''})</p>
          <p
            key={totalBalance}
            className={`amount-mono text-4xl md:text-5xl font-semibold text-white animate-countup relative z-10 transition-colors ${isFlashing ? (realtimeFlash.direction === 'up' ? 'text-mint-400' : 'text-coral-400') : ''}`}
          >
            {totalBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </p>

          <div className="flex gap-2 mt-6 relative z-10">
            <Link to="/transfer" className="btn-primary flex items-center gap-2 text-sm">
              <Send size={15} /> Virement
            </Link>
            <Link to="/budget" className="btn-secondary flex items-center gap-2 text-sm">
              <PieIcon size={15} /> Voir le budget
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6 relative z-10">
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-white/5 rounded-xl p-4 border border-white/5">
                <p className="text-xs text-slate-250/50 mb-1">{acc.label}</p>
                <p className="amount-mono text-lg text-white font-medium">
                  {acc.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {acc.currency === 'EUR' ? '€' : acc.currency}
                </p>
                <p className="text-[11px] text-slate-250/30 font-mono mt-1 truncate">{acc.iban}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Répartition budget */}
        <div className="panel p-6">
          <p className="text-sm font-medium text-white mb-1">Dépenses (30j)</p>
          <p className="text-xs text-slate-250/50 mb-2">{budget?.totalSpent?.toFixed(2) || '0.00'} € au total</p>
          <BudgetChart summary={budget?.summary} />
        </div>
      </div>

      {/* Transactions récentes */}
      <div className="panel p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-white">Transactions récentes</p>
          <Link to="/accounts" className="text-xs text-mint-400 hover:underline">Tout voir</Link>
        </div>
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-250/40 py-6 text-center">Aucune transaction pour le moment.</p>
        ) : (
          <div>{transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}</div>
        )}
      </div>
    </div>
  );
}
