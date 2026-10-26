import { Attempt, Round, Student } from './models.js';
import { attemptScore, isQualified, maxScore, roundMs, ts } from './scoring.js';
import { computeStandings } from './standings.js';
import { effectiveCount, gradeAttempt } from './grading.js';
import { notifyStudent } from './notify.js';
import { activity, scheduleChanged } from './realtime.js';
import { HttpError } from './utils.js';

export async function loadAll() {
  const [students, rounds, attempts] = await Promise.all([
    Student.find().select('-passwordHash').lean(),
    Round.find().sort({ n: 1 }).lean(),
    Attempt.find().lean(),
  ]);
  return { students, rounds, attempts };
}

export async function getStandings() {
  const data = await loadAll();
  return { ...data, standings: computeStandings(data) };
}

/* ------------------------------------------------------------------ notifications */

/**
 * Tell a student their SCORE. Whether they qualified is only visible to the organiser, so nothing here says so.
 * Idempotent per score (a corrected score sends a fresh message).
 */
export async function notifyResult(student, round, attempt) {
  const score = attemptScore(attempt);
  const total = maxScore(round, attempt.language ?? null);
  return notifyStudent(student, {
    type: 'result',
    round: round.n,
    key: `result:${student._id}:${round.n}:${score}`,
    title: `${round.name} submitted`,
    message: `You scored ${score} out of ${total}. The organisers will announce what happens next.`,
  });
}

/** Re-check every finished attempt of a round (after settings/content/marks changed) and notify any changed outcomes. */
export async function syncResults(n) {
  const round = await Round.findOne({ n }).lean();
  if (!round) return;
  const attempts = await Attempt.find({ round: n, endedAt: { $ne: null } }).lean();
  if (!attempts.length) return;
  const students = await Student.find({ _id: { $in: attempts.map((a) => a.student) } }).lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));
  for (const a of attempts) {
    const s = byId.get(String(a.student));
    if (s) await notifyResult(s, round, a);
  }
  scheduleChanged('results-synced');
}

async function notifyRoundOpen(round) {
  const { students, rounds, attempts } = await loadAll();
  const standings = computeStandings({ students, rounds, attempts });
  let sent = 0;
  for (const row of standings) {
    const mine = row.stats.find((x) => x.n === round.n);
    if (mine?.attempted) continue;
    const eligible = round.n === 1 || !!row.stats.find((x) => x.n === round.n - 1)?.qualified;
    if (!eligible) continue;
    const doc = await notifyStudent(
      { _id: row.id, email: row.email, name: row.name },
      {
        type: 'round_open',
        round: round.n,
        key: `open:${round.n}:${row.id}`,
        title: `🚀 ${round.name} is open!`,
        message: `You can start now. You'll need the round password from the organiser. You get ${round.durationMin} minutes once you press Start — the timer can't be paused.`,
      },
    );
    if (doc) sent++;
  }
  activity(`${round.name} opened — ${sent} participant(s) notified`);
}

/* ------------------------------------------------------------------ attempts */

/**
 * End an attempt (once): grade it if the round is graded at the end (quiz, code correction),
 * then send the qualification result to the student.
 */
export async function finalizeAttempt(attempt, round, endMs) {
  const fresh = await Attempt.findById(attempt._id).lean(); // pick up answers saved a moment ago
  if (!fresh || fresh.endedAt) return null;
  const graded = gradeAttempt(fresh, round);
  const set = { endedAt: new Date(endMs) };
  if (graded) set.points = graded;

  const updated = await Attempt.findOneAndUpdate({ _id: fresh._id, endedAt: null }, { $set: set }, { new: true }).lean();
  if (!updated) return null; // somebody else already ended it
  try {
    const student = await Student.findById(updated.student).lean();
    if (student) {
      await notifyResult(student, round, updated);
      const q = isQualified(student, round, updated);
      activity(
        `${student.name} finished ${round.name}: ${attemptScore(updated)}/${maxScore(round, updated.language ?? null)} — ${q ? 'qualified' : 'not qualified'}`,
      );
    }
  } catch (err) {
    console.error('notify after finalize failed:', err);
  }
  scheduleChanged('attempt-finished');
  return updated;
}

/** Auto-submit every attempt whose time is up. Runs on a timer and lazily before reads. */
export async function expireAttempts(studentId) {
  const filter = { endedAt: null };
  if (studentId) filter.student = studentId;
  const running = await Attempt.find(filter).lean();
  if (!running.length) return 0;
  const rounds = new Map((await Round.find().lean()).map((r) => [r.n, r]));
  const now = Date.now();
  let count = 0;
  for (const a of running) {
    const round = rounds.get(a.round);
    if (!round) continue;
    const end = ts(a.startedAt) + roundMs(round);
    if (now >= end && (await finalizeAttempt(a, round, end))) count++;
  }
  if (count) activity(`${count} attempt(s) auto-submitted because time ran out`);
  return count;
}

/* ------------------------------------------------------------------ admin actions */

export async function setRoundStatus(n, status) {
  const round = await Round.findOne({ n });
  if (!round) throw new HttpError(404, 'Round not found.');
  if (round.status === status) return round;

  if (status === 'open') {
    if (!round.password?.trim()) {
      throw new HttpError(400, `Set a password for ${round.name} before opening it. Students need it to start the round.`);
    }
    if (effectiveCount(round.toObject()) === 0) {
      throw new HttpError(400, `${round.name} has no questions yet. Add some before opening it.`);
    }
  }

  round.status = status;
  await round.save();
  const plain = round.toObject();

  if (status === 'closed') {
    const running = await Attempt.find({ round: n, endedAt: null }).lean();
    const now = Date.now();
    for (const a of running) await finalizeAttempt(a, plain, Math.min(now, ts(a.startedAt) + roundMs(plain)));
    activity(`${plain.name} closed`);
  }
  if (status === 'open') await notifyRoundOpen(plain);
  scheduleChanged('round-status');
  return round;
}

export async function setOverride(studentId, n, value) {
  const update =
    typeof value === 'boolean' ? { $set: { [`overrides.${n}`]: value } } : { $unset: { [`overrides.${n}`]: '' } };
  const student = await Student.findByIdAndUpdate(studentId, update, { new: true }).lean();
  if (!student) throw new HttpError(404, 'Participant not found.');
  // The student is NOT told: qualification is visible to the organiser only.
  scheduleChanged('override');
  return student;
}
