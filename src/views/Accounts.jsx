import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import useAccountStore from '../store/accountStore';
import api from '../services/api';
import TransactionRow from '../components/TransactionRow';

const CURRENCIES = ['EUR', 'USD', 'GBP'];

export default function Accounts() {
  const { accounts, selectedAccountId, selectAccount, fetchAccounts, createAccount } = useAccountStore();
  const [transactions, setTransactions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: 'Courant', currency: 'EUR', label: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchAccounts(); }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    api.get(`/transactions/account/${selectedAccountId}`).then(({ data }) => setTransactions(data.transactions));
  }, [selectedAccountId]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const acc = await createAccount(form);
      selectAccount(acc.id);
      setShowModal(false);
      setForm({ type: 'Courant', currency: 'EUR', label: '' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold text-white">Vos comptes</h2>
        <button onClick={() => setShowModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <Plus size={15} /> Nouveau compte
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <button
            key={acc.id}
            onClick={() => selectAccount(acc.id)}
            className={`panel p-5 text-left transition-all ${acc.id === selectedAccountId ? 'ring-1 ring-mint-500/50 bg-mint-500/5' : 'hover:bg-white/[0.03]'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-250/60">{acc.type}</span>
              <span className="text-xs font-mono text-slate-250/40">{acc.currency}</span>
            </div>
            <p className="text-sm text-slate-250/50 mb-1">{acc.label}</p>
            <p className="amount-mono text-2xl font-semibold text-white">
              {acc.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] font-mono text-slate-250/30 mt-2 truncate">{acc.iban}</p>
          </button>
        ))}
      </div>

      <div className="panel p-6">
        <p className="text-sm font-medium text-white mb-2">Historique du compte sélectionné</p>
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-250/40 py-6 text-center">Aucune transaction.</p>
        ) : (
          <div>{transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}</div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setShowModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleCreate} className="panel p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-white">Nouveau compte</h3>
              <button type="button" onClick={() => setShowModal(false)}><X size={18} className="text-slate-250/50" /></button>
            </div>

            <div>
              <label className="label-field">Type</label>
              <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="Courant">Courant</option>
                <option value="Epargne">Épargne</option>
              </select>
            </div>
            <div>
              <label className="label-field">Devise</label>
              <select className="input-field" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">Nom du compte</label>
              <input required className="input-field" placeholder="Ex : Épargne Voyage" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <button type="submit" disabled={creating} className="btn-primary w-full">Créer le compte</button>
          </form>
        </div>
      )}
    </div>
  );
}
