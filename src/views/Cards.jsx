import { useEffect, useState } from 'react';
import { Plus, Eye, Lock, Unlock, X, Loader2 } from 'lucide-react';
import useAccountStore from '../store/accountStore';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import CardVisual from '../components/CardVisual';

export default function Cards() {
  const { accounts, selectedAccountId, selectAccount, fetchAccounts } = useAccountStore();
  const { user } = useAuthStore();
  const [cards, setCards] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ type: 'Virtuelle', pin: '' });
  const [creating, setCreating] = useState(false);
  const [revealCard, setRevealCard] = useState(null);
  const [revealPassword, setRevealPassword] = useState('');
  const [revealedData, setRevealedData] = useState(null);
  const [revealError, setRevealError] = useState('');

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { if (selectedAccountId) loadCards(); }, [selectedAccountId]);

  async function loadCards() {
    const { data } = await api.get(`/cards/account/${selectedAccountId}`);
    setCards(data.cards);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/cards', { account_id: selectedAccountId, type: createForm.type, pin: createForm.pin });
      await loadCards();
      setShowCreate(false);
      setCreateForm({ type: 'Virtuelle', pin: '' });
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(card) {
    const newStatus = card.status === 'Active' ? 'Blocked' : 'Active';
    await api.patch(`/cards/${card.id}/status`, { status: newStatus });
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, status: newStatus } : c)));
  }

  async function handleReveal(e) {
    e.preventDefault();
    setRevealError('');
    try {
      const { data } = await api.post(`/cards/${revealCard.id}/reveal`, { password: revealPassword });
      setRevealedData(data);
    } catch (err) {
      setRevealError(err.response?.data?.error || 'Mot de passe incorrect.');
    }
  }

  function closeReveal() {
    setRevealCard(null);
    setRevealPassword('');
    setRevealedData(null);
    setRevealError('');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-display font-semibold text-white">Vos cartes</h2>
        <div className="flex items-center gap-2">
          <select className="input-field !w-auto text-sm py-2" value={selectedAccountId || ''} onChange={(e) => selectAccount(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <Plus size={15} /> Nouvelle carte
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="panel p-10 text-center text-slate-250/40 text-sm">Aucune carte pour ce compte.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {cards.map((card) => (
            <div key={card.id} className="space-y-3">
              <CardVisual card={card} holderName={`${user?.prenom} ${user?.nom}`} />
              <div className="flex items-center gap-2">
                <button onClick={() => setRevealCard(card)} className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs py-2">
                  <Eye size={13} /> Voir le numéro
                </button>
                <button
                  onClick={() => toggleStatus(card)}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-xl border transition-colors ${
                    card.status === 'Active' ? 'border-coral-500/20 text-coral-400 hover:bg-coral-500/10' : 'border-mint-500/20 text-mint-400 hover:bg-mint-500/10'
                  }`}
                >
                  {card.status === 'Active' ? <><Lock size={13} /> Bloquer</> : <><Unlock size={13} /> Activer</>}
                </button>
              </div>
              <p className="text-xs text-slate-250/40 text-center">Plafond : {card.limits.toFixed(2)} €</p>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setShowCreate(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleCreate} className="panel p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-white">Nouvelle carte</h3>
              <button type="button" onClick={() => setShowCreate(false)}><X size={18} className="text-slate-250/50" /></button>
            </div>
            <div>
              <label className="label-field">Type de carte</label>
              <select className="input-field" value={createForm.type} onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}>
                <option value="Virtuelle">Virtuelle (éphémère, 24h)</option>
                <option value="Physique">Physique</option>
              </select>
            </div>
            <div>
              <label className="label-field">Code PIN (4 chiffres)</label>
              <input required maxLength={4} pattern="[0-9]{4}" className="input-field font-mono" value={createForm.pin} onChange={(e) => setCreateForm({ ...createForm, pin: e.target.value.replace(/\D/g, '') })} />
            </div>
            <button type="submit" disabled={creating} className="btn-primary w-full flex items-center justify-center gap-2">
              {creating && <Loader2 size={16} className="animate-spin" />} Générer la carte
            </button>
          </form>
        </div>
      )}

      {revealCard && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={closeReveal}>
          <div onClick={(e) => e.stopPropagation()} className="panel p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-white">Afficher le numéro</h3>
              <button onClick={closeReveal}><X size={18} className="text-slate-250/50" /></button>
            </div>

            {!revealedData ? (
              <form onSubmit={handleReveal} className="space-y-4">
                <p className="text-xs text-slate-250/50">Confirmez votre mot de passe pour révéler les informations sensibles.</p>
                {revealError && <div className="bg-coral-500/10 border border-coral-500/20 text-coral-400 text-sm rounded-xl px-3 py-2">{revealError}</div>}
                <input type="password" required autoFocus className="input-field" placeholder="Mot de passe" value={revealPassword} onChange={(e) => setRevealPassword(e.target.value)} />
                <button type="submit" className="btn-primary w-full">Confirmer</button>
              </form>
            ) : (
              <CardVisual card={revealCard} holderName={`${user?.prenom} ${user?.nom}`} revealedNumber={revealedData.fullNumber} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
