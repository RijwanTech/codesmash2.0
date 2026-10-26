import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../store';
import { Chip } from '../../components/Chip';
import { CodeEditor } from '../../components/CodeEditor';
import { Palette } from '../../components/Palette';
import { runPython } from '../../lib/pyRunner';
import { useSaver } from '../../lib/useSaver';
import type { Flush } from '../../lib/useSaver';
import { LANGUAGE_LABELS } from '../../types';
import type { CodingItem, Language, Verdict } from '../../types';

// Round 3 – problem solving. One problem at a time: statement on top, editor below, Run / Submit buttons, output panel.

const STARTERS: Record<Language, string> = {
  python: '# Read input with input() and print the answer\n',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        \n    }\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n',
};

const EXT: Record<Language, string> = { python: 'py', java: 'java', c: 'c' };

interface RunResponse {
  status: string;
  message?: string;
  runs: { input: string; expected: string | null; output: string; error: string; status: string; passed: boolean | null }[];
}

const VERDICT_TEXT: Record<Verdict['status'], string> = {
  ok: 'All tests passed',
  wrong_answer: 'Wrong answer',
  compile_error: 'Compilation error',
  runtime_error: 'Runtime error',
  timeout: 'Time limit exceeded',
  pending: 'Saved – awaiting organiser review',
};

type Stats = { answered: number; total: number };

const norm = (t: string) =>
  t
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

export function CodingExam({
  roundN,
  items,
  language,
  manual,
  flush,
  stats,
  onChanged,
  onSubmit,
}: {
  roundN: number;
  items: CodingItem[];
  language: Language;
  manual: boolean;
  flush: Flush;
  stats: { current: Stats };
  onChanged: () => void;
  onSubmit: () => void;
}) {
  const { notify } = useApp();
  const save = useSaver(roundN, flush);
  const [index, setIndex] = useState(0);
  const [sideOpen, setSideOpen] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(items.map((p) => [p.id, p.answer || STARTERS[language]])));
  const [verdicts, setVerdicts] = useState<Record<string, Verdict | null>>(() => Object.fromEntries(items.map((p) => [p.id, p.verdict])));
  const [earned, setEarned] = useState<Record<string, number>>(() => Object.fromEntries(items.map((p) => [p.id, p.earned])));
  const [customOn, setCustomOn] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [runOut, setRunOut] = useState<Record<string, RunResponse | null>>({});
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);

  const total = items.length;
  const p = items[Math.min(index, Math.max(0, total - 1))];
  stats.current = { answered: items.filter((x) => (earned[x.id] ?? 0) > 0 || verdicts[x.id]).length, total };
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, total - 1)));
  }, [total]);

  if (!p) return <div className="card">No problems.</div>;

  const useCustom = customOn[p.id] ?? p.samples.length === 0;
  const code = codes[p.id] ?? '';
  const verdict = verdicts[p.id] ?? null;
  const out = runOut[p.id] ?? null;

  const edit = (v: string) => {
    setCodes((c) => ({ ...c, [p.id]: v }));
    save(p.id, v, 1500); // draft autosave, so a refresh never loses work
  };

  const run = async () => {
    setRunning(true);
    setRunOut((r) => ({ ...r, [p.id]: null }));
    let result: RunResponse | null = null;
    try {
      if (manual) {
        // No Judge0 on the server: Python can still be tested inside the browser; Java and C cannot.
        if (language !== 'python') {
          result = { status: 'unavailable', message: 'Running Java and C needs the Judge0 service, which is not set up. Check your code carefully and press Submit code.', runs: [] };
        } else {
          const cases = useCustom ? [{ input: custom[p.id] ?? '', expected: null as string | null }] : p.samples;
          const runs = [];
          for (const c of cases) {
            const r = await runPython(code, c.input);
            runs.push({
              input: c.input,
              expected: c.expected,
              output: r.output,
              error: r.error,
              status: r.error ? 'runtime_error' : 'ok',
              passed: c.expected === null ? null : !r.error && norm(r.output) === norm(c.expected),
            });
          }
          result = { status: 'ok', runs };
        }
      } else {
        result = await api<RunResponse>(`/rounds/${roundN}/problems/${p.id}/run`, { body: { code, input: useCustom ? (custom[p.id] ?? '') : undefined } });
      }
    } catch (e) {
      notify('error', (e as Error).message);
    }
    setRunOut((r) => ({ ...r, [p.id]: result }));
    setRunning(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api<{ verdict: Verdict; earned: number; max: number }>(`/rounds/${roundN}/problems/${p.id}/submit`, { body: { code } });
      setVerdicts((v) => ({ ...v, [p.id]: res.verdict }));
      setEarned((e) => ({ ...e, [p.id]: res.earned }));
      if (res.verdict.status === 'ok') notify('success', `All tests passed. ${res.earned}/${res.max} marks`);
      else if (res.verdict.status === 'pending') notify('info', 'Code saved. The organiser will review it.');
      else notify('error', `${VERDICT_TEXT[res.verdict.status]}: ${res.verdict.passed}/${res.verdict.total} tests passed`);
      onChanged();
    } catch (e) {
      notify('error', (e as Error).message);
    }
    setBusy(false);
  };

  const paletteState = (i: number) => {
    const id = items[i].id;
    const e = earned[id] ?? 0;
    if (e >= items[i].points) return 'done';
    if (e > 0) return 'marked';
    return '';
  };

  return (
    <div className="exam-layout">
      <div className="stack">
        <div className="card q-card" style={{ margin: 0 }}>
          <div className="q-meta">
            <span className="q-no">
              Problem {index + 1} <span className="muted">of {total}</span>
            </span>
            <span className="row">
              <Chip kind="neutral">{p.points} marks</Chip>
              {(earned[p.id] ?? 0) > 0 && <Chip kind={earned[p.id] >= p.points ? 'good' : 'warn'}>Earned {earned[p.id]}</Chip>}
            </span>
          </div>
          <h2 style={{ margin: '0 0 8px' }}>{p.title}</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.statement}</p>
          {p.samples.map((s, i) => (
            <div className="sample" key={i}>
              <div>
                <span className="muted small">Sample input {p.samples.length > 1 ? i + 1 : ''}</span>
                <pre className="input-box">{s.input || '(none)'}</pre>
              </div>
              <div>
                <span className="muted small">Expected output</span>
                <pre className="input-box">{s.expected}</pre>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ margin: 0 }}>
          <CodeEditor
            label={`main.${EXT[language]}  (${LANGUAGE_LABELS[language]}${language === 'java' ? ', class Main' : ''})`}
            tone="fix"
            value={code}
            onChange={edit}
            tall
          />
          <div className="field" style={{ marginTop: 12, marginBottom: 8 }}>
            <label className="row small">
              <input type="checkbox" checked={useCustom} onChange={(e) => setCustomOn((c) => ({ ...c, [p.id]: e.target.checked }))} />
              Run with my own input
              {p.samples.length > 0 && !useCustom && <span className="muted"> (now using the sample input)</span>}
            </label>
            {useCustom && (
              <textarea
                className="code"
                rows={3}
                value={custom[p.id] ?? ''}
                onChange={(e) => setCustom((c) => ({ ...c, [p.id]: e.target.value }))}
                placeholder="Type the input your program should read"
              />
            )}
          </div>
          <div className="row wrap">
            <button className="btn btn-ghost" disabled={running || busy} onClick={() => void run()}>
              {running ? 'Running…' : 'Run code'}
            </button>
            <button className="btn btn-primary" disabled={busy || running} onClick={() => void submit()}>
              {busy ? 'Checking…' : 'Submit code'}
            </button>
            {verdict && (
              <Chip kind={verdict.status === 'ok' ? 'good' : verdict.status === 'pending' ? 'neutral' : 'bad'}>
                {VERDICT_TEXT[verdict.status]}
                {verdict.status !== 'pending' && ` (${verdict.passed}/${verdict.total})`}
              </Chip>
            )}
          </div>
          <p className="exam-hint">Run code only tests your program and gives no marks. Submit code scores it against the hidden tests.</p>

          {out && (
            <div className="run-out">
              {out.status !== 'ok' ? (
                <pre className="input-box verdict-msg">{out.message}</pre>
              ) : (
                out.runs.map((r, i) => (
                  <div key={i} className="run-case">
                    <span className="muted small">Input</span>
                    <pre className="input-box">{r.input || '(none)'}</pre>
                    <span className="muted small">Your output</span>
                    <pre className="input-box">{r.output || '(nothing printed)'}</pre>
                    {r.error && <pre className="input-box verdict-msg">{r.error}</pre>}
                    {r.expected !== null && (
                      <>
                        <span className="muted small">Expected output</span>
                        <pre className="input-box">{r.expected}</pre>
                        <Chip kind={r.passed ? 'good' : 'bad'}>{r.passed ? 'Matches' : 'Different'}</Chip>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
          {verdict?.message && verdict.status !== 'ok' && verdict.status !== 'pending' && <pre className="input-box verdict-msg" style={{ marginTop: 10 }}>{verdict.message}</pre>}
        </div>

        <div className="q-nav">
          <button className="btn btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            Previous problem
          </button>
          {index < total - 1 ? (
            <button className="btn btn-primary" onClick={() => setIndex(index + 1)}>
              Next problem
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onSubmit}>
              Finish &amp; submit round
            </button>
          )}
        </div>
      </div>

      <aside className={`exam-side ${sideOpen ? '' : 'collapsed'}`}>
        <div className="card">
          <div className="row between">
            <b>Problems</b>
            <button className="btn btn-ghost btn-sm side-toggle" onClick={() => setSideOpen((o) => !o)}>
              {sideOpen ? 'Hide' : 'Palette'}
            </button>
          </div>
          <div style={{ height: 12 }} />
          <Palette count={total} index={index} doneLabel="Full marks" markedLabel="Partial" state={paletteState} onSelect={setIndex} />
          <ul className="facts small" style={{ marginTop: 12 }}>
            {items.map((x, i) => (
              <li key={x.id}>
                {i + 1}. {x.title}: <b>{earned[x.id] ?? 0}</b> / {x.points}
              </li>
            ))}
          </ul>
          {manual && <p className="muted small">Automatic judging is off. Your submitted code is saved and the organiser gives the marks.</p>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={onSubmit}>
            Submit round
          </button>
        </div>
      </aside>
    </div>
  );
}
