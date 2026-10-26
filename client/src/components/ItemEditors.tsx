import { useState, type FormEvent, type ReactNode } from 'react';
import { LANGUAGES, LANGUAGE_LABELS } from '../types';
import type { AdminFix, AdminProblem, AdminQuiz, AdminTest, Language, RoundType } from '../types';

interface FormShellProps {
  title: string;
  error: string;
  saving?: boolean;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  children: ReactNode;
}

function Shell({ title, error, saving, onSubmit, onCancel, children }: FormShellProps) {
  return (
    <form className="card form" onSubmit={onSubmit}>
      <h3>{title}</h3>
      {error && <div className="alert alert-error">{error}</div>}
      {children}
      <div className="row end">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ quiz */

export function QuizForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: AdminQuiz;
  saving?: boolean;
  onSave: (v: Omit<AdminQuiz, 'id'>) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? '');
  const [options, setOptions] = useState<string[]>(initial?.options ?? ['', '', '', '']);
  const [correct, setCorrect] = useState(initial?.correct ?? 0);
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = options.map((o) => o.trim());
    if (!text.trim()) return setError('Write the question.');
    if (clean.length < 2 || clean.some((o) => !o)) return setError('Fill in every option (at least 2), or remove the empty ones.');
    onSave({ text: text.trim(), options: clean, correct });
  };

  return (
    <Shell title={initial ? 'Edit question' : 'Add quiz question'} error={error} saving={saving} onSubmit={submit} onCancel={onCancel}>
      <label className="field">
        <span>Question</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="field">
        <span>Options — select the correct one</span>
        {options.map((o, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Option ${i + 1} is correct`} />
            <input className="grow" value={o} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
            {options.length > 2 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setOptions(options.filter((_, j) => j !== i));
                  setCorrect(correct === i ? 0 : correct > i ? correct - 1 : correct);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOptions([...options, ''])}>
            + Add option
          </button>
        )}
      </div>
    </Shell>
  );
}

/** Parses lines like:  Question | Option A | Option B | Option C | Option D | B   (last column = correct letter or number) */
export function parseBulkQuiz(text: string): { items: Omit<AdminQuiz, 'id'>[]; errors: string[] } {
  const items: Omit<AdminQuiz, 'id'>[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .forEach((line, idx) => {
      if (!line) return;
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length < 4) return errors.push(`Line ${idx + 1}: needs a question, at least 2 options and the correct answer.`);
      const key = parts[parts.length - 1];
      const options = parts.slice(1, -1);
      if (options.length > 6 || options.some((o) => !o)) return errors.push(`Line ${idx + 1}: 2 to 6 non-empty options are allowed.`);
      let correct = /^[a-fA-F]$/.test(key) ? key.toUpperCase().charCodeAt(0) - 65 : Number(key) - 1;
      if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
        const byText = options.findIndex((o) => o.toLowerCase() === key.toLowerCase());
        if (byText < 0) return errors.push(`Line ${idx + 1}: the last column must be the correct option (A, B, C… or its number).`);
        correct = byText;
      }
      items.push({ text: parts[0], options, correct });
    });
  return { items, errors };
}

export function BulkQuizForm({
  saving,
  onImport,
  onCancel,
}: {
  saving?: boolean;
  onImport: (items: Omit<AdminQuiz, 'id'>[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const parsed = parseBulkQuiz(text);
  return (
    <div className="card form">
      <h3>Import many questions</h3>
      <p className="muted small">
        One question per line: <code>Question | Option A | Option B | Option C | Option D | B</code> — the last column is the
        correct option (A, B, C… or 1, 2, 3…). You can paste 30 questions at once.
      </p>
      <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className="code" placeholder={'What is 2+2? | 3 | 4 | 5 | 6 | B'} />
      <p className="small">
        <b>{parsed.items.length}</b> question(s) ready.
      </p>
      {parsed.errors.length > 0 && (
        <div className="alert alert-error">
          {parsed.errors.slice(0, 5).map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      <div className="row end">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving || !parsed.items.length || parsed.errors.length > 0} onClick={() => onImport(parsed.items)}>
          {saving ? 'Importing…' : `Import ${parsed.items.length} question(s)`}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ code correction */

export function FixForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: AdminFix;
  saving?: boolean;
  onSave: (v: { title: string; description: string; variants: AdminFix['variants'] }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [lang, setLang] = useState<Language>('python');
  const [data, setData] = useState<Record<Language, { wrongCode: string; correctCode: string }>>(() => {
    const base = Object.fromEntries(LANGUAGES.map((l) => [l, { wrongCode: '', correctCode: '' }])) as Record<Language, { wrongCode: string; correctCode: string }>;
    initial?.variants.forEach((v) => (base[v.language] = { wrongCode: v.wrongCode, correctCode: v.correctCode }));
    return base;
  });
  const [error, setError] = useState('');

  const set = (k: 'wrongCode' | 'correctCode', v: string) => setData((d) => ({ ...d, [lang]: { ...d[lang], [k]: v } }));
  const filled = (l: Language) => !!(data[l].wrongCode.trim() || data[l].correctCode.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Give the question a title.');
    const variants = LANGUAGES.filter(filled).map((l) => ({ language: l, ...data[l] }));
    if (!variants.length) return setError('Add the code for at least one language.');
    const half = variants.find((v) => !v.wrongCode.trim() || !v.correctCode.trim());
    if (half) return setError(`${LANGUAGE_LABELS[half.language]}: fill both the wrong code and the correct code.`);
    onSave({ title: title.trim(), description: description.trim(), variants });
  };

  return (
    <Shell title={initial ? 'Edit code-correction question' : 'Add code-correction question'} error={error} saving={saving} onSubmit={submit} onCancel={onCancel}>
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sum of two numbers" />
      </label>
      <label className="field">
        <span>Instruction shown to students (optional)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. The program should print the sum of a and b." />
      </label>
      <div className="tabs">
        {LANGUAGES.map((l) => (
          <button type="button" key={l} className={lang === l ? 'tab active' : 'tab'} onClick={() => setLang(l)}>
            {LANGUAGE_LABELS[l]} {filled(l) ? '✓' : ''}
          </button>
        ))}
      </div>
      <p className="muted small">
        Students see the <b>wrong code</b> and type the corrected program. Their code is compared with your <b>correct code</b>
        (comments, spacing and blank lines are ignored). Students only get this question if its language has code here.
      </p>
      <label className="field">
        <span>{LANGUAGE_LABELS[lang]} – wrong code (shown to students)</span>
        <textarea className="code" rows={8} value={data[lang].wrongCode} onChange={(e) => set('wrongCode', e.target.value)} spellCheck={false} />
      </label>
      <label className="field">
        <span>{LANGUAGE_LABELS[lang]} – correct code (hidden)</span>
        <textarea className="code" rows={8} value={data[lang].correctCode} onChange={(e) => set('correctCode', e.target.value)} spellCheck={false} />
      </label>
    </Shell>
  );
}

/* ------------------------------------------------------------------ coding problems */

export function CodingForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial?: AdminProblem;
  saving?: boolean;
  onSave: (v: Omit<AdminProblem, 'id'>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [statement, setStatement] = useState(initial?.statement ?? '');
  const [points, setPoints] = useState(String(initial?.points ?? 20));
  const [tests, setTests] = useState<AdminTest[]>(initial?.tests.length ? initial.tests : [{ input: '', expected: '', sample: true }]);
  const [error, setError] = useState('');

  const patch = (i: number, p: Partial<AdminTest>) => setTests(tests.map((t, j) => (j === i ? { ...t, ...p } : t)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const pts = Number(points);
    if (!title.trim() || !statement.trim()) return setError('Title and problem statement are required.');
    if (!Number.isFinite(pts) || pts < 1) return setError('Marks must be 1 or more.');
    if (!tests.length || tests.some((t) => !t.expected.trim())) return setError('Every test case needs an expected output.');
    onSave({ title: title.trim(), statement: statement.trim(), points: pts, tests });
  };

  return (
    <Shell title={initial ? 'Edit problem' : 'Add problem'} error={error} saving={saving} onSubmit={submit} onCancel={onCancel}>
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>Problem statement (describe the input and output format)</span>
        <textarea rows={6} value={statement} onChange={(e) => setStatement(e.target.value)} />
      </label>
      <label className="field">
        <span>Marks</span>
        <input type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} />
      </label>
      <div className="field">
        <span>Test cases — the input you give, and the output the program must print</span>
        <p className="muted small">Tick “Show to students” for sample cases students can see. Others stay hidden. Marks are given in proportion to the tests passed.</p>
        {tests.map((t, i) => (
          <div className="test-case" key={i}>
            <div className="row between">
              <b>Test {i + 1}</b>
              <div className="row">
                <label className="row small">
                  <input type="checkbox" checked={t.sample} onChange={(e) => patch(i, { sample: e.target.checked })} /> Show to students
                </label>
                {tests.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTests(tests.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-2">
              <label className="field">
                <span>Input (stdin)</span>
                <textarea className="code" rows={3} value={t.input} onChange={(e) => patch(i, { input: e.target.value })} />
              </label>
              <label className="field">
                <span>Expected output</span>
                <textarea className="code" rows={3} value={t.expected} onChange={(e) => patch(i, { expected: e.target.value })} />
              </label>
            </div>
          </div>
        ))}
        {tests.length < 20 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTests([...tests, { input: '', expected: '', sample: false }])}>
            + Add test case
          </button>
        )}
      </div>
    </Shell>
  );
}

export const typeNoun = (t: RoundType) => (t === 'quiz' ? 'question' : t === 'codefix' ? 'code-correction question' : 'problem');
