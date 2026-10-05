import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './admin.css';

export function AdminLayout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    void navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin-layout">
      <header className="admin-layout__header">
        <span className="admin-layout__title">Harsol27 Admin</span>
        <nav className="admin-layout__nav">
          <Link to="/admin">Leads</Link>
          <Link to="/admin/industries">Industries</Link>
        </nav>
        <div className="admin-layout__account">
          {admin && <span className="admin-layout__email">{admin.email}</span>}
          <button type="button" onClick={() => void handleLogout()}>
            Log out
          </button>
        </div>
      </header>
      <main className="admin-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
