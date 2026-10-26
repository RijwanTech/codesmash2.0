import { useState } from 'react';
import { Link, navigate } from '../router';
import { useApp } from '../store';
import { NotificationBell } from './NotificationBell';

export function Navbar({ path }: { path: string }) {
  const { user, isAdmin, isStudent, connected, logout, notify, registrationOpen } = useApp();
  const [open, setOpen] = useState(false);

  const items: { to: string; label: string }[] = [
    { to: '/', label: 'Home' },
    { to: '/rules', label: 'Rules' },
  ];
  if (isStudent) items.push({ to: '/dashboard', label: 'Dashboard' });
  if (isAdmin) items.push({ to: '/admin', label: 'Admin' });

  const active = (to: string) => (to === '/' ? path === '/' : path.startsWith(to));
  const close = () => setOpen(false);

  const onLogout = () => {
    logout();
    close();
    notify('info', 'You have been logged out.');
    navigate('/');
  };

  return (
    <header className="navbar">
      <div className="container nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">&lt;/&gt;</span>
          <span>
            FORCES <b>CodeSmash</b> 2.0
          </span>
        </Link>
        <div className="row nav-right">
          {isStudent && <NotificationBell />}
          <button className="nav-toggle" aria-label="Toggle menu" onClick={() => setOpen((o) => !o)}>
            ☰
          </button>
        </div>
        <nav className={`nav-links ${open ? 'open' : ''}`} onClick={close}>
          {items.map((i) => (
            <Link key={i.to} to={i.to} className={active(i.to) ? 'active' : ''}>
              {i.label}
            </Link>
          ))}
          {user ? (
            <>
              <span className="nav-user" title={connected ? 'Live connection active' : 'Reconnecting…'}>
                <span className={connected ? 'dot dot-on' : 'dot'} />
                {isAdmin ? 'Admin' : user.name.split(' ')[0]}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={active('/login') ? 'active' : ''}>
                Login
              </Link>
              {registrationOpen && (
                <Link to="/register" className="btn btn-primary btn-sm">
                  Register
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
