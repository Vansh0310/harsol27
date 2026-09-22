import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Gates every /admin/* route except the login page itself. While the
 * session is being hydrated (one GET /api/auth/me on app load) this shows
 * nothing rather than flashing the login page and immediately redirecting
 * away from it once the real answer comes back.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return null;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return children;
}
