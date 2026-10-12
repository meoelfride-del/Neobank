import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import KycProfileFields, { emptyProfile } from '../components/KycProfileFields';
import LanguageSelector from '../components/LanguageSelector';

export default function Register() {
  const navigate = useNavigate();
  const { register, loading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({ ...emptyProfile, nom: '', prenom: '', email: '', password: '', phone: '', accept_terms: false });
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState('');
  function update(field, value) { clearError(); setLocalError(''); setForm(current => ({ ...current, [field]: value })); }
  async function submit(event) {
    event.preventDefault(); if (loading) return;
    if (form.password !== confirmation) { setLocalError('Les mots de passe ne correspondent pas.'); return; }
    const result = await register(form); if (result.success) navigate('/onboarding');
  }
  return <main className="min-h-screen px-4 py-10"><div className="max-w-2xl mx-auto">
    <div className="flex justify-end mb-4"><LanguageSelector /></div>
    <Link to="/" className="text-mint-400">← Accueil NEO BANK</Link>
    <h1 className="text-2xl font-display text-white mt-5">Créer votre compte</h1>
    <p className="text-sm text-slate-250/70 my-4">Étape 1 sur 2 · Informations personnelles. Vous déposerez ensuite votre photo de pièce d’identité pour vérification manuelle.</p>
    <form onSubmit={submit} className="panel p-5 sm:p-7 space-y-6">
      {(error || localError) && <p role="alert" className="text-coral-400">{localError || error}</p>}
      <fieldset className="space-y-4"><legend className="text-white font-semibold mb-3">Identité et coordonnées</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{[['prenom', 'Prénom', 'text', 'given-name'], ['nom', 'Nom', 'text', 'family-name'], ['email', 'Adresse email', 'email', 'email'], ['phone', 'Téléphone avec indicatif international', 'tel', 'tel']].map(([field, label, type, autoComplete]) => <label key={field} className="label-field">{label}<input required type={type} autoComplete={autoComplete} className="input-field mt-1" maxLength={field === 'email' ? 254 : field === 'phone' ? 20 : 60} value={form[field]} onChange={event => update(field, event.target.value)} /></label>)}</div><KycProfileFields value={form} onChange={update} /></fieldset>
      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4"><legend className="text-white font-semibold mb-3">Sécurité du compte</legend><label className="label-field">Mot de passe (8 caractères minimum)<input required type="password" autoComplete="new-password" minLength={8} maxLength={72} className="input-field mt-1" value={form.password} onChange={event => update('password', event.target.value)} /></label><label className="label-field">Confirmer le mot de passe<input required type="password" autoComplete="new-password" className="input-field mt-1" value={confirmation} onChange={event => { setConfirmation(event.target.value); setLocalError(''); }} /></label></fieldset>
      <label className="flex items-start gap-3 text-sm text-slate-250/80"><input required type="checkbox" checked={form.accept_terms} onChange={event => update('accept_terms', event.target.checked)} className="mt-1" /><span>J’accepte les <Link className="text-mint-400 underline" target="_blank" to="/conditions-utilisation">conditions d’utilisation</Link> et j’ai pris connaissance de la <Link className="text-mint-400 underline" target="_blank" to="/confidentialite">politique de confidentialité</Link>.</span></label>
      <button disabled={loading} className="btn-primary w-full">{loading ? 'Création…' : 'Créer mon compte et déposer mon document'}</button>
      <p className="text-sm text-center text-slate-250/70">Déjà inscrit ? <Link to="/login" className="text-mint-400">Se connecter</Link></p>
    </form></div></main>;
}
