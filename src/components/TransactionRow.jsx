import { useState } from 'react';

const CATEGORY_ICONS = {
  Alimentation: '🛒', Logement: '🏠', Transport: '🚆', Loisirs: '🎬',
  Santé: '💊', Shopping: '🛍️', Salaire: '💼', Autre: '💳',
};

export default function TransactionRow({ tx, onCancel, onVerifyOtp }) {
  const isCredit = tx.amount >= 0;
  const date = new Date(tx.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const submitOtp = async (event) => {
    event.preventDefault();
    setVerifying(true);
    await onVerifyOtp(tx.id, otp);
    setVerifying(false);
  };

  return (
    <div className="py-3 px-1 border-b border-white/5 last:border-0">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-base shrink-0">
          {CATEGORY_ICONS[tx.category] || '💳'}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{tx.libelle || tx.category}</p>
          <p className="text-xs text-slate-250/45">{date} · {tx.category}</p>
        </div>
      </div>
      <div className="text-right shrink-0 pl-3">
        <p className={`amount-mono text-sm font-semibold ${isCredit ? 'text-mint-400' : 'text-white'}`}>
          {isCredit ? '+' : ''}{tx.amount.toFixed(2)} €
        </p>
        {tx.status === 'pending' && <p className="text-[10px] text-gold-400 mt-0.5">En vérification</p>}
        {tx.status === 'failed' && <p className="text-[10px] text-coral-400 mt-0.5">Annulé</p>}
        {tx.status === 'pending' && onCancel && <button onClick={() => onCancel(tx.id)} className="text-[10px] text-coral-400 hover:underline mt-1">Annuler</button>}
      </div>
      </div>
      {tx.status === 'pending' && tx.otp_required && !tx.otp_verified && onVerifyOtp && (
        <form onSubmit={submitOtp} className="mt-3 sm:ml-12 rounded-xl bg-gold-500/5 border border-gold-500/15 p-3">
          <p className="text-xs text-gold-400 mb-2">{tx.otp_message}</p>
          <div className="flex flex-col xs:flex-row gap-2">
            <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="input-field !py-2 amount-mono tracking-[0.25em]" placeholder="Code à 6 chiffres" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} />
            <button disabled={verifying || otp.length !== 6} className="btn-primary !py-2 shrink-0">{verifying ? 'Vérification…' : 'Confirmer'}</button>
          </div>
        </form>
      )}
      {tx.status === 'pending' && tx.otp_verified && <p className="mt-2 sm:ml-12 text-xs text-mint-400">OTP confirmé — en attente de validation administrative.</p>}
    </div>
  );
}
