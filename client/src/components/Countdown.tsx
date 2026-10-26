import { useEffect, useRef, useState } from 'react';
import { fmtTime } from '../format';

interface Props {
  /** Absolute deadline in SERVER time (ms). */
  deadline: number;
  /** serverNow - Date.now() at the moment the data was fetched. Keeps the timer honest even if the PC clock is wrong. */
  offset: number;
  onExpire?: () => void;
}

export function Countdown({ deadline, offset, onExpire }: Props) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const left = Math.max(0, deadline - (now + offset));
  const expired = left === 0;

  useEffect(() => {
    if (expired && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  const cls = expired ? 'countdown danger' : left < 5 * 60000 ? 'countdown warn' : 'countdown';
  return (
    <div className={cls} aria-label="Time remaining">
      <span className="countdown-label">Time left</span>
      <span className="countdown-time">{fmtTime(left)}</span>
    </div>
  );
}
