import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import useAccountStore from '../store/accountStore';
import api from '../services/api';
import BudgetChart from '../components/BudgetChart';

const CATEGORY_COLORS = ['#16E0B0', '#F2B705', '#FF5D5D', '#3CF0C5', '#8B98AC', '#F7CB3F', '#E24444'];

export default function Budget() {
  const { accounts, selectedAccountId, selectAccount, fetchAccounts } = useAccountStore();
  const [budget, setBudget] = useState(null);

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => {
    if (!selectedAccountId) return;
    api.get(`/budget/${selectedAccountId}`).then(({ data }) => setBudget(data));
  }, [selectedAccountId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-display font-semibold text-white">Analyse budgétaire</h2>
        <select className="input-field !w-auto text-sm py-2" value={selectedAccountId || ''} onChange={(e) => selectAccount(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="panel p-6">
          <p className="text-sm text-slate-250/50 mb-1">Total dépensé (30 derniers jours)</p>
          <p className="amount-mono text-3xl font-semibold text-white mb-4">{budget?.totalSpent?.toFixed(2) || '0.00'} €</p>
          <BudgetChart summary={budget?.summary} />
        </div>

        <div className="panel p-6">
          <p className="text-sm font-medium text-white mb-4">Détail par catégorie</p>
          <div className="space-y-3">
            {budget?.summary?.length ? budget.summary.map((s, i) => (
              <div key={s.category}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                    <span className="text-sm text-white">{s.category}</span>
                    {s.alert && <AlertTriangle size={13} className="text-coral-400" />}
                  </div>
                  <span className="amount-mono text-sm text-slate-250/70">
                    {s.total.toFixed(2)} € {s.threshold ? `/ ${s.threshold} €` : ''}
                  </span>
                </div>
                {s.threshold && (
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${s.alert ? 'bg-coral-500' : 'bg-mint-500'}`}
                      style={{ width: `${Math.min(100, (s.total / s.threshold) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )) : (
              <p className="text-sm text-slate-250/40 text-center py-6">Aucune dépense catégorisée.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
