import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';

const Login = lazy(() => import('./views/Login'));
const Landing = lazy(() => import('./views/Landing'));
const Register = lazy(() => import('./views/Register'));
const OnboardingKYC = lazy(() => import('./views/OnboardingKYC'));
const Dashboard = lazy(() => import('./views/Dashboard'));
const Accounts = lazy(() => import('./views/Accounts'));
const Transfer = lazy(() => import('./views/Transfer'));
const Cards = lazy(() => import('./views/Cards'));
const Budget = lazy(() => import('./views/Budget'));
const Chatbot = lazy(() => import('./views/Chatbot'));
const AdminBackoffice = lazy(() => import('./views/AdminBackoffice'));
const NotFound = lazy(() => import('./views/NotFound'));
const Legal = lazy(() => import('./views/Legal'));

function RouteLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-ink-950 text-slate-250">
      <div className="flex items-center gap-3 text-sm" role="status" aria-live="polite">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-mint-400/30 border-t-mint-400" />
        Chargement…
      </div>
    </div>
  );
}

function Protected({ children, adminOnly }) {
  return (
    <ProtectedRoute adminOnly={adminOnly}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/mentions-legales" element={<Legal type="mentions" />} />
          <Route path="/confidentialite" element={<Legal type="privacy" />} />
          <Route path="/conditions-utilisation" element={<Legal type="terms" />} />
          <Route path="/onboarding" element={<ProtectedRoute allowUnverified><OnboardingKYC /></ProtectedRoute>} />

          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/accounts" element={<Protected><Accounts /></Protected>} />
          <Route path="/transfer" element={<Protected><Transfer /></Protected>} />
          <Route path="/cards" element={<Protected><Cards /></Protected>} />
          <Route path="/budget" element={<Protected><Budget /></Protected>} />
          <Route path="/chatbot" element={<Protected><Chatbot /></Protected>} />
          <Route path="/admin" element={<Protected adminOnly><AdminBackoffice /></Protected>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Analytics beforeSend={(event) => /\/(dashboard|accounts|transfer|cards|budget|chatbot|admin|onboarding)(\/|$)/.test(new URL(event.url, window.location.origin).pathname) ? null : event} />
      <SpeedInsights />
    </BrowserRouter>
  );
}
