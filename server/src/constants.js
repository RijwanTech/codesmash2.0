export const LANGUAGES = ['python', 'java', 'c'];
export const LANGUAGE_LABELS = { python: 'Python', java: 'Java', c: 'C' };

/** Round 1 = technical quiz, Round 2 = code correction, Round 3 = problem solving. */
export const ROUND_TYPES = ['quiz', 'codefix', 'coding'];
export const typeForRound = (n) => (n === 1 ? 'quiz' : n === 2 ? 'codefix' : 'coding');

/** Which array of the Round document holds the content of each round type. */
export const CONTENT_FIELD = { quiz: 'quiz', codefix: 'fixes', coding: 'problems' };
