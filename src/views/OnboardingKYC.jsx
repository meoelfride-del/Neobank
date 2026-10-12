import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import KycProfileFields, { emptyProfile } from '../components/KycProfileFields';
import KycPhoto from '../components/KycPhoto';
import { getSocket } from '../services/socket';

export default function OnboardingKYC() {
  const navigate = useNavigate();
  const { refreshUser, logout } = useAuthStore();
  const [dossier, setDossier] = useState(null);
  const [profile, setProfile] = useState(emptyProfile);
  const [file, setFile] = useState(null);
  const [type, setType] = useState('identity_card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const read = useCallback(async () => {
    const { data } = await api.get('/accounts/kyc/status'); setDossier(data);
    if (data.status_kyc === 'verified') await refreshUser(); return data;
  }, [refreshUser]);
  useEffect(() => {
    const socket = getSocket();
    const update = () => read().catch(() => setError('Impossible d’actualiser le statut KYC.'));
    socket.on('kyc:updated', update);
    return () => socket.off('kyc:updated', update);
  }, [read]);
  useEffect(() => { let active = true; api.get('/accounts/kyc/status').then(({ data }) => { if (active) { setDossier(data); setProfile(data.profile || emptyProfile); } }).catch(() => { if (active) setError('Impossible de charger votre dossier.'); }); return () => { active = false; }; }, []);
  const status = dossier?.status_kyc;
  useEffect(() => {
    if (status !== 'in_review') return;
    let stopped = false; let timer;
    async function poll() { try { if (!stopped) await read(); } catch { if (!stopped) setError('Statut temporairement indisponible. Votre dossier reste enregistré.'); } if (!stopped) timer = setTimeout(poll, 10000); }
    timer = setTimeout(poll, 10000); return () => { stopped = true; clearTimeout(timer); };
  }, [status, read]);
  async function action(operation, message, syncProfile = false) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(message); const fresh = await read(); if (syncProfile) setProfile(fresh.profile || emptyProfile); }
    catch (failure) { setError(failure.response?.data?.details?.join(' ') || failure.response?.data?.error || 'Opération impossible. Réessayez.'); }
    finally { setBusy(false); }
  }
  async function upload(event) {
    event.preventDefault();
    if (!file || !['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choisissez une photo JPEG ou PNG de 5 Mo maximum.'); return; }
    const data = new FormData(); data.append('document_type', type); data.append('document', file);
    await action(() => api.post('/accounts/kyc/document', data, { headers: { 'Content-Type': undefined } }), 'Photo enregistrée. Soumettez maintenant votre dossier.');
  }
  const editable = ['pending', 'rejected'].includes(status);
  const profileChanged = dossier?.profile && Object.keys(emptyProfile).some(key => (profile[key] || '') !== (dossier.profile[key] || ''));
  return <main className="min-h-screen px-4 py-10"><div className="max-w-2xl mx-auto panel p-5 sm:p-8 space-y-6">
    <h1 className="text-2xl text-white font-display">Vérification de votre identité</h1><p className="text-sm text-slate-250/70">Étape 2 sur 2 · Déposez une photo lisible de votre pièce d’identité. Un administrateur examinera manuellement votre dossier.</p>
    {error && <p role="alert" className="text-coral-400">{error}</p>}{notice && <p role="status" className="text-mint-400">{notice}</p>}
    {!dossier && <p role="status">Chargement du dossier…</p>}
    {dossier && <p className="text-white" aria-live="polite">Statut : {({ pending: 'À compléter', in_review: 'En cours de vérification', rejected: 'Refusé', verified: 'Validé' })[status]}</p>}
    {dossier?.document?.review_reason && <p className="rounded-xl bg-white/5 p-4 text-slate-250/80">Motif de l’administrateur : {dossier.document.review_reason}</p>}
    {editable && <form onSubmit={event => { event.preventDefault(); const payload = Object.fromEntries(Object.keys(emptyProfile).map(key => [key, profile[key] || ''])); action(() => api.put('/accounts/kyc/profile', payload), 'Informations enregistrées.', true); }} className="space-y-4"><h2 className="text-white font-semibold">Vos informations personnelles</h2><KycProfileFields value={profile} onChange={(field, value) => setProfile(current => ({ ...current, [field]: value }))} /><button disabled={busy} className="btn-secondary">Enregistrer les informations</button></form>}
    {editable && <form onSubmit={upload} className="space-y-4"><h2 className="text-white font-semibold">Photo de votre document</h2><label className="label-field">Type de document<select className="input-field mt-1" value={type} onChange={event => setType(event.target.value)}><option value="identity_card">Carte d’identité</option><option value="passport">Passeport</option><option value="residence_permit">Titre de séjour</option></select></label><label className="label-field">Photo JPEG ou PNG, 5 Mo et 20 mégapixels maximum<input required type="file" accept="image/jpeg,image/png" className="input-field mt-1" onChange={event => setFile(event.target.files[0] || null)} /></label><p className="text-sm text-slate-250/70">Le document doit être complet, net et sans reflet. Une nouvelle photo remplace la précédente.</p><button disabled={busy || !file} className="btn-secondary">{busy ? 'Enregistrement…' : dossier?.document ? 'Remplacer la photo' : 'Enregistrer la photo'}</button></form>}
    {dossier?.document && <KycPhoto endpoint="/accounts/kyc/document" document={dossier.document} />}
    {profileChanged && <p className="text-sm text-gold-400">Enregistrez vos informations modifiées avant de soumettre votre dossier.</p>}
    {status === 'pending' && <button disabled={busy || !dossier.profile || !dossier.document || profileChanged} onClick={() => action(() => api.post('/accounts/kyc/submit'), 'Dossier transmis pour vérification.')} className="btn-primary w-full">Soumettre mon dossier KYC</button>}
    {status === 'rejected' && <p className="text-sm text-slate-250/70">Corrigez vos informations et remplacez votre photo avant de soumettre à nouveau votre dossier.</p>}
    {status === 'in_review' && <p className="text-sm text-slate-250/70">Votre dossier est enregistré. Les modifications sont verrouillées pendant la vérification.</p>}
    {status === 'verified' && <button className="btn-primary" onClick={async () => { await refreshUser(); navigate('/dashboard'); }}>Accéder à mon espace</button>}
    <div className="flex flex-wrap gap-4"><button disabled={busy} className="btn-secondary" onClick={() => action(async () => { const data = await read(); if (data.profile) setProfile(data.profile); }, 'Statut actualisé.')}>Actualiser</button><button className="text-sm text-slate-250/70" onClick={async () => { await logout(); navigate('/login'); }}>Se déconnecter</button></div>
  </div></main>;
}
