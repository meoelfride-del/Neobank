import { useState } from 'react';
import { ChevronDown, KeyRound } from 'lucide-react';

const CATEGORY_ICONS = {
  Alimentation: '🛒', Logement: '🏠', Transport: '🚆', Loisirs: '🎬',
  Santé: '💊', Shopping: '🛍️', Salaire: '💼', Autre: '💳',
};

const STATUS = {
  pending: { label: 'En attente', className: 'text-gold-400 bg-gold-500/10' },
  completed: { label: 'Effectué', className: 'text-mint-400 bg-mint-500/10' },
  failed: { label: 'Annulé', className: 'text-coral-400 bg-coral-500/10' },
};

export default function TransactionRow({ tx, onCancel, onVerifyOtp }) {
  const [expanded, setExpanded] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const isCredit = Number(tx.amount) >= 0;
  const status = STATUS[tx.status] || STATUS.pending;
  const date = new Date(tx.timestamp);
  const otpExpired = tx.otp_expires_at && new Date(tx.otp_expires_at).getTime() <= Date.now();

  async function submitOtp(event) {
    event.preventDefault();
    setVerifying(true);
    const success = await onVerifyOtp(tx.id, otp);
    if (success) setOtp('');
    setVerifying(false);
  }

  return (
    <article className="border-b border-white/5 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-between gap-3 py-3 px-1 text-left hover:bg-white/[0.02] rounded-lg transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-base shrink-0">
            {CATEGORY_ICONS[tx.category] || '💳'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{tx.libelle || tx.category}</p>
            <p className="text-xs text-slate-250/45">
              {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {tx.category}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className={`amount-mono text-sm font-semibold ${isCredit ? 'text-mint-400' : 'text-white'}`}>
              {isCredit ? '+' : ''}{Number(tx.amount).toFixed(2)} €
            </p>
            <p className={`inline-block text-[10px] px-1.5 py-0.5 rounded-md mt-0.5 ${status.className}`}>{status.label}</p>
          </div>
          <ChevronDown size={16} className={`text-slate-250/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="mb-3 mx-1 sm:ml-12 rounded-xl bg-white/[0.025] border border-white/5 p-3 sm:p-4 space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-x-5 gap-y-3 text-xs">
            <Detail label="Statut" value={status.label} />
            <Detail label="Date et heure" value={date.toLocaleString('fr-FR')} />
            <Detail label="Type" value={formatType(tx.type)} />
            <Detail label="Montant" value={`${Math.abs(Number(tx.amount)).toFixed(2)} €`} mono />
            <Detail label="Destination / origine" value={tx.destination_info || 'Non renseignée'} mono />
            <Detail label="Référence" value={tx.id} mono />
          </div>

          {tx.status === 'pending' && !tx.otp_required && (
            <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-xs text-slate-250/60">
              <p className="font-medium text-white mb-1">En attente du code OTP</p>
              L’administrateur doit encore générer et vous transmettre le code de sécurité.
            </div>
          )}

          {tx.status === 'pending' && tx.otp_required && !tx.otp_verified && onVerifyOtp && (
            <form onSubmit={submitOtp} className="rounded-xl bg-gold-500/5 border border-gold-500/15 p-3">
              <div className="flex items-start gap-2 mb-3">
                <KeyRound size={16} className="text-gold-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gold-400">Confirmation OTP requise</p>
                  <p className="text-xs text-slate-250/65 mt-1">{tx.otp_message}</p>
                  {tx.otp_expires_at && <p className={`text-[11px] mt-1 ${otpExpired ? 'text-coral-400' : 'text-slate-250/40'}`}>{otpExpired ? 'Ce code a expiré. Demandez-en un nouveau.' : `Valable jusqu’au ${new Date(tx.otp_expires_at).toLocaleString('fr-FR')}`}</p>}
                </div>
              </div>
              <div className="flex flex-col xs:flex-row gap-2">
                <input
                  required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
                  disabled={otpExpired}
                  className="input-field !py-2 amount-mono tracking-[0.25em]"
                  aria-label="Code OTP à six chiffres"
                  placeholder="Code à 6 chiffres"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                />
                <button disabled={verifying || otp.length !== 6 || otpExpired} className="btn-primary !py-2 shrink-0">
                  {verifying ? 'Vérification…' : 'Confirmer le code'}
                </button>
              </div>
            </form>
          )}

          {tx.status === 'pending' && tx.otp_verified && (
            <p className="rounded-xl bg-mint-500/10 border border-mint-500/15 p-3 text-xs text-mint-400">
              Code OTP confirmé. Le transfert attend maintenant la validation de l’administrateur.
            </p>
          )}

          {tx.status === 'pending' && onCancel && (
            <button type="button" onClick={() => onCancel(tx.id)} className="btn-danger !py-2 !px-3 text-xs">
              Annuler ce virement et récupérer les fonds
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Detail({ label, value, mono = false }) {
  return <div className="min-w-0"><p className="text-slate-250/40 mb-1">{label}</p><p className={`text-slate-250/80 break-words ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</p></div>;
}

function formatType(type) {
  const labels = { virement_interne: 'Virement interne', virement_externe: 'Virement externe', paiement: 'Paiement', prelevement: 'Prélèvement', depot: 'Crédit' };
  return labels[type] || type || 'Transaction';
}
