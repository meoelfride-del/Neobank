import { useEffect, useState } from 'react';
import { Users, ShieldAlert, Ban, AlertTriangle, Check, X, Landmark } from 'lucide-react';
import api from '../services/api';

export default function AdminBackoffice() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingTx, setPendingTx] = useState([]);
  const [tab, setTab] = useState('users');

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
    await api.post(`/admin/kyc/${userId}`, { decision });
    loadAll();
  }

  async function toggleSuspend(userId, suspended) {
    await api.post(`/admin/users/${userId}/suspend`, { suspended });
    loadAll();
  }

  async function reviewTx(txId, approve) {
    await api.post(`/admin/transactions/${txId}/review`, { approve });
    loadAll();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-display font-semibold text-white">Back-Office Administration</h2>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Utilisateurs" value={stats?.totalUsers} />
        <StatCard icon={ShieldAlert} label="KYC en attente" value={stats?.pendingKyc} accent="gold" />
        <StatCard icon={Ban} label="Comptes suspendus" value={stats?.suspended} accent="coral" />
        <StatCard icon={AlertTriangle} label="Transactions à revoir" value={stats?.flaggedTx} accent="coral" />
        <StatCard icon={Landmark} label="Solde total" value={`${stats?.totalBalance?.toFixed(0) ?? 0} €`} />
      </div>

      <div className="panel p-1.5 flex gap-1 w-fit">
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
                      {u.status_kyc === 'in_review' || u.status_kyc === 'pending' ? (
                        <>
                          <button onClick={() => validateKyc(u.id, 'verified')} className="text-mint-400 hover:bg-mint-500/10 p-1.5 rounded-lg" title="Valider KYC"><Check size={15} /></button>
                          <button onClick={() => validateKyc(u.id, 'rejected')} className="text-coral-400 hover:bg-coral-500/10 p-1.5 rounded-lg" title="Rejeter KYC"><X size={15} /></button>
                        </>
                      ) : null}
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
            <div key={tx.id} className="flex items-center justify-between px-5 py-4 flex-wrap gap-2">
              <div>
                <p className="text-white text-sm font-medium">{tx.email}</p>
                <p className="text-xs text-slate-250/40">{tx.libelle || tx.category} · vers {tx.destination_info}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="amount-mono text-sm text-coral-400">{Math.abs(tx.amount).toFixed(2)} €</span>
                <button onClick={() => reviewTx(tx.id, true)} className="btn-secondary !py-1.5 !px-3 text-xs text-mint-400">Approuver</button>
                <button onClick={() => reviewTx(tx.id, false)} className="btn-danger !py-1.5 !px-3 text-xs">Rejeter</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
