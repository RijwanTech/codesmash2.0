export type RoundStatus = 'upcoming' | 'open' | 'closed';
export type StatusKind = 'good' | 'bad' | 'neutral' | 'live';

export interface User {
  role: 'student' | 'admin';
  id?: string;
  name: string;
  rollNo?: string;
  email?: string;
  year?: string;
}

export type RoundType = 'quiz' | 'codefix' | 'coding';
export type Language = 'python' | 'java' | 'c';
export const LANGUAGES: Language[] = ['python', 'java', 'c'];
export const LANGUAGE_LABELS: Record<Language, string> = { python: 'Python', java: 'Java', c: 'C' };
export const TYPE_LABELS: Record<RoundType, string> = {
  quiz: 'Technical Quiz',
  codefix: 'Code Correction',
  coding: 'Problem Solving',
};

export interface AttemptSummary {
  status: 'running' | 'finished';
  score: number;
  maxScore: number;
  timeMs: number;
  startedAt: number;
  deadline: number;
  language: Language | null;
  violations: number;
}

export interface RoundInfo {
  n: number;
  type: RoundType;
  name: string;
  durationMin: number;
  status: RoundStatus;
  /** Number of questions / problems a student gets. */
  problemCount: number;
  maxScore: number;
  needsLanguage: boolean;
  maxViolations: number;
  marksPerQuestion: number;
  /** Student view only: may this student enter the round (qualified in the previous one)? */
  allowed?: boolean;
  attempt?: AttemptSummary | null;
}

export interface QuizItem {
  id: string;
  text: string;
  options: string[];
  answer: number | null;
}
export interface FixItem {
  id: string;
  title: string;
  description: string;
  wrongCode: string;
  answer: string;
}
export interface Verdict {
  status: 'ok' | 'wrong_answer' | 'compile_error' | 'runtime_error' | 'timeout' | 'pending';
  passed: number;
  total: number;
  message: string;
  at: number;
}
export interface CodingItem {
  id: string;
  title: string;
  statement: string;
  points: number;
  samples: { input: string; expected: string }[];
  answer: string;
  verdict: Verdict | null;
  earned: number;
}
export type RunItem = QuizItem | FixItem | CodingItem;

export interface ItemResult {
  id: string;
  title: string;
  earned: number;
  max: number;
  verdict?: Verdict | null;
}

export interface RoundDetail extends RoundInfo {
  serverNow: number;
  items: RunItem[] | null;
  results: ItemResult[] | null;
  summary: { answered: number; total: number } | null;
  judgeMode: 'judge0' | 'manual';
}

export interface StatRow {
  n: number;
  roundName: string;
  roundStatus: RoundStatus;
  attempted: boolean;
  finished: boolean;
  violations: number;
  score: number;
  timeMs: number;
  qualified: boolean;
  override: boolean | null;
  maxScore: number;
  qualifyScore: number;
}

export interface StandingRow {
  id: string;
  name: string;
  rollNo: string;
  year: string;
  email?: string;
  source?: 'online' | 'spot';
  totalScore: number;
  totalTimeMs: number;
  participated: boolean;
  status: string;
  statusKind: StatusKind;
  rank: number;
  stats: StatRow[];
}

export interface RoundBoardRow {
  id: string;
  name: string;
  rollNo: string;
  score: number;
  timeMs: number;
  finished: boolean;
  qualified: boolean;
  rank: number;
}

export interface AppNotification {
  id: string;
  type: 'result' | 'qualified' | 'not_qualified' | 'round_open' | 'announcement' | 'override' | 'info';
  title: string;
  message: string;
  round: number | null;
  read: boolean;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  at: number;
  text: string;
}

export interface AdminQuiz {
  id: string;
  text: string;
  options: string[];
  correct: number;
}
export interface AdminFix {
  id: string;
  title: string;
  description: string;
  variants: { language: Language; wrongCode: string; correctCode: string }[];
}
export interface AdminTest {
  input: string;
  expected: string;
  sample: boolean;
}
export interface AdminProblem {
  id: string;
  title: string;
  statement: string;
  points: number;
  tests: AdminTest[];
}

export interface AdminRound {
  n: number;
  type: RoundType;
  name: string;
  durationMin: number;
  qualifyScore: number;
  questionCount: number;
  marksPerQuestion: number;
  password: string;
  maxViolations: number;
  status: RoundStatus;
  maxScore: number;
  itemCount: number;
  quiz: AdminQuiz[];
  fixes: AdminFix[];
  problems: AdminProblem[];
}

export interface RegistrationInfo {
  open: boolean;
  closesAt: number | null;
  deadlinePassed: boolean;
  effectiveOpen: boolean;
  online?: number;
  spot?: number;
}
