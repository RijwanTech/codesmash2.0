import { useRoute, Link } from './router';
import { Navbar } from './components/Navbar';
import { Toasts } from './components/Toasts';
import { Home } from './pages/Home';
import { Rules } from './pages/Rules';
import { Login, Register } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { RoundPage } from './pages/Round';
import { Notifications } from './pages/Notifications';
import { Admin } from './pages/Admin';
import { useApp } from './store';

function Page({ path }: { path: string }) {
  const roundMatch = path.match(/^\/round\/(\d+)$/);
  if (roundMatch) return <RoundPage n={Number(roundMatch[1])} />;
  switch (path) {
    case '/':
      return <Home />;
    case '/rules':
      return <Rules />;
    case '/register':
      return <Register />;
    case '/login':
      return <Login />;
    case '/dashboard':
      return <Dashboard />;
    case '/notifications':
      return <Notifications />;
    case '/admin':
      return <Admin />;
    default:
      return (
        <div className="container section narrow">
          <div className="card center-text">
            <h2>Page not found</h2>
            <Link to="/" className="btn btn-primary">
              Go home
            </Link>
          </div>
        </div>
      );
  }
}

function ServerBanner() {
  const { server, recheckServer } = useApp();
  if (server === 'ok' || server === 'checking') return null;
  return (
    <div className="container server-banner">
      <div className="alert alert-error row between wrap">
        <span>
          {server === 'down'
            ? 'Cannot reach the server. Start it with "npm run dev" inside the server folder and check its terminal for errors.'
            : 'An old or different program is answering on the server port. Close the other server (Task Manager → node.exe) and start this one again.'}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={recheckServer}>
          Check again
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const path = useRoute();
  return (
    <div className="app">
      <Navbar path={path} />
      <ServerBanner />
      <main>
        <Page path={path} />
      </main>
      <footer className="footer">
        <div className="container">
          FORCES CSE · P.E.S. College of Engineering, Chhatrapati Sambhajinagar · CodeSmash 2.0
        </div>
      </footer>
      <Toasts />
    </div>
  );
}
