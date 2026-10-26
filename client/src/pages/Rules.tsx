import { Link } from '../router';
import { api } from '../api';
import { useApp } from '../store';
import { useApi } from '../hooks';
import { TYPE_LABELS } from '../types';
import type { RoundInfo } from '../types';

export function Rules() {
  const { registrationOpen, isStudent } = useApp();
  const { data } = useApi(() => api<{ rounds: RoundInfo[] }>('/public/rounds'));
  const rounds = data?.rounds ?? [];
  return (
    <div className="container section narrow">
      <h1>Rules &amp; instructions</h1>

      <div className="card">
        <h3>The competition</h3>
        <ol className="rules">
          <li>
            There are <b>three rounds</b>: a technical quiz, a code-correction round and a problem-solving round. Each has its own time limit.
          </li>
          <li>The organisers decide who moves on to the next round and will tell you.</li>
          <li>You can attempt each round <b>only once</b>. Once started, the timer cannot be paused.</li>
          <li>Each round has its own password. The organiser gives it to you when the round starts.</li>
          <li>After you submit a round you see your score. Results and rankings are kept by the organisers.</li>
          <li>Cheating or sharing answers leads to disqualification by the organisers.</li>
        </ol>
      </div>

      <div className="card">
        <h3>How a round works</h3>
        <ol className="rules">
          <li>Open your dashboard and choose the round when it is open.</li>
          <li>Read the rules for that round and tick <b>Yes, I understand</b>.</li>
          <li>Enter the round password, choose your language if the round needs one, and press <b>Start round</b>.</li>
          <li>The round opens in <b>full screen</b>. Stay in full screen, do not switch tabs or windows, and do not copy or paste. Every violation is recorded for the organiser.</li>
          <li>Your answers are saved as you go. Press <b>Submit round</b> when you finish, or let the timer auto-submit at zero. Timing is kept by the server.</li>
        </ol>
      </div>

      <div className="card">
        <h3>Rounds</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Round</th>
                <th>Type</th>
                <th>Time</th>
                <th>Questions</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.n}>
                  <td>{r.name}</td>
                  <td>{TYPE_LABELS[r.type]}</td>
                  <td>{r.durationMin} min</td>
                  <td>{r.problemCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row center">
        {isStudent ? (
          <Link to="/dashboard" className="btn btn-primary">
            Open dashboard
          </Link>
        ) : registrationOpen ? (
          <Link to="/register" className="btn btn-primary">
            Register now
          </Link>
        ) : (
          <Link to="/login" className="btn btn-primary">
            Log in
          </Link>
        )}
      </div>
    </div>
  );
}
