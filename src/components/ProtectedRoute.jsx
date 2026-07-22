import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function ProtectedRoute({ children, adminOnly = false, allowUnverified = false }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (!allowUnverified && user?.role !== 'admin' && user?.status_kyc !== 'verified') return <Navigate to="/onboarding" replace />;
  if (allowUnverified && user?.role !== 'admin' && user?.status_kyc === 'verified') return <Navigate to="/dashboard" replace />;

  return children;
}
