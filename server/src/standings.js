import { attemptScore, attemptTime, isQualified, maxScore, overrideOf } from './scoring.js';

function statusOf(stats) {
  const lastN = stats[stats.length - 1]?.n;
  for (const st of stats) {
    if (!st.attempted) {
      if (st.qualified) continue; // admin forced qualification
      if (st.roundStatus === 'closed') return { status: `Absent – Round ${st.n}`, kind: 'bad' };
      return st.n === 1
        ? { status: 'Registered', kind: 'neutral' }
        : { status: `Qualified for Round ${st.n}`, kind: 'good' };
    }
    if (!st.finished) return { status: `In Round ${st.n}`, kind: 'live' };
    if (st.qualified) {
      if (st.n === lastN) return { status: 'Finalist', kind: 'good' };
      continue;
    }
    return { status: `Eliminated – Round ${st.n}`, kind: 'bad' };
  }
  return { status: 'Finalist', kind: 'good' };
}

/**
 * Overall standings: total points desc, then total time asc.
 * `students`, `rounds` (sorted by n) and `attempts` are lean Mongo documents.
 */
export function computeStandings({ students, rounds, attempts }, now = Date.now()) {
  const byKey = new Map(attempts.map((a) => [`${a.student}:${a.round}`, a]));

  const rows = students.map((student) => {
    const stats = rounds.map((round) => {
      const attempt = byKey.get(`${student._id}:${round.n}`);
      return {
        n: round.n,
        roundName: round.name,
        roundStatus: round.status,
        attempted: !!attempt,
        finished: !!attempt?.endedAt,
        violations: attempt?.violations?.length ?? 0,
        score: attemptScore(attempt),
        timeMs: attempt ? attemptTime(attempt, round, now) : 0,
        qualified: isQualified(student, round, attempt),
        override: overrideOf(student, round.n),
        maxScore: maxScore(round, attempt?.language ?? null),
        qualifyScore: round.qualifyScore,
      };
    });
    const { status, kind } = statusOf(stats);
    return {
      id: String(student._id),
      name: student.name,
      rollNo: student.rollNo,
      email: student.email,
      year: student.year,
      source: student.source ?? 'online',
      registeredAt: student.createdAt,
      stats,
      totalScore: stats.reduce((s, x) => s + x.score, 0),
      totalTimeMs: stats.reduce((s, x) => s + x.timeMs, 0),
      participated: stats.some((x) => x.attempted),
      status,
      statusKind: kind,
      rank: 0,
    };
  });

  rows.sort((a, b) => {
    if (a.participated !== b.participated) return a.participated ? -1 : 1;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
    return a.name.localeCompare(b.name);
  });

  let prev = null;
  rows
    .filter((r) => r.participated)
    .forEach((row, i) => {
      row.rank = prev && prev.totalScore === row.totalScore && prev.totalTimeMs === row.totalTimeMs ? prev.rank : i + 1;
      prev = row;
    });

  return rows;
}

/** Leaderboard for one round: score desc, time asc. */
export function computeRoundBoard(standings, roundN) {
  const rows = standings
    .map((s) => ({ s, stat: s.stats.find((x) => x.n === roundN) }))
    .filter((x) => x.stat?.attempted)
    .map(({ s, stat }) => ({
      id: s.id,
      name: s.name,
      rollNo: s.rollNo,
      score: stat.score,
      timeMs: stat.timeMs,
      finished: stat.finished,
      qualified: stat.qualified,
      rank: 0,
    }));
  rows.sort((a, b) => b.score - a.score || a.timeMs - b.timeMs || a.name.localeCompare(b.name));
  rows.forEach((row, i) => {
    const p = rows[i - 1];
    row.rank = p && p.score === row.score && p.timeMs === row.timeMs ? p.rank : i + 1;
  });
  return rows;
}

/** The competition is complete once the last round is closed by the organisers. */
export function isCompetitionFinal(rounds) {
  const last = rounds[rounds.length - 1];
  return !!last && last.status === 'closed';
}

/** Strip private fields (email) for public / student-facing responses. */
export function publicRow(row) {
  const { email, registeredAt, ...rest } = row; // eslint-disable-line no-unused-vars
  return rest;
}
