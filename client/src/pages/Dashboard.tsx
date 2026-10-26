import type { ReactNode } from 'react';
import { Link } from '../router';
import { api } from '../api';
import { useApp } from '../store';
import { useApi } from '../hooks';
import { Chip } from '../components/Chip';
import { ErrorBox, Loading, RequireStudent } from '../components/Guards';
import { fmtTime } from '../format';
import type { RoundInfo } from '../types';

export function Dashboard() {
  return (
    <RequireStudent>
      <DashboardInner />
    </RequireStudent>
  );
}

const FILE: Record<string, string> = { quiz: 'quiz', codefix: 'fix', coding: 'code' };

function DashboardInner() {
  const { user } = useApp();
  const { data, error, loading, reload } = useApi(() => api<{ rounds: RoundInfo[] }>('/rounds'), [user?.id]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox message={error} onRetry={reload} />;
  if (!user) return null;

  const { rounds } = data;
  const done = rounds.filter((r) => r.attempt?.status === 'finished');
  const totalScore = done.reduce((s, r) => s + (r.attempt?.score ?? 0), 0);
  const openForMe = rounds.filter((r) => r.status === 'open' && r.allowed && !r.attempt);
  const running = rounds.filter((r) => r.attempt?.status === 'running');

  return (
    <div className="container section">
      {running.map((r) => (
        <div className="alert alert-info banner" key={r.n}>
          Your timer is running in <b>{r.name}</b>. <Link to={`/round/${r.n}`}>Continue now</Link>
        </div>
      ))}
      {openForMe.map((r) => (
        <div className="alert alert-success banner" key={r.n}>
          <b>{r.name}</b> is open. Get the round password from the organiser, then <Link to={`/round/${r.n}`}>start the round</Link>
        </div>
      ))}

      <div className="grid dash-top">
        <div className="card profile">
          <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div>
            <h2>{user.name}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {user.rollNo} · {user.year}
              {user.email ? ` · ${user.email}` : ''}
            </p>
          </div>
        </div>
        <div className="grid grid-2 stats">
          <div className="card stat">
            <span className="stat-label">Total score</span>
            <span className="stat-value">{totalScore}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Rounds submitted</span>
            <span className="stat-value">
              {done.length}/{rounds.length}
            </span>
          </div>
        </div>
      </div>

      <h2>Progress</h2>
      <div className="progress-steps">
        {rounds.map((r) => {
          const a = r.attempt;
          const cls = a ? (a.status === 'finished' ? 'step-good' : 'step-live') : '';
          return (
            <div key={r.n} className={`step ${cls}`}>
              <span>{r.n}</span>
            </div>
          );
        })}
      </div>

      <h2>Rounds</h2>
      <div className="grid grid-3">
        {rounds.map((r) => {
          const a = r.attempt;
          let state: ReactNode;
          let action: ReactNode = null;

          if (a?.status === 'finished') {
            state = (
              <>
                <Chip kind="good">Submitted</Chip>
                <p className="muted">
                  Score <b>{a.score}</b> / {a.maxScore}
                </p>
              </>
            );
            action = (
              <Link to={`/round/${r.n}`} className="btn btn-ghost btn-block">
                View score
              </Link>
            );
          } else if (a) {
            state = (
              <>
                <Chip kind="live">In progress</Chip>
                <p className="muted">Your timer is running.</p>
              </>
            );
            action = (
              <Link to={`/round/${r.n}`} className="btn btn-primary btn-block">
                Continue round
              </Link>
            );
          } else if (!r.allowed) {
            state = (
              <>
                <Chip kind="neutral">Not available</Chip>
                <p className="muted">The organisers decide who enters this round.</p>
              </>
            );
          } else if (r.status === 'open') {
            state = (
              <>
                <Chip kind="live">Open now</Chip>
                <p className="muted">Read the rules, enter the password and start.</p>
              </>
            );
            action = (
              <Link to={`/round/${r.n}`} className="btn btn-primary btn-block">
                Open round
              </Link>
            );
          } else if (r.status === 'closed') {
            state = (
              <>
                <Chip kind="bad">Closed</Chip>
                <p className="muted">This round ended before you started it.</p>
              </>
            );
          } else {
            state = (
              <>
                <Chip kind="warn">Opens soon</Chip>
                <p className="muted">You will get a notification when it opens.</p>
              </>
            );
          }

          return (
            <div className="card round-card" key={r.n}>
              <span className="file-tag" style={{ alignSelf: 'flex-start' }}>
                round{r.n}.{FILE[r.type] ?? 'round'}
              </span>
              <h3>{r.name}</h3>
              <p className="muted">
                {r.durationMin} min · {r.problemCount} {r.type === 'coding' ? 'problems' : 'questions'} · {r.maxScore} marks
              </p>
              <div className="state">{state}</div>
              {a?.status === 'finished' && <p className="muted small">Time taken {fmtTime(a.timeMs)}</p>}
              {action}
            </div>
          );
        })}
      </div>
    </div>
  );
}
