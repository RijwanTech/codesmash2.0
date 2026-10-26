// Run with: npm test   (uses Node's built-in test runner, no database needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import { attemptScore, attemptTime, isQualified, maxScore, normalize } from '../src/scoring.js';
import { computeRoundBoard, computeStandings, isCompetitionFinal, publicRow } from '../src/standings.js';

const MIN = 60000;
const T0 = new Date('2026-10-20T10:00:00Z').getTime();

// Coding-style rounds: 3 problems of 10 points each.
const round = (n, qualifyScore, status = 'closed', type = 'coding') => ({
  n,
  type,
  name: `Round ${n}`,
  durationMin: 30,
  qualifyScore,
  questionCount: 0,
  marksPerQuestion: 10,
  status,
  quiz: [],
  fixes: [],
  problems: [
    { _id: `r${n}a`, points: 10 },
    { _id: `r${n}b`, points: 10 },
    { _id: `r${n}c`, points: 10 },
  ],
});
const rounds = [round(1, 20), round(2, 30), round(3, 40)];

const student = (id, overrides = {}) => ({ _id: id, name: id.toUpperCase(), rollNo: id, email: `${id}@x.com`, year: 'TE', overrides });

/** Attempt where `solved` is { problemSuffix: minutesAfterStart } and each solved problem earned 10 points. */
const attempt = (sid, n, solved, { finished = true, spentMin = 30 } = {}) => ({
  student: sid,
  round: n,
  startedAt: new Date(T0),
  endedAt: finished ? new Date(T0 + spentMin * MIN) : null,
  language: 'python',
  points: Object.fromEntries(Object.keys(solved).map((k) => [`r${n}${k}`, 10])),
  solved: Object.fromEntries(Object.entries(solved).map(([k, m]) => [`r${n}${k}`, m * MIN])),
});

test('normalize ignores case and extra spaces', () => {
  assert.equal(normalize('  Fun   IS codesmash '), 'fun is codesmash');
  assert.equal(normalize(undefined), '');
});

test('score sums the marks stored on the attempt; maxScore depends on the round type', () => {
  assert.equal(maxScore(rounds[0]), 30);
  assert.equal(attemptScore(attempt('a', 1, { a: 3, c: 9 })), 20);
  assert.equal(attemptScore(undefined), 0);

  const quiz = { type: 'quiz', questionCount: 30, marksPerQuestion: 2, quiz: Array.from({ length: 40 }, (_, i) => ({ _id: `q${i}` })) };
  assert.equal(maxScore(quiz), 60); // 30 of the 40 questions are asked, 2 marks each
  const smallQuiz = { ...quiz, quiz: quiz.quiz.slice(0, 10) };
  assert.equal(maxScore(smallQuiz), 20); // fewer questions than the count: all 10 are asked
});

test('coding round time = last scoring solve; quiz / code-correction time = time taken to submit', () => {
  assert.equal(attemptTime(attempt('a', 1, { a: 3, b: 12 }), rounds[0]), 12 * MIN);
  assert.equal(attemptTime(attempt('a', 1, {}, { spentMin: 10 }), rounds[0]), 10 * MIN);
  assert.equal(attemptTime(attempt('a', 1, {}, { spentMin: 99 }), rounds[0]), 30 * MIN);
  const quiz = { ...round(1, 15, 'closed', 'quiz') };
  assert.equal(attemptTime(attempt('a', 1, { a: 1 }, { spentMin: 22 }), quiz), 22 * MIN);
});

test('qualification needs a finished attempt at/above the qualifying score', () => {
  const s = student('a');
  assert.equal(isQualified(s, rounds[0], attempt('a', 1, { a: 1, b: 2 })), true); // 20 >= 20
  assert.equal(isQualified(s, rounds[0], attempt('a', 1, { a: 1 })), false); // 10 < 20
  assert.equal(isQualified(s, rounds[0], attempt('a', 1, { a: 1, b: 2 }, { finished: false })), false); // still running
  assert.equal(isQualified(s, rounds[0], undefined), false);
});

test('admin override beats the score in both directions', () => {
  assert.equal(isQualified(student('a', { 1: true }), rounds[0], undefined), true);
  assert.equal(isQualified(student('a', { 1: false }), rounds[0], attempt('a', 1, { a: 1, b: 2, c: 3 })), false);
});

test('standings: points desc, ties broken by lower total time, equal both = shared rank', () => {
  const students = ['fast', 'slow', 'twin1', 'twin2', 'top', 'idle'].map((id) => student(id));
  const attempts = [
    attempt('top', 1, { a: 1, b: 2, c: 3 }), // 30 pts
    attempt('fast', 1, { a: 2, b: 5 }), // 20 pts, 5 min
    attempt('slow', 1, { a: 2, b: 20 }), // 20 pts, 20 min
    attempt('twin1', 1, { a: 4, b: 8 }), // 20 pts, 8 min
    attempt('twin2', 1, { a: 3, b: 8 }), // 20 pts, 8 min (same score + same time as twin1)
  ];
  const rows = computeStandings({ students, rounds, attempts }, T0 + 60 * MIN);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(rows.slice(0, 2).map((r) => r.id), ['top', 'fast']);
  assert.equal(by.top.rank, 1);
  assert.equal(by.fast.rank, 2);
  assert.equal(by.twin1.rank, 3);
  assert.equal(by.twin2.rank, 3); // tie shares the rank
  assert.equal(by.slow.rank, 5); // next rank skips (competition ranking)
  assert.equal(by.idle.rank, 0); // never attempted => unranked, listed last
  assert.equal(rows[rows.length - 1].id, 'idle');
});

test('standings: totals add up across rounds and status follows qualification', () => {
  const students = [student('q'), student('out'), student('new')];
  const attempts = [
    attempt('q', 1, { a: 1, b: 2 }), // 20 -> qualified R1
    attempt('q', 2, { a: 5, b: 6, c: 7 }), // 30 -> qualified R2
    attempt('out', 1, { a: 1 }), // 10 -> not qualified
  ];
  const rs = [round(1, 20, 'closed'), round(2, 30, 'closed'), round(3, 40, 'open')];
  const rows = computeStandings({ students, rounds: rs, attempts }, T0 + 99 * MIN);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.q.totalScore, 50);
  assert.equal(by.q.status, 'Qualified for Round 3'); // finished R1+R2, R3 open but not started
  assert.equal(by.q.statusKind, 'good');
  assert.equal(by.out.status, 'Eliminated – Round 1');
  assert.equal(by.new.status, 'Absent – Round 1'); // round 1 closed and never attempted
});

test('status: running, registered, and eliminated in the last round', () => {
  const rs = [round(1, 20, 'open'), round(2, 30, 'upcoming'), round(3, 40, 'upcoming')];
  const running = computeStandings({ students: [student('r')], rounds: rs, attempts: [attempt('r', 1, { a: 1 }, { finished: false })] });
  assert.equal(running[0].status, 'In Round 1');
  const fresh = computeStandings({ students: [student('f')], rounds: rs, attempts: [] });
  assert.equal(fresh[0].status, 'Registered');

  const all = rounds.map((r) => ({ ...r, status: 'closed' }));
  const fin = computeStandings({
    students: [student('w')],
    rounds: all,
    attempts: [attempt('w', 1, { a: 1, b: 2 }), attempt('w', 2, { a: 1, b: 2, c: 3 }), attempt('w', 3, { a: 1, b: 2, c: 3 })],
  });
  // Round 3 needs 40 but only has 30 max points -> not qualified in R3
  assert.equal(fin[0].status, 'Eliminated – Round 3');
});

test('round board ranks a single round by score then time', () => {
  const students = [student('a'), student('b'), student('c')];
  const attempts = [attempt('a', 1, { a: 2, b: 9 }), attempt('b', 1, { a: 1, b: 3 }), attempt('c', 1, { a: 1 })];
  const board = computeRoundBoard(computeStandings({ students, rounds, attempts }), 1);
  assert.deepEqual(board.map((r) => [r.id, r.rank]), [['b', 1], ['a', 2], ['c', 3]]);
  assert.equal(board[0].qualified, true);
  assert.equal(board[2].qualified, false);
});

test('competition is final only when the last round is closed; public rows hide email', () => {
  assert.equal(isCompetitionFinal([round(1, 1, 'closed'), round(2, 1, 'open')]), false);
  assert.equal(isCompetitionFinal([round(1, 1, 'closed'), round(2, 1, 'closed')]), true);
  const [row] = computeStandings({ students: [student('a')], rounds, attempts: [] });
  assert.equal('email' in publicRow(row), false);
});

test('spot participants are labelled in the standings', () => {
  const [row] = computeStandings({ students: [{ ...student('s'), source: 'spot' }], rounds, attempts: [] });
  assert.equal(row.source, 'spot');
});
