import { useEffect, useState } from 'react';
import { Users, ShieldAlert, Ban, AlertTriangle, Check, X, Landmark, Pencil, WalletCards, KeyRound, Bell, Eye } from 'lucide-react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import TransactionRow from '../components/TransactionRow';
import KycReviewDialog from '../components/KycReviewDialog';
import BankingDialog from '../components/BankingDialog';

export default function AdminBackoffice() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingTx, setPendingTx] = useState([]);
  const [tab, setTab] = useState('users');
  const [editingUser, setEditingUser] = useState(null);
  const [fundUser, setFundUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [otpTransaction, setOtpTransaction] = useState(null);
  const [notifyUser, setNotifyUser] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [kycUser, setKycUser] = useState(null);
  const [bankUser, setBankUser] = useState(null);
  const [kycFilter, setKycFilter] = useState('in_review');
  const [sms, setSms] = useState({ enabled: false, messages: [] });
  const [smsDiagnostic, setSmsDiagnostic] = useState(null);
  const [checkingSms, setCheckingSms] = useState(false);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const socket = getSocket();
    const refreshOtpStatus = () => loadAll();
    const events = ['transaction:otp-verified', 'transaction:otp-required', 'kyc:updated', 'user:registered', 'user:updated'];
    events.forEach(event => socket.on(event, refreshOtpStatus));
    window.addEventListener('focus', refreshOtpStatus);
    return () => { events.forEach(event => socket.off(event, refreshOtpStatus)); window.removeEventListener('focus', refreshOtpStatus); };
  }, []);

  useEffect(() => {
    if (tab !== 'sms') return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      api.get('/admin/sms').then(({ data }) => setSms(data)).catch(() => setFeedback({ type: 'error', text: 'Suivi SMS temporairement indisponible.' }));
    }, 30000);
    return () => clearInterval(timer);
  }, [tab]);

  async function loadAll() {
    try {
    const [s, u, t, smsResult] = await Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/users'),
      api.get('/admin/transactions/pending'),
      api.get('/admin/sms'),
    ]);
    setStats(s.data);
    setUsers(u.data.users);
    setPendingTx(t.data.transactions);
    setSms(smsResult.data);
    } catch {
      setFeedback({ type: 'error', text: 'Impossible de charger le backoffice. Réessayez ou vérifiez la connexion à l’API.' });
    }
  }

  async function toggleSuspend(userId, suspended) {
    await runAction(() => api.post(`/admin/users/${userId}/suspend`, { suspended }), 'Statut du compte mis à jour.');
  }

  async function checkSmsConnection() {
    setCheckingSms(true);
    setSmsDiagnostic(null);
    try {
      const { data } = await api.get('/admin/sms/diagnostics');
      setSmsDiagnostic(data);
    } catch {
      setSmsDiagnostic({ state: 'error', message: 'Impossible de joindre l’API pour vérifier TextBee.' });
    } finally { setCheckingSms(false); }
  }

  async function reviewTx(txId, approve) {
    await runAction(() => api.post(`/admin/transactions/${txId}/review`, { approve }), 'Transaction traitée.');
  }

  async function runAction(action, successMessage) {
    try {
      setFeedback(null);
      const result = await action();
      setFeedback({ type: 'success', text: result?.data?.message || successMessage });
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

  async function openClientDetail(user) {
    setDetailLoading(true);
    setFeedback(null);
    try {
      const { data } = await api.get(`/admin/users/${user.id}/detail`);
      setClientDetail(data);
    } catch (error) {
      setFeedback({ type: 'error', text: error.response?.data?.error || 'Impossible de charger le compte client.' });
    } finally {
      setDetailLoading(false);
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
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}><Users size={16} aria-hidden="true" />Utilisateurs</TabButton>
        <TabButton active={tab === 'kyc'} onClick={() => setTab('kyc')}><ShieldAlert size={16} aria-hidden="true" />Dossiers KYC</TabButton>
        <TabButton active={tab === 'fraud'} onClick={() => setTab('fraud')}><KeyRound size={16} aria-hidden="true" />Opérations sortantes / OTP</TabButton>
        <TabButton active={tab === 'sms'} onClick={() => setTab('sms')}><Bell size={16} aria-hidden="true" />Suivi SMS</TabButton>
      </div>

      {tab === 'sms' && <section className="panel p-5 space-y-4">
        {sms.provider === 'textbee' && <div className="rounded-xl border border-white/10 p-4 space-y-3">
          <h3 className="text-white font-semibold">Connexion du téléphone TextBee</h3>
          <p className="text-sm text-slate-250/60">Associez votre Android dans TextBee, renseignez la clé API et le Device ID dans la configuration locale, puis redémarrez l’API. Ce contrôle ne transmet aucun SMS.</p>
          <button type="button" disabled={checkingSms} className="btn-secondary disabled:opacity-50" onClick={checkSmsConnection}>{checkingSms ? 'Vérification…' : 'Vérifier la connexion TextBee'}</button>
          {smsDiagnostic && <div role="status" className={`text-sm ${smsDiagnostic.state === 'connected' ? 'text-mint-400' : 'text-gold-400'}`}><p>{smsDiagnostic.message}</p>{smsDiagnostic.missing?.length > 0 && <p className="mt-1">Paramètres manquants : {smsDiagnostic.missing.join(', ')}</p>}</div>}
        </div>}
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-white">Notifications SMS</h3><button type="button" className="btn-secondary" onClick={loadAll}>Actualiser</button></div>
        <p className="text-sm text-slate-250/60">Prestataire : {sms.provider === 'textbee' ? 'TextBee' : 'Twilio'}. {sms.enabled ? 'Envoi activé. Les messages acceptés restent en attente de confirmation de livraison.' : 'Envoi désactivé : configurez les accès du prestataire pour envoyer les messages en attente.'}</p>
        {sms.messages.length === 0 ? <EmptyText>Aucun SMS enregistré.</EmptyText> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-250/50"><th className="py-2">Client</th><th>Statut</th><th>Date</th><th>Diagnostic</th></tr></thead><tbody>{sms.messages.map(message => <tr key={message.id} className="border-t border-white/5"><td className="py-3 text-white">{message.prenom} {message.nom}</td><td className="text-slate-250">{({ pending: 'En attente', processing: 'En cours', accepted: 'Accepté par le prestataire', delivered: 'Livré', failed: 'Échec', uncertain: 'À vérifier chez le prestataire', invalid_phone: 'Téléphone international requis' })[message.status] || message.status}</td><td className="text-slate-250/60">{new Date(message.created_at).toLocaleString('fr-FR')}</td><td className="text-slate-250/60">{message.error_code || '—'}</td></tr>)}</tbody></table></div>}
      </section>}

      {tab === 'kyc' && <label className="label-field block max-w-sm">Filtrer les dossiers<select className="input-field mt-1" value={kycFilter} onChange={event => setKycFilter(event.target.value)}><option value="in_review">En cours de revue</option><option value="pending">À compléter</option><option value="verified">Validés</option><option value="rejected">Refusés</option><option value="all">Tous les dossiers</option></select></label>}
      {(tab === 'users' || tab === 'kyc') && (
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
              {tab === 'kyc' && !users.some(u => kycFilter === 'all' || u.status_kyc === kycFilter) && <tr><td colSpan={5} className="p-5 text-center text-slate-250/70">Aucun dossier pour ce statut.</td></tr>}
              {users.filter(u => tab !== 'kyc' || kycFilter === 'all' || u.status_kyc === kycFilter).map((u) => (
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
                      <button onClick={() => setNotifyUser(u)} className="text-mint-400 hover:bg-mint-500/10 p-1.5 rounded-lg" title="Notifier le client"><Bell size={15} /></button>
                      <button disabled={detailLoading} onClick={() => openClientDetail(u)} className="text-white hover:bg-white/10 p-1.5 rounded-lg disabled:opacity-40" title="Visualiser le compte client"><Eye size={15} /></button>
                      <button onClick={() => openFunds(u)} className="text-gold-400 hover:bg-gold-500/10 p-1.5 rounded-lg" title="Ajuster les fonds"><WalletCards size={15} /></button>
                      <button onClick={() => setBankUser(u)} className="inline-flex items-center gap-1 text-xs text-mint-400 p-1.5 rounded-lg hover:bg-white/5"><Landmark size={15} aria-hidden="true" />IBAN et cartes</button>
                      <button onClick={() => setKycUser(u)} className="inline-flex items-center gap-1 text-mint-400 hover:bg-mint-500/10 p-1.5 rounded-lg text-xs"><ShieldAlert size={15} aria-hidden="true" />Examiner KYC</button>
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
                <button onClick={() => setOtpTransaction(tx)} className="btn-secondary !py-1.5 !px-3 text-xs text-gold-400"><KeyRound size={13} className="inline mr-1" />OTP</button>
                <button disabled={!tx.otp_verified} onClick={() => reviewTx(tx.id, true)} className="btn-secondary !py-1.5 !px-3 text-xs text-mint-400 disabled:opacity-30">Approuver</button>
                <button onClick={() => reviewTx(tx.id, false)} className="btn-danger !py-1.5 !px-3 text-xs">Rejeter</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {clientDetail && <ClientDetailDialog detail={clientDetail} onClose={() => setClientDetail(null)} />}
      {kycUser && <KycReviewDialog user={kycUser} onClose={() => setKycUser(null)} onReviewed={loadAll} />}
      {bankUser && <BankingDialog user={bankUser} onClose={() => setBankUser(null)} onSaved={loadAll} />}

      {otpTransaction && (
        <OtpDialog transaction={otpTransaction} onClose={() => setOtpTransaction(null)} onGenerated={loadAll} />
      )}

      {notifyUser && (
        <NotificationDialog
          user={notifyUser}
          onClose={() => setNotifyUser(null)}
          onSent={async (payload) => {
            const ok = await runAction(() => api.post(`/admin/users/${notifyUser.id}/notifications`, payload), 'Notification envoyée au client.');
            if (ok) setNotifyUser(null);
          }}
        />
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

function ClientDetailDialog({ detail, onClose }) {
  const { user, profile, document, accounts, transactions, notifications, summary } = detail;
  return (
    <DialogShell title={`Compte client — ${user.prenom} ${user.nom}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <DetailItem label="Email" value={user.email} />
          <DetailItem label="Téléphone" value={user.phone || 'Non renseigné'} />
          <DetailItem label="KYC" value={user.status_kyc} />
          <DetailItem label="État du compte" value={user.status_compte} />
          <DetailItem label="Inscription" value={new Date(user.created_at).toLocaleString('fr-FR')} />
        </div>
        <section><h4 className="flex items-center gap-2 text-sm font-medium text-white mb-3"><Users size={16} aria-hidden="true" />Informations d’inscription</h4>
          {profile ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[['Date de naissance', profile.birth_date], ['Lieu de naissance', profile.birth_place], ['Nationalité', profile.nationality], ['Adresse', profile.address_line], ['Ville', profile.city], ['Code postal', profile.postal_code], ['Pays', profile.country], ['Profession', profile.occupation], ['Conditions acceptées le', profile.terms_accepted_at ? new Date(profile.terms_accepted_at).toLocaleString('fr-FR') : 'Non enregistré']].map(([label, value]) => <DetailItem key={label} label={label} value={value || 'Non renseigné'} />)}
          </div> : <EmptyText>Profil d’inscription non renseigné.</EmptyText>}
          <p className="mt-3 text-xs text-slate-250/60">Document KYC : {document ? `${document.document_type} — déposé le ${new Date(document.uploaded_at).toLocaleString('fr-FR')}` : 'Non déposé'}. La photo est consultable et téléchargeable depuis « Examiner KYC ».</p>
        </section>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <MiniStat label="Solde total" value={`${Number(summary.totalBalance).toFixed(2)} €`} />
          <MiniStat label="Comptes" value={summary.accountCount} />
          <MiniStat label="Transactions" value={summary.transactionCount} />
        </div>
        <section>
          <h4 className="text-sm font-medium text-white mb-2">Comptes bancaires</h4>
          {accounts.length === 0 ? <EmptyText>Aucun compte bancaire.</EmptyText> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {accounts.map((account) => (
                <div key={account.id} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                  <div className="flex justify-between gap-3"><p className="text-sm text-white font-medium">{account.label}</p><span className="text-xs text-slate-250/40">{account.type}</span></div>
                  <p className="amount-mono text-lg text-mint-400 mt-2">{Number(account.balance).toFixed(2)} {account.currency}</p>
                  <p className="font-mono text-[10px] text-slate-250/40 mt-1 break-all">{account.iban}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        <section>
          <h4 className="text-sm font-medium text-white mb-2">Transactions récentes</h4>
          <div className="rounded-xl border border-white/5 px-3 max-h-72 overflow-y-auto">
            {transactions.length === 0 ? <EmptyText>Aucune transaction.</EmptyText> : transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}
          </div>
        </section>
        <section>
          <h4 className="text-sm font-medium text-white mb-2">Notifications récentes</h4>
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {notifications.length === 0 ? <EmptyText>Aucune notification.</EmptyText> : notifications.map((notification) => (
              <div key={notification.id} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                <div className="flex justify-between gap-3"><p className="text-xs font-medium text-white">{notification.title}</p><span className="text-[10px] text-slate-250/35">{new Date(notification.created_at).toLocaleDateString('fr-FR')}</span></div>
                <p className="text-xs text-slate-250/55 mt-1">{notification.message}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DialogShell>
  );
}

function DetailItem({ label, value }) {
  return <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3"><p className="text-slate-250/40 mb-1">{label}</p><p className="text-white break-words">{value}</p></div>;
}

function MiniStat({ label, value }) {
  return <div className="rounded-xl bg-mint-500/5 border border-mint-500/10 p-3 text-center"><p className="amount-mono text-sm sm:text-lg text-white">{value}</p><p className="text-[10px] text-slate-250/40 mt-1">{label}</p></div>;
}

function EmptyText({ children }) { return <p className="text-xs text-slate-250/40 text-center py-5">{children}</p>; }

function NotificationDialog({ user, onClose, onSent }) {
  const [form, setForm] = useState({ title: '', message: '', kind: 'info', actionUrl: '' });
  const [sending, setSending] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    await onSent(form);
    setSending(false);
  };
  return (
    <DialogShell title={`Notifier ${user.prenom} ${user.nom}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <AdminInput label="Titre de la notification" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
        <label className="block text-xs text-slate-250/60">Type d’action
          <select className="input-field mt-1" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            <option value="info">Information</option><option value="success">Confirmation</option><option value="warning">Action requise</option><option value="security">Sécurité</option>
          </select>
        </label>
        <label className="block text-xs text-slate-250/60">Message affiché au client
          <textarea required minLength={3} maxLength={1000} rows={5} className="input-field mt-1 resize-none" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
        </label>
        <label className="block text-xs text-slate-250/60">Page à ouvrir (optionnel)
          <select className="input-field mt-1" value={form.actionUrl} onChange={(event) => setForm({ ...form, actionUrl: event.target.value })}>
            <option value="">Aucune</option><option value="/dashboard">Tableau de bord</option><option value="/accounts">Comptes</option><option value="/transfer">Virements</option><option value="/cards">Cartes</option><option value="/budget">Budget</option><option value="/chatbot">Assistance</option>
          </select>
        </label>
        <button disabled={sending} className="btn-primary w-full">{sending ? 'Envoi…' : 'Envoyer la notification'}</button>
      </form>
    </DialogShell>
  );
}

function OtpDialog({ transaction, onClose, onGenerated }) {
  const [message, setMessage] = useState(transaction.otp_message || 'Veuillez confirmer le code de sécurité reçu afin que votre virement puisse être validé.');
  const [expiresInMinutes, setExpiresInMinutes] = useState(15);
  const [generated, setGenerated] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const generate = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post(`/admin/transactions/${transaction.id}/otp`, { message, expiresInMinutes });
      setGenerated(data);
      await onGenerated();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de générer le code OTP.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <DialogShell title="Code OTP du transfert" onClose={onClose}>
      {generated ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-250/60">Transmettez ce code au client par un canal sécurisé. Il ne sera plus affiché après fermeture.</p>
          <div className="rounded-2xl bg-mint-500/10 border border-mint-500/20 py-5 amount-mono text-3xl tracking-[0.35em] text-mint-400">{generated.otp}</div>
          <p className="text-xs text-slate-250/45">Expiration : {new Date(generated.expiresAt).toLocaleString('fr-FR')}</p>
          <button onClick={onClose} className="btn-primary w-full">Terminer</button>
        </div>
      ) : (
        <form onSubmit={generate} className="space-y-4">
          <label className="block text-xs text-slate-250/60">Message affiché au client
            <textarea required minLength={5} maxLength={500} rows={4} className="input-field mt-1 resize-none" value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <label className="block text-xs text-slate-250/60">Durée de validité
            <select className="input-field mt-1" value={expiresInMinutes} onChange={(event) => setExpiresInMinutes(Number(event.target.value))}>
              {[5, 10, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
          </label>
          {error && <p className="text-sm text-coral-400">{error}</p>}
          <button disabled={loading} className="btn-primary w-full">{loading ? 'Génération…' : transaction.otp_generated ? 'Générer un nouveau code' : 'Générer le code OTP'}</button>
        </form>
      )}
    </DialogShell>
  );
}

function DialogShell({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className={`panel w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto p-4 sm:p-6`} onMouseDown={(event) => event.stopPropagation()}>
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
    <button onClick={onClick} className={`inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-xl text-sm transition-colors ${active ? 'bg-mint-500/10 text-mint-400' : 'text-slate-250/60 hover:bg-white/5'}`}>
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
