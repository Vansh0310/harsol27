import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from './api';
import type { LeadDetail, LeadStatus } from './api';
import { ApiError, UnauthorizedError } from './api';
import { useAuth } from './AuthContext';
import {
  BUSINESS_CATEGORY_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_VALUES,
} from '../lib/validation';
import './admin.css';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    api
      .getLead(id)
      .then((result) => {
        if (!cancelled) setLead(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          void logout().then(() => navigate('/admin/login', { replace: true }));
        } else if (err instanceof ApiError && err.status === 404) {
          setLoadError('This lead no longer exists.');
        } else {
          setLoadError('Could not load this lead. Please try again.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, logout, navigate]);

  const handleStatusChange = async (status: LeadStatus): Promise<void> => {
    if (!id) return;
    setUpdating(true);
    setUpdateError(null);
    try {
      const updated = await api.updateLeadStatus(id, status);
      setLead(updated);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        await logout();
        void navigate('/admin/login', { replace: true });
        return;
      }
      setUpdateError(
        err instanceof ApiError ? err.message : 'Could not update status. Please try again.',
      );
    } finally {
      setUpdating(false);
    }
  };

  if (loadError) {
    return (
      <div className="lead-detail">
        <p role="alert">{loadError}</p>
        <Link to="/admin">Back to leads</Link>
      </div>
    );
  }

  if (!lead) {
    return <p>Loading…</p>;
  }

  return (
    <div className="lead-detail">
      <Link to="/admin" className="lead-detail__back">
        ← Back to leads
      </Link>

      <h1>{lead.fullName}</h1>

      <dl className="lead-detail__fields">
        <dt>Phone</dt>
        <dd>{lead.phoneNumber}</dd>
        <dt>Email</dt>
        <dd>{lead.email}</dd>
        <dt>Business category</dt>
        <dd>{BUSINESS_CATEGORY_LABELS[lead.businessCategory]}</dd>
        <dt>Submitted</dt>
        <dd>{formatDate(lead.createdAt)}</dd>
        <dt>Source IP</dt>
        <dd>{lead.sourceIp ?? '—'}</dd>
      </dl>

      <div className="lead-detail__status">
        <label htmlFor="status">Status</label>
        <select
          id="status"
          value={lead.status}
          disabled={updating}
          onChange={(e) => void handleStatusChange(e.target.value as LeadStatus)}
        >
          {LEAD_STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {LEAD_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        {updateError && (
          <p className="lead-detail__error" role="alert">
            {updateError}
          </p>
        )}
      </div>

      <h2>History</h2>
      {lead.statusHistory.length === 0 ? (
        <p>No status changes yet.</p>
      ) : (
        <ul className="lead-detail__history">
          {lead.statusHistory.map((entry) => (
            <li key={entry.id}>
              <span>
                {entry.fromStatus ? LEAD_STATUS_LABELS[entry.fromStatus] : 'New submission'} →{' '}
                {LEAD_STATUS_LABELS[entry.toStatus]}
              </span>
              <span className="lead-detail__history-meta">
                {formatDate(entry.createdAt)} by {entry.changedBy.email}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
