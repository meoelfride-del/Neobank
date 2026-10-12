import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import KycPhoto from './KycPhoto';
import { profileLabels } from './KycProfileFields';

export default function KycReviewDialog({ user, onClose, onReviewed }) {
  const [dossier, setDossier] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoReady, setPhotoReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const busyRef = useRef(busy); busyRef.current = busy;
  const panel = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const endpoint = `/admin/kyc/${user.id}`;
  const read = useCallback(async () => { const { data } = await api.get(endpoint); setDossier(data); setError(''); }, [endpoint]);
  useEffect(() => { let active = true; api.get(endpoint).then(({ data }) => { if (active) setDossier(data); }).catch(() => { if (active) setError('Impossible de charger le dossier.'); }); return () => { active = false; }; }, [endpoint]);
  useEffect(() => {
    const previous = window.document.activeElement; panel.current?.focus();
    const oldOverflow = window.document.body.style.overflow; window.document.body.style.overflow = 'hidden';
    function key(event) {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const items = [...panel.current.querySelectorAll('button:not(:disabled), a[href], textarea, input')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (window.document.activeElement === first || window.document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (window.document.activeElement === last || window.document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
    }
    window.document.addEventListener('keydown', key);
    return () => { window.document.removeEventListener('keydown', key); window.document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  async function review(decision) {
    if (busy) return;
    if (decision !== 'verified' && reason.trim().length < 3) { setError('Indiquez un motif de trois caractères minimum.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await api.post(endpoint, { decision, documentId: dossier.document?.id, reason: reason.trim() });
      setDossier(current => ({ ...current, user: { ...current.user, status_kyc: data.status } }));
      setNotice('Décision enregistrée.'); setReason(''); setChecked(false);
      await read(); await onReviewed();
    } catch (failure) { setError(failure.response?.data?.error || 'Impossible de traiter ou d’actualiser le dossier. Rechargez avant de réessayer.'); }
    finally { setBusy(false); }
  }
  const status = dossier?.user.status_kyc;
  return <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="kyc-dialog-title" className="panel w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-7 space-y-5">
    <div className="flex justify-between gap-4"><h2 id="kyc-dialog-title" className="font-semibold text-white">Dossier KYC — {user.prenom} {user.nom}</h2><button disabled={busy} onClick={onClose} className="text-slate-250/70">Fermer</button></div>
    {error && <p role="alert" className="text-coral-400">{error}</p>}{notice && <p role="status" className="text-mint-400">{notice}</p>}
    {!dossier && <p role="status">Chargement…</p>}
    {dossier && <><p className="text-white">Statut : {({ pending: 'À compléter', in_review: 'En revue', verified: 'Validé', rejected: 'Refusé' })[status]}</p><p className="text-sm text-slate-250/80">{dossier.user.email} · {dossier.user.phone}</p>
    {dossier.profile ? <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Object.entries(profileLabels).map(([field, label]) => <div key={field} className="rounded-xl bg-white/5 p-3"><dt className="text-xs text-slate-250/60">{label}</dt><dd className="text-sm text-white break-words">{dossier.profile[field] || 'Non renseigné'}</dd></div>)}</dl> : <p>Profil incomplet.</p>}
    {dossier.document && <p className="text-sm text-slate-250/70">{({ identity_card: 'Carte d’identité', passport: 'Passeport', residence_permit: 'Titre de séjour' })[dossier.document.document_type]} · Déposé le {new Date(dossier.document.uploaded_at).toLocaleString('fr-FR')}</p>}
    <KycPhoto endpoint={`${endpoint}/document`} document={dossier.document} onReady={setPhotoReady} />
    {dossier.document?.review_reason && <p className="text-sm text-slate-250/80">Dernier motif : {dossier.document.review_reason}</p>}
    {status === 'in_review' && <label className="flex gap-3 text-sm text-slate-250/80"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />J’ai contrôlé les informations et la photo du document.</label>}
    {['in_review', 'verified'].includes(status) && <><label className="label-field">Motif (obligatoire pour refuser ou annuler)<textarea maxLength={500} rows={3} className="input-field mt-1" value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex flex-wrap gap-3">
      {status === 'in_review' && <><button disabled={busy || !dossier.profile || !dossier.document || !photoReady || !checked} className="btn-primary" onClick={() => review('verified')}>Valider le KYC</button><button disabled={busy || !dossier.document} className="btn-danger" onClick={() => review('rejected')}>Refuser le KYC</button></>}
      <button disabled={busy} className="btn-secondary" onClick={() => review('pending')}>{status === 'verified' ? 'Annuler la validation KYC' : 'Annuler la revue'}</button>
    </div></>}
    {status === 'verified' && <p className="text-sm text-slate-250/70">Annuler la validation bloque l’accès du client aux fonctionnalités soumises au KYC jusqu’à une nouvelle validation.</p>}
    <button disabled={busy} className="btn-secondary" onClick={() => { setChecked(false); read().catch(() => setError('Actualisation impossible.')); }}>Recharger le dossier</button></>}
  </section></div>;
}
