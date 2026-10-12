import { useEffect, useState } from 'react';
import api from '../services/api';
export default function KycPhoto({ endpoint, document, onReady }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true; let objectUrl;
    setUrl(''); setError(''); onReady?.(false);
    if (document) api.get(endpoint, { responseType: 'blob' }).then(({ data }) => { objectUrl = URL.createObjectURL(data); if (active) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl); }).catch(() => { if (active) setError('Impossible de charger la photo. Fermez et rouvrez le dossier pour réessayer.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [endpoint, document?.id, onReady]);
  async function download() {
    setBusy(true); setError('');
    try { const { data } = await api.get(`${endpoint}${endpoint.includes('?') ? '&' : '?'}download=true`, { responseType: 'blob' }); const objectUrl = URL.createObjectURL(data); const anchor = window.document.createElement('a'); anchor.href = objectUrl; anchor.download = `kyc-${document.id}-${endpoint.includes('side=back') ? 'verso' : 'recto'}.jpg`; window.document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
    catch { setError('Téléchargement impossible. Réessayez.'); } finally { setBusy(false); }
  }
  if (!document) return <p>Aucune photo déposée.</p>;
  return <div className="space-y-3">{error && <p role="alert" className="text-coral-400">{error}</p>}{url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} onLoad={() => onReady?.(true)} onError={() => { onReady?.(false); setError('Photo illisible. Rechargez le dossier.'); }} alt="Document d’identité déposé" className="max-h-80 w-full object-contain rounded-xl bg-white/5" /><span className="text-mint-400 text-xs">Agrandir la photo</span></a> : !error && <p role="status">Chargement de la photo…</p>}<button type="button" disabled={busy} onClick={download} className="btn-secondary">Télécharger la photo</button></div>;
}
