import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../router';
import { api } from '../api';
import { useApp } from '../store';
import { useApi } from '../hooks';
import { Chip } from '../components/Chip';
import { CodeEditor } from '../components/CodeEditor';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Countdown } from '../components/Countdown';
import { ExamShell, fsSupported } from '../components/ExamShell';
import { ErrorBox, Loading, RequireStudent } from '../components/Guards';
import { Palette } from '../components/Palette';
import { fmtTime } from '../format';
import { FullscreenLock, useExamGuard } from '../lib/examGuard';
import { rulesFor } from '../lib/rules';
import { useSaver } from '../lib/useSaver';
import type { Flush } from '../lib/useSaver';
import { LANGUAGES, LANGUAGE_LABELS, TYPE_LABELS } from '../types';
import type { CodingItem, FixItem, Language, QuizItem, RoundDetail } from '../types';
import { CodingExam } from './exam/CodingExam';

export function RoundPage({ n }: { n: number }) {
  return (
    <RequireStudent>
      <RoundInner n={n} />
    </RequireStudent>
  );
}

type Stats = { answered: number; total: number };

const leaveFullScreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
};

/* ------------------------------------------------------------------ the round page */

function RoundInner({ n }: { n: number }) {
  const { notify } = useApp();
  // Not "live": a background refresh must never disturb someone who is typing an answer.
  const { data: round, error, loading, reload } = useApi(() => api<RoundDetail>(`/rounds/${n}`), [n], false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState<Language | ''>('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const flush: Flush = useRef<null | (() => Promise<void>)>(null); // lets the runner save pending answers before finishing
  const stats = useRef<Stats>({ answered: 0, total: 0 });
  const offset = useMemo(() => (round ? round.serverNow - Date.now() : 0), [round?.serverNow]); // eslint-disable-line

  const running = !!round && round.attempt?.status === 'running';
  const guard = useExamGuard({
    active: running,
    roundN: n,
    max: round?.maxViolations ?? 0,
    onAutoSubmitted: () => {
      notify('error', 'Too many rule violations. Your round was submitted automatically.', { ms: 8000 });
      guard.release();
      leaveFullScreen();
      reload();
    },
  });

  // Make sure the next screen always starts at the top.
  useEffect(() => {
    document.querySelector('.exam-body')?.scrollTo(0, 0);
  }, [round?.attempt?.status]);

  if (loading && !round) {
    return (
      <ExamShell title="Loading round…">
        <Loading />
      </ExamShell>
    );
  }
  if (!round) {
    return (
      <ExamShell title="Round">
        <ErrorBox message={error || 'Round not found.'} onRetry={reload} />
      </ExamShell>
    );
  }

  const attempt = round.attempt;
  const typeLabel = TYPE_LABELS[round.type];

  const start = async () => {
    setBusy(true);
    try {
      await api(`/rounds/${n}/start`, { body: { password, language: language || undefined, agreed: true } });
      notify('success', `${round.name} started. Good luck!`);
      setPassword('');
    } catch (e) {
      notify('error', (e as Error).message);
      leaveFullScreen();
    }
    setBusy(false);
    reload();
  };

  /** Start button: ask for full screen straight from the click (browsers refuse it later), then start. */
  const onStartClick = () => {
    if (!agreed) return notify('error', 'Tick "Yes, I understand" after reading the rules.');
    if (!password.trim()) return notify('error', 'Enter the round password given by the organiser.');
    if (round.needsLanguage && !language) return notify('error', 'Choose your programming language first.');
    if (fsSupported && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
    void start();
  };

  const finish = async (auto: boolean) => {
    try {
      await flush.current?.();
      await api(`/rounds/${n}/finish`, { body: {} });
      guard.release();
      notify(auto ? 'info' : 'success', auto ? 'Time is up. Your answers were submitted automatically.' : 'Submitted. Your score is ready.');
      leaveFullScreen();
    } catch (e) {
      notify('error', (e as Error).message);
    }
    reload();
  };

  /* ---------- locked ---------- */
  if (!attempt && !round.allowed) {
    return (
      <ExamShell title={round.name} subtitle={typeLabel}>
        <div className="exam-center">
          <div className="card center-text intro-card">
            <h2>Round {n} is not available to you</h2>
            <p className="muted">The organisers decide who can enter this round. Ask them if you think this is a mistake.</p>
            <Link to="/dashboard" className="btn btn-primary">
              Back to dashboard
            </Link>
          </div>
        </div>
      </ExamShell>
    );
  }

  /* ---------- rules, password, language ---------- */
  if (!attempt) {
    const sections = rulesFor(round);
    return (
      <ExamShell title={round.name} subtitle={typeLabel}>
        <div className="exam-center">
          <div className="card intro-card">
            <span className="file-tag">
              round{round.n}.{round.type === 'quiz' ? 'quiz' : round.type === 'codefix' ? 'fix' : 'code'}
            </span>
            <h1>{round.name}</h1>
            <ul className="facts">
              <li>
                Time: <b>{round.durationMin} minutes</b>
              </li>
              <li>
                {round.type === 'coding' ? 'Problems' : 'Questions'}: <b>{round.problemCount}</b> · Total marks: <b>{round.maxScore}</b>
              </li>
            </ul>

            <div className="rule-box">
              {sections.map((sec) => (
                <div key={sec.title}>
                  <h3>{sec.title}</h3>
                  <ul>
                    {sec.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {round.status === 'open' ? (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  onStartClick();
                }}
              >
                {round.needsLanguage && (
                  <div className="field">
                    <span>Choose your programming language</span>
                    <div className="pick">
                      {LANGUAGES.map((l) => (
                        <button type="button" key={l} className={language === l ? 'on' : ''} onClick={() => setLanguage(l)}>
                          {LANGUAGE_LABELS[l]}
                        </button>
                      ))}
                    </div>
                    <small className="muted">You cannot change the language after you start.</small>
                  </div>
                )}
                <label className="field">
                  <span>Round password (from the organiser)</span>
                  <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter the password for this round" />
                </label>
                <label className={`agree ${agreed ? 'on' : ''}`}>
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>
                    <b>Yes, I understand.</b> I have read the rules above and I agree to follow them. I know the round opens in full screen,
                    the timer cannot be paused and breaking the rules is recorded.
                  </span>
                </label>
                <button className="btn btn-primary btn-lg" disabled={busy || !agreed}>
                  {busy ? 'Starting…' : 'Start round'}
                </button>
              </form>
            ) : (
              <div className="alert alert-error">
                {round.status === 'closed' ? 'This round is closed.' : "This round has not opened yet. You'll get a notification when it does."}
              </div>
            )}
          </div>
        </div>
      </ExamShell>
    );
  }

  /* ---------- submitted: the score only ---------- */
  if (attempt.status === 'finished') {
    return (
      <ExamShell title={round.name} subtitle="Submitted">
        <div className="exam-center">
          <div className="card center-text intro-card">
            <h1>{round.name}</h1>
            <p className="muted">Your answers are submitted. Your score:</p>
            <div className="big-score">
              {attempt.score}
              <small> / {attempt.maxScore}</small>
            </div>
            <p className="muted">
              Time taken <b>{fmtTime(attempt.timeMs)}</b>
              {attempt.language && <> · {LANGUAGE_LABELS[attempt.language]}</>}
            </p>
            {round.summary && (
              <p className="muted">
                You answered {round.summary.answered} of {round.summary.total} questions.
              </p>
            )}
            {round.type === 'coding' && round.judgeMode === 'manual' && (
              <div className="alert alert-info">Your code is saved. The organiser will review it, so your final marks may change.</div>
            )}
            <div className="alert alert-info">The organisers will tell you what happens next.</div>
            <Link to="/dashboard" className="btn btn-primary">
              Back to dashboard
            </Link>
          </div>
          {round.results && (
            <div className="card table-card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Question</th>
                      <th>Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.results.map((r, i) => (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td>{r.title}</td>
                        <td>
                          {r.earned} / {r.max}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </ExamShell>
    );
  }

  /* ---------- running ---------- */
  const items = round.items ?? [];
  const openSubmit = () => setConfirmFinish(true);
  const left = stats.current.total - stats.current.answered;

  return (
    <ExamShell
      title={round.name}
      subtitle={`${typeLabel}${attempt.language ? ` · ${LANGUAGE_LABELS[attempt.language]}` : ''}${round.type === 'coding' ? ` · Score ${attempt.score}/${attempt.maxScore}` : ''}`}
      progress={round.type === 'coding' ? undefined : prog}
      hideExit
      right={
        <>
          <Countdown deadline={attempt.deadline} offset={offset} onExpire={() => void finish(true)} />
          <button className="btn btn-primary btn-sm" onClick={openSubmit}>
            Submit round
          </button>
        </>
      }
    >
      {round.type === 'quiz' && <QuizRunner roundN={n} items={items as QuizItem[]} flush={flush} stats={stats} onProgress={setProg} onSubmit={openSubmit} />}
      {round.type === 'codefix' && (
        <FixRunner roundN={n} items={items as FixItem[]} language={attempt.language} flush={flush} stats={stats} onProgress={setProg} onSubmit={openSubmit} />
      )}
      {round.type === 'coding' && (
        <CodingExam
          roundN={n}
          items={items as CodingItem[]}
          language={attempt.language ?? 'python'}
          manual={round.judgeMode === 'manual'}
          flush={flush}
          stats={stats}
          onChanged={reload}
          onSubmit={openSubmit}
        />
      )}

      {guard.locked && <FullscreenLock onReturn={guard.returnToFullScreen} max={round.maxViolations} />}

      <ConfirmDialog
        open={confirmFinish}
        title="Submit this round?"
        message={
          round.type === 'coding'
            ? 'Your submitted code will be scored. You cannot change anything afterwards.'
            : left > 0
              ? `You have not answered ${left} of ${stats.current.total} questions. After submitting you cannot change anything.`
              : 'Your answers will be submitted and scored. You cannot change them afterwards.'
        }
        confirmText="Submit"
        danger
        onCancel={() => setConfirmFinish(false)}
        onConfirm={() => {
          setConfirmFinish(false);
          void finish(false);
        }}
      />
    </ExamShell>
  );
}

/* ------------------------------------------------------------------ round 1: quiz */

function QuizRunner({
  roundN,
  items,
  flush,
  stats,
  onProgress,
  onSubmit,
}: {
  roundN: number;
  items: QuizItem[];
  flush: Flush;
  stats: { current: Stats };
  onProgress: (pct: number) => void;
  onSubmit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>(() => Object.fromEntries(items.map((q) => [q.id, q.answer])));
  const [sideOpen, setSideOpen] = useState(false);
  const save = useSaver(roundN, flush);

  const total = items.length;
  const answered = items.filter((q) => answers[q.id] !== null && answers[q.id] !== undefined).length;
  stats.current = { answered, total };
  useEffect(() => onProgress(total ? (answered / total) * 100 : 0), [answered, total]); // eslint-disable-line

  const q = items[Math.min(index, Math.max(0, total - 1))];

  const choose = (i: number) => {
    if (!q) return;
    const next = answers[q.id] === i ? null : i; // click the chosen option again to clear it
    setAnswers((a) => ({ ...a, [q.id]: next }));
    save(q.id, next, 200);
  };
  const go = (i: number) => setIndex(Math.max(0, Math.min(total - 1, i)));

  // Keyboard: left/right arrows move, A-F or 1-6 pick an option.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (q) {
        const k = e.key.toLowerCase();
        const idx = /^[a-f]$/.test(k) ? k.charCodeAt(0) - 97 : /^[1-6]$/.test(k) ? Number(k) - 1 : -1;
        if (idx >= 0 && idx < q.options.length) choose(idx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!q) return <div className="card">No questions.</div>;
  const chosen = answers[q.id];

  return (
    <div className="exam-layout">
      <div>
        <div className="card q-card">
          <div className="q-meta">
            <span className="q-no">
              Question {index + 1} <span className="muted">of {total}</span>
            </span>
          </div>
          <p className="quiz-text">{q.text}</p>
          <div className="q-opts" role="radiogroup" aria-label="Answer options">
            {q.options.map((o, i) => (
              <button key={i} type="button" role="radio" aria-checked={chosen === i} className={`option ${chosen === i ? 'selected' : ''}`} onClick={() => choose(i)}>
                <b>{String.fromCharCode(65 + i)}</b>
                <span>{o}</span>
              </button>
            ))}
          </div>
          <div className="q-nav">
            <button className="btn btn-ghost" disabled={index === 0} onClick={() => go(index - 1)}>
              Previous
            </button>
            <button className="btn btn-ghost btn-sm" disabled={chosen === null || chosen === undefined} onClick={() => choose(chosen as number)}>
              Clear answer
            </button>
            {index < total - 1 ? (
              <button className="btn btn-primary" onClick={() => go(index + 1)}>
                Save &amp; next
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onSubmit}>
                Review &amp; submit
              </button>
            )}
          </div>
          <p className="exam-hint">
            Shortcuts: <span className="kbd">A</span> to <span className="kbd">D</span> choose an option, <span className="kbd">←</span> <span className="kbd">→</span> move. Answers save automatically.
          </p>
        </div>
      </div>

      <aside className={`exam-side ${sideOpen ? '' : 'collapsed'}`}>
        <div className="card">
          <div className="row between">
            <b>
              {answered}/{total} answered
            </b>
            <button className="btn btn-ghost btn-sm side-toggle" onClick={() => setSideOpen((o) => !o)}>
              {sideOpen ? 'Hide' : 'Palette'}
            </button>
          </div>
          <div style={{ height: 12 }} />
          <Palette
            count={total}
            index={index}
            marked={false}
            state={(i) => (answers[items[i].id] !== null && answers[items[i].id] !== undefined ? 'done' : '')}
            onSelect={go}
          />
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={onSubmit}>
            Submit round
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ round 2: code correction */

function FixRunner({
  roundN,
  items,
  language,
  flush,
  stats,
  onProgress,
  onSubmit,
}: {
  roundN: number;
  items: FixItem[];
  language: Language | null;
  flush: Flush;
  stats: { current: Stats };
  onProgress: (pct: number) => void;
  onSubmit: () => void;
}) {
  const { notify } = useApp();
  const [index, setIndex] = useState(0);
  const [code, setCode] = useState<Record<string, string>>(() => Object.fromEntries(items.map((f) => [f.id, f.answer])));
  const [sideOpen, setSideOpen] = useState(false);
  const save = useSaver(roundN, flush);

  const total = items.length;
  const answered = items.filter((x) => (code[x.id] ?? '').trim()).length;
  stats.current = { answered, total };
  useEffect(() => onProgress(total ? (answered / total) * 100 : 0), [answered, total]); // eslint-disable-line

  if (!total) return <div className="card">No questions.</div>;
  const f = items[Math.min(index, total - 1)];
  const go = (i: number) => setIndex(Math.max(0, Math.min(total - 1, i)));
  const change = (v: string) => {
    setCode((c) => ({ ...c, [f.id]: v }));
    save(f.id, v);
  };
  const ext = language === 'python' ? 'py' : language === 'java' ? 'java' : 'c';

  return (
    <div className="exam-layout">
      <div>
        <div className="card q-card">
          <div className="q-meta">
            <span className="q-no">
              Question {index + 1} <span className="muted">of {total}</span>
            </span>
            {language && <Chip kind="live">{LANGUAGE_LABELS[language]}</Chip>}
          </div>
          <h2 style={{ margin: '0 0 6px' }}>{f.title}</h2>
          <p className="muted">{f.description || 'Find the mistake in the code on the left and type the corrected program on the right.'}</p>
          <div className="split">
            <CodeEditor label={`wrong.${ext}  (has a bug)`} tone="bug" value={f.wrongCode} readOnly />
            <CodeEditor label={`correct.${ext}  (your fix)`} tone="fix" value={code[f.id] ?? ''} onChange={change} placeholder="Type the complete corrected code here…" />
          </div>
          <div className="q-nav">
            <button className="btn btn-ghost" disabled={index === 0} onClick={() => go(index - 1)}>
              Previous
            </button>
            <span className="row">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  change(f.wrongCode);
                  notify('info', 'Wrong code copied to your editor. Edit it to fix the mistake.');
                }}
              >
                Copy wrong code
              </button>
              <button className="btn btn-ghost btn-sm" disabled={!(code[f.id] ?? '').trim()} onClick={() => change('')}>
                Clear
              </button>
            </span>
            {index < total - 1 ? (
              <button className="btn btn-primary" onClick={() => go(index + 1)}>
                Save &amp; next
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onSubmit}>
                Review &amp; submit
              </button>
            )}
          </div>
          <p className="exam-hint">Your code is saved automatically. Press Tab to indent. Comments and extra spaces do not matter.</p>
        </div>
      </div>

      <aside className={`exam-side ${sideOpen ? '' : 'collapsed'}`}>
        <div className="card">
          <div className="row between">
            <b>
              {answered}/{total} attempted
            </b>
            <button className="btn btn-ghost btn-sm side-toggle" onClick={() => setSideOpen((o) => !o)}>
              {sideOpen ? 'Hide' : 'Palette'}
            </button>
          </div>
          <div style={{ height: 12 }} />
          <Palette count={total} index={index} marked={false} doneLabel="Attempted" state={(i) => ((code[items[i].id] ?? '').trim() ? 'done' : '')} onSelect={go} />
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={onSubmit}>
            Submit round
          </button>
        </div>
      </aside>
    </div>
  );
}
