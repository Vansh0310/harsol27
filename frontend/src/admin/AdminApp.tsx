import { Route, Routes } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { AuthProvider } from './AuthContext';
import { DashboardPage } from './DashboardPage';
import { IndustriesPage } from './IndustriesPage';
import { LeadDetailPage } from './LeadDetailPage';
import { LoginPage } from './LoginPage';
import { RequireAuth } from './RequireAuth';

/**
 * Everything under /admin, code-split from the public form's bundle (see
 * App.tsx's React.lazy import) so a visitor to the public form never
 * downloads the admin dashboard's JS at all - one layer of the "separate
 * surface" isolation the plan doc calls for, short of a fully separate
 * build/deploy.
 */
export default function AdminApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="leads/:id" element={<LeadDetailPage />} />
          <Route path="industries" element={<IndustriesPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
