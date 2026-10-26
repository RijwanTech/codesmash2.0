import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Attempt, Notification, Round, Student } from '../models.js';
import { CONTENT_FIELD, LANGUAGES } from '../constants.js';
import { requireAdmin } from '../middleware.js';
import { activity, scheduleChanged } from '../realtime.js';
import { ah, csvCell, HttpError } from '../utils.js';
import { attemptScore, maxScore, ts } from '../scoring.js';
import { effectiveCount, idOf, maxForItem, normalizeCode } from '../grading.js';
import { getStandings, setOverride, setRoundStatus, syncResults, expireAttempts } from '../competition.js';
import { computeRoundBoard } from '../standings.js';
import { notifyStudent } from '../notify.js';
import { mailEnabled } from '../mailer.js';
import { getRegistration, setRegistration } from '../registration.js';
import { judge } from './student.js';

const router = Router();
router.use(requireAdmin);

const fmt = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
};
const str = (v) => String(v ?? '').trim();

/* ------------------------------------------------------------------ views */

const roundView = (r) => ({
  n: r.n,
  type: r.type,
  name: r.name,
  durationMin: r.durationMin,
  qualifyScore: r.qualifyScore,
  questionCount: r.questionCount ?? 0,
  marksPerQuestion: r.marksPerQuestion ?? 0,
  password: r.password ?? '',
  maxViolations: r.maxViolations ?? 0,
  status: r.status,
  maxScore: maxScore(r),
  itemCount: effectiveCount(r),
  quiz: (r.quiz ?? []).map((q) => ({ id: idOf(q), text: q.text, options: q.options, correct: q.correct })),
  fixes: (r.fixes ?? []).map((f) => ({
    id: idOf(f),
    title: f.title,
    description: f.description ?? '',
    variants: f.variants.map((v) => ({ language: v.language, wrongCode: v.wrongCode, correctCode: v.correctCode })),
  })),
  problems: (r.problems ?? []).map((p) => ({
    id: idOf(p),
    title: p.title,
    statement: p.statement,
    points: p.points,
    tests: p.tests.map((t) => ({ input: t.input, expected: t.expected, sample: !!t.sample })),
  })),
});

const studentView = (s) => ({ id: String(s._id), name: s.name, rollNo: s.rollNo, email: s.email, year: s.year, source: s.source });

/* ------------------------------------------------------------------ content validation */

function parseItem(type, body) {
  if (type === 'quiz') {
    const text = str(body?.text);
    const options = Array.isArray(body?.options) ? body.options.map(str) : [];
    if (!text) throw new HttpError(400, 'The question text is required.');
    if (options.length < 2 || options.length > 6) throw new HttpError(400, 'A question needs 2 to 6 options.');
    if (options.some((o) => !o)) throw new HttpError(400, 'Fill in every option, or remove the empty ones.');
    const correct = Number(body?.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      throw new HttpError(400, 'Choose which option is correct.');
    }
    return { text, options, correct };
  }

  if (type === 'codefix') {
    const title = str(body?.title);
    if (!title) throw new HttpError(400, 'The title is required.');
    const input = Array.isArray(body?.variants)
      ? Object.fromEntries(body.variants.map((v) => [v.language, v]))
      : (body?.variants ?? {});
    const variants = [];
    for (const language of LANGUAGES) {
      const v = input[language];
      const wrongCode = String(v?.wrongCode ?? '').replace(/\r\n?/g, '\n');
      const correctCode = String(v?.correctCode ?? '').replace(/\r\n?/g, '\n');
      if (!wrongCode.trim() && !correctCode.trim()) continue;
      if (!wrongCode.trim() || !correctCode.trim()) {
        throw new HttpError(400, `${language}: give both the wrong code and the correct code (or leave both empty).`);
      }
      if (normalizeCode(wrongCode, language) === normalizeCode(correctCode, language)) {
        throw new HttpError(400, `${language}: the wrong code and the correct code are the same.`);
      }
      variants.push({ language, wrongCode, correctCode });
    }
    if (!variants.length) throw new HttpError(400, 'Add the code for at least one language.');
    return { title, description: str(body?.description), variants };
  }

  // coding
  const title = str(body?.title);
  const statement = str(body?.statement);
  const points = Number(body?.points);
  if (!title || !statement) throw new HttpError(400, 'Title and problem statement are required.');
  if (!Number.isFinite(points) || points < 1 || points > 1000) throw new HttpError(400, 'Points must be between 1 and 1000.');
  const testsIn = Array.isArray(body?.tests) ? body.tests : [];
  if (testsIn.length < 1 || testsIn.length > 20) throw new HttpError(400, 'Add between 1 and 20 test cases.');
  const tests = testsIn.map((t, i) => {
    const expected = String(t?.expected ?? '').replace(/\r\n?/g, '\n').trimEnd();
    if (!expected) throw new HttpError(400, `Test ${i + 1}: the expected output is required.`);
    return { input: String(t?.input ?? '').replace(/\r\n?/g, '\n'), expected, sample: !!t?.sample };
  });
  if (!tests.some((t) => t.sample)) tests[0].sample = true; // students need at least one example
  return { title, statement, points, tests };
}

async function findRound(n) {
  const round = await Round.findOne({ n: Number(n) });
  if (!round) throw new HttpError(404, 'Round not found.');
  return round;
}

const randomPassword = (len = 8) => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters
  return Array.from({ length: len }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
};

/* ------------------------------------------------------------------ overview */

router.get(
  '/overview',
  ah(async (_req, res) => {
    await expireAttempts();
    const [{ rounds, standings }, registration] = await Promise.all([getStandings(), getRegistration()]);
    res.json({
      participants: standings.length,
      participating: standings.filter((s) => s.participated).length,
      spot: standings.filter((s) => s.source === 'spot').length,
      emailEnabled: mailEnabled,
      judgeMode: judge.mode,
      registrationOpen: registration.effectiveOpen,
      rounds: rounds.map((r, i) => {
        const stats = standings.map((s) => s.stats[i]);
        return {
          n: r.n,
          type: r.type,
          name: r.name,
          status: r.status,
          problems: effectiveCount(r),
          hasPassword: !!r.password,
          attempted: stats.filter((x) => x.attempted).length,
          running: stats.filter((x) => x.attempted && !x.finished).length,
          finished: stats.filter((x) => x.finished).length,
          qualified: stats.filter((x) => x.qualified).length,
        };
      }),
    });
  }),
);

/* ------------------------------------------------------------------ registration & spot registration */

router.get(
  '/registration',
  ah(async (_req, res) => {
    const reg = await getRegistration();
    const [online, spot] = await Promise.all([
      Student.countDocuments({ source: { $ne: 'spot' } }),
      Student.countDocuments({ source: 'spot' }),
    ]);
    res.json({ ...reg, online, spot });
  }),
);

router.put(
  '/registration',
  ah(async (req, res) => {
    const open = req.body?.open === true;
    let closesAt = null;
    if (req.body?.closesAt) {
      const d = new Date(req.body.closesAt);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'That deadline is not a valid date and time.');
      closesAt = d;
    }
    const reg = await setRegistration({ open, closesAt });
    activity(reg.effectiveOpen ? 'Registration opened' : 'Registration closed');
    scheduleChanged('registration-setting');
    res.json(reg);
  }),
);

router.post(
  '/spot-register',
  ah(async (req, res) => {
    const name = str(req.body?.name);
    const rollNo = str(req.body?.rollNo).toUpperCase();
    const email = str(req.body?.email).toLowerCase();
    const year = ['FE', 'SE', 'TE', 'BE'].includes(req.body?.year) ? req.body.year : 'FE';
    const given = String(req.body?.password ?? '');
    if (name.length < 2) throw new HttpError(400, 'Please enter the participant\'s full name.');
    if (!rollNo) throw new HttpError(400, 'Roll number / PRN is required.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'That email address is not valid (or leave it empty).');
    if (given && given.length < 6) throw new HttpError(400, 'A password needs at least 6 characters (or leave it empty to generate one).');
    if (await Student.exists({ rollNo })) throw new HttpError(409, 'This roll number is already registered.');

    const password = given || randomPassword();
    const student = await Student.create({
      name,
      rollNo,
      email,
      year,
      source: 'spot',
      passwordHash: await bcrypt.hash(password, 10),
    });
    activity(`${student.name} (${student.rollNo}) added by spot registration`);
    scheduleChanged('registration');
    res.status(201).json({ student: studentView(student), password });
  }),
);

/* ------------------------------------------------------------------ rounds */

router.get(
  '/rounds',
  ah(async (_req, res) => {
    const rounds = await Round.find().sort({ n: 1 }).lean();
    res.json({ rounds: rounds.map(roundView), judgeMode: judge.mode });
  }),
);

router.put(
  '/rounds/:n',
  ah(async (req, res) => {
    const round = await findRound(req.params.n);
    const name = str(req.body?.name);
    const durationMin = Math.round(Number(req.body?.durationMin));
    const qualifyScore = Number(req.body?.qualifyScore);
    const questionCount = Math.round(Number(req.body?.questionCount ?? round.questionCount ?? 0));
    const marksPerQuestion = Number(req.body?.marksPerQuestion ?? round.marksPerQuestion ?? 0);
    const password = str(req.body?.password);
    const maxViolations = Math.round(Number(req.body?.maxViolations ?? round.maxViolations ?? 0));

    if (!name) throw new HttpError(400, 'Round name cannot be empty.');
    if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > 600) throw new HttpError(400, 'Duration must be between 1 and 600 minutes.');
    if (!Number.isFinite(qualifyScore) || qualifyScore < 0) throw new HttpError(400, 'Qualifying score must be 0 or more.');
    if (!Number.isFinite(questionCount) || questionCount < 0 || questionCount > 200) throw new HttpError(400, 'Number of questions must be between 0 and 200 (0 = all).');
    if (!Number.isFinite(marksPerQuestion) || marksPerQuestion < 0 || marksPerQuestion > 1000) throw new HttpError(400, 'Marks per question must be between 0 and 1000.');
    if (!Number.isFinite(maxViolations) || maxViolations < 0 || maxViolations > 50) throw new HttpError(400, 'Violation limit must be between 0 (never auto-submit) and 50.');
    if (password.length > 60) throw new HttpError(400, 'The password is too long (max 60 characters).');
    if (round.status === 'open' && !password) throw new HttpError(400, 'A round that is open must keep a password.');

    const scoreChanged = round.qualifyScore !== qualifyScore;
    Object.assign(round, { name, durationMin, qualifyScore, questionCount, marksPerQuestion, password, maxViolations });
    await round.save();
    if (scoreChanged) await syncResults(round.n); // notify anyone whose outcome changed
    scheduleChanged('round-settings');
    res.json({ round: roundView(round.toObject()) });
  }),
);

router.post(
  '/rounds/:n/status',
  ah(async (req, res) => {
    const status = req.body?.status;
    if (!['upcoming', 'open', 'closed'].includes(status)) throw new HttpError(400, 'Invalid status.');
    const round = await setRoundStatus(Number(req.params.n), status);
    res.json({ round: roundView(round.toObject()) });
  }),
);

/* ------------------------------------------------------------------ round content (questions / problems) */

router.post(
  '/rounds/:n/items',
  ah(async (req, res) => {
    const round = await findRound(req.params.n);
    round[CONTENT_FIELD[round.type]].push(parseItem(round.type, req.body));
    await round.save();
    scheduleChanged('content');
    res.status(201).json({ round: roundView(round.toObject()) });
  }),
);

// Add many quiz questions at once (all-or-nothing, so a typo never leaves half of them imported).
router.post(
  '/rounds/:n/items/bulk',
  ah(async (req, res) => {
    const round = await findRound(req.params.n);
    if (round.type !== 'quiz') throw new HttpError(400, 'Bulk import is only available for the quiz round.');
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) throw new HttpError(400, 'Nothing to import.');
    if (items.length > 200) throw new HttpError(400, 'Import at most 200 questions at a time.');
    const parsed = items.map((it, i) => {
      try {
        return parseItem('quiz', it);
      } catch (e) {
        throw new HttpError(400, `Question ${i + 1}: ${e.message}`);
      }
    });
    round.quiz.push(...parsed);
    await round.save();
    scheduleChanged('content');
    res.status(201).json({ added: parsed.length, round: roundView(round.toObject()) });
  }),
);

router.put(
  '/rounds/:n/items/:id',
  ah(async (req, res) => {
    const round = await findRound(req.params.n);
    const item = round[CONTENT_FIELD[round.type]].id(req.params.id);
    if (!item) throw new HttpError(404, 'Item not found.');
    item.set(parseItem(round.type, req.body));
    await round.save();
    scheduleChanged('content');
    res.json({ round: roundView(round.toObject()) });
  }),
);

router.delete(
  '/rounds/:n/items/:id',
  ah(async (req, res) => {
    const round = await findRound(req.params.n);
    const list = round[CONTENT_FIELD[round.type]];
    if (!list.id(req.params.id)) throw new HttpError(404, 'Item not found.');
    list.pull({ _id: req.params.id });
    await round.save();
    scheduleChanged('content');
    res.json({ round: roundView(round.toObject()) });
  }),
);

// Remove every quiz question / fix / problem of a round (handy before importing a fresh set).
router.delete(
  '/rounds/:n/items',
  ah(async (req, res) => {
    const round = await findRound(req.params.n);
    if (round.status !== 'upcoming') throw new HttpError(400, 'You can only clear the content of a round that has not opened yet.');
    round[CONTENT_FIELD[round.type]] = [];
    await round.save();
    scheduleChanged('content');
    res.json({ round: roundView(round.toObject()) });
  }),
);

/* ------------------------------------------------------------------ leaderboard (organiser only) */

router.get(
  '/leaderboard',
  ah(async (req, res) => {
    await expireAttempts();
    const { rounds, standings } = await getStandings();
    const roundN = Number(req.query.round) || 0;
    const base = { rounds: rounds.map((r) => ({ n: r.n, name: r.name, qualifyScore: r.qualifyScore, type: r.type })) };
    if (roundN > 0) {
      const board = computeRoundBoard(standings, roundN).map((row) => ({
        ...row,
        violations: standings.find((s) => s.id === row.id)?.stats.find((x) => x.n === roundN)?.violations ?? 0,
      }));
      return res.json({ ...base, scope: roundN, rows: board });
    }
    res.json({ ...base, scope: 0, rows: standings.filter((s) => s.participated) });
  }),
);

/* ------------------------------------------------------------------ participants */

router.get(
  '/participants',
  ah(async (_req, res) => {
    await expireAttempts();
    const { rounds, standings } = await getStandings();
    res.json({ rounds: rounds.map((r) => ({ n: r.n, name: r.name, type: r.type })), rows: standings });
  }),
);

router.patch(
  '/participants/:id/override',
  ah(async (req, res) => {
    const n = Number(req.body?.round);
    const v = req.body?.value;
    if (!Number.isInteger(n)) throw new HttpError(400, 'Round is required.');
    if (v !== true && v !== false && v !== null) throw new HttpError(400, 'Value must be true, false or null.');
    await setOverride(req.params.id, n, v === null ? undefined : v);
    res.json({ ok: true });
  }),
);

router.post(
  '/participants/:id/password',
  ah(async (req, res) => {
    const given = String(req.body?.password ?? '');
    if (given && given.length < 6) throw new HttpError(400, 'A password needs at least 6 characters (or leave it empty to generate one).');
    const password = given || randomPassword();
    const student = await Student.findByIdAndUpdate(req.params.id, { $set: { passwordHash: await bcrypt.hash(password, 10) } }, { new: true }).lean();
    if (!student) throw new HttpError(404, 'Participant not found.');
    res.json({ password, student: studentView(student) });
  }),
);

/** Everything a student answered in one round, with the correct answers, for review and manual grading. */
router.get(
  '/participants/:id/rounds/:n/submission',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    const [student, round, attempt] = await Promise.all([
      Student.findById(req.params.id).lean(),
      Round.findOne({ n }).lean(),
      Attempt.findOne({ student: req.params.id, round: n }).lean(),
    ]);
    if (!student || !round || !attempt) throw new HttpError(404, 'No submission found.');

    const answers = attempt.answers ?? {};
    const points = attempt.points ?? {};
    const earned = (id) => Number(points[id]) || 0;
    let items = [];
    if (round.type === 'quiz') {
      const byId = new Map(round.quiz.map((q) => [idOf(q), q]));
      items = (attempt.order ?? []).filter((id) => byId.has(id)).map((id) => {
        const q = byId.get(id);
        return { id, kind: 'quiz', title: q.text, options: q.options, correct: q.correct, chosen: Number.isInteger(answers[id]) ? answers[id] : null, earned: earned(id), max: round.marksPerQuestion };
      });
    } else if (round.type === 'codefix') {
      const byId = new Map(round.fixes.map((f) => [idOf(f), f]));
      items = (attempt.order ?? []).filter((id) => byId.has(id)).map((id) => {
        const f = byId.get(id);
        const v = f.variants.find((x) => x.language === attempt.language);
        return { id, kind: 'codefix', title: f.title, wrongCode: v?.wrongCode ?? '', correctCode: v?.correctCode ?? '', answer: typeof answers[id] === 'string' ? answers[id] : '', earned: earned(id), max: round.marksPerQuestion };
      });
    } else {
      items = round.problems.map((p) => ({
        id: idOf(p),
        kind: 'coding',
        title: p.title,
        statement: p.statement,
        answer: typeof answers[idOf(p)] === 'string' ? answers[idOf(p)] : '',
        verdict: attempt.verdicts?.[idOf(p)] ?? null,
        tests: p.tests.map((t) => ({ input: t.input, expected: t.expected, sample: !!t.sample })),
        earned: earned(idOf(p)),
        max: p.points,
      }));
    }
    res.json({
      student: { name: student.name, rollNo: student.rollNo },
      round: { n: round.n, name: round.name, type: round.type },
      language: attempt.language ?? null,
      startedAt: ts(attempt.startedAt),
      endedAt: attempt.endedAt ? ts(attempt.endedAt) : null,
      score: attemptScore(attempt),
      maxScore: maxScore(round, attempt.language ?? null),
      violations: attempt.violations ?? [],
      items,
    });
  }),
);

/**
 * Manual grading / correction: set the marks for individual questions of an attempt.
 * Needed in "manual" judge mode, and handy when a valid alternative solution was marked wrong.
 */
router.put(
  '/participants/:id/rounds/:n/grade',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    const [round, attempt] = await Promise.all([
      Round.findOne({ n }).lean(),
      Attempt.findOne({ student: req.params.id, round: n }).lean(),
    ]);
    if (!round || !attempt) throw new HttpError(404, 'No submission found.');
    const incoming = req.body?.points;
    if (!incoming || typeof incoming !== 'object') throw new HttpError(400, 'No marks given.');

    const valid = new Set(round.type === 'coding' ? round.problems.map(idOf) : attempt.order ?? []);
    const $set = {};
    for (const [id, raw] of Object.entries(incoming)) {
      if (!valid.has(id)) continue;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) throw new HttpError(400, 'Marks must be a number, 0 or more.');
      const clamped = Math.min(Math.round(v * 100) / 100, maxForItem(round, id));
      $set[`points.${id}`] = clamped;
      if (round.type === 'coding' && clamped > 0 && attempt.solved?.[id] === undefined) {
        const end = attempt.endedAt ? ts(attempt.endedAt) : Date.now();
        $set[`solved.${id}`] = Math.max(0, end - ts(attempt.startedAt));
      }
    }
    if (!Object.keys($set).length) throw new HttpError(400, 'No valid questions to grade.');
    await Attempt.updateOne({ _id: attempt._id }, { $set });
    if (attempt.endedAt) await syncResults(n); // re-check qualification and notify the student if it changed
    activity(`Marks updated by the organiser for ${req.params.id} in ${round.name}`);
    scheduleChanged('graded');
    res.json({ ok: true });
  }),
);

router.delete(
  '/participants/:id/attempts/:n',
  ah(async (req, res) => {
    const n = Number(req.params.n);
    const { deletedCount } = await Attempt.deleteOne({ student: req.params.id, round: n });
    // Allow fresh notifications if they play this round again.
    await Notification.deleteMany({ student: req.params.id, key: { $regex: `^result:${req.params.id}:${n}:` } });
    scheduleChanged('attempt-reset');
    res.json({ ok: deletedCount > 0 });
  }),
);

router.delete(
  '/participants/:id',
  ah(async (req, res) => {
    const student = await Student.findByIdAndDelete(req.params.id).lean();
    if (!student) throw new HttpError(404, 'Participant not found.');
    await Promise.all([Attempt.deleteMany({ student: student._id }), Notification.deleteMany({ student: student._id })]);
    activity(`${student.name} was removed by the organiser`);
    scheduleChanged('participant-removed');
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ announcements */

router.post(
  '/announcements',
  ah(async (req, res) => {
    const title = str(req.body?.title).slice(0, 120);
    const message = str(req.body?.message).slice(0, 1000);
    const audience = req.body?.audience;
    const n = Number(req.body?.round);
    if (!title || !message) throw new HttpError(400, 'Title and message are required.');
    if (!['all', 'qualified', 'eligible'].includes(audience)) throw new HttpError(400, 'Invalid audience.');
    if (audience !== 'all' && !Number.isInteger(n)) throw new HttpError(400, 'Choose a round for this audience.');

    const { standings } = await getStandings();
    let targets = standings;
    if (audience === 'qualified') targets = standings.filter((s) => s.stats.find((x) => x.n === n)?.qualified);
    if (audience === 'eligible') {
      targets = standings.filter((s) => n === 1 || s.stats.find((x) => x.n === n - 1)?.qualified);
    }

    const stamp = Date.now();
    let sent = 0;
    for (const s of targets) {
      const doc = await notifyStudent(
        { _id: s.id, email: s.email, name: s.name },
        { type: 'announcement', title: `📢 ${title}`, message, key: `announce:${stamp}:${s.id}` },
      );
      if (doc) sent++;
    }
    activity(`Announcement "${title}" sent to ${sent} participant(s)`);
    res.json({ sent });
  }),
);

/* ------------------------------------------------------------------ export & reset */

router.get(
  '/export.csv',
  ah(async (_req, res) => {
    await expireAttempts();
    const { rounds, standings } = await getStandings();
    const header = ['Rank', 'Name', 'Roll No', 'Email', 'Year', 'Registered'];
    rounds.forEach((r) => header.push(`R${r.n} Score`, `R${r.n} Time`, `R${r.n} Qualified`, `R${r.n} Violations`));
    header.push('Total Score', 'Total Time', 'Status');
    const rows = standings.map((s) => [
      s.rank || '',
      s.name,
      s.rollNo,
      s.email,
      s.year,
      s.source === 'spot' ? 'Spot' : 'Online',
      ...s.stats.flatMap((x) => [
        x.attempted ? x.score : '',
        x.attempted ? fmt(x.timeMs) : '',
        x.attempted || x.override !== null ? (x.qualified ? 'Yes' : 'No') : '',
        x.attempted ? x.violations : '',
      ]),
      s.totalScore,
      fmt(s.totalTimeMs),
      s.status,
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="codesmash-results.csv"');
    res.send([header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
  }),
);

// Clears participants, attempts and notifications and closes all rounds again. Questions, passwords and settings are kept.
router.post(
  '/reset',
  ah(async (req, res) => {
    if (req.body?.confirm !== 'RESET') throw new HttpError(400, 'Type RESET to confirm.');
    await Promise.all([Student.deleteMany({}), Attempt.deleteMany({}), Notification.deleteMany({})]);
    await Round.updateMany({}, { $set: { status: 'upcoming' } });
    activity('Competition reset by the organiser');
    scheduleChanged('reset');
    res.json({ ok: true });
  }),
);

export default router;
