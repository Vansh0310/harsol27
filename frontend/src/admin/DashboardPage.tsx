import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from './api';
import type { LeadStatus, ListLeadsParams, PaginatedLeads } from './api';
import { UnauthorizedError } from './api';
import { useAuth } from './AuthContext';
import {
  BUSINESS_CATEGORY_LABELS,
  BUSINESS_CATEGORY_VALUES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_VALUES,
  type BusinessCategory,
} from '../lib/validation';
import './admin.css';

type SortableField = NonNullable<ListLeadsParams['sortBy']>;

interface Filters {
  businessCategory: BusinessCategory | '';
  status: LeadStatus | '';
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = { businessCategory: '', status: '', dateFrom: '', dateTo: '' };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function DashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<SortableField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PaginatedLeads | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Intentional: this is the standard "reset, then fetch" data-loading
    // effect pattern (each dependency change should immediately show a
    // loading state, not wait for a later render) - not the kind of
    // derivable-from-render state this lint rule is meant to catch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);

    const params: ListLeadsParams = {
      page,
      pageSize: 20,
      sortBy,
      sortDir,
      businessCategory: filters.businessCategory || undefined,
      status: filters.status || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    };

    api
      .listLeads(params)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          void logout().then(() => navigate('/admin/login', { replace: true }));
          return;
        }
        setLoadError('Could not load leads. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, sortBy, sortDir, page, logout, navigate]);

  const toggleSort = (field: SortableField): void => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortableField): string => {
    if (sortBy !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]): void => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  return (
    <div className="dashboard">
      <h1>Leads</h1>

      <div className="dashboard__filters">
        <label>
          Category
          <select
            value={filters.businessCategory}
            onChange={(e) =>
              updateFilter('businessCategory', e.target.value as BusinessCategory | '')
            }
          >
            <option value="">All</option>
            {BUSINESS_CATEGORY_VALUES.map((value) => (
              <option key={value} value={value}>
                {BUSINESS_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value as LeadStatus | '')}
          >
            <option value="">All</option>
            {LEAD_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {LEAD_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label>
          From
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => updateFilter('dateFrom', e.target.value)}
          />
        </label>

        <label>
          To
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => updateFilter('dateTo', e.target.value)}
          />
        </label>

        <button type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
          Clear filters
        </button>
      </div>

      {loadError && (
        <p className="dashboard__error" role="alert">
          {loadError}
        </p>
      )}

      <table className="dashboard__table">
        <thead>
          <tr>
            <th onClick={() => toggleSort('fullName')}>Name{sortIndicator('fullName')}</th>
            <th>Phone</th>
            <th>Email</th>
            <th onClick={() => toggleSort('businessCategory')}>
              Category{sortIndicator('businessCategory')}
            </th>
            <th onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
            <th onClick={() => toggleSort('createdAt')}>Submitted{sortIndicator('createdAt')}</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6}>Loading…</td>
            </tr>
          )}
          {!loading && data?.leads.length === 0 && (
            <tr>
              <td colSpan={6}>No leads match these filters.</td>
            </tr>
          )}
          {!loading &&
            data?.leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <Link to={`/admin/leads/${lead.id}`}>{lead.fullName}</Link>
                </td>
                <td>{lead.phoneNumber}</td>
                <td>{lead.email}</td>
                <td>{BUSINESS_CATEGORY_LABELS[lead.businessCategory]}</td>
                <td>
                  <span className={`status-badge status-badge--${lead.status}`}>
                    {LEAD_STATUS_LABELS[lead.status]}
                  </span>
                </td>
                <td>{formatDate(lead.createdAt)}</td>
              </tr>
            ))}
        </tbody>
      </table>

      {data && data.totalPages > 1 && (
        <div className="dashboard__pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {data.page} of {data.totalPages} ({data.total} total)
          </span>
          <button
            type="button"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
