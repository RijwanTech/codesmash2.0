// Pure scoring helpers (no database access) so they are easy to test.
import { effectiveCount, idOf } from './grading.js';

export const ts = (d) => new Date(d).getTime();
export const normalize = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
export const roundMs = (round) => round.durationMin * 60000;
export const pidOf = idOf;

/** Highest possible score for one student in this round. */
export function maxScore(round, language = null) {
  if (round.type === 'coding') return (round.problems ?? []).reduce((sum, p) => sum + (Number(p.points) || 0), 0);
  return effectiveCount(round, language) * (Number(round.marksPerQuestion) || 0);
}

/** Marks earned so far (sum of the per-question marks stored on the attempt). */
export function attemptScore(attempt) {
  if (!attempt) return 0;
  return Object.values(attempt.points || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

/**
 * Completion time used to break ties.
 * - Coding round: the moment the last mark was earned.
 * - Quiz / code correction: how long the student took (start -> submit), capped at the round length.
 */
export function attemptTime(attempt, round, now = Date.now()) {
  if (!attempt) return 0;
  if (round.type === 'coding') {
    const solved = attempt.solved || {};
    const times = Object.keys(attempt.points || {})
      .filter((id) => Number(attempt.points[id]) > 0 && solved[id] !== undefined)
      .map((id) => solved[id]);
    if (times.length) return Math.max(...times);
  }
  const end = attempt.endedAt ? ts(attempt.endedAt) : now;
  return Math.min(Math.max(end - ts(attempt.startedAt), 0), roundMs(round));
}

export function overrideOf(student, roundN) {
  const o = student.overrides?.[roundN];
  return typeof o === 'boolean' ? o : null;
}

export function isQualified(student, round, attempt) {
  const o = overrideOf(student, round.n);
  if (o !== null) return o;
  return !!attempt?.endedAt && attemptScore(attempt) >= round.qualifyScore;
}
