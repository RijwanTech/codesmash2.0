import { useApp } from '../store';

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissToast(t.id)}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          <div>
            {t.title && <b className="toast-title">{t.title}</b>}
            <p>{t.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
