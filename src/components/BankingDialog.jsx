import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

const blankCard = () => ({ number: '', expiry: `12/${new Date().getFullYear() + 4}`, type: 'Physique', limits: 3000, status: 'Active' });
export default function BankingDialog({ user, onClose, onSaved }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [cards, setCards] = useState([]);
  const [requests, setRequests] = useState([]);
  const [iban, setIban] = useState('');
  const [card, setCard] = useState(blankCard);
  const [editing, setEditing] = useState(null);
  const [requestId, setRequestId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const panel = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  const account = accounts.find(item => item.id === accountId);
  async function readAccounts() { const { data } = await api.get(`/admin/users/${user.id}/accounts`); setAccounts(data.accounts); return data.accounts; }
  async function readCards() { const { data } = await api.get(`/admin/accounts/${accountId}/cards`); setCards(data.cards); setRequests(data.requests); }
  useEffect(() => { let active = true; api.get(`/admin/users/${user.id}/accounts`).then(({ data }) => { if (active) { setAccounts(data.accounts); setAccountId(data.accounts[0]?.id || ''); } }).catch(() => { if (active) setError('Chargement des comptes impossible.'); }); return () => { active = false; }; }, [user.id]);
  useEffect(() => {
    setCards([]); setRequests([]); setEditing(null); setRequestId(''); setCard(blankCard());
    if (!accountId) return;
    let active = true;
    api.get(`/admin/accounts/${accountId}/cards`).then(({ data }) => { if (active) { setCards(data.cards); setRequests(data.requests); } }).catch(() => { if (active) setError('Chargement des cartes impossible.'); });
    return () => { active = false; };
  }, [accountId]);
  useEffect(() => { setIban(account?.iban || ''); }, [account?.iban, accountId]);
  useEffect(() => {
    const previous = document.activeElement; panel.current?.focus();
    function key(event) {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const items = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  async function save(event, operation) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try { const { data } = await operation(); setNotice(data.message); await readAccounts(); await readCards(); await onSaved(); setEditing(null); setRequestId(''); setCard(blankCard()); }
    catch (failure) { setError(failure.response?.data?.details?.join(' ') || failure.response?.data?.error || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="banking-title" className="panel w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-7 space-y-5">
    <div className="flex justify-between gap-3"><h2 id="banking-title" className="font-semibold text-white">IBAN et cartes — {user.prenom} {user.nom}</h2><button disabled={busy} onClick={onClose}>Fermer</button></div>
    {error && <p role="alert" className="text-coral-400">{error}</p>}{notice && <p role="status" className="text-mint-400">{notice}</p>}
    {account && <button disabled={busy} className="btn-secondary" onClick={async () => { setBusy(true); setError(''); try { await readAccounts(); await readCards(); setEditing(null); setRequestId(''); setCard(blankCard()); } catch { setError('Actualisation impossible.'); } finally { setBusy(false); } }}>Recharger le dossier</button>}
    <label className="label-field">Compte<select disabled={busy} className="input-field mt-1" value={accountId} onChange={event => setAccountId(event.target.value)}>{accounts.map(item => <option key={item.id} value={item.id}>{item.label} · {item.currency}</option>)}</select></label>
    {!account && <p>Aucun compte disponible.</p>}
    {account && <><form className="space-y-3" onSubmit={event => save(event, () => api.patch(`/admin/accounts/${accountId}/iban`, { iban, version: account.iban_version }))}><label className="label-field">IBAN fourni par le prestataire<input required maxLength={42} autoComplete="off" className="input-field mt-1 font-mono" value={iban} onChange={event => setIban(event.target.value)} /></label><p className="text-xs text-slate-250/70">La vérification du format ne prouve pas l’attribution bancaire. Saisissez uniquement l’IBAN destiné à ce client.</p><button disabled={busy} className="btn-primary">{account.iban ? 'Modifier l’IBAN' : 'Attribuer l’IBAN'}</button></form>
    <div className="space-y-2"><h3 className="text-white font-semibold">Cartes attribuées</h3>{cards.length === 0 && <p className="text-sm text-slate-250/70">Aucune carte.</p>}{cards.map(item => <div key={item.id} className="flex justify-between items-center gap-3 rounded-xl bg-white/5 p-3"><p className="text-sm text-slate-250/80">{item.display} · {item.type} · {item.expiry} · {item.status}</p><button disabled={busy} className="btn-secondary" onClick={() => { setEditing(item); setRequestId(''); setCard({ number: '', expiry: item.expiry, type: item.type, limits: item.limits, status: item.status }); }}>Modifier</button></div>)}</div>
    <div className="space-y-2"><h3 className="text-white font-semibold">Demandes en attente</h3>{requests.filter(item => item.status === 'pending').map(item => <button key={item.id} disabled={busy} className="btn-secondary mr-2" onClick={() => { setEditing(null); setRequestId(item.id); setCard({ ...blankCard(), type: item.type }); }}>Attribuer : {item.type}</button>)}</div>
    <form className="space-y-4 border-t border-white/10 pt-5" onSubmit={event => save(event, () => { const payload = { ...card, limits: Number(card.limits) }; if (editing) { if (!payload.number.trim()) delete payload.number; payload.version = editing.version; return api.patch(`/admin/cards/${editing.id}`, payload); } if (requestId) payload.requestId = requestId; return api.post(`/admin/accounts/${accountId}/cards`, payload); })}>
      <h3 className="font-semibold text-white">{editing ? 'Modifier la carte' : 'Attribuer une carte'}{requestId ? ' · Demande sélectionnée' : ''}</h3>
      <label className="label-field">Numéro fourni par l’émetteur {editing && '(vide pour conserver le numéro)'}<input required={!editing} maxLength={24} autoComplete="off" inputMode="numeric" className="input-field mt-1 font-mono" value={card.number} onChange={event => setCard(current => ({ ...current, number: event.target.value }))} /></label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="label-field">Expiration MM/AAAA<input required pattern="(0[1-9]|1[0-2])/20[0-9]{2}" className="input-field mt-1" value={card.expiry} onChange={event => setCard(current => ({ ...current, expiry: event.target.value }))} /></label><label className="label-field">Plafond<input required type="number" min="0.01" max="1000000" step="0.01" className="input-field mt-1" value={card.limits} onChange={event => setCard(current => ({ ...current, limits: event.target.value }))} /></label><label className="label-field">Type<select className="input-field mt-1" value={card.type} onChange={event => setCard(current => ({ ...current, type: event.target.value }))}><option value="Physique">Physique</option><option value="Virtuelle">Virtuelle</option></select></label><label className="label-field">Statut<select className="input-field mt-1" value={card.status} onChange={event => setCard(current => ({ ...current, status: event.target.value }))}><option value="Active">Active</option><option value="Blocked">Bloquée</option>{editing && <option value="Expired">Expirée</option>}</select></label></div>
      <p className="text-xs text-slate-250/70">Aucun CVV ni PIN bancaire n’est demandé. Le numéro est conservé chiffré. L’attribution exige un IBAN et un KYC validé.</p><div className="flex gap-3"><button disabled={busy || !account.iban} className="btn-primary">{editing ? 'Enregistrer la carte' : 'Attribuer la carte'}</button>{editing && <button type="button" disabled={busy} className="btn-secondary" onClick={() => { setEditing(null); setCard(blankCard()); }}>Nouvelle carte</button>}</div>
    </form></>}
  </section></div>;
}
