import { Link } from '../router';
import { api } from '../api';
import { useApp } from '../store';
import { useApi } from '../hooks';
import { Chip } from '../components/Chip';
import type { RoundInfo } from '../types';

const FILE_EXT: Record<string, string> = { quiz: 'quiz', codefix: 'fix', coding: 'code' };

export function Home() {
  const { isStudent, registrationOpen } = useApp();
  const { data } = useApi(() => api<{ rounds: RoundInfo[] }>('/public/rounds'));
  const rounds = data?.rounds ?? [];

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">FORCES CSE community · P.E.S. College of Engineering, Chhatrapati Sambhajinagar</p>
            <h1>
              FORCES <span className="grad">CodeSmash</span> 2.0
            </h1>
            <p className="lead">
              Three rounds, one winner. Answer a technical quiz, fix broken code, then solve real problems. Qualify
              in each round to move on.
            </p>
            <div className="row wrap">
              {isStudent ? (
                <Link to="/dashboard" className="btn btn-primary btn-lg">
                  Open dashboard
                </Link>
              ) : (
                <>
                  {registrationOpen && (
                    <Link to="/register" className="btn btn-primary btn-lg">
                      Register
                    </Link>
                  )}
                  <Link to="/login" className={`btn btn-lg ${registrationOpen ? 'btn-ghost' : 'btn-primary'}`}>
                    Log in
                  </Link>
                </>
              )}
              <Link to="/rules" className="btn btn-ghost btn-lg">
                Read the rules
              </Link>
            </div>
          </div>
          <div className="terminal" aria-hidden="true">
            <div className="term-bar">
              <i />
              <i />
              <i />
              <span>codesmash — rounds</span>
            </div>
            <div className="term-body">
              <div>
                <span className="c">$</span> <span className="f">codesmash</span> status
              </div>
              {(rounds.length ? rounds : []).map((r) => (
                <div key={r.n}>
                  <span className="k">round{r.n}</span>.{FILE_EXT[r.type]} <span className="c">//</span>{' '}
                  <span className="s">{r.durationMin}min</span>{' '}
                  <span className={r.status === 'open' ? 'g' : 'c'}>{r.status}</span>
                </div>
              ))}
              <div>
                <span className="c">$</span> <span className="cursor" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container section">
        <h2>The Rounds</h2>
        <div className="grid grid-3">
          {rounds.map((r) => (
            <div className="card round-card" key={r.n}>
              <div className="row between">
                <span className="file-tag">round{r.n}.{FILE_EXT[r.type]}</span>
                <Chip kind={r.status === 'open' ? 'live' : r.status === 'closed' ? 'neutral' : 'warn'}>
                  {r.status === 'open' ? 'Open' : r.status === 'closed' ? 'Closed' : 'Upcoming'}
                </Chip>
              </div>
              <h3>{r.name}</h3>
              <ul className="facts">
                <li>
                  <b>{r.durationMin}</b> minutes
                </li>
                <li>
                  <b>{r.problemCount}</b> questions · <b>{r.maxScore}</b> points
                </li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="grid grid-3">
          <div className="card feature">
            <h3>Server-timed rounds</h3>
            <p>Every round has a countdown kept by the server. When it hits zero your round is submitted automatically.</p>
          </div>
          <div className="card feature">
            <h3>Instant updates</h3>
            <p>You are notified when a round opens and when your score is ready.</p>
          </div>
          <div className="card feature">
            <h3>Fair scoring</h3>
            <p>Every round is scored automatically. The organisers announce who moves on to the next round.</p>
          </div>
        </div>
      </section>
    </>
  );
}
