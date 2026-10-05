import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { IndustriesPage } from './IndustriesPage';
import { useAuth } from './AuthContext';
import * as api from './api';
import { ApiError } from './api';

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listAllIndustries: vi.fn(),
    createIndustry: vi.fn(),
    updateIndustry: vi.fn(),
  };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedListAll = vi.mocked(api.listAllIndustries);
const mockedCreate = vi.mocked(api.createIndustry);
const mockedUpdate = vi.mocked(api.updateIndustry);

const sampleIndustries: api.Industry[] = [
  {
    id: 'industry_1',
    name: 'Textiles & Fabrics',
    slug: 'textiles-fabrics',
    isActive: true,
    sortOrder: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'industry_2',
    name: 'Steel & Metal Products',
    slug: 'steel-metal-products',
    isActive: false,
    sortOrder: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function renderPage(role: 'admin' | 'viewer' = 'admin'): void {
  mockedUseAuth.mockReturnValue({
    admin: { id: 'admin-1', email: 'admin@example.com', role },
    status: 'authenticated',
    login: vi.fn(),
    logout: vi.fn(),
  });
  render(
    <MemoryRouter>
      <IndustriesPage />
    </MemoryRouter>,
  );
}

describe('IndustriesPage', () => {
  beforeEach(() => {
    mockedListAll.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedListAll.mockResolvedValue(sampleIndustries);
  });

  it('lists every industry, including inactive ones, with their status', async () => {
    renderPage('admin');

    expect(await screen.findByText('Textiles & Fabrics')).toBeInTheDocument();
    expect(screen.getByText('Steel & Metal Products')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows the add form and action buttons for an admin', async () => {
    renderPage('admin');

    expect(await screen.findByText('Textiles & Fabrics')).toBeInTheDocument();
    expect(screen.getByLabelText(/add industry/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /deactivate|activate/i })).toHaveLength(2);
  });

  it('hides the add form and every action button for a viewer', async () => {
    renderPage('viewer');

    expect(await screen.findByText('Textiles & Fabrics')).toBeInTheDocument();
    expect(screen.queryByLabelText(/add industry/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate|activate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
  });

  it('creates a new industry through the add form', async () => {
    mockedCreate.mockResolvedValue({
      id: 'industry_3',
      name: 'Food & Beverages',
      slug: 'food-beverages',
      isActive: true,
      sortOrder: 30,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderPage('admin');
    await screen.findByText('Textiles & Fabrics');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/add industry/i), 'Food & Beverages');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(mockedCreate).toHaveBeenCalledWith('Food & Beverages');
    expect(await screen.findByText('Food & Beverages')).toBeInTheDocument();
  });

  it('deactivates an active industry', async () => {
    mockedUpdate.mockResolvedValue({ ...sampleIndustries[0], isActive: false });

    renderPage('admin');
    await screen.findByText('Textiles & Fabrics');

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /^deactivate$/i })[0]);

    expect(mockedUpdate).toHaveBeenCalledWith('industry_1', { isActive: false });
    await waitFor(() => {
      expect(screen.getAllByText('Inactive')).toHaveLength(2);
    });
  });

  it('renames an industry when the inline edit is submitted', async () => {
    mockedUpdate.mockResolvedValue({ ...sampleIndustries[0], name: 'Textiles & Garments' });

    renderPage('admin');
    await screen.findByText('Textiles & Fabrics');

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /rename/i })[0]);
    const input = screen.getByDisplayValue('Textiles & Fabrics');
    await user.clear(input);
    await user.type(input, 'Textiles & Garments{Enter}');

    expect(mockedUpdate).toHaveBeenCalledWith('industry_1', { name: 'Textiles & Garments' });
    expect(await screen.findByText('Textiles & Garments')).toBeInTheDocument();
  });

  it('shows an error message when an action fails', async () => {
    mockedUpdate.mockRejectedValue(new ApiError(409, 'An industry with this name already exists.'));

    renderPage('admin');
    await screen.findByText('Textiles & Fabrics');

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /^deactivate$/i })[0]);

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it('shows a load error when the industry list fails to fetch', async () => {
    mockedListAll.mockReset();
    mockedListAll.mockRejectedValue(new Error('network down'));

    renderPage('admin');

    expect(await screen.findByText(/could not load industries/i)).toBeInTheDocument();
  });
});
