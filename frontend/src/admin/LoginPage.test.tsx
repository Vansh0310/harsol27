import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { useAuth } from './AuthContext';
import { ApiError } from './api';

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderLoginPage(initialEntries: string[] = ['/admin/login']): void {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<div>Dashboard placeholder</div>} />
        <Route path="/admin/leads/:id" element={<div>Lead detail placeholder</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    mockLogin.mockReset();
    mockedUseAuth.mockReturnValue({
      admin: null,
      status: 'unauthenticated',
      login: mockLogin,
      logout: vi.fn(),
    });
  });

  it('renders the email and password fields', () => {
    renderLoginPage();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows inline validation errors and never calls login for an empty submission', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls login with the entered credentials and navigates to /admin on success', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'harsol27helpdesk@gmail.com');
    await user.type(screen.getByLabelText(/password/i), 'a-real-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith('harsol27helpdesk@gmail.com', 'a-real-password');
    expect(await screen.findByText(/dashboard placeholder/i)).toBeInTheDocument();
  });

  it('redirects back to the originally requested page after login', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/admin/login', state: { from: { pathname: '/admin/leads/123' } } },
        ]}
      >
        <Routes>
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin/leads/:id" element={<div>Lead detail placeholder</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email/i), 'harsol27helpdesk@gmail.com');
    await user.type(screen.getByLabelText(/password/i), 'a-real-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/lead detail placeholder/i)).toBeInTheDocument();
  });

  it('shows the exact ApiError message for invalid credentials without navigating away', async () => {
    mockLogin.mockRejectedValue(new ApiError(401, 'Invalid email or password.'));
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'wrong@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(screen.queryByText(/dashboard placeholder/i)).not.toBeInTheDocument();
  });

  it('shows a generic connection error when login fails for a non-API reason', async () => {
    mockLogin.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'harsol27helpdesk@gmail.com');
    await user.type(screen.getByLabelText(/password/i), 'a-real-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
  });

  it('redirects straight to /admin when already authenticated, without showing the form', () => {
    mockedUseAuth.mockReturnValue({
      admin: { id: 'admin-1', email: 'harsol27helpdesk@gmail.com', role: 'admin' },
      status: 'authenticated',
      login: mockLogin,
      logout: vi.fn(),
    });

    renderLoginPage();

    expect(screen.getByText(/dashboard placeholder/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });
});
