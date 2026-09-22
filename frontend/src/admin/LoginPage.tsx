import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from './api';
import { useAuth } from './AuthContext';
import './admin.css';

const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  // Already signed in (e.g. navigated here directly with a live session) -
  // send straight through rather than showing a pointless login form.
  if (status === 'authenticated') {
    return <Navigate to="/admin" replace />;
  }

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      const state = location.state as LocationState | null;
      void navigate(state?.from?.pathname ?? '/admin', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Couldn't reach the server. Check your connection and try again.");
      }
    }
  };

  return (
    <main className="admin-login">
      <form
        className="admin-login__form"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
      >
        <h1>Admin sign in</h1>

        <div className="admin-login__field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p id="email-error" className="admin-login__error" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="admin-login__field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password && (
            <p id="password-error" className="admin-login__error" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        {formError && (
          <p
            className="admin-login__error admin-login__error--summary"
            role="alert"
            aria-live="assertive"
          >
            {formError}
          </p>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
