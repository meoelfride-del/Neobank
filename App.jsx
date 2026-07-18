import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';

import Login from './views/Login';
import Register from './views/Register';
import OnboardingKYC from './views/OnboardingKYC';
import Dashboard from './views/Dashboard';
import Accounts from './views/Accounts';
import Transfer from './views/Transfer';
import Cards from './views/Cards';
import Budget from './views/Budget';
import Chatbot from './views/Chatbot';
import AdminBackoffice from './views/AdminBackoffice';
import NotFound from './views/NotFound';

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
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={<ProtectedRoute><OnboardingKYC /></ProtectedRoute>} />

        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/accounts" element={<Protected><Accounts /></Protected>} />
        <Route path="/transfer" element={<Protected><Transfer /></Protected>} />
        <Route path="/cards" element={<Protected><Cards /></Protected>} />
        <Route path="/budget" element={<Protected><Budget /></Protected>} />
        <Route path="/chatbot" element={<Protected><Chatbot /></Protected>} />
        <Route path="/admin" element={<Protected adminOnly><AdminBackoffice /></Protected>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
