const CATEGORY_ICONS = {
  Alimentation: '🛒', Logement: '🏠', Transport: '🚆', Loisirs: '🎬',
  Santé: '💊', Shopping: '🛍️', Salaire: '💼', Autre: '💳',
};

export default function TransactionRow({ tx, onCancel }) {
  const isCredit = tx.amount >= 0;
  const date = new Date(tx.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

  return (
    <div className="flex items-center justify-between py-3 px-1 border-b border-white/5 last:border-0">
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
  );
}
