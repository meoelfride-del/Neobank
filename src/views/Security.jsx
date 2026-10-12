import { useEffect, useState } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function Security() {
  const { user, refreshUser } = useAuthStore();
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [setup, setSetup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sessions, setSessions] = useState([]);
  async function readSessions() { const { data } = await api.get('/auth/sessions'); setSessions(data.sessions); }
  useEffect(() => { readSessions().catch(() => setError('Impossible de charger les sessions.')); }, []);
  async function revoke(id) {
    setBusy(true); setError('');
    try { await api.delete(`/auth/sessions/${id}`); await readSessions(); setNotice('Session déconnectée.'); }
    catch (failure) { setError(failure.response?.data?.error || 'Révocation impossible. Actualisez la liste.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { refreshUser(); }, [refreshUser]);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (!setup) { const { data } = await api.post('/auth/mfa/setup', { password }); setSetup(data.mfaSetup); }
      else { await api.post('/auth/mfa/enable', { password, otp }); setSetup(null); setPassword(''); setOtp(''); setNotice('Double authentification activée. Attendez le prochain code avant une nouvelle connexion.'); await refreshUser(); }
    } catch (failure) { setError(failure.response?.data?.error || 'Configuration impossible.'); }
    finally { setBusy(false); }
  }
  return <section className="panel p-5 sm:p-7 max-w-2xl space-y-5"><h2 className="text-xl font-semibold text-white">Sécurité du compte</h2>
    {error && <p role="alert" className="text-coral-400">{error}</p>}{notice && <p role="status" className="text-mint-400">{notice}</p>}
    {user?.mfa_enabled ? <p className="text-mint-400">La double authentification est active. Chaque connexion nécessite votre mot de passe et un code de votre application d’authentification.</p> : <form className="space-y-5" onSubmit={submit}>
      <p className="text-sm text-slate-250/70">Configurez une application d’authentification sur un appareil que vous conservez. L’activation exige votre mot de passe et un code valide. La récupération en cas de perte de l’appareil n’est pas encore disponible dans cet écran.</p>
      <label className="label-field">Mot de passe actuel<input required type="password" autoComplete="current-password" className="input-field mt-1" value={password} onChange={event => setPassword(event.target.value)} /></label>
      {setup && <div className="space-y-4"><p className="text-sm text-slate-250/70">Dans votre application d’authentification, ajoutez une clé manuelle TOTP (6 chiffres, période de 30 secondes). Cette configuration expire à {new Date(setup.expiresAt).toLocaleTimeString('fr-FR')}.</p><p className="font-mono text-mint-400 break-all select-all">{setup.secret}</p><p className="text-xs text-slate-250/70">Gardez cette clé confidentielle. Elle disparaît de cet écran après confirmation ou fermeture.</p><label className="label-field">Code à six chiffres<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className="input-field mt-1" value={otp} onChange={event => setOtp(event.target.value)} /></label><button type="button" disabled={busy} className="btn-secondary" onClick={() => { setSetup(null); setOtp(''); }}>Recommencer la configuration</button></div>}
      <button disabled={busy} className="btn-primary">{busy ? 'Vérification…' : setup ? 'Confirmer et activer la MFA' : 'Configurer la MFA'}</button>
    </form>}
    <div className="border-t border-white/10 pt-5 space-y-3"><h3 className="font-semibold text-white">Sessions actives</h3><p className="text-sm text-slate-250/70">Vous pouvez déconnecter vos autres sessions. La session actuelle se ferme avec le bouton de déconnexion habituel.</p>{sessions.map(session => <div key={session.id} className="flex justify-between items-center gap-3 rounded-xl bg-white/5 p-3"><div className="text-sm text-slate-250/80"><p>{session.current ? 'Cette session' : 'Autre session'}</p><p className="text-xs">Expiration : {new Date(session.expires_at).toLocaleString('fr-FR')}</p></div>{!session.current && <button disabled={busy} className="btn-secondary" onClick={() => revoke(session.id)}>Déconnecter</button>}</div>)}<button disabled={busy} className="btn-secondary" onClick={() => readSessions().catch(() => setError('Actualisation impossible.'))}>Actualiser les sessions</button></div>
  </section>;
}
