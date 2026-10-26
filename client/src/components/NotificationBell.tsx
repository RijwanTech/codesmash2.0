import { useEffect, useRef, useState } from 'react';
import { navigate } from '../router';
import { useApp } from '../store';
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

export function NotificationBell() {
  const { notifications, unread, markRead } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="bell" ref={ref}>
      <button className="bell-btn" aria-label={`Notifications (${unread} unread)`} onClick={() => setOpen((o) => !o)}>
        🔔
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-menu">
          <div className="row between bell-head">
            <b>Notifications</b>
            {unread > 0 && (
              <button className="link-btn" onClick={() => void markRead()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="bell-list">
            {notifications.slice(0, 8).map((n) => (
              <button
                key={n.id}
                className={n.read ? 'bell-item' : 'bell-item unread'}
                onClick={() => {
                  void markRead([n.id]);
                  setOpen(false);
                  navigate('/dashboard');
                }}
              >
                <span className="bell-icon">{ICON[n.type] ?? 'ℹ️'}</span>
                <span>
                  <b>{n.title}</b>
                  <span className="bell-msg">{n.message}</span>
                  <span className="muted small">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
            {notifications.length === 0 && <p className="empty">Nothing yet. Updates about your rounds appear here.</p>}
          </div>
          <button
            className="bell-foot"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
