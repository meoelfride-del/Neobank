import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Landmark, Loader2, ShieldCheck } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../components/LanguageSelector';

export default function Login() {
  const navigate = useNavigate();
  const { login, loading, error, mfaRequired, clearError } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '', otp: '' });
  const { t } = useTranslation();

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await login(form.email, form.password, form.otp || undefined);
    if (res.success) navigate(res.user?.role === 'admin' ? '/admin' : '/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end"><LanguageSelector /></div>
        <Link to="/" aria-label="Retour à l’accueil" className="flex flex-col items-center mb-8 group">
          <div className="w-12 h-12 rounded-2xl bg-mint-500 flex items-center justify-center mb-3">
            <Landmark size={24} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-display font-semibold text-white group-hover:text-mint-400 transition-colors">NEO BANK</h1>
          <p className="text-sm text-slate-250/50 mt-1">Votre argent, en temps réel.</p>
        </Link>

        <form onSubmit={handleSubmit} className="panel p-7 space-y-4">
          <h2 className="text-lg font-display font-semibold text-white mb-1">{t('auth.loginTitle')}</h2>

          {error && (
            <div className="bg-coral-500/10 border border-coral-500/20 text-coral-400 text-sm rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          {mfaRequired && (
            <div className="bg-gold-500/10 border border-gold-500/20 text-gold-400 text-sm rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <ShieldCheck size={16} /> Entrez le code à 6 chiffres de votre application d'authentification.
            </div>
          )}

          {!mfaRequired && (
            <>
              <div>
                <label className="label-field">{t('auth.email')}</label>
                <input
                  type="email" required autoFocus
                  className="input-field"
                  placeholder="vous@exemple.com"
                  value={form.email}
                  onChange={(e) => { clearError(); setForm({ ...form, email: e.target.value }); }}
                />
              </div>
              <div>
                <label className="label-field">{t('auth.password')}</label>
                <input
                  type="password" required
                  className="input-field"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => { clearError(); setForm({ ...form, password: e.target.value }); }}
                />
              </div>
            </>
          )}

          {mfaRequired && (
            <div>
              <label className="label-field">{t('auth.otp')}</label>
              <input
                type="text" required autoFocus maxLength={6}
                className="input-field text-center tracking-[0.5em] font-mono text-lg"
                placeholder="000000"
                value={form.otp}
                onChange={(e) => setForm({ ...form, otp: e.target.value.replace(/\D/g, '') })}
              />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t(mfaRequired ? 'auth.verify' : 'auth.login')}
          </button>

          <p className="text-center text-sm text-slate-250/50 pt-2">
            {t('auth.noAccount')} <Link to="/register" className="text-mint-400 hover:underline">{t('auth.openAccount')}</Link>
          </p>
        </form>

      </div>
    </div>
  );
}

