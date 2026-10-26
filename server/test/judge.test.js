// Tests the Judge0 client against a fake Judge0 server (no network, no real code execution).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJudge } from '../src/judge.js';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/**
 * Fake Judge0: `behave(sourceCode, stdin)` returns { id, stdout?, stderr?, compile_output? } per test.
 * Stays "processing" for `slowPolls` polls first to exercise the polling loop.
 */
function fakeJudge0({ behave, slowPolls = 0 }) {
  const store = new Map();
  const calls = [];
  let polls = 0;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const u = new URL(url);
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (u.pathname === '/submissions/batch' && options.method === 'POST') {
      const { submissions } = JSON.parse(options.body);
      const tokens = submissions.map((s, i) => {
        const token = `tok${store.size}-${i}`;
        store.set(token, { src: Buffer.from(s.source_code, 'base64').toString(), stdin: Buffer.from(s.stdin, 'base64').toString(), languageId: s.language_id });
        return { token };
      });
      return reply(201, tokens);
    }
    if (u.pathname === '/submissions/batch') {
      polls++;
      const tokens = u.searchParams.get('tokens').split(',');
      const submissions = tokens.map((t) => {
        if (polls <= slowPolls) return { token: t, status: { id: 2 } };
        const { src, stdin } = store.get(t);
        const r = behave(src, stdin);
        return {
          token: t,
          status: { id: r.id },
          stdout: r.stdout === undefined ? null : b64(r.stdout),
          stderr: r.stderr === undefined ? null : b64(r.stderr),
          compile_output: r.compile_output === undefined ? null : b64(r.compile_output),
        };
      });
      return reply(200, { submissions });
    }
    return reply(404, {});
  };
  return { fetchImpl, calls };
}

const tests3 = [
  { input: '5\n1 2 3 4 5\n', expected: '15', sample: true },
  { input: '3\n10 20 30\n', expected: '60' },
  { input: '1\n-7\n', expected: '-7' },
];
const sum = (stdin) => String(stdin.split('\n')[1].split(' ').reduce((a, b) => a + Number(b), 0));
const noSleep = async () => {};
const make = (fake, extra = {}) => createJudge({ url: 'http://judge.local:2358', ...extra }, { fetchImpl: fake.fetchImpl, sleep: noSleep });

test('without JUDGE0_URL the judge is in manual mode and returns "pending"', async () => {
  const j = createJudge({});
  assert.equal(j.mode, 'manual');
  const r = await j.judge({ language: 'python', code: 'print(1)', tests: tests3 });
  assert.equal(r.status, 'pending');
  assert.equal(r.total, 3);
});

test('all tests pass -> ok', async () => {
  const fake = fakeJudge0({ behave: (_s, stdin) => ({ id: 3, stdout: sum(stdin) + '\n' }) });
  const j = make(fake);
  assert.equal(j.mode, 'judge0');
  const r = await j.judge({ language: 'python', code: 'print(sum)', tests: tests3 });
  assert.deepEqual([r.status, r.passed, r.total], ['ok', 3, 3]);
  // language id for Python and base64 encoding were sent
  const post = fake.calls.find((c) => c.options.method === 'POST');
  assert.equal(JSON.parse(post.options.body).submissions[0].language_id, 71);
  assert.ok(post.url.includes('base64_encoded=true'));
});

test('language ids: java=62, c=50 (overridable)', async () => {
  const fake = fakeJudge0({ behave: (_s, stdin) => ({ id: 3, stdout: sum(stdin) }) });
  await make(fake).judge({ language: 'java', code: 'x', tests: tests3 });
  await make(fake, { langIds: { c: 103 } }).judge({ language: 'c', code: 'x', tests: tests3 });
  const ids = fake.calls.filter((c) => c.options.method === 'POST').map((c) => JSON.parse(c.options.body).submissions[0].language_id);
  assert.deepEqual(ids, [62, 103]);
});

test('some tests wrong -> partial result with counts only (no expected output leaked)', async () => {
  const fake = fakeJudge0({ behave: (_s, stdin) => ({ id: 3, stdout: stdin.startsWith('1') ? '0' : sum(stdin) }) });
  const r = await make(fake).judge({ language: 'python', code: 'x', tests: tests3 });
  assert.deepEqual([r.status, r.passed, r.total], ['wrong_answer', 2, 3]);
  assert.ok(!r.message.includes('-7'));
});

test('compile error is reported with the compiler message', async () => {
  const fake = fakeJudge0({ behave: () => ({ id: 6, compile_output: 'main.c:3: error: expected ;' }) });
  const r = await make(fake).judge({ language: 'c', code: 'int main(', tests: tests3 });
  assert.equal(r.status, 'compile_error');
  assert.equal(r.passed, 0);
  assert.match(r.message, /expected ;/);
});

test('runtime error and time limit are told apart', async () => {
  const rt = fakeJudge0({ behave: (_s, stdin) => (stdin.startsWith('3') ? { id: 11, stderr: 'ZeroDivisionError' } : { id: 3, stdout: sum(stdin) }) });
  const r1 = await make(rt).judge({ language: 'python', code: 'x', tests: tests3 });
  assert.deepEqual([r1.status, r1.passed], ['runtime_error', 2]);
  assert.match(r1.message, /ZeroDivisionError/);

  const tle = fakeJudge0({ behave: (_s, stdin) => (stdin.startsWith('3') ? { id: 5 } : { id: 3, stdout: sum(stdin) }) });
  const r2 = await make(tle).judge({ language: 'python', code: 'x', tests: tests3 });
  assert.deepEqual([r2.status, r2.passed], ['timeout', 2]);
});

test('polls until the judge finishes processing', async () => {
  const fake = fakeJudge0({ slowPolls: 3, behave: (_s, stdin) => ({ id: 3, stdout: sum(stdin) }) });
  const r = await make(fake).judge({ language: 'python', code: 'x', tests: tests3 });
  assert.equal(r.status, 'ok');
  assert.ok(fake.calls.filter((c) => c.options.method !== 'POST').length >= 4);
});

test('gives up with judge_error when the judge never finishes or is unreachable', async () => {
  const stuck = fakeJudge0({ slowPolls: 1e9, behave: () => ({ id: 3, stdout: '' }) });
  const r1 = await make(stuck, { maxPolls: 5 }).judge({ language: 'python', code: 'x', tests: tests3 });
  assert.equal(r1.status, 'judge_error');

  const down = createJudge({ url: 'http://nowhere' }, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); }, sleep: noSleep });
  const r2 = await down.judge({ language: 'python', code: 'x', tests: tests3 });
  assert.equal(r2.status, 'judge_error');
  assert.match(r2.message, /ECONNREFUSED/);
});

test('auth headers: token for self-hosted, RapidAPI key + host for the hosted API', async () => {
  const fake = fakeJudge0({ behave: (_s, stdin) => ({ id: 3, stdout: sum(stdin) }) });
  await make(fake, { authToken: 'secret-token' }).judge({ language: 'python', code: 'x', tests: tests3 });
  assert.equal(fake.calls[0].options.headers['X-Auth-Token'], 'secret-token');

  const fake2 = fakeJudge0({ behave: (_s, stdin) => ({ id: 3, stdout: sum(stdin) }) });
  const j = createJudge({ url: 'https://judge0-ce.p.rapidapi.com', rapidApiKey: 'abc' }, { fetchImpl: fake2.fetchImpl, sleep: noSleep });
  await j.judge({ language: 'python', code: 'x', tests: tests3 });
  assert.equal(fake2.calls[0].options.headers['X-RapidAPI-Key'], 'abc');
  assert.equal(fake2.calls[0].options.headers['X-RapidAPI-Host'], 'judge0-ce.p.rapidapi.com');
});

test('run(): returns what the program printed for each input, without grading', async () => {
  const fake = fakeJudge0({ behave: (_s, stdin) => ({ id: 3, stdout: sum(stdin) + '\n' }) });
  const r = await make(fake).run({ language: 'python', code: 'x', inputs: ['5\n1 2 3 4 5\n', '1\n-7\n'] });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.runs.map((x) => x.stdout.trim()), ['15', '-7']);
});

test('run(): compile errors, runtime errors and manual mode', async () => {
  const ce = fakeJudge0({ behave: () => ({ id: 6, compile_output: 'bad syntax' }) });
  assert.equal((await make(ce).run({ language: 'c', code: 'x', inputs: [''] })).status, 'compile_error');

  const rt = fakeJudge0({ behave: () => ({ id: 11, stderr: 'boom' }) });
  const r = await make(rt).run({ language: 'python', code: 'x', inputs: [''] });
  assert.deepEqual([r.runs[0].status, r.runs[0].stderr], ['runtime_error', 'boom']);

  assert.equal((await createJudge({}).run({ language: 'python', code: 'x', inputs: [''] })).status, 'unavailable');
});
