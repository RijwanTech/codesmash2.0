import crypto from 'node:crypto';
import { Router } from 'express';
import { Attempt, Notification, Round } from '../models.js';
import { config } from '../config.js';
import { LANGUAGES } from '../constants.js';
import { requireStudent } from '../middleware.js';
import { activity, scheduleChanged } from '../realtime.js';
import { ah, HttpError } from '../utils.js';
import { attemptScore, attemptTime, isQualified, maxScore, roundMs, ts } from '../scoring.js';
import { expireAttempts, finalizeAttempt } from '../competition.js';
import { serializeNotification } from '../notify.js';
import { effectiveCount, idOf, outputsMatch, pickItems, poolFor } from '../grading.js';
import { createJudge } from '../judge.js';
import { getRegistration } from '../registration.js';

export const judge = createJudge(config.judge);

/* ------------------------------------------------------------------ helpers */

const roundPublic = (r) => ({
  n: r.n,
  type: r.type,
  name: r.name,
  durationMin: r.durationMin,
  status: r.status,
  problemCount: effectiveCount(r),
  maxScore: maxScore(r),
  needsLanguage: r.type !== 'quiz',
  maxViolations: r.maxViolations ?? 0,
  marksPerQuestion: r.marksPerQuestion ?? 0,
});

const sameSecret = (a, b) => {
  const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

// Brute-force guard for round passwords: 8 wrong tries per student per 10 minutes.
const wrongPasswords = new Map();
function checkPasswordLock(studentId) {
  const f = wrongPasswords.get(studentId);
  if (f && f.until > Date.now() && f.count >= 8) {
    throw new HttpError(429, 'Too many wrong passwords. Please wait a few minutes and ask the organiser for the password.');
  }
}
function recordWrongPassword(studentId) {
  const now = Date.now();
  const f = wrongPasswords.get(studentId);
  if (!f || f.until < now) wrongPasswords.set(studentId, { count: 1, until: now + 10 * 60000 });
  else f.count++;
}

// Judging calls an external service; keep students from hammering it.
const lastSubmit = new Map();

function summarize(attempt, round, now) {
  return {
    status: attempt.endedAt ? 'finished' : 'running',
    score: attemptScore(attempt),
    maxScore: maxScore(round, attempt.language ?? null),
    timeMs: attemptTime(attempt, round, now),
    violations: attempt.violations?.length ?? 0,
    startedAt: ts(attempt.startedAt),
    deadline: ts(attempt.startedAt) + roundMs(round),
    language: attempt.language ?? null,
  };
}

/** What the student sees while the attempt is running. Correct answers are never included. */
function buildItems(round, attempt) {
  const answers = attempt.answers || {};
  if (round.type === 'quiz') {
    const byId = new Map(round.quiz.map((q) => [idOf(q), q]));
    return (attempt.order || [])
      .map((id) => byId.get(id) && { id, text: byId.get(id).text, options: byId.get(id).options, answer: Number.isInteger(answers[id]) ? answers[id] : null })
      .filter(Boolean);
  }
  if (round.type === 'codefix') {
    const byId = new Map(round.fixes.map((f) => [idOf(f), f]));
    return (attempt.order || [])
      .map((id) => {
        const fix = byId.get(id);
        const variant = fix?.variants.find((v) => v.language === attempt.language);
        return fix && variant && { id, title: fix.title, description: fix.description, wrongCode: variant.wrongCode, answer: typeof answers[id] === 'string' ? answers[id] : '' };
      })
      .filter(Boolean);
  }
  return round.problems.map((p) => {
    const id = idOf(p);
    return {
      id,
      title: p.title,
      statement: p.statement,
      points: p.points,
      samples: p.tests.filter((t) => t.sample).map((t) => ({ input: t.input, expected: t.expected })),
      answer: typeof answers[id] === 'string' ? answers[id] : '',
      verdict: attempt.verdicts?.[id] ?? null,
      earned: Number(attempt.points?.[id]) || 0,
    };
  });
}

/** Per-question results shown after the attempt ended. */
function buildResults(round, attempt) {
  const points = attempt.points || {};
  if (round.type === 'codefix') {
    const byId = new Map(round.fixes.map((f) => [idOf(f), f]));
    return (attempt.order || []).map((id) => ({ id, title: byId.get(id)?.title ?? 'Question', earned: Number(points[id]) || 0, max: round.marksPerQuestion }));
  }
  if (round.type === 'coding') {
    return round.problems.map((p) => ({ id: idOf(p), title: p.title, earned: Number(points[idOf(p)]) || 0, max: p.points, verdict: attempt.verdicts?.[idOf(p)] ?? null }));
  }
  return null; // quiz: only the total score is shown
}

function detail(round, attempt, student, allowed, now) {
  const out = {
    ...roundPublic(round),
    allowed,
    serverNow: now,
    attempt: attempt ? summarize(attempt, round, now) : null,
    items: null,
    results: null,
    summary: null,
    judgeMode: judge.mode,
  };
  if (attempt && !attempt.endedAt) out.items = buildItems(round, attempt);
  else if (attempt) {
    out.results = buildResults(round, attempt);
    if (round.type === 'quiz') {
      const answered = Object.keys(attempt.answers || {}).length;
      out.summary = { answered, total: (attempt.order || []).length };
    }
  }
  return out;
}

async function loadRoundContext(student, n) {
  await expireAttempts(student._id);
  const rounds = await Round.find().sort({ n: 1 }).lean();
  const round = rounds.find((r) => r.n === n);
  if (!round) throw new HttpError(404, 'Round not found.');
  const attempts = await Attempt.find({ student: student._id }).lean();
  const byRound = new Map(attempts.map((a) => [a.round, a]));
  const prev = rounds.find((r) => r.n === n - 1);
  const allowed = n === 1 || (!!prev && isQualified(student, prev, byRound.get(prev.n)));
  return { rounds, round, attempt: byRound.get(n) ?? null, allowed };
}

/* ------------------------------------------------------------------ public routes */

export const publicRouter = Router();

publicRouter.get(
  '/rounds',
  ah(async (_req, res) => {
    const rounds = await Round.find().sort({ n: 1 }).lean();
    res.json({ rounds: rounds.map(roundPublic) });
  }),
);

publicRouter.get(
  '/registration',
  ah(async (_req, res) => {
    const reg = await getRegistration();
    res.json({ open: reg.effectiveOpen, closesAt: reg.closesAt, deadlinePassed: reg.deadlinePassed });
  }),
);

/* ------------------------------------------------------------------ student routes */

const router = Router();
router.use(requireStudent);

router.get(
  '/rounds',
  ah(async (req, res) => {
    const student = req.student;
    await expireAttempts(student._id);
    const rounds = await Round.find().sort({ n: 1 }).lean();
    const attempts = await Attempt.find({ student: student._id }).lean();
    const byRound = new Map(attempts.map((a) => [a.round, a]));
    const now = Date.now();
    res.json({
      serverNow: now,
      rounds: rounds.map((r) => {
        const prev = rounds.find((x) => x.n === r.n - 1);
        const allowed = r.n === 1 || (!!prev && isQualified(student, prev, byRound.get(prev.n)));
        const a = byRound.get(r.n);
        return { ...roundPublic(r), allowed, attempt: a ? summarize(a, r, now) : null };
      }),
    });
  }),
);

router.get(
  '/rounds/:n',
  ah(async (req, res) => {
    const ctx = await loadRoundContext(req.student, Number(req.params.n));
    const out = detail(ctx.round, ctx.attempt, req.student, ctx.allowed, Date.now());
    // Languages that actually have questions (code-correction round), so the picker only offers valid choices.
    out.languages = LANGUAGES.filter((l) => ctx.round.type !== 'codefix' || poolFor(ctx.round, l).length > 0);
    res.json(out);
  }),
);

/** Validate and store answers: quiz = option index (or null to clear), other rounds = code text. */
async function saveAnswers(round, attempt, incoming) {
  if (!incoming || typeof incoming !== 'object') throw new HttpError(400, 'Nothing to save.');
  const allowed = new Set(attempt.order);
  const quizById = new Map(round.quiz.map((q) => [idOf(q), q]));
  const $set = {};
  const $unset = {};
  for (const [id, value] of Object.entries(incoming)) {
    if (!allowed.has(id)) continue;
    if (round.type === 'quiz') {
      const q = quizById.get(id);
      if (value === null) $unset[`answers.${id}`] = '';
      else if (q && Number.isInteger(value) && value >= 0 && value < q.options.length) $set[`answers.${id}`] = value;
    } else if (typeof value === 'string') {
      $set[`answers.${id}`] = value.slice(0, 20000);
    }
  }
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  if (Object.keys(update).length) await Attempt.updateOne({ _id: attempt._id, endedAt: null }, update);
}

/** Start a round: needs the organiser's round password (and a language for rounds 2 and 3). */
router.post(
  '/rounds/:n/start',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    const student = req.student;
    const ctx = await loadRoundContext(student, n);
    const { round } = ctx;
    if (ctx.attempt) throw new HttpError(409, 'You have already attempted this round.');
    if (!ctx.allowed) throw new HttpError(403, 'You have not qualified for this round.');
    if (round.status !== 'open') throw new HttpError(409, 'This round is not open right now.');

    if (req.body?.agreed !== true) throw new HttpError(400, 'Please read the rules and tick "Yes, I understand" before starting.');
    checkPasswordLock(String(student._id));
    const given = String(req.body?.password ?? '').trim();
    if (!given || !sameSecret(given, String(round.password ?? '').trim())) {
      recordWrongPassword(String(student._id));
      throw new HttpError(403, 'Incorrect round password. Ask the organiser for the password for this round.');
    }

    let language = null;
    if (round.type !== 'quiz') {
      language = String(req.body?.language ?? '').toLowerCase();
      if (!LANGUAGES.includes(language)) throw new HttpError(400, 'Please choose a programming language.');
    }
    const order = pickItems(round, language);
    if (!order.length) {
      throw new HttpError(409, language ? `No questions are available in ${language} yet. Tell the organiser.` : 'This round has no questions yet.');
    }

    let attempt;
    try {
      attempt = (
        await Attempt.create({ student: student._id, round: n, startedAt: new Date(), language, order, answers: {}, points: {} })
      ).toObject();
    } catch (err) {
      if (err?.code === 11000) throw new HttpError(409, 'You have already attempted this round.');
      throw err;
    }
    activity(`${student.name} started ${round.name}${language ? ` (${language})` : ''}`);
    scheduleChanged('attempt-started');
    res.json(detail(round, attempt, student, true, Date.now()));
  }),
);

/**
 * Save answers while the round runs (quiz: chosen option index, other rounds: code).
 * Body: { answers: { <itemId>: value } }. Nothing is revealed; grading happens when the attempt ends.
 */
router.put(
  '/rounds/:n/answers',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    const ctx = await loadRoundContext(req.student, n);
    const { round, attempt } = ctx;
    if (!attempt || attempt.endedAt || Date.now() >= ts(attempt.startedAt) + roundMs(round)) {
      throw new HttpError(409, 'This round is no longer running for you.');
    }
    await saveAnswers(round, attempt, req.body?.answers);
    res.json({ ok: true });
  }),
);

/** Coding round: judge one problem. Returns the verdict and the marks earned for that problem. */
router.post(
  '/rounds/:n/problems/:pid/submit',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    const pid = String(req.params.pid);
    const code = String(req.body?.code ?? '').slice(0, 20000);
    if (!code.trim()) throw new HttpError(400, 'Please write some code first.');

    const sid = String(req.student._id);
    if (Date.now() - (lastSubmit.get(sid) ?? 0) < 4000) {
      throw new HttpError(429, 'Please wait a few seconds before submitting again.');
    }
    lastSubmit.set(sid, Date.now());

    const ctx = await loadRoundContext(req.student, n);
    const { round, attempt } = ctx;
    if (round.type !== 'coding') throw new HttpError(400, 'This round does not take code submissions.');
    const problem = round.problems.find((p) => idOf(p) === pid);
    if (!problem) throw new HttpError(404, 'Problem not found.');
    const submittedAt = Date.now();
    if (!attempt || attempt.endedAt || submittedAt >= ts(attempt.startedAt) + roundMs(round)) {
      throw new HttpError(409, 'This round is no longer running for you.');
    }

    const result = problem.tests.length
      ? await judge.judge({ language: attempt.language, code, tests: problem.tests })
      : { status: 'pending', passed: 0, total: 0, message: 'Saved. The organiser will review your code.' };

    const verdict = { status: result.status, passed: result.passed, total: result.total, message: result.message, at: submittedAt };
    const previous = Number(attempt.points?.[pid]) || 0;
    const $set = { [`answers.${pid}`]: code };

    if (result.status === 'judge_error') {
      await Attempt.updateOne({ _id: attempt._id, endedAt: null }, { $set });
      throw new HttpError(502, `${result.message} Your code was saved — please try submitting again in a moment.`);
    }

    $set[`verdicts.${pid}`] = verdict;
    let earned = previous;
    if (result.status !== 'pending' && result.total > 0) {
      const now = Math.round((problem.points * result.passed) / result.total);
      if (now > previous) {
        earned = now;
        $set[`points.${pid}`] = now;
        $set[`solved.${pid}`] = submittedAt - ts(attempt.startedAt);
      }
    }
    await Attempt.updateOne({ _id: attempt._id, endedAt: null }, { $set });

    if (earned > previous) {
      activity(`${req.student.name} scored ${earned}/${problem.points} on "${problem.title}" in ${round.name}`);
      scheduleChanged('solve');
    }
    const score = attemptScore({ points: { ...(attempt.points || {}), [pid]: earned } });
    res.json({ verdict, earned, max: problem.points, score });
  }),
);

/**
 * "Run" button: execute the student's code on the sample inputs (or on an input they type) and show the output.
 * Nothing is graded or saved as a score; hidden tests are never revealed.
 */
const lastRun = new Map();
router.post(
  '/rounds/:n/problems/:pid/run',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    const pid = String(req.params.pid);
    const code = String(req.body?.code ?? '').slice(0, 20000);
    if (!code.trim()) throw new HttpError(400, 'Please write some code first.');
    const custom = typeof req.body?.input === 'string' ? req.body.input.slice(0, 5000) : null;

    const sid = String(req.student._id);
    if (Date.now() - (lastRun.get(sid) ?? 0) < 2000) throw new HttpError(429, 'Please wait a moment before running again.');
    lastRun.set(sid, Date.now());

    const { round, attempt } = await loadRoundContext(req.student, n);
    if (round.type !== 'coding') throw new HttpError(400, 'This round does not take code.');
    const problem = round.problems.find((p) => idOf(p) === pid);
    if (!problem) throw new HttpError(404, 'Problem not found.');
    if (!attempt || attempt.endedAt || Date.now() >= ts(attempt.startedAt) + roundMs(round)) {
      throw new HttpError(409, 'This round is no longer running for you.');
    }

    const samples = problem.tests.filter((t) => t.sample);
    const cases = custom !== null ? [{ input: custom, expected: null }] : samples.map((t) => ({ input: t.input, expected: t.expected }));
    if (!cases.length) throw new HttpError(400, 'This problem has no sample input. Type your own input to test.');

    const result = await judge.run({ language: attempt.language, code, inputs: cases.map((c) => c.input) });
    if (result.status === 'unavailable') throw new HttpError(503, result.message);
    if (result.status !== 'ok') return res.json({ status: result.status, message: result.message, runs: [] });
    res.json({
      status: 'ok',
      runs: result.runs.map((r, i) => ({
        input: cases[i].input,
        expected: cases[i].expected,
        output: r.stdout,
        error: r.stderr,
        status: r.status,
        passed: cases[i].expected === null ? null : r.status === 'ok' && outputsMatch(r.stdout, cases[i].expected),
      })),
    });
  }),
);

/**
 * The browser reports rule violations (left full screen, switched tab ...). They are stored for the organiser, and when
 * the round has a violation limit the attempt is submitted automatically once it is reached.
 */
const lastViolation = new Map();
router.post(
  '/rounds/:n/violation',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    const type = ['fullscreen_exit', 'tab_hidden', 'window_blur', 'devtools_key'].includes(req.body?.type) ? req.body.type : 'other';
    const ctx = await loadRoundContext(req.student, n);
    const { round, attempt } = ctx;
    if (!attempt || attempt.endedAt) return res.json({ count: attempt?.violations?.length ?? 0, max: round.maxViolations ?? 0, ended: !!attempt?.endedAt });

    const key = `${req.student._id}:${n}:${type}`;
    const now = Date.now();
    if (now - (lastViolation.get(key) ?? 0) < 1500) {
      return res.json({ count: attempt.violations?.length ?? 0, max: round.maxViolations ?? 0, ended: false }); // same event reported twice
    }
    lastViolation.set(key, now);

    const updated = await Attempt.findOneAndUpdate(
      { _id: attempt._id, endedAt: null, 'violations.199': { $exists: false } },
      { $push: { violations: { type, at: now } } },
      { new: true },
    ).lean();
    const count = updated?.violations?.length ?? attempt.violations?.length ?? 0;
    activity(`⚠ ${req.student.name} broke an exam rule in ${round.name} (${type.replace('_', ' ')}) – ${count} so far`);
    scheduleChanged('violation');

    const max = round.maxViolations ?? 0;
    let ended = false;
    if (max > 0 && count >= max) {
      await finalizeAttempt(updated ?? attempt, round, Math.min(now, ts(attempt.startedAt) + roundMs(round)));
      ended = true;
    }
    res.json({ count, max, ended });
  }),
);

router.post(
  '/rounds/:n/finish',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    let ctx = await loadRoundContext(req.student, n);
    if (!ctx.attempt) throw new HttpError(409, 'You have not started this round.');
    if (!ctx.attempt.endedAt) {
      const end = Math.min(Date.now(), ts(ctx.attempt.startedAt) + roundMs(ctx.round));
      // Answers typed in the last moments (or that failed to autosave) travel with the submit request.
      if (req.body?.answers && typeof req.body.answers === 'object' && ctx.round.type !== 'coding') {
        await saveAnswers(ctx.round, ctx.attempt, req.body.answers).catch(() => {});
      }
      await finalizeAttempt(ctx.attempt, ctx.round, end);
      ctx = await loadRoundContext(req.student, n);
    }
    res.json(detail(ctx.round, ctx.attempt, req.student, ctx.allowed, Date.now()));
  }),
);

router.get(
  '/notifications',
  ah(async (req, res) => {
    const [items, unread] = await Promise.all([
      Notification.find({ student: req.student._id }).sort({ createdAt: -1 }).limit(100).lean(),
      Notification.countDocuments({ student: req.student._id, read: false }),
    ]);
    res.json({ items: items.map(serializeNotification), unread });
  }),
);

router.post(
  '/notifications/read',
  ah(async (req, res) => {
    const filter = { student: req.student._id, read: false };
    if (Array.isArray(req.body?.ids) && req.body.ids.length) filter._id = { $in: req.body.ids.slice(0, 200) };
    await Notification.updateMany(filter, { $set: { read: true } });
    res.json({ ok: true });
  }),
);

export default router;
