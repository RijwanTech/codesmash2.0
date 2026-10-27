import { useState, type FormEvent } from 'react';
import { api, download } from '../api';
import { useApp } from '../store';
import { useApi } from '../hooks';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorBox, Loading } from '../components/Guards';
import { BulkQuizForm, CodingForm, FixForm, QuizForm, typeNoun } from '../components/ItemEditors';
import { fmtTime, timeAgo } from '../format';
import { LANGUAGE_LABELS, TYPE_LABELS } from '../types';
import type { AdminFix, AdminProblem, AdminQuiz, AdminRound, RegistrationInfo, RoundBoardRow, RoundStatus, StandingRow } from '../types';

export function Admin() {
  const { isAdmin, ready } = useApp();
  if (!ready) return <Loading />;
  return isAdmin ? <AdminPanel /> : <AdminLogin />;
}

function AdminLogin() {
  const { adminLogin, notify } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await adminLogin(username, password);
    setBusy(false);
    if (err) {
      setError(err);
      notify('error', err);
    } else notify('success', 'Welcome, organiser!');
  };

  return (
    <div className="container section auth">
      <form className="card form" onSubmit={submit}>
        <h2>Organiser Login</h2>
        <p className="muted">The username and password are set in the server's .env file.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Login'}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

type Tab = 'overview' | 'rounds' | 'problems' | 'registration' | 'participants' | 'leaderboard' | 'announce' | 'settings';

interface PendingConfirm {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
  action: () => void | Promise<void>;
}
type AskFn = (c: PendingConfirm) => void;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

function AdminPanel() {
  const { connected } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const tabs: { id: Tab; label: string; ico: string }[] = [
    { id: 'overview', label: 'Live overview', ico: '~' },
    { id: 'rounds', label: 'Rounds & passwords', ico: '#' },
    { id: 'problems', label: 'Questions', ico: '?' },
    { id: 'registration', label: 'Registration', ico: '+' },
    { id: 'participants', label: 'Participants', ico: '@' },
    { id: 'leaderboard', label: 'Leaderboard', ico: '^' },
    { id: 'announce', label: 'Announcements', ico: '!' },
    { id: 'settings', label: 'Settings', ico: '*' },
  ];
  const current = tabs.find((t) => t.id === tab);

  return (
    <div className="admin">
      <aside className="admin-side">
        <h4>Organiser</h4>
        <nav className="admin-nav">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="ico">{t.ico}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="admin-main">
        <div className="admin-head">
          <h1>{current?.label}</h1>
          <Chip kind={connected ? 'good' : 'warn'}>{connected ? 'Live' : 'Reconnecting…'}</Chip>
        </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'rounds' && <RoundsTab ask={setConfirm} />}
      {tab === 'problems' && <QuestionsTab ask={setConfirm} />}
      {tab === 'registration' && <RegistrationTab />}
      {tab === 'participants' && <ParticipantsTab ask={setConfirm} />}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'announce' && <AnnounceTab ask={setConfirm} />}
      {tab === 'settings' && <SettingsTab />}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmText={confirm?.confirmText}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const run = confirm?.action;
          setConfirm(null);
          void run?.();
        }}
      />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ overview (live) */

interface Overview {
  participants: number;
  participating: number;
  spot: number;
  judgeMode: 'judge0' | 'manual';
  registrationOpen: boolean;
  emailEnabled: boolean;
  rounds: {
    n: number;
    name: string;
    status: RoundStatus;
    hasPassword: boolean;
    problems: number;
    attempted: number;
    running: number;
    finished: number;
    qualified: number;
  }[];
}

const statusKind = (s: RoundStatus) => (s === 'open' ? 'live' : s === 'closed' ? 'neutral' : 'warn');

function OverviewTab() {
  const { activity } = useApp();
  const { data, error, loading, reload } = useApi(() => api<Overview>('/admin/overview'));
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="grid dash-top">
      <div>
        <div className="grid grid-3 stats">
          <div className="card stat">
            <span className="stat-label">Registered</span>
            <span className="stat-value">{data.participants}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Competing</span>
            <span className="stat-value">{data.participating}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Registration</span>
            <span className="stat-value small-val">{data.registrationOpen ? 'OPEN' : 'closed'}</span>
          </div>
        </div>
        <p className="muted small">
          Spot registrations: {data.spot} · Email alerts: {data.emailEnabled ? 'on' : 'off'} · Code judging:{' '}
          {data.judgeMode === 'judge0' ? 'automatic (Judge0)' : 'manual — you grade Round 3 code in Participants → View / grade'}
        </p>
        <div className="card table-card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Running now</th>
                  <th>Finished</th>
                  <th>Qualified</th>
                </tr>
              </thead>
              <tbody>
                {data.rounds.map((r) => (
                  <tr key={r.n}>
                    <td>
                      <b>{r.name}</b>
                      <div className="muted small">{r.problems} questions · {r.hasPassword ? 'password set' : <b>no password!</b>}</div>
                    </td>
                    <td>
                      <Chip kind={statusKind(r.status)}>{r.status}</Chip>
                    </td>
                    <td>{r.attempted}</td>
                    <td>{r.running}</td>
                    <td>{r.finished}</td>
                    <td>{r.qualified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card feed">
        <h3>Live activity</h3>
        {activity.length === 0 && <p className="muted">Waiting for activity… registrations, solves and results show up here instantly.</p>}
        <ul>
          {activity.map((a) => (
            <li key={a.id}>
              <span>{a.text}</span>
              <span className="muted small">{timeAgo(a.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ rounds */

function RoundsTab({ ask }: { ask: AskFn }) {
  const { notify } = useApp();
  const { data, error, loading, reload } = useApi(() => api<{ rounds: AdminRound[] }>('/admin/rounds'));
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox message={error} onRetry={reload} />;

  const change = (r: AdminRound, status: RoundStatus) => {
    if (status === r.status) return;
    const run = async () => {
      try {
        await api(`/admin/rounds/${r.n}/status`, { body: { status } });
        notify('success', `${r.name} is now ${status}.`);
      } catch (e) {
        notify('error', errMsg(e));
      }
      reload();
    };
    if (status === 'open') {
      ask({
        title: `Open ${r.name}?`,
        message:
          r.n === 1
            ? 'All registered participants will be notified immediately.'
            : `Every participant who qualified in Round ${r.n - 1} will be notified immediately.`,
        confirmText: 'Open & notify',
        action: run,
      });
    } else if (status === 'closed') {
      ask({
        title: `Close ${r.name}?`,
        message:
          'Attempts still running are submitted now, results are final, and participants get their qualification notification.',
        confirmText: 'Close round',
        danger: true,
        action: run,
      });
    } else void run();
  };

  return (
    <div className="grid grid-3">
      {data.rounds.map((r) => (
        <div className="card" key={r.n}>
          <RoundSettings round={r} onSaved={reload} />
          <div className="field">
            <span>Round status</span>
            <div className="seg">
              {(['upcoming', 'open', 'closed'] as const).map((s) => (
                <button key={s} className={r.status === s ? 'seg-btn active' : 'seg-btn'} onClick={() => change(r, s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">
            {TYPE_LABELS[r.type]} · {r.itemCount} questions per student · {r.maxScore} total marks.
          </p>
        </div>
      ))}
    </div>
  );
}

const genPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};

function RoundSettings({ round, onSaved }: { round: AdminRound; onSaved: () => void }) {
  const { notify } = useApp();
  const [name, setName] = useState(round.name);
  const [dur, setDur] = useState(String(round.durationMin));
  const [qs, setQs] = useState(String(round.qualifyScore));
  const [count, setCount] = useState(String(round.questionCount));
  const [marks, setMarks] = useState(String(round.marksPerQuestion));
  const [password, setPassword] = useState(round.password);
  const [maxV, setMaxV] = useState(String(round.maxViolations));
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const isCoding = round.type === 'coding';

  const save = async () => {
    setBusy(true);
    try {
      await api(`/admin/rounds/${round.n}`, {
        method: 'PUT',
        body: {
          name,
          durationMin: Number(dur),
          qualifyScore: Number(qs),
          questionCount: Number(count),
          marksPerQuestion: Number(marks),
          maxViolations: Number(maxV),
          password,
        },
      });
      notify('success', `Round ${round.n} settings saved.`);
      onSaved();
    } catch (e) {
      notify('error', errMsg(e));
    }
    setBusy(false);
  };

  return (
    <div className="form">
      <h3>
        Round {round.n} <span className="muted small">· {TYPE_LABELS[round.type]}</span>
      </h3>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Round password (students must enter it to start)</span>
        <div className="row">
          <input className="grow" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password" autoComplete="off" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'Show'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPassword(genPassword()); setShow(true); }}>
            Generate
          </button>
        </div>
      </label>
      <div className="grid grid-2">
        <label className="field">
          <span>Duration (min)</span>
          <input type="number" min={1} value={dur} onChange={(e) => setDur(e.target.value)} />
        </label>
        <label className="field">
          <span>Qualifying score</span>
          <input type="number" min={0} value={qs} onChange={(e) => setQs(e.target.value)} />
        </label>
        {!isCoding && (
          <>
            <label className="field">
              <span>Questions per student (0 = all)</span>
              <input type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
            <label className="field">
              <span>Marks per question</span>
              <input type="number" min={0} value={marks} onChange={(e) => setMarks(e.target.value)} />
            </label>
          </>
        )}
      </div>
      <label className="field">
        <span>Auto-submit after this many rule violations (0 = only record them)</span>
        <input type="number" min={0} max={50} value={maxV} onChange={(e) => setMaxV(e.target.value)} />
      </label>
      <p className="muted small">Total marks: {round.maxScore}. {isCoding ? 'Marks per problem are set on each problem.' : 'Each student gets a different random order.'}</p>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save settings'}
      </button>
      <p className="muted small">Changing the qualifying score re-checks finished attempts and notifies anyone whose result changes. Share each round's password with students only when you start that round.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ questions */

type Editing = { kind: 'new' } | { kind: 'edit'; id: string } | { kind: 'bulk' } | null;

function QuestionsTab({ ask }: { ask: AskFn }) {
  const { notify } = useApp();
  const { data, error, loading, reload } = useApi(() => api<{ rounds: AdminRound[] }>('/admin/rounds'));
  const [roundN, setRoundN] = useState(1);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox message={error} onRetry={reload} />;
  const round = data.rounds.find((r) => r.n === roundN) ?? data.rounds[0];
  if (!round) return <ErrorBox message="No rounds found." onRetry={reload} />;
  const noun = typeNoun(round.type);
  const list = round.type === 'quiz' ? round.quiz : round.type === 'codefix' ? round.fixes : round.problems;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setSaving(true);
    try {
      await fn();
      notify('success', ok);
      setEditing(null);
      reload();
    } catch (e) {
      notify('error', errMsg(e));
    }
    setSaving(false);
  };

  const save = (body: unknown) =>
    run(
      () =>
        editing?.kind === 'edit'
          ? api(`/admin/rounds/${round.n}/items/${editing.id}`, { method: 'PUT', body })
          : api(`/admin/rounds/${round.n}/items`, { body }),
      editing?.kind === 'edit' ? 'Saved.' : 'Added.',
    );

  const current = editing?.kind === 'edit' ? list.find((x) => x.id === editing.id) : undefined;

  const form = () => {
    if (!editing) return null;
    const common = { saving, onCancel: () => setEditing(null) };
    if (editing.kind === 'bulk')
      return (
        <BulkQuizForm
          saving={saving}
          onCancel={() => setEditing(null)}
          onImport={(items) => void run(() => api(`/admin/rounds/${round.n}/items/bulk`, { body: { items } }), `${items.length} questions imported.`)}
        />
      );
    const key = editing.kind === 'edit' ? editing.id : 'new';
    if (round.type === 'quiz') return <QuizForm key={key} initial={current as AdminQuiz | undefined} onSave={(v) => void save(v)} {...common} />;
    if (round.type === 'codefix') return <FixForm key={key} initial={current as AdminFix | undefined} onSave={(v) => void save(v)} {...common} />;
    return <CodingForm key={key} initial={current as AdminProblem | undefined} onSave={(v) => void save(v)} {...common} />;
  };

  const remove = (id: string, title: string) =>
    ask({
      title: `Delete this ${noun}?`,
      message: `"${title}" will be removed from ${round.name}.`,
      confirmText: 'Delete',
      danger: true,
      action: async () => {
        try {
          await api(`/admin/rounds/${round.n}/items/${id}`, { method: 'DELETE' });
          notify('success', 'Deleted.');
        } catch (e) {
          notify('error', errMsg(e));
        }
        reload();
      },
    });

  return (
    <div>
      <div className="tabs">
        {data.rounds.map((r) => (
          <button
            key={r.n}
            className={round.n === r.n ? 'tab active' : 'tab'}
            onClick={() => {
              setRoundN(r.n);
              setEditing(null);
            }}
          >
            Round {r.n} · {TYPE_LABELS[r.type]} ({r.type === 'quiz' ? r.quiz.length : r.type === 'codefix' ? r.fixes.length : r.problems.length})
          </button>
        ))}
      </div>

      {editing ? (
        form()
      ) : (
        <>
          <div className="row between wrap">
            <p className="muted">
              {round.name} · {list.length} {noun}s in the pool
              {round.type !== 'coding' && round.questionCount > 0 && <> · each student gets {round.questionCount}, picked at random</>}
            </p>
            <div className="row">
              {round.type === 'quiz' && (
                <button className="btn btn-ghost" onClick={() => setEditing({ kind: 'bulk' })}>
                  Import many
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setEditing({ kind: 'new' })}>
                + Add {noun}
              </button>
            </div>
          </div>
          <div className="grid">
            {round.type === 'quiz' &&
              round.quiz.map((q, i) => (
                <div className="card" key={q.id}>
                  <b>
                    {i + 1}. {q.text}
                  </b>
                  <ol type="A" className="small">
                    {q.options.map((o, j) => (
                      <li key={j} style={j === q.correct ? { fontWeight: 700, color: '#22aa64' } : undefined}>
                        {o} {j === q.correct && '✓'}
                      </li>
                    ))}
                  </ol>
                  <ItemActions onEdit={() => setEditing({ kind: 'edit', id: q.id })} onDelete={() => remove(q.id, q.text)} />
                </div>
              ))}
            {round.type === 'codefix' &&
              round.fixes.map((f, i) => (
                <div className="card" key={f.id}>
                  <b>
                    {i + 1}. {f.title}
                  </b>
                  <p className="muted small">Languages: {f.variants.map((v) => LANGUAGE_LABELS[v.language]).join(', ')}</p>
                  <ItemActions onEdit={() => setEditing({ kind: 'edit', id: f.id })} onDelete={() => remove(f.id, f.title)} />
                </div>
              ))}
            {round.type === 'coding' &&
              round.problems.map((p, i) => (
                <div className="card" key={p.id}>
                  <div className="row between wrap">
                    <b>
                      {i + 1}. {p.title}
                    </b>
                    <Chip>{p.points} marks</Chip>
                  </div>
                  <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{p.statement}</p>
                  <p className="muted small">{p.tests.length} test case(s), {p.tests.filter((t) => t.sample).length} visible to students.</p>
                  <ItemActions onEdit={() => setEditing({ kind: 'edit', id: p.id })} onDelete={() => remove(p.id, p.title)} />
                </div>
              ))}
            {list.length === 0 && <div className="card empty">Nothing here yet. Add the first {noun}.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function ItemActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="row end">
      <button className="btn btn-ghost btn-sm" onClick={onEdit}>
        Edit
      </button>
      <button className="btn btn-danger btn-sm" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ registration & spot registration */

function toLocalInput(ms: number | null) {
  if (!ms) return '';
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function RegistrationTab() {
  const { notify } = useApp();
  const { data, error, loading, reload } = useApi(() => api<RegistrationInfo>('/admin/registration'));
  const [deadline, setDeadline] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spot, setSpot] = useState({ name: '', rollNo: '', email: '', year: 'FY', password: '' });
  const [created, setCreated] = useState<{ name: string; rollNo: string; password: string } | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox message={error} onRetry={reload} />;
  const dl = deadline ?? toLocalInput(data.closesAt);

  const saveReg = async (open: boolean) => {
    setBusy(true);
    try {
      await api('/admin/registration', { method: 'PUT', body: { open, closesAt: dl ? new Date(dl).toISOString() : null } });
      notify('success', open ? 'Online registration settings saved.' : 'Online registration closed.');
      setDeadline(null);
      reload();
    } catch (e) {
      notify('error', errMsg(e));
    }
    setBusy(false);
  };

  const addSpot = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ student: { name: string; rollNo: string }; password: string }>('/admin/spot-register', { body: spot });
      setCreated({ name: r.student.name, rollNo: r.student.rollNo, password: r.password });
      setSpot({ name: '', rollNo: '', email: '', year: 'FY', password: '' });
      notify('success', 'Participant added.');
    } catch (err) {
      notify('error', errMsg(err));
    }
    setBusy(false);
  };

  return (
    <div className="grid grid-2">
      <div className="card form">
        <h3>Online registration</h3>
        <p>
          Status:{' '}
          <Chip kind={data.effectiveOpen ? 'good' : 'bad'}>
            {data.effectiveOpen ? 'Open' : data.deadlinePassed ? 'Closed (deadline passed)' : 'Closed'}
          </Chip>
        </p>
        <p className="muted small">
          {data.online ?? 0} registered online · {data.spot ?? 0} added by spot registration. Once registration is closed,
          students cannot register themselves — only you can add people below.
        </p>
        <label className="field">
          <span>Registration deadline (optional – closes automatically)</span>
          <input type="datetime-local" value={dl} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <div className="row wrap">
          <button className="btn btn-primary" disabled={busy} onClick={() => void saveReg(true)}>
            {data.open ? 'Save deadline' : 'Re-open registration'}
          </button>
          <button className="btn btn-danger" disabled={busy || !data.open} onClick={() => void saveReg(false)}>
            Close registration now
          </button>
        </div>
      </div>

      <form className="card form" onSubmit={(e) => void addSpot(e)}>
        <h3>Spot registration (organiser only)</h3>
        <p className="muted small">Works even when registration is closed. The participant logs in with their roll number and the password below.</p>
        <label className="field">
          <span>Full name</span>
          <input value={spot.name} onChange={(e) => setSpot({ ...spot, name: e.target.value })} required />
        </label>
        <div className="grid grid-2">
          <label className="field">
            <span>Roll number</span>
            <input value={spot.rollNo} onChange={(e) => setSpot({ ...spot, rollNo: e.target.value })} required />
          </label>
          <label className="field">
            <span>Year</span>
            <select value={spot.year} onChange={(e) => setSpot({ ...spot, year: e.target.value })}>
              {['FY', 'SY', 'TY', 'B.Tech'].map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Email</span>
          <input type="email" value={spot.email} onChange={(e) => setSpot({ ...spot, email: e.target.value })} />
        </label>
        <label className="field">
          <span>Password (leave empty to generate one)</span>
          <input value={spot.password} onChange={(e) => setSpot({ ...spot, password: e.target.value })} minLength={6} />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          Add participant
        </button>
        {created && (
          <div className="alert alert-success">
            <b>{created.name}</b> ({created.rollNo}) added. Login password: <code>{created.password}</code>
            <div className="small">Note it down now — it is not shown again.</div>
          </div>
        )}
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ participants */

interface SubItem {
  id: string;
  kind: 'quiz' | 'codefix' | 'coding';
  title: string;
  statement?: string;
  options?: string[];
  correct?: number;
  chosen?: number | null;
  wrongCode?: string;
  correctCode?: string;
  answer?: string;
  verdict?: { status: string; passed: number; total: number; message: string } | null;
  tests?: { input: string; expected: string; sample: boolean }[];
  earned: number;
  max: number;
}
interface Submission {
  student: { name: string; rollNo: string };
  round: { n: number; name: string; type: string };
  language: string | null;
  score: number;
  maxScore: number;
  violations: { type: string; at: number }[];
  items: SubItem[];
}

function copyText(text: string, ok: () => void, fail: () => void) {
  const done = () => ok();
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fail);
  else fail();
}

/** Marking helper for Round 3 in manual mode: copy code / test input, and (Python) run every test in the browser. */
function CodingMarker({ item, language, onFull }: { item: SubItem; language: string | null; onFull: () => void }) {
  const { notify } = useApp();
  const tests = item.tests ?? [];
  const [results, setResults] = useState<{ passed: boolean; output: string; error: string }[] | null>(null);
  const [running, setRunning] = useState(false);
  const copy = (t: string, what: string) =>
    copyText(t, () => notify('success', `${what} copied.`), () => notify('error', 'Could not copy. Select the text and press Ctrl+C.'));
  const norm = (t: string) => t.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim();

  const runAll = async () => {
    setRunning(true);
    setResults(null);
    try {
      const { runPython } = await import('../lib/pyRunner');
      const out: { passed: boolean; output: string; error: string }[] = [];
      for (const t of tests) {
        const r = await runPython(item.answer ?? '', t.input);
        out.push({ passed: !r.error && norm(r.output) === norm(t.expected), output: r.output, error: r.error });
      }
      setResults(out);
    } catch (e) {
      notify('error', errMsg(e));
    }
    setRunning(false);
  };

  const passed = results?.filter((r) => r.passed).length ?? 0;
  return (
    <div className="marker">
      <div className="row wrap">
        <button className="btn btn-ghost btn-sm" onClick={() => copy(item.answer ?? '', 'Code')} disabled={!item.answer}>
          Copy code
        </button>
        {language === 'python' ? (
          <button className="btn btn-primary btn-sm" onClick={() => void runAll()} disabled={running || !item.answer || !tests.length}>
            {running ? 'Running tests…' : `Run all ${tests.length} tests (Python)`}
          </button>
        ) : (
          <span className="muted small">Java / C: copy the code and run it in your own compiler, then compare with the tests below.</span>
        )}
        {results && (
          <>
            <Chip kind={passed === results.length ? 'good' : 'bad'}>
              {passed}/{results.length} tests passed
            </Chip>
            {passed === results.length && (
              <button className="btn btn-ghost btn-sm" onClick={onFull}>
                Give full marks
              </button>
            )}
          </>
        )}
      </div>
      {tests.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="small">Test cases ({tests.length})</summary>
          {tests.map((t, i) => (
            <div className="grid grid-2" key={i} style={{ marginTop: 6 }}>
              <div>
                <span className="muted small">
                  Input {i + 1}
                  {t.sample ? ' (sample)' : ''}{' '}
                  <button className="btn btn-ghost btn-sm" onClick={() => copy(t.input, 'Input')}>
                    Copy
                  </button>
                </span>
                <pre className="input-box code-view">{t.input || '(none)'}</pre>
              </div>
              <div>
                <span className="muted small">
                  Expected output {results && (results[i]?.passed ? '✓' : '✗')}
                </span>
                <pre className="input-box code-view">{t.expected}</pre>
                {results && !results[i]?.passed && (
                  <pre className="input-box verdict-msg">{results[i]?.error || results[i]?.output || '(nothing printed)'}</pre>
                )}
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** Review everything a student answered and (optionally) change the marks of each question. */
function SubmissionModal({ studentId, roundN, onClose, onSaved }: { studentId: string; roundN: number; onClose: () => void; onSaved: () => void }) {
  const { notify } = useApp();
  const { data, error } = useApi(
    () => api<Submission>(`/admin/participants/${studentId}/rounds/${roundN}/submission`),
    [studentId, roundN],
    false,
  );
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const points: Record<string, number> = {};
    for (const [id, v] of Object.entries(marks)) if (v !== '') points[id] = Number(v);
    if (!Object.keys(points).length) return notify('info', 'No marks changed.');
    setBusy(true);
    try {
      await api(`/admin/participants/${studentId}/rounds/${roundN}/grade`, { method: 'PUT', body: { points } });
      notify('success', 'Marks saved. The score and qualification were updated.');
      onSaved();
      onClose();
    } catch (e) {
      notify('error', errMsg(e));
    }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {!data && !error && <p className="muted">Loading…</p>}
        {error && <div className="alert alert-error">{error}</div>}
        {data && (
          <>
            <h3>
              {data.student.name} ({data.student.rollNo}) · {data.round.name}
            </h3>
            <p className="muted">
              Score {data.score} / {data.maxScore}
              {data.language && <> · {LANGUAGE_LABELS[data.language as 'python' | 'java' | 'c'] ?? data.language}</>}
            </p>
            {data.violations.length > 0 && (
              <div className="alert alert-warn">
                <b>{data.violations.length} rule violation(s) recorded:</b>{' '}
                {data.violations.map((v) => `${v.type.replace(/_/g, ' ')} at ${new Date(v.at).toLocaleTimeString()}`).join(' · ')}
              </div>
            )}
            <div className="submissions">
              {data.items.map((it, i) => (
                <div key={it.id} className="sub">
                  <div className="row between wrap">
                    <b>
                      {i + 1}. {it.title}
                    </b>
                    <label className="row small">
                      Marks
                      <input
                        className="mini"
                        type="number"
                        min={0}
                        max={it.max}
                        style={{ width: 80 }}
                        value={marks[it.id] ?? String(it.earned)}
                        onChange={(e) => setMarks({ ...marks, [it.id]: e.target.value })}
                      />
                      / {it.max}
                    </label>
                  </div>
                  {it.kind === 'quiz' && (
                    <p className="small muted">
                      Chose: <b>{it.chosen === null || it.chosen === undefined ? '—' : it.options?.[it.chosen]}</b> · Correct: <b>{it.options?.[it.correct ?? 0]}</b>
                    </p>
                  )}
                  {it.kind === 'codefix' && (
                    <div className="grid grid-2">
                      <div>
                        <span className="muted small">Student's code</span>
                        <pre className="input-box code-view">{it.answer || '—'}</pre>
                      </div>
                      <div>
                        <span className="muted small">Correct code</span>
                        <pre className="input-box code-view">{it.correctCode}</pre>
                      </div>
                    </div>
                  )}
                  {it.kind === 'coding' && (
                    <>
                      {it.verdict && (
                        <p className="small muted">
                          Last verdict: {it.verdict.status} ({it.verdict.passed}/{it.verdict.total} tests)
                        </p>
                      )}
                      <pre className="input-box code-view">{it.answer || '(no code submitted)'}</pre>
                      <CodingMarker item={it} language={data.language} onFull={() => setMarks((m) => ({ ...m, [it.id]: String(it.max) }))} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="row end">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {data && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save marks'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantsTab({ ask }: { ask: AskFn }) {
  const { notify } = useApp();
  const { data, error, loading, reload } = useApi(() =>
    api<{ rounds: { n: number; name: string }[]; rows: StandingRow[] }>('/admin/participants'),
  );
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState<{ id: string; n: number } | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox message={error} onRetry={reload} />;

  const rows = data.rows.filter(
    (s) => !q.trim() || s.name.toLowerCase().includes(q.toLowerCase()) || s.rollNo.toLowerCase().includes(q.toLowerCase()),
  );

  const resetPassword = async (s: StandingRow) => {
    try {
      const r = await api<{ password: string }>(`/admin/participants/${s.id}/password`, { body: {} });
      window.prompt(`New password for ${s.name} (copy it now, it is not shown again):`, r.password);
    } catch (e) {
      notify('error', errMsg(e));
    }
  };

  const setOverride = async (s: StandingRow, n: number, v: 'auto' | 'yes' | 'no') => {
    try {
      await api(`/admin/participants/${s.id}/override`, {
        method: 'PATCH',
        body: { round: n, value: v === 'auto' ? null : v === 'yes' },
      });
      notify('success', `Round ${n} qualification updated for ${s.name}${v === 'auto' ? '.' : ' — they were notified.'}`);
    } catch (e) {
      notify('error', errMsg(e));
    }
    reload();
  };

  return (
    <div>
      <div className="row between wrap">
        <input className="search" placeholder="Search by name or roll number…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button
          className="btn btn-primary"
          disabled={data.rows.length === 0}
          onClick={() =>
            download('/admin/export.csv', 'codesmash-results.csv')
              .then(() => notify('success', 'Results exported as CSV.'))
              .catch((e: unknown) => notify('error', errMsg(e)))
          }
        >
          ⬇ Export results (CSV)
        </button>
      </div>
      <p className="muted small">
        Qualification is automatic (score ≥ qualifying score once the attempt ends) and the participant is notified
        instantly. Use the dropdown to override it, or reset a round to let a student attempt it again.
      </p>

      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Participant</th>
                {data.rounds.map((r) => (
                  <th key={r.n}>Round {r.n}</th>
                ))}
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="rank">{s.rank || '–'}</td>
                  <td>
                    <b>{s.name}</b> {s.source === 'spot' && <Chip kind="neutral">Spot</Chip>}
                    <div className="muted small">
                      {s.rollNo} · {s.year}
                    </div>
                    <button className="link-btn" onClick={() => void resetPassword(s)}>
                      Reset password
                    </button>
                    <div className="muted small">{s.email}</div>
                  </td>
                  {s.stats.map((st) => (
                    <td key={st.n}>
                      <div className="cell-stack">
                        <span>
                          {st.attempted ? (
                            <>
                              <b>{st.score}</b> / {st.maxScore} · {fmtTime(st.timeMs)}
                            </>
                          ) : (
                            '–'
                          )}
                        </span>
                        {st.attempted && !st.finished && <Chip kind="live">Running</Chip>}
                        {st.violations > 0 && <Chip kind="warn">{st.violations} violation{st.violations > 1 ? 's' : ''}</Chip>}
                        {(st.finished || st.override !== null) && (
                          <Chip kind={st.qualified ? 'good' : 'bad'}>{st.qualified ? 'Qualified' : 'Not qualified'}</Chip>
                        )}
                        <select
                          className="mini"
                          value={st.override === null ? 'auto' : st.override ? 'yes' : 'no'}
                          onChange={(e) => void setOverride(s, st.n, e.target.value as 'auto' | 'yes' | 'no')}
                        >
                          <option value="auto">Auto</option>
                          <option value="yes">Force qualify</option>
                          <option value="no">Force disqualify</option>
                        </select>
                        {st.attempted && (
                          <span className="row">
                            <button className="link-btn" onClick={() => setViewing({ id: s.id, n: st.n })}>
                              View / grade
                            </button>
                            <button
                              className="link-btn"
                              onClick={() =>
                                ask({
                                  title: 'Reset this attempt?',
                                  message: `${s.name}'s Round ${st.n} attempt will be deleted so they can start it again.`,
                                  confirmText: 'Reset attempt',
                                  danger: true,
                                  action: async () => {
                                    try {
                                      await api(`/admin/participants/${s.id}/attempts/${st.n}`, { method: 'DELETE' });
                                      notify('success', 'Attempt reset.');
                                    } catch (e) {
                                      notify('error', errMsg(e));
                                    }
                                    reload();
                                  },
                                })
                              }
                            >
                              Reset
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                  <td>
                    <b>{s.totalScore}</b>
                    <div className="muted small">{fmtTime(s.totalTimeMs)}</div>
                  </td>
                  <td>
                    <Chip kind={s.statusKind}>{s.status}</Chip>
                  </td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() =>
                        ask({
                          title: 'Remove participant?',
                          message: `${s.name} and all of their attempts and notifications will be deleted.`,
                          confirmText: 'Remove',
                          danger: true,
                          action: async () => {
                            try {
                              await api(`/admin/participants/${s.id}`, { method: 'DELETE' });
                              notify('success', 'Participant removed.');
                            } catch (e) {
                              notify('error', errMsg(e));
                            }
                            reload();
                          },
                        })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={data.rounds.length + 5} className="empty">
                    {data.rows.length === 0 ? 'No participants registered yet.' : 'No participants match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {viewing && <SubmissionModal studentId={viewing.id} roundN={viewing.n} onClose={() => setViewing(null)} onSaved={reload} />}
    </div>
  );
}

/* ------------------------------------------------------------------ leaderboard (organiser only) */

interface BoardResponse {
  rounds: { n: number; name: string; qualifyScore: number }[];
  scope: number;
  rows: Record<string, unknown>[];
}

function LeaderboardTab() {
  const [scope, setScope] = useState(0);
  const { data, error, loading, reload } = useApi(() => api<BoardResponse>(`/admin/leaderboard?round=${scope}`), [scope]);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox message={error} onRetry={reload} />;
  const round = data.rounds.find((r) => r.n === scope);
  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank || '–');
  const overallRows = data.rows as unknown as StandingRow[];
  const missingStats = scope === 0 && overallRows.some((s) => !Array.isArray(s.stats));

  return (
    <div>
      <p className="muted">Only you can see this. Participants see their own score only.</p>
      <div className="tabs">
        <button className={scope === 0 ? 'tab active' : 'tab'} onClick={() => setScope(0)}>
          Overall
        </button>
        {data.rounds.map((r) => (
          <button key={r.n} className={scope === r.n ? 'tab active' : 'tab'} onClick={() => setScope(r.n)}>
            Round {r.n}
          </button>
        ))}
      </div>
      {round && <p className="muted small">Qualifying score for {round.name}: {round.qualifyScore}</p>}
      {missingStats && (
        <div className="alert alert-error">
          The server returned incomplete leaderboard data. Refresh and make sure the API server is running the current version.
        </div>
      )}
      <div className="card table-card">
        <div className="table-wrap">
          {scope === 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Participant</th>
                  {data.rounds.map((r) => (
                    <th key={r.n}>Round {r.n}</th>
                  ))}
                  <th>Total</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {overallRows.map((s) => (
                  <tr key={s.id}>
                    <td className="rank">{medal(s.rank)}</td>
                    <td>
                      <b>{s.name}</b>
                      <div className="muted small">{s.rollNo}</div>
                    </td>
                    {Array.isArray(s.stats)
                      ? s.stats.map((st) => (
                          <td key={st.n}>{st.attempted ? `${st.score} / ${st.maxScore}` : '–'}</td>
                        ))
                      : data.rounds.map((r) => <td key={r.n}>–</td>)}
                    <td>
                      <b>{s.totalScore}</b>
                    </td>
                    <td>{fmtTime(s.totalTimeMs)}</td>
                    <td>
                      <Chip kind={s.statusKind}>{s.status}</Chip>
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={data.rounds.length + 5} className="empty">
                      Nobody has started a round yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Participant</th>
                  <th>Score</th>
                  <th>Time</th>
                  <th>Result</th>
                  <th>Violations</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows as unknown as (RoundBoardRow & { violations: number })[]).map((r) => (
                  <tr key={r.id}>
                    <td className="rank">{medal(r.rank)}</td>
                    <td>
                      <b>{r.name}</b>
                      <div className="muted small">{r.rollNo}</div>
                    </td>
                    <td>
                      <b>{r.score}</b>
                    </td>
                    <td>{fmtTime(r.timeMs)}</td>
                    <td>{r.finished ? <Chip kind={r.qualified ? 'good' : 'bad'}>{r.qualified ? 'Qualified' : 'Not qualified'}</Chip> : <Chip kind="live">Running</Chip>}</td>
                    <td>{r.violations > 0 ? <Chip kind="warn">{r.violations}</Chip> : '0'}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      Nobody has started this round yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ announcements */

function AnnounceTab({ ask }: { ask: AskFn }) {
  const { notify } = useApp();
  const [audience, setAudience] = useState<'all' | 'qualified' | 'eligible'>('all');
  const [round, setRound] = useState(1);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const who =
    audience === 'all'
      ? 'every registered participant'
      : audience === 'qualified'
        ? `everyone who qualified in Round ${round}`
        : `everyone eligible to enter Round ${round}`;

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      notify('error', 'Please write a title and a message.');
      return;
    }
    ask({
      title: 'Send announcement?',
      message: `"${title.trim()}" will be sent instantly to ${who}.`,
      confirmText: 'Send now',
      action: async () => {
        try {
          const r = await api<{ sent: number }>('/admin/announcements', { body: { title, message, audience, round } });
          notify('success', `Announcement sent to ${r.sent} participant(s).`);
          setTitle('');
          setMessage('');
        } catch (e2) {
          notify('error', errMsg(e2));
        }
      },
    });
  };

  return (
    <form className="card form narrow-card" onSubmit={send}>
      <h3>Send a notification</h3>
      <p className="muted">
        Participants who are online see it pop up immediately; everyone gets it in their notification list (and by email if
        email is configured).
      </p>
      <div className="grid grid-2">
        <label className="field">
          <span>Send to</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
            <option value="all">All participants</option>
            <option value="qualified">Qualified in a round</option>
            <option value="eligible">Eligible to enter a round</option>
          </select>
        </label>
        <label className="field">
          <span>Round</span>
          <select value={round} disabled={audience === 'all'} onChange={(e) => setRound(Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                Round {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Title</span>
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Round 2 starts at 3 PM" />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea rows={4} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="row end">
        <button className="btn btn-primary" type="submit">
          Send notification
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ settings */

function SettingsTab() {
  const { notify } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      await api('/admin/reset', { body: { confirm: text } });
      notify('success', 'Competition reset. Questions were kept; all rounds are back to "upcoming".');
      setText('');
    } catch (e) {
      notify('error', errMsg(e));
    }
    setBusy(false);
  };

  return (
    <div className="grid grid-2">
      <div className="card form">
        <h3>Organiser account</h3>
        <p className="muted">
          The organiser username and password, the database connection and the optional email (SMTP) settings are stored in
          the server's <code>.env</code> file, never in the browser. Edit that file and restart the server to change them.
        </p>
      </div>
      <div className="card form">
        <h3>Reset before the real event</h3>
        <p className="muted">
          Deletes every participant, attempt and notification and sets all rounds back to "upcoming". Your questions, passwords and
          round settings are kept. This cannot be undone.
        </p>
        <label className="field">
          <span>
            Type <b>RESET</b> to confirm
          </span>
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button className="btn btn-danger" disabled={text !== 'RESET' || busy} onClick={() => void reset()}>
          {busy ? 'Resetting…' : 'Reset competition'}
        </button>
      </div>
    </div>
  );
}
