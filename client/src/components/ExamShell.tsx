import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from '../router';

export const fsSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

export function ExamShell({
  title,
  subtitle,
  right,
  progress,
  hideExit,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  progress?: number;
  /** Hide the links that leave the page (used while a round is running). */
  hideExit?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // the exam view scrolls on its own
    return () => {
      document.body.style.overflow = prev;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  return (
    <div className="exam">
      <div className="exam-top">
        {hideExit ? (
          <span className="brand-mark">&lt;/&gt;</span>
        ) : (
          <Link to="/dashboard" className="brand-mark">
            &lt;/&gt;
          </Link>
        )}
        <div className="exam-title">
          <b>{title}</b>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="spacer" />
        {right}
        {!hideExit && (
          <Link to="/dashboard" className="btn btn-ghost btn-sm">
            Dashboard
          </Link>
        )}
      </div>
      {progress !== undefined && (
        <div className="exam-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="exam-body">{children}</div>
    </div>
  );
}
