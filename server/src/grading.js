// Pure grading helpers (no database, no network) – unit-tested in test/.
import { randomInt } from 'node:crypto';

export const idOf = (x) => String(x._id ?? x.id);

/** Fisher–Yates shuffle with a cryptographic RNG, so every student gets an unpredictable order. */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The questions a student can be given for this round (and language, for code correction). */
export function poolFor(round, language = null) {
  if (round.type === 'quiz') return round.quiz ?? [];
  if (round.type === 'codefix') {
    const fixes = round.fixes ?? [];
    return language ? fixes.filter((f) => f.variants.some((v) => v.language === language)) : fixes.filter((f) => f.variants.length);
  }
  return round.problems ?? [];
}

/** How many questions one student gets. */
export function effectiveCount(round, language = null) {
  const pool = poolFor(round, language).length;
  if (round.type === 'coding') return pool;
  const want = round.questionCount > 0 ? round.questionCount : pool;
  return Math.min(want, pool);
}

/** Random question ids for one student (quiz / code correction); all problems in order for the coding round. */
export function pickItems(round, language = null, rng = shuffle) {
  const ids = poolFor(round, language).map(idOf);
  if (round.type === 'coding') return ids;
  return rng(ids).slice(0, effectiveCount(round, language));
}

/* ------------------------------------------------------------------ code matching */

/** Remove comments while leaving string literals alone. */
export function stripComments(src, language) {
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (language === 'python') {
      if (c === '#') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if ((c === '"' || c === "'") && src.startsWith(c.repeat(3), i)) {
        const q = c.repeat(3);
        const end = src.indexOf(q, i + 3);
        const stop = end < 0 ? n : end + 3;
        out.push(src.slice(i, stop));
        i = stop;
        continue;
      }
    } else {
      if (c === '/' && d === '/') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && d === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 2;
        out.push(' ');
        continue;
      }
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        j++;
      }
      out.push(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    out.push(c);
    i++;
  }
  return out.join('');
}

const PUNCT = /\s*([()[\]{}.,:;+\-*/%=<>!&|^~?])\s*/g;

/**
 * Turn code into a canonical form so harmless differences (spacing, blank lines, comments, indent width,
 * line breaks) do not matter, while real differences (names, operators, numbers, keywords) do.
 */
export function normalizeCode(code, language) {
  const src = stripComments(String(code ?? '').replace(/\r\n?/g, '\n'), language);

  if (language === 'python') {
    // Indentation is meaningful: compare indentation *levels*, so 2-space and 4-space styles are equal.
    const stack = [0];
    const lines = [];
    for (const raw of src.split('\n')) {
      const line = raw.replace(/\t/g, '    ').replace(/\s+$/, '');
      if (!line.trim()) continue;
      const indent = line.length - line.trimStart().length;
      if (indent > stack[stack.length - 1]) stack.push(indent);
      else while (stack.length > 1 && indent < stack[stack.length - 1]) stack.pop();
      const body = line.trim().replace(/\s+/g, ' ').replace(PUNCT, '$1');
      lines.push(`${stack.length - 1}|${body}`);
    }
    return lines.join('\n');
  }

  return src.replace(/\s+/g, ' ').replace(PUNCT, '$1').trim();
}

export function codeMatches(studentCode, correctCode, language) {
  const a = normalizeCode(studentCode, language);
  if (!a) return false;
  return a === normalizeCode(correctCode, language);
}

/* ------------------------------------------------------------------ program output */

/** Compare program output with the expected output, ignoring trailing spaces and trailing blank lines. */
export function outputsMatch(actual, expected) {
  const clean = (s) =>
    String(s ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  return clean(actual) === clean(expected);
}

/* ------------------------------------------------------------------ grading */

/**
 * Marks per question for the rounds that are graded when the attempt ends (quiz and code correction).
 * Returns null for the coding round: its points are written as each problem is judged.
 */
export function gradeAttempt(attempt, round) {
  const answers = attempt.answers || {};
  const order = attempt.order || [];
  const marks = Number(round.marksPerQuestion) || 0;
  const points = {};

  if (round.type === 'quiz') {
    const byId = new Map((round.quiz ?? []).map((q) => [idOf(q), q]));
    for (const id of order) {
      const q = byId.get(id);
      points[id] = q && Number.isInteger(answers[id]) && answers[id] === q.correct ? marks : 0;
    }
    return points;
  }

  if (round.type === 'codefix') {
    const byId = new Map((round.fixes ?? []).map((f) => [idOf(f), f]));
    for (const id of order) {
      const variant = byId.get(id)?.variants.find((v) => v.language === attempt.language);
      points[id] =
        variant && typeof answers[id] === 'string' && codeMatches(answers[id], variant.correctCode, attempt.language)
          ? marks
          : 0;
    }
    return points;
  }

  return null;
}

/** Marks a single item can give (used to clamp manual grades). */
export function maxForItem(round, id) {
  if (round.type === 'coding') return Number((round.problems ?? []).find((p) => idOf(p) === id)?.points) || 0;
  return Number(round.marksPerQuestion) || 0;
}
