import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Landmark, Loader2 } from 'lucide-react';
import useAuthStore from '../store/authStore';

export default function Register() {
  const navigate = useNavigate();
  const { register, loading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', password: '', phone: '' });

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await register(form);
    if (res.success) navigate('/onboarding');
  }

  function update(field, value) {
    clearError();
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="Retour à l’accueil" className="flex flex-col items-center mb-8 group">
          <div className="w-12 h-12 rounded-2xl bg-mint-500 flex items-center justify-center mb-3">
            <Landmark size={24} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-display font-semibold text-white group-hover:text-mint-400 transition-colors">Ouvrir un compte</h1>
          <p className="text-sm text-slate-250/50 mt-1">Gratuit, en moins de 3 minutes.</p>
        </Link>

        <form onSubmit={handleSubmit} className="panel p-7 space-y-4">
          {error && (
            <div className="bg-coral-500/10 border border-coral-500/20 text-coral-400 text-sm rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-field">Prénom</label>
              <input required className="input-field" value={form.prenom} onChange={(e) => update('prenom', e.target.value)} />
            </div>
            <div>
              <label className="label-field">Nom</label>
              <input required className="input-field" value={form.nom} onChange={(e) => update('nom', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-field">Adresse email</label>
            <input type="email" required className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>

          <div>
            <label className="label-field">Téléphone (pour virements par numéro)</label>
            <input required className="input-field" placeholder="+33612345678" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>

          <div>
            <label className="label-field">Mot de passe (8 caractères min.)</label>
            <input type="password" required minLength={8} className="input-field" value={form.password} onChange={(e) => update('password', e.target.value)} />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Créer mon compte
          </button>

          <p className="text-center text-sm text-slate-250/50 pt-2">
            Déjà client ? <Link to="/login" className="text-mint-400 hover:underline">Se connecter</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
