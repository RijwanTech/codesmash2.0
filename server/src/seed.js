import { Attempt, Round } from './models.js';
import { typeForRound } from './constants.js';
import { defaultRounds } from './samples.js';

/**
 * - Empty database: create the three rounds with sample content.
 * - Database from the first version (rounds without a `type`): keep participants, round names, durations and
 *   statuses, keep the points they already earned, and replace the old question format with the new samples.
 */
export async function seedOrMigrate() {
  if ((await Round.countDocuments()) === 0) {
    await Round.insertMany(defaultRounds());
    console.log('✔ Seeded 3 rounds (quiz, code correction, problem solving) with sample content');
    return;
  }

  const rounds = await Round.find({ type: { $exists: false } });
  for (const round of rounds) {
    const def = defaultRounds().find((d) => d.n === round.n);
    if (!def) continue;

    // Remember points earned under the old format so scores are not lost.
    const oldPoints = new Map((round.get('problems') ?? []).map((p) => [String(p._id), Number(p.points) || 0]));
    const attempts = await Attempt.find({ round: round.n }).lean();
    for (const a of attempts) {
      if (a.points && Object.keys(a.points).length) continue;
      const points = {};
      for (const pid of Object.keys(a.solved ?? {})) if (oldPoints.has(pid)) points[pid] = oldPoints.get(pid);
      await Attempt.updateOne({ _id: a._id }, { $set: { points } });
    }

    round.type = typeForRound(round.n);
    round.qualifyScore = def.qualifyScore;
    round.questionCount = def.questionCount;
    round.marksPerQuestion = def.marksPerQuestion;
    round.password = '';
    round.quiz = def.quiz;
    round.fixes = def.fixes;
    round.problems = def.problems;
    await round.save();
    console.log(`✔ Upgraded Round ${round.n} to the new format (${round.type})`);
  }
}
