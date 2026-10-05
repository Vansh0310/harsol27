import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from './api';
import type { Industry } from './api';
import { ApiError, UnauthorizedError } from './api';
import { useAuth } from './AuthContext';
import './admin.css';

/**
 * Admin-only screen for managing the industry list the public lead form's
 * dropdown and the dashboard's filter both draw from. A 'viewer' can see
 * everything here (same read access as the dashboard), but every mutating
 * control is hidden for them - the backend enforces the same restriction
 * independently (see backend/src/middleware/auth.ts's requireRole), so
 * hiding these is a UX nicety, not the actual security boundary.
 */
export function IndustriesPage() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const canManage = admin?.role === 'admin';

  const [industries, setIndustries] = useState<Industry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .listAllIndustries()
      .then((result) => {
        if (!cancelled) setIndustries(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          void logout().then(() => navigate('/admin/login', { replace: true }));
          return;
        }
        setLoadError('Could not load industries. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [logout, navigate]);

  const handleApiError = (err: unknown, fallback: string): void => {
    if (err instanceof UnauthorizedError) {
      void logout().then(() => navigate('/admin/login', { replace: true }));
      return;
    }
    setActionError(err instanceof ApiError ? err.message : fallback);
  };

  const handleCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await api.createIndustry(newName.trim());
      setIndustries((prev) => (prev ? [...prev, created] : [created]));
      setNewName('');
    } catch (err) {
      handleApiError(err, 'Could not create this industry. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const applyUpdate = async (
    id: string,
    input: api.UpdateIndustryInput,
    fallbackMessage: string,
  ): Promise<void> => {
    setBusyId(id);
    setActionError(null);
    try {
      const updated = await api.updateIndustry(id, input);
      setIndustries((prev) => prev?.map((i) => (i.id === id ? updated : i)) ?? null);
    } catch (err) {
      handleApiError(err, fallbackMessage);
    } finally {
      setBusyId(null);
    }
  };

  const startEditing = (industry: Industry): void => {
    setEditingId(industry.id);
    setEditingName(industry.name);
  };

  const submitRename = async (id: string): Promise<void> => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    await applyUpdate(id, { name }, 'Could not rename this industry. Please try again.');
  };

  const toggleActive = (industry: Industry): void => {
    void applyUpdate(
      industry.id,
      { isActive: !industry.isActive },
      'Could not update this industry. Please try again.',
    );
  };

  /**
   * Swaps this row's sortOrder with its neighbor in the given direction -
   * two PATCH calls, applied to local state together so the table never
   * shows a moment where both rows share the same order (a call failing
   * partway through just leaves one row unmoved, corrected on next load).
   */
  const move = async (index: number, direction: -1 | 1): Promise<void> => {
    if (!industries) return;
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= industries.length) return;

    const current = industries[index];
    const other = industries[otherIndex];
    setBusyId(current.id);
    setActionError(null);
    try {
      const [updatedCurrent, updatedOther] = await Promise.all([
        api.updateIndustry(current.id, { sortOrder: other.sortOrder }),
        api.updateIndustry(other.id, { sortOrder: current.sortOrder }),
      ]);
      setIndustries((prev) => {
        if (!prev) return prev;
        const next = prev.map((i) => {
          if (i.id === updatedCurrent.id) return updatedCurrent;
          if (i.id === updatedOther.id) return updatedOther;
          return i;
        });
        return [...next].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      });
    } catch (err) {
      handleApiError(err, 'Could not reorder these industries. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (loadError) {
    return (
      <p className="dashboard__error" role="alert">
        {loadError}
      </p>
    );
  }

  if (!industries) {
    return <p>Loading…</p>;
  }

  return (
    <div className="industries">
      <h1>Industries</h1>
      <p className="industries__hint">
        Shown on the public lead form and used to filter the dashboard. Deactivating one hides it
        from the public form immediately, without affecting leads already submitted under it.
      </p>

      {actionError && (
        <p className="dashboard__error" role="alert">
          {actionError}
        </p>
      )}

      {canManage && (
        <form className="industries__add" onSubmit={(e) => void handleCreate(e)}>
          <label htmlFor="new-industry-name">Add industry</label>
          <input
            id="new-industry-name"
            type="text"
            value={newName}
            maxLength={80}
            placeholder="e.g. Steel & Metal Products"
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" disabled={creating || !newName.trim()}>
            {creating ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      <table className="industries__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            {canManage && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {industries.map((industry, index) => (
            <tr key={industry.id}>
              <td>
                {editingId === industry.id ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingName}
                    maxLength={80}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => void submitRename(industry.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitRename(industry.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <span>{industry.name}</span>
                )}
              </td>
              <td>
                <span
                  className={`status-badge ${industry.isActive ? 'status-badge--new' : 'status-badge--inactive'}`}
                >
                  {industry.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              {canManage && (
                <td className="industries__actions">
                  <button
                    type="button"
                    disabled={busyId === industry.id || index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={busyId === industry.id || index === industries.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={busyId === industry.id}
                    onClick={() => startEditing(industry)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={busyId === industry.id}
                    onClick={() => toggleActive(industry)}
                  >
                    {industry.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
