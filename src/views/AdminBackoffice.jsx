import { useEffect, useState } from 'react';
import { Users, ShieldAlert, Ban, AlertTriangle, Check, X, Landmark, Pencil, WalletCards } from 'lucide-react';
import api from '../services/api';

export default function AdminBackoffice() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingTx, setPendingTx] = useState([]);
  const [tab, setTab] = useState('users');
  const [editingUser, setEditingUser] = useState(null);
  const [fundUser, setFundUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [s, u, t] = await Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/users'),
      api.get('/admin/transactions/pending'),
    ]);
    setStats(s.data);
    setUsers(u.data.users);
    setPendingTx(t.data.transactions);
  }

  async function validateKyc(userId, decision) {
    await runAction(() => api.post(`/admin/kyc/${userId}`, { decision }), 'Statut KYC mis à jour.');
  }

  async function toggleSuspend(userId, suspended) {
    await runAction(() => api.post(`/admin/users/${userId}/suspend`, { suspended }), 'Statut du compte mis à jour.');
  }

  async function reviewTx(txId, approve) {
    await runAction(() => api.post(`/admin/transactions/${txId}/review`, { approve }), 'Transaction traitée.');
  }

  async function runAction(action, successMessage) {
    try {
      setFeedback(null);
      await action();
      setFeedback({ type: 'success', text: successMessage });
      await loadAll();
      return true;
    } catch (error) {
      setFeedback({ type: 'error', text: error.response?.data?.error || 'Opération impossible.' });
      return false;
    }
  }

  async function openFunds(user) {
    try {
      const { data } = await api.get(`/admin/users/${user.id}/accounts`);
      setAccounts(data.accounts);
      setFundUser(user);
    } catch (error) {
      setFeedback({ type: 'error', text: error.response?.data?.error || 'Impossible de charger les comptes.' });
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-display font-semibold text-white">Back-Office Administration</h2>

      {feedback && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-mint-500/20 bg-mint-500/10 text-mint-400' : 'border-coral-500/20 bg-coral-500/10 text-coral-400'}`}>
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Utilisateurs" value={stats?.totalUsers} />
        <StatCard icon={ShieldAlert} label="KYC en attente" value={stats?.pendingKyc} accent="gold" />
        <StatCard icon={Ban} label="Comptes suspendus" value={stats?.suspended} accent="coral" />
        <StatCard icon={AlertTriangle} label="Transactions à revoir" value={stats?.flaggedTx} accent="coral" />
        <StatCard icon={Landmark} label="Solde total" value={`${stats?.totalBalance?.toFixed(0) ?? 0} €`} />
      </div>

      <div className="panel p-1.5 flex gap-1 w-full sm:w-fit overflow-x-auto">
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>Utilisateurs</TabButton>
        <TabButton active={tab === 'fraud'} onClick={() => setTab('fraud')}>Transactions suspectes</TabButton>
      </div>

      {tab === 'users' && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-250/50 border-b border-white/5">
                <th className="px-5 py-3 font-medium">Utilisateur</th>
                <th className="px-5 py-3 font-medium">KYC</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Score fraude</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <p className="text-white font-medium">{u.prenom} {u.nom}</p>
                    <p className="text-xs text-slate-250/40">{u.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={u.status_kyc} />
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.status_compte === 'active' ? 'bg-mint-500/10 text-mint-400' : 'bg-coral-500/10 text-coral-400'}`}>
                      {u.status_compte === 'active' ? 'Actif' : 'Suspendu'}
                    </span>
                  </td>
                  <td className="px-5 py-3 amount-mono text-slate-250/70">{u.fraud_score}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setEditingUser({ ...u })} className="text-slate-250/70 hover:bg-white/5 p-1.5 rounded-lg" title="Modifier les coordonnées"><Pencil size={15} /></button>
                      <button onClick={() => openFunds(u)} className="text-gold-400 hover:bg-gold-500/10 p-1.5 rounded-lg" title="Ajuster les fonds"><WalletCards size={15} /></button>
                      {u.status_kyc !== 'verified' && <button onClick={() => validateKyc(u.id, 'verified')} className="text-mint-400 hover:bg-mint-500/10 p-1.5 rounded-lg" title="Valider KYC"><Check size={15} /></button>}
                      {u.status_kyc !== 'rejected' && <button onClick={() => validateKyc(u.id, 'rejected')} className="text-coral-400 hover:bg-coral-500/10 p-1.5 rounded-lg" title="Rejeter KYC"><X size={15} /></button>}
                      <button
                        onClick={() => toggleSuspend(u.id, u.status_compte === 'active')}
                        className={`text-xs px-2.5 py-1 rounded-lg border ${u.status_compte === 'active' ? 'border-coral-500/20 text-coral-400 hover:bg-coral-500/10' : 'border-mint-500/20 text-mint-400 hover:bg-mint-500/10'}`}
                      >
                        {u.status_compte === 'active' ? 'Suspendre' : 'Réactiver'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'fraud' && (
        <div className="panel divide-y divide-white/5">
          {pendingTx.length === 0 ? (
            <p className="text-sm text-slate-250/40 text-center py-10">Aucune transaction en attente de revue.</p>
          ) : pendingTx.map((tx) => (
            <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-5 py-4 gap-3">
              <div>
                <p className="text-white text-sm font-medium">{tx.email}</p>
                <p className="text-xs text-slate-250/40">{tx.libelle || tx.category} · vers {tx.destination_info}</p>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 w-full sm:w-auto">
                <span className="amount-mono text-sm text-coral-400">{Math.abs(tx.amount).toFixed(2)} €</span>
                <button onClick={() => reviewTx(tx.id, true)} className="btn-secondary !py-1.5 !px-3 text-xs text-mint-400">Approuver</button>
                <button onClick={() => reviewTx(tx.id, false)} className="btn-danger !py-1.5 !px-3 text-xs">Rejeter</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={async (payload) => {
            const ok = await runAction(() => api.patch(`/admin/users/${editingUser.id}`, payload), 'Coordonnées mises à jour.');
            if (ok) setEditingUser(null);
          }}
        />
      )}

      {fundUser && (
        <FundsDialog
          user={fundUser}
          accounts={accounts}
          onClose={() => setFundUser(null)}
          onSubmit={async (accountId, payload) => {
            const ok = await runAction(() => api.post(`/admin/accounts/${accountId}/adjust-balance`, payload), 'Solde ajusté avec succès.');
            if (ok) {
              const { data } = await api.get(`/admin/users/${fundUser.id}/accounts`);
              setAccounts(data.accounts);
            }
          }}
        />
      )}
    </div>
  );
}

function DialogShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-250/50 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditUserDialog({ user, onClose, onSave }) {
  const [form, setForm] = useState({ nom: user.nom, prenom: user.prenom, email: user.email, phone: user.phone || '' });
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };
  return (
    <DialogShell title="Modifier le client" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AdminInput label="Prénom" value={form.prenom} onChange={(value) => setForm({ ...form, prenom: value })} />
          <AdminInput label="Nom" value={form.nom} onChange={(value) => setForm({ ...form, nom: value })} />
        </div>
        <AdminInput label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <AdminInput label="Téléphone" type="tel" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </DialogShell>
  );
}

function FundsDialog({ user, accounts, onClose, onSubmit }) {
  const [form, setForm] = useState({ accountId: accounts[0]?.id || '', operation: 'credit', amount: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    await onSubmit(form.accountId, { operation: form.operation, amount: Number(form.amount), reason: form.reason });
    setForm((current) => ({ ...current, amount: '', reason: '' }));
    setSaving(false);
  };
  return (
    <DialogShell title={`Ajuster les fonds — ${user.prenom} ${user.nom}`} onClose={onClose}>
      {accounts.length === 0 ? <p className="text-sm text-slate-250/60">Ce client ne possède aucun compte.</p> : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs text-slate-250/60">Compte
            <select className="input-field mt-1" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.label} — {Number(account.balance).toFixed(2)} {account.currency}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-slate-250/60">Opération
              <select className="input-field mt-1" value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })}>
                <option value="credit">Ajouter des fonds</option>
                <option value="debit">Soustraire des fonds</option>
              </select>
            </label>
            <AdminInput label="Montant" type="number" min="0.01" step="0.01" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
          </div>
          <AdminInput label="Motif de l’ajustement" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} />
          <button disabled={saving} className="btn-primary w-full">{saving ? 'Traitement…' : 'Confirmer l’ajustement'}</button>
        </form>
      )}
    </DialogShell>
  );
}

function AdminInput({ label, onChange, ...props }) {
  return <label className="block text-xs text-slate-250/60">{label}<input required className="input-field mt-1" onChange={(e) => onChange(e.target.value)} {...props} /></label>;
}

function StatCard({ icon: Icon, label, value, accent }) {
  const colors = { gold: 'text-gold-400 bg-gold-500/10', coral: 'text-coral-400 bg-coral-500/10' };
  return (
    <div className="panel p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${colors[accent] || 'text-mint-400 bg-mint-500/10'}`}>
        <Icon size={16} />
      </div>
      <p className="amount-mono text-xl font-semibold text-white">{value ?? '—'}</p>
      <p className="text-xs text-slate-250/50 mt-0.5">{label}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-xl text-sm transition-colors ${active ? 'bg-mint-500/10 text-mint-400' : 'text-slate-250/60 hover:bg-white/5'}`}>
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    verified: ['Vérifié', 'bg-mint-500/10 text-mint-400'],
    pending: ['En attente', 'bg-white/10 text-slate-250/60'],
    in_review: ['En cours', 'bg-gold-500/10 text-gold-400'],
    rejected: ['Rejeté', 'bg-coral-500/10 text-coral-400'],
  };
  const [label, cls] = map[status] || map.pending;
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}
