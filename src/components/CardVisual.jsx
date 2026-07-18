import { Wifi } from 'lucide-react';

const NETWORK_MARK = { Virtuelle: '#F2B705', Physique: '#3CF0C5' };

export default function CardVisual({ card, holderName, revealedNumber, onClick, className = '' }) {
  const isVirtual = card.type === 'Virtuelle';
  const isBlocked = card.status === 'Blocked';
  const accent = NETWORK_MARK[card.type];

  return (
    <div
      onClick={onClick}
      className={`relative w-full aspect-[1.586/1] rounded-2xl p-5 flex flex-col justify-between overflow-hidden select-none transition-transform duration-200 ${onClick ? 'cursor-pointer hover:-translate-y-1' : ''} ${isBlocked ? 'grayscale opacity-60' : ''} ${className}`}
      style={{
        background: isVirtual
          ? 'linear-gradient(135deg, #241a08 0%, #0B0F17 55%, #F2B70522 100%)'
          : 'linear-gradient(135deg, #132a24 0%, #0B0F17 55%, #16E0B022 100%)',
        boxShadow: '0 20px 45px -18px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* sheen décoratif */}
      <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: accent }} />

      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-medium">{card.type === 'Virtuelle' ? 'Carte Virtuelle' : 'Carte Physique'}</p>
          <p className="text-sm font-display font-semibold text-white mt-0.5">NeoBank</p>
        </div>
        <Wifi size={20} className="text-white/60 rotate-90" />
      </div>

      <div className="relative z-10">
        {/* puce */}
        <div className="w-9 h-7 rounded-md mb-3" style={{ background: 'linear-gradient(135deg, #e8d48a, #b89a4a)' }} />
        <p className="amount-mono text-lg md:text-xl text-white tracking-widest">
          {revealedNumber ? formatNumber(revealedNumber) : `•••• •••• •••• ${card.last4}`}
        </p>
      </div>

      <div className="flex items-end justify-between relative z-10">
        <div>
          <p className="text-[9px] uppercase text-white/40 tracking-wider">Titulaire</p>
          <p className="text-xs font-medium text-white/90 uppercase">{holderName}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase text-white/40 tracking-wider">Exp.</p>
          <p className="text-xs font-mono text-white/90">{card.expiry}</p>
        </div>
      </div>

      {isBlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <span className="text-xs font-semibold uppercase tracking-widest text-coral-400 border border-coral-400/40 rounded-full px-3 py-1">Bloquée</span>
        </div>
      )}
    </div>
  );
}

function formatNumber(num) {
  return num.replace(/(.{4})/g, '$1 ').trim();
}
