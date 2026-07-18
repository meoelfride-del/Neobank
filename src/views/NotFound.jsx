import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
      <Compass size={40} className="text-mint-400" />
      <h1 className="text-2xl font-display font-semibold text-white">Page introuvable</h1>
      <p className="text-slate-250/50 text-sm">Cette page n'existe pas ou a été déplacée.</p>
      <Link to="/dashboard" className="btn-primary mt-2">Retour au tableau de bord</Link>
    </div>
  );
}
