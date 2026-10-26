import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import { fsSupported } from '../components/ExamShell';

/**
 * Exam rules enforced by the browser while a round is running:
 *  - the round must stay in full screen (leaving it covers the page until the student returns, and is recorded),
 *  - switching tab / window is recorded,
 *  - copy, cut, paste, right-click and the developer-tool shortcuts are blocked,
 *  - closing or reloading the page asks for confirmation.
 * A web page can never fully lock a computer. Everything recorded here is shown to the organiser, and the round can be
 * set to submit itself after a number of violations. For a stricter lock-down use a kiosk browser such as Safe Exam Browser.
 */
export function useExamGuard({
  active,
  roundN,
  max,
  onAutoSubmitted,
}: {
  active: boolean;
  roundN: number;
  max: number;
  onAutoSubmitted: () => void;
}) {
  const { notify } = useApp();
  const [locked, setLocked] = useState(false);
  const released = useRef(false);
  const lastToast = useRef(0);
  const cb = useRef({ onAutoSubmitted, max });
  cb.current = { onAutoSubmitted, max };

  const report = useCallback(
    async (type: string) => {
      if (released.current) return;
      try {
        const r = await api<{ count: number; max: number; ended: boolean }>(`/rounds/${roundN}/violation`, { body: { type } });
        if (r.ended) return cb.current.onAutoSubmitted();
        notify(
          'error',
          r.max > 0
            ? `Rule violation recorded (${r.count} of ${r.max}). Your round is submitted automatically at ${r.max}.`
            : 'Rule violation recorded. The organiser can see it.',
          { title: 'Stay in full screen', ms: 6000 },
        );
      } catch {
        /* the next violation will be recorded; never break the exam because of this */
      }
    },
    [roundN, notify],
  );

  useEffect(() => {
    if (!active) {
      setLocked(false);
      return;
    }
    released.current = false;
    if (fsSupported && !document.fullscreenElement) setLocked(true); // e.g. after a page reload

    const onFs = () => {
      if (released.current) return;
      if (document.fullscreenElement) setLocked(false);
      else if (fsSupported) {
        setLocked(true);
        void report('fullscreen_exit');
      }
    };
    const onVisibility = () => {
      if (document.hidden) void report('tab_hidden');
    };
    let blurTimer: number | undefined;
    const onBlur = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (!document.hidden && !document.hasFocus()) void report('window_blur');
      }, 500);
    };
    const toastBlocked = () => {
      if (Date.now() - lastToast.current < 3000) return;
      lastToast.current = Date.now();
      notify('info', 'Copy, paste and right-click are switched off during the round.');
    };
    const block = (e: Event) => {
      e.preventDefault();
      toastBlocked();
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (k === 'f12' || (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (ctrl && ['u', 's', 'p'].includes(k))) {
        e.preventDefault();
        void report('devtools_key');
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (released.current) return;
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('paste', block);
    document.addEventListener('contextmenu', block);
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.clearTimeout(blurTimer);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('paste', block);
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [active, report, notify]);

  const returnToFullScreen = () => {
    void document.documentElement
      .requestFullscreen()
      .then(() => setLocked(false))
      .catch(() => notify('error', 'Your browser did not allow full screen. Press F11, then try again.'));
  };

  /** Call right before a normal submit so leaving full screen is not counted against the student. */
  const release = () => {
    released.current = true;
    setLocked(false);
  };

  return { locked, returnToFullScreen, release };
}

export function FullscreenLock({ onReturn, max }: { onReturn: () => void; max: number }) {
  return (
    <div className="fs-lock" role="alertdialog" aria-modal="true" aria-label="Return to full screen">
      <div className="card center-text">
        <h2>Return to full screen to continue</h2>
        <p className="muted">
          The round must stay in full screen. Your questions are hidden until you return, the timer keeps running, and leaving
          full screen is recorded for the organiser.
          {max > 0 && ` After ${max} violations your round is submitted automatically.`}
        </p>
        <button className="btn btn-primary btn-lg" onClick={onReturn} autoFocus>
          Return to full screen
        </button>
      </div>
    </div>
  );
}
