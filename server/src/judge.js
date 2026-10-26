// Runs student code against test cases through a Judge0 server (a sandboxed code-execution service).
//
// Student code is NEVER executed on this machine: arbitrary code could read the server's .env (database password)
// or damage the computer. If JUDGE0_URL is not configured the platform falls back to "manual" mode: submissions are
// stored and the organiser awards the marks from the admin panel.
import { outputsMatch } from './grading.js';

const DEFAULT_LANGUAGE_IDS = { python: 71, java: 62, c: 50 }; // Python 3, Java (OpenJDK), C (GCC) in Judge0 CE

const b64 = (s) => Buffer.from(String(s ?? ''), 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(String(s), 'base64').toString('utf8') : '');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * cfg: { url, authToken, rapidApiKey, langIds, pollMs, maxPolls }
 * deps (for tests): { fetchImpl, sleep }
 */
export function createJudge(cfg = {}, deps = {}) {
  const url = (cfg.url || '').replace(/\/+$/, '');
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const pollMs = cfg.pollMs ?? 700;
  const maxPolls = cfg.maxPolls ?? 40;
  const langIds = { ...DEFAULT_LANGUAGE_IDS, ...(cfg.langIds ?? {}) };
  const mode = url ? 'judge0' : 'manual';

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.authToken) headers['X-Auth-Token'] = cfg.authToken;
  if (cfg.rapidApiKey && url) {
    headers['X-RapidAPI-Key'] = cfg.rapidApiKey;
    headers['X-RapidAPI-Host'] = new URL(url).host;
  }

  async function http(path, options = {}) {
    const res = await fetchImpl(`${url}${path}`, { headers, ...options });
    if (!res.ok) throw new Error(`Judge server answered ${res.status}`);
    return res.json();
  }

  /** Submit one run per stdin and wait for all of them. Returns the Judge0 submissions, or null on timeout. */
  async function runBatch(languageId, code, stdins) {
    const created = await http('/submissions/batch?base64_encoded=true', {
      method: 'POST',
      body: JSON.stringify({
        submissions: stdins.map((stdin) => ({ language_id: languageId, source_code: b64(code), stdin: b64(stdin) })),
      }),
    });
    const tokens = created.map((c) => c.token);
    for (let i = 0; i < maxPolls; i++) {
      const res = await http(`/submissions/batch?base64_encoded=true&fields=*&tokens=${tokens.join(',')}`);
      const subs = res.submissions ?? [];
      if (subs.length === tokens.length && subs.every((s) => (s.status?.id ?? 0) > 2)) return subs;
      await sleep(pollMs);
    }
    return null;
  }

  /**
   * "Run" button: execute the code on the given inputs and return what it printed (nothing is graded).
   * @returns {{status: string, message?: string, runs?: {stdout: string, stderr: string, status: string}[]}}
   */
  async function run({ language, code, inputs }) {
    if (mode === 'manual') {
      return { status: 'unavailable', message: 'Running code needs the Judge0 service, which is not set up. You can still submit your code.' };
    }
    const languageId = langIds[language];
    if (!languageId) return { status: 'judge_error', message: `Unsupported language: ${language}` };
    try {
      const subs = await runBatch(languageId, code, inputs);
      if (!subs) return { status: 'judge_error', message: 'The runner took too long to answer.' };
      const first = subs[0];
      if (first.status?.id === 6) return { status: 'compile_error', message: clip(unb64(first.compile_output) || 'Compilation error', 800) };
      return {
        status: 'ok',
        runs: subs.map((s) => {
          const id = s.status?.id;
          const kind = id === 3 ? 'ok' : id === 5 ? 'timeout' : id >= 7 && id <= 12 ? 'runtime_error' : 'error';
          return {
            status: kind,
            stdout: clip(unb64(s.stdout), 2000),
            stderr: kind === 'ok' ? '' : clip(unb64(s.stderr) || unb64(s.message) || unb64(s.compile_output), 800),
          };
        }),
      };
    } catch (err) {
      return { status: 'judge_error', message: `Could not reach the runner (${err.message}).` };
    }
  }

  /** @returns {{status: string, passed: number, total: number, message: string}} */
  async function judge({ language, code, tests }) {
    const total = tests.length;
    if (mode === 'manual') {
      return { status: 'pending', passed: 0, total, message: 'Saved. The organiser will review your code.' };
    }
    const languageId = langIds[language];
    if (!languageId) return { status: 'judge_error', passed: 0, total, message: `Unsupported language: ${language}` };

    try {
      const created = await http('/submissions/batch?base64_encoded=true', {
        method: 'POST',
        body: JSON.stringify({
          submissions: tests.map((t) => ({ language_id: languageId, source_code: b64(code), stdin: b64(t.input) })),
        }),
      });
      const tokens = created.map((c) => c.token);

      let subs = [];
      for (let i = 0; i < maxPolls; i++) {
        const res = await http(`/submissions/batch?base64_encoded=true&fields=*&tokens=${tokens.join(',')}`);
        subs = res.submissions ?? [];
        if (subs.length === tokens.length && subs.every((s) => (s.status?.id ?? 0) > 2)) break;
        subs = [];
        await sleep(pollMs);
      }
      if (!subs.length) return { status: 'judge_error', passed: 0, total, message: 'The judge took too long to answer.' };

      let passed = 0;
      let runtimeErrors = 0;
      let timeouts = 0;
      let lastError = '';
      for (let i = 0; i < subs.length; i++) {
        const s = subs[i];
        const id = s.status?.id;
        if (id === 6) {
          return { status: 'compile_error', passed: 0, total, message: clip(unb64(s.compile_output) || 'Compilation error', 600) };
        }
        if (id === 13 || id === 14) return { status: 'judge_error', passed: 0, total, message: 'The judge had an internal error.' };
        if (id === 5) timeouts++;
        else if (id >= 7 && id <= 12) {
          runtimeErrors++;
          lastError = clip(unb64(s.stderr) || unb64(s.message) || 'Runtime error', 300);
        } else if (id === 3 && outputsMatch(unb64(s.stdout), tests[i].expected)) passed++;
      }

      if (passed === total) return { status: 'ok', passed, total, message: `All ${total} tests passed.` };
      const base = `Passed ${passed}/${total} tests.`;
      if (runtimeErrors) return { status: 'runtime_error', passed, total, message: `${base} Runtime error: ${lastError}` };
      if (timeouts) return { status: 'timeout', passed, total, message: `${base} Time limit exceeded on some tests.` };
      return { status: 'wrong_answer', passed, total, message: base };
    } catch (err) {
      return { status: 'judge_error', passed: 0, total, message: `Could not reach the judge (${err.message}).` };
    }
  }

  return { mode, judge, run };
}
