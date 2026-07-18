import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanFace, IdCard, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const STEPS = ['upload', 'scanning', 'in_review', 'verified', 'rejected'];

export default function OnboardingKYC() {
  const navigate = useNavigate();
  const { refreshUser } = useAuthStore();
  const [step, setStep] = useState('upload');
  const [polling, setPolling] = useState(false);
  const submitTimerRef = useRef(null);

  useEffect(() => {
    if (step !== 'in_review') return;
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get('/accounts/kyc/status');
        if (data.status_kyc === 'verified' || data.status_kyc === 'rejected') {
          clearInterval(interval);
          setPolling(false);
          setStep(data.status_kyc);
          await refreshUser();
        }
      } catch {
        // Ignore transient polling failures and keep retrying.
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [step]);

  async function startVerification() {
    setStep('scanning');
    submitTimerRef.current = setTimeout(async () => {
      try {
        await api.post('/accounts/kyc/submit');
        setStep('in_review');
      } catch {
        setStep('upload');
      }
    }, 1800);
  }

  useEffect(() => () => {
    if (submitTimerRef.current) {
      clearTimeout(submitTimerRef.current);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg panel p-8 text-center">
        <h1 className="text-2xl font-display font-semibold text-white mb-2">Vérification d'identité</h1>
        <p className="text-sm text-slate-250/50 mb-8">Exigence réglementaire KYC/AML — traitement automatisé sécurisé.</p>

        {step === 'upload' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-dashed border-white/15 rounded-2xl p-6 flex flex-col items-center gap-2 text-slate-250/60">
                <IdCard size={28} />
                <span className="text-xs">Pièce d'identité</span>
              </div>
              <div className="border border-dashed border-white/15 rounded-2xl p-6 flex flex-col items-center gap-2 text-slate-250/60">
                <ScanFace size={28} />
                <span className="text-xs">Reconnaissance faciale</span>
              </div>
            </div>
            <button onClick={startVerification} className="btn-primary w-full">Démarrer la vérification</button>
          </div>
        )}

        {step === 'scanning' && (
          <div className="py-10 flex flex-col items-center gap-4">
            <Loader2 size={36} className="text-mint-400 animate-spin" />
            <p className="text-sm text-slate-250/60">Analyse des documents en cours…</p>
          </div>
        )}

        {step === 'in_review' && (
          <div className="py-10 flex flex-col items-center gap-4">
            <Loader2 size={36} className="text-gold-400 animate-spin" />
            <p className="text-sm text-slate-250/60">Validation automatisée en cours de traitement…</p>
            {polling && <p className="text-xs text-slate-250/30">Cela ne prend généralement que quelques secondes.</p>}
          </div>
        )}

        {step === 'verified' && (
          <div className="py-10 flex flex-col items-center gap-4">
            <CheckCircle2 size={44} className="text-mint-400" />
            <p className="text-white font-medium">Identité vérifiée avec succès</p>
            <button onClick={() => navigate('/dashboard')} className="btn-primary mt-2">Accéder à mon compte</button>
          </div>
        )}

        {step === 'rejected' && (
          <div className="py-10 flex flex-col items-center gap-4">
            <XCircle size={44} className="text-coral-400" />
            <p className="text-white font-medium">La vérification a échoué</p>
            <p className="text-xs text-slate-250/50">Merci de réessayer avec des documents plus lisibles.</p>
            <button onClick={() => setStep('upload')} className="btn-secondary mt-2">Réessayer</button>
          </div>
        )}

        {step === 'upload' && (
          <button onClick={() => navigate('/dashboard')} className="text-xs text-slate-250/40 hover:text-slate-250/70 mt-6">
            Passer cette étape pour l'instant
          </button>
        )}
      </div>
    </div>
  );
}
