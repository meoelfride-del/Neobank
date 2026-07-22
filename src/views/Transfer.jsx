import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Phone, Landmark, Clock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import useAccountStore from '../store/accountStore';
import api from '../services/api';

export default function Transfer() {
  const { accounts, selectedAccountId, selectAccount, fetchAccounts } = useAccountStore();
  const [mode, setMode] = useState('instant'); // instant | scheduled
  const [destType, setDestType] = useState('iban');
  const [form, setForm] = useState({ destination_info: '', amount: '', libelle: '' });
  const [scheduledForm, setScheduledForm] = useState({ destination_info: '', amount: '', label: '', frequency: 'mensuel' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success'|'error'|'flagged', message }

  useEffect(() => { fetchAccounts(); }, []);

  async function handleInstant(e) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const { data } = await api.post('/transactions/transfer', {
        source_account_id: selectedAccountId,
        destination_type: destType,
        destination_info: form.destination_info,
        amount: parseFloat(form.amount),
        libelle: form.libelle,
      });
      setResult({ type: data.requiresApproval ? 'flagged' : 'success', message: data.message, transactionId: data.transactionId });
      setForm({ destination_info: '', amount: '', libelle: '' });
      await fetchAccounts();
    } catch (err) {
      setResult({ type: 'error', message: err.response?.data?.error || 'Le virement a échoué.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleScheduled(e) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const { data } = await api.post('/transactions/scheduled', {
        account_id: selectedAccountId,
        ...scheduledForm,
        amount: parseFloat(scheduledForm.amount),
      });
      setResult({ type: 'success', message: data.message });
      setScheduledForm({ destination_info: '', amount: '', label: '', frequency: 'mensuel' });
    } catch (err) {
      setResult({ type: 'error', message: err.response?.data?.error || 'La planification a échoué.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h2 className="text-lg font-display font-semibold text-white">Effectuer un virement</h2>

      <div className="panel p-1.5 grid grid-cols-1 xs:grid-cols-2 gap-1">
        <button onClick={() => { setMode('instant'); setResult(null); }} className={`flex-1 flex items-center justify-center gap-2 text-sm py-2.5 rounded-xl transition-colors ${mode === 'instant' ? 'bg-mint-500/10 text-mint-400' : 'text-slate-250/60 hover:bg-white/5'}`}>
          <Send size={15} /> Virement instantané
        </button>
        <button onClick={() => { setMode('scheduled'); setResult(null); }} className={`flex-1 flex items-center justify-center gap-2 text-sm py-2.5 rounded-xl transition-colors ${mode === 'scheduled' ? 'bg-mint-500/10 text-mint-400' : 'text-slate-250/60 hover:bg-white/5'}`}>
          <Clock size={15} /> Prélèvement planifié
        </button>
      </div>

      <div>
        <label className="label-field">Compte source</label>
        <select className="input-field" value={selectedAccountId || ''} onChange={(e) => selectAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label} — {a.balance.toFixed(2)} {a.currency}</option>
          ))}
        </select>
      </div>

      {result && (
        <div className={`flex items-start gap-2.5 text-sm rounded-xl px-3.5 py-3 border ${
          result.type === 'success' ? 'bg-mint-500/10 border-mint-500/20 text-mint-400' :
          result.type === 'flagged' ? 'bg-gold-500/10 border-gold-500/20 text-gold-400' :
          'bg-coral-500/10 border-coral-500/20 text-coral-400'
        }`}>
          {result.type === 'success' && <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          {result.type === 'flagged' && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          {result.type === 'error' && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p>{result.message}</p>
            {result.transactionId && <Link to="/accounts" className="inline-block mt-2 text-xs font-semibold underline underline-offset-2">Ouvrir la transaction et saisir l’OTP</Link>}
          </div>
        </div>
      )}

      {mode === 'instant' ? (
        <form onSubmit={handleInstant} className="panel p-4 sm:p-6 space-y-4">
          <div>
            <label className="label-field">Envoyer par</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDestType('iban')} className={`flex-1 flex items-center justify-center gap-2 text-sm py-2 rounded-xl border ${destType === 'iban' ? 'border-mint-500/50 bg-mint-500/10 text-mint-400' : 'border-white/10 text-slate-250/60'}`}>
                <Landmark size={14} /> IBAN
              </button>
              <button type="button" onClick={() => setDestType('phone')} className={`flex-1 flex items-center justify-center gap-2 text-sm py-2 rounded-xl border ${destType === 'phone' ? 'border-mint-500/50 bg-mint-500/10 text-mint-400' : 'border-white/10 text-slate-250/60'}`}>
                <Phone size={14} /> Téléphone
              </button>
            </div>
          </div>

          <div>
            <label className="label-field">{destType === 'iban' ? 'IBAN du bénéficiaire' : 'Numéro de téléphone'}</label>
            <input
              required className="input-field font-mono"
              placeholder={destType === 'iban' ? 'FR76...' : '+33612345678'}
              value={form.destination_info}
              onChange={(e) => setForm({ ...form, destination_info: e.target.value })}
            />
          </div>

          <div>
            <label className="label-field">Montant (€)</label>
            <input required type="number" step="0.01" min="0.01" className="input-field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>

          <div>
            <label className="label-field">Libellé (optionnel)</label>
            <input className="input-field" placeholder="Ex : Loyer, Remboursement..." value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} />
          </div>

          <button type="submit" disabled={submitting || !selectedAccountId} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Envoyer maintenant
          </button>
        </form>
      ) : (
        <form onSubmit={handleScheduled} className="panel p-4 sm:p-6 space-y-4">
          <div>
            <label className="label-field">IBAN du bénéficiaire</label>
            <input required className="input-field font-mono" placeholder="FR76..." value={scheduledForm.destination_info} onChange={(e) => setScheduledForm({ ...scheduledForm, destination_info: e.target.value })} />
          </div>
          <div>
            <label className="label-field">Libellé du mandat</label>
            <input required className="input-field" placeholder="Ex : Loyer appartement" value={scheduledForm.label} onChange={(e) => setScheduledForm({ ...scheduledForm, label: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label-field">Montant (€)</label>
              <input required type="number" step="0.01" min="0.01" className="input-field" value={scheduledForm.amount} onChange={(e) => setScheduledForm({ ...scheduledForm, amount: e.target.value })} />
            </div>
            <div>
              <label className="label-field">Fréquence</label>
              <select className="input-field" value={scheduledForm.frequency} onChange={(e) => setScheduledForm({ ...scheduledForm, frequency: e.target.value })}>
                <option value="mensuel">Mensuel</option>
                <option value="hebdomadaire">Hebdomadaire</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-250/40">Signature électronique du mandat SEPA validée automatiquement à la soumission.</p>
          <button type="submit" disabled={submitting || !selectedAccountId} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Programmer le prélèvement
          </button>
        </form>
      )}
    </div>
  );
}
