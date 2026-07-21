import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const API_ROOT = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : (import.meta.env.PROD ? 'https://neobank-api-meoelfride.onrender.com' : 'http://localhost:4000');

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const report = {
      name: String(error?.name || 'Error').slice(0, 80),
      message: String(error?.message || 'Erreur inconnue').slice(0, 500),
      componentStack: String(info?.componentStack || '').slice(0, 2000),
      path: window.location.pathname.slice(0, 300),
    };

    console.error('[frontend-error]', error, info);
    fetch(`${API_ROOT}/api/monitoring/client-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {});
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen grid place-items-center bg-ink-950 px-5 text-center text-white">
        <div className="max-w-md">
          <AlertTriangle size={42} className="mx-auto text-gold-400" />
          <h1 className="mt-5 text-3xl font-semibold">Un imprévu est survenu.</h1>
          <p className="mt-3 text-slate-250/60">L’incident a été signalé. Rechargez la page ou revenez à l’accueil.</p>
          <div className="mt-7 flex justify-center gap-3">
            <button type="button" onClick={() => window.location.reload()} className="btn-primary inline-flex items-center gap-2"><RefreshCw size={17} /> Recharger</button>
            <a href="/" className="btn-secondary">Accueil</a>
          </div>
        </div>
      </main>
    );
  }
}
