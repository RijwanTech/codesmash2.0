import { Link } from '../router';
import { useApp } from '../store';
import { RequireStudent } from '../components/Guards';
import { timeAgo } from '../format';

const ICON: Record<string, string> = {
  result: '📝',
  qualified: '🎉',
  not_qualified: '📋',
  round_open: '🚀',
  announcement: '📢',
  override: '✅',
  info: 'ℹ️',
};

export function Notifications() {
  return (
    <RequireStudent>
      <NotificationsInner />
    </RequireStudent>
  );
}

function NotificationsInner() {
  const { notifications, unread, markRead } = useApp();
  return (
    <div className="container section narrow">
      <div className="row between wrap">
        <h1>Notifications</h1>
        {unread > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => void markRead()}>
            Mark all as read ({unread})
          </button>
        )}
      </div>
      <p className="muted">Round results, round openings and messages from the organisers appear here instantly.</p>

      {notifications.length === 0 && <div className="card empty">No notifications yet.</div>}
      {notifications.map((n) => (
        <div key={n.id} className={n.read ? 'card note' : 'card note unread'} onClick={() => !n.read && void markRead([n.id])}>
          <span className="note-icon">{ICON[n.type] ?? 'ℹ️'}</span>
          <div className="grow">
            <div className="row between wrap">
              <b>{n.title}</b>
              <span className="muted small">{timeAgo(n.createdAt)}</span>
            </div>
            <p>{n.message}</p>
            {n.round && (
              <Link to={`/round/${n.round}`} className="small">
                Go to Round {n.round} →
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
