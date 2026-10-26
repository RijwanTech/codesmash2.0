import type { ReactNode } from 'react';
import { Link } from '../router';
import { useApp } from '../store';

export function Loading({ text = 'Loading…' }: { text?: string }) {
  const { serverDown } = useApp();
  return (
    <div className="container section center-text muted">
      <div className="spinner" />
      <p>{serverDown ? 'Cannot reach the server. Retrying… your login is kept.' : text}</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="container section narrow">
      <div className="card center-text">
        <h3>Something went wrong</h3>
        <p className="muted">{message}</p>
        {onRetry && (
          <button className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function RequireStudent({ children }: { children: ReactNode }) {
  const { isStudent, ready } = useApp();
  if (!ready) return <Loading />;
  if (isStudent) return <>{children}</>;
  return (
    <div className="container section narrow">
      <div className="card center-text">
        <h2>Please log in</h2>
        <p className="muted">You need to be registered and logged in to see this page.</p>
        <div className="row center">
          <Link to="/login" className="btn btn-primary">
            Login
          </Link>
          <Link to="/register" className="btn btn-ghost">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
