import test from 'node:test';
import assert from 'node:assert/strict';
import {
  codeMatches,
  effectiveCount,
  gradeAttempt,
  maxForItem,
  normalizeCode,
  outputsMatch,
  pickItems,
  poolFor,
  shuffle,
} from '../src/grading.js';
import { defaultRounds } from '../src/samples.js';

const [quizRound, fixRound, codingRound] = defaultRounds();
// give the sample content stable ids like Mongo would
quizRound.quiz.forEach((q, i) => (q._id = `q${i}`));
fixRound.fixes.forEach((f, i) => (f._id = `f${i}`));
codingRound.problems.forEach((p, i) => (p._id = `p${i}`));

/* ------------------------------------------------------------------ random order */

test('shuffle keeps every element exactly once and does not mutate the input', () => {
  const input = Array.from({ length: 30 }, (_, i) => i);
  const out = shuffle(input);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
  assert.deepEqual(input, Array.from({ length: 30 }, (_, i) => i));
});

test('different students get different orders (30 questions)', () => {
  const round = { type: 'quiz', questionCount: 30, quiz: Array.from({ length: 30 }, (_, i) => ({ _id: `q${i}` })) };
  const orders = new Set(Array.from({ length: 20 }, () => pickItems(round).join(',')));
  assert.ok(orders.size > 15, `expected mostly distinct orders, got ${orders.size}/20`);
});

test('quiz: asks min(questionCount, pool) questions; asks all when the pool is smaller', () => {
  const big = { type: 'quiz', questionCount: 30, quiz: Array.from({ length: 45 }, (_, i) => ({ _id: `q${i}` })) };
  assert.equal(pickItems(big).length, 30);
  assert.equal(new Set(pickItems(big)).size, 30); // no duplicates
  assert.equal(pickItems(quizRound).length, 6); // sample pool has 6 < 30
  assert.equal(effectiveCount({ ...big, questionCount: 0 }), 45); // 0 = all
});

test('code correction: only questions that exist in the chosen language, count capped by the setting', () => {
  const round = {
    type: 'codefix',
    questionCount: 3,
    fixes: [
      { _id: 'a', variants: [{ language: 'python' }, { language: 'c' }] },
      { _id: 'b', variants: [{ language: 'python' }] },
      { _id: 'c', variants: [{ language: 'java' }] },
      { _id: 'd', variants: [{ language: 'python' }] },
      { _id: 'e', variants: [{ language: 'python' }] },
    ],
  };
  assert.deepEqual(poolFor(round, 'java').map((f) => f._id), ['c']);
  assert.equal(pickItems(round, 'java').length, 1);
  const py = pickItems(round, 'python');
  assert.equal(py.length, 3);
  assert.ok(py.every((id) => ['a', 'b', 'd', 'e'].includes(id)));
});

test('coding round: every problem, in the admin order', () => {
  assert.deepEqual(pickItems(codingRound), ['p0', 'p1', 'p2']);
});

/* ------------------------------------------------------------------ quiz grading */

test('quiz grading: marks only for the right option, unanswered = 0', () => {
  const order = ['q0', 'q1', 'q2', 'q3'];
  const attempt = { order, answers: { q0: 1, q1: 0, q2: 2 } }; // q0 right, q1 wrong, q2 wrong (correct is 1), q3 unanswered
  const round = { ...quizRound, marksPerQuestion: 2 };
  assert.deepEqual(gradeAttempt(attempt, round), { q0: 2, q1: 0, q2: 0, q3: 0 });
  assert.equal(quizRound.quiz[0].correct, 1);
});

test('every sample quiz question has a valid correct option', () => {
  for (const q of quizRound.quiz) {
    assert.ok(q.options.length >= 2 && q.options.length <= 6);
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length);
  }
});

/* ------------------------------------------------------------------ code matching */

test('correct code matches itself in every sample, the wrong code never does', () => {
  for (const fix of fixRound.fixes) {
    for (const v of fix.variants) {
      assert.equal(codeMatches(v.correctCode, v.correctCode, v.language), true, `${fix.title}/${v.language} self`);
      assert.equal(codeMatches(v.wrongCode, v.correctCode, v.language), false, `${fix.title}/${v.language} wrong`);
      assert.notEqual(normalizeCode(v.wrongCode, v.language), normalizeCode(v.correctCode, v.language));
    }
  }
});

test('harmless formatting differences are accepted (spacing, comments, blank lines, indent width)', () => {
  const python = fixRound.fixes[0].variants.find((v) => v.language === 'python').correctCode;
  const reformatted = '# add the numbers\n\na=int( input() )\nb  =  int(input())\n\nprint( a+b )   # result\n';
  assert.equal(codeMatches(reformatted, python, 'python'), true);

  const py2 = 'n = int(input())\nif n % 2 == 0:\n    print("Even")\nelse:\n    print("Odd")\n';
  const py2Indent = 'n=int(input())\nif n%2==0:\n  print("Even")\nelse:\n  print("Odd")\n'; // 2-space indent
  assert.equal(codeMatches(py2Indent, py2, 'python'), true);

  const java = fixRound.fixes[0].variants.find((v) => v.language === 'java').correctCode;
  const javaSquashed = java.replace(/\n\s*/g, ' ').replace('a + b', 'a+b') + ' // done';
  assert.equal(codeMatches(javaSquashed, java, 'java'), true);

  const c = fixRound.fixes[1].variants.find((v) => v.language === 'c').correctCode;
  assert.equal(codeMatches(`/* fixed */\n${c.replace(/\n/g, '\r\n')}`, c, 'c'), true);
});

test('real differences are rejected (operator, number, wrong indentation block, empty answer)', () => {
  const py = 'n = int(input())\nif n % 2 == 0:\n    print("Even")\nelse:\n    print("Odd")\n';
  assert.equal(codeMatches(py.replace('== 0', '== 1'), py, 'python'), false);
  assert.equal(codeMatches(py.replace('"Even"', '"Odd"'), py, 'python'), false);
  assert.equal(codeMatches('', py, 'python'), false);
  assert.equal(codeMatches('   \n', py, 'python'), false);
  // moving the else-branch print out of its block changes the program
  const moved = 'n = int(input())\nif n % 2 == 0:\n    print("Even")\nelse:\n    print("Odd")\nprint("Odd")\n';
  assert.equal(codeMatches(moved, py, 'python'), false);
});

test('comment markers inside strings are not treated as comments', () => {
  const a = 'print("# not a comment")\n';
  const b = 'print("# something else")\n';
  assert.equal(codeMatches(a, a, 'python'), true);
  assert.equal(codeMatches(a, b, 'python'), false);
  const c1 = 'printf("http://x");';
  assert.equal(codeMatches(c1, 'printf("http://y");', 'c'), false);
});

test('code-correction grading uses the language the student picked', () => {
  const f0 = fixRound.fixes[0];
  const py = f0.variants.find((v) => v.language === 'python');
  const java = f0.variants.find((v) => v.language === 'java');
  const attempt = {
    language: 'python',
    order: ['f0', 'f1'],
    answers: { f0: py.correctCode, f1: fixRound.fixes[1].variants[0].wrongCode },
  };
  assert.deepEqual(gradeAttempt(attempt, fixRound), { f0: 10, f1: 0 });
  // Java code submitted for a Python attempt must not score
  assert.deepEqual(gradeAttempt({ ...attempt, answers: { f0: java.correctCode } }, fixRound), { f0: 0, f1: 0 });
});

test('coding round is not graded at the end (points come from the judge); item maximums', () => {
  assert.equal(gradeAttempt({ order: ['p0'], answers: {} }, codingRound), null);
  assert.equal(maxForItem(codingRound, 'p1'), 20);
  assert.equal(maxForItem(fixRound, 'f0'), 10);
  assert.equal(maxForItem(quizRound, 'q0'), 1);
});

/* ------------------------------------------------------------------ program output */

test('output comparison ignores trailing spaces, trailing blank lines and CRLF', () => {
  assert.equal(outputsMatch('15\n', '15'), true);
  assert.equal(outputsMatch('15  \r\n\r\n', '15'), true);
  assert.equal(outputsMatch('a \nb\n', 'a\nb'), true);
  assert.equal(outputsMatch('16', '15'), false);
  assert.equal(outputsMatch('1 5', '15'), false);
  assert.equal(outputsMatch('', '15'), false);
});

test('sample coding problems have at least one sample and one hidden-or-more test', () => {
  for (const p of codingRound.problems) {
    assert.ok(p.tests.some((t) => t.sample), `${p.title} has a sample`);
    assert.ok(p.tests.length >= 3);
    assert.ok(p.tests.every((t) => t.expected.length > 0));
  }
});
