import mongoose from 'mongoose';
import { LANGUAGES, ROUND_TYPES } from './constants.js';

const { Schema, model } = mongoose;

const studentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    rollNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    year: { type: String, enum: ['FE', 'SE', 'TE', 'BE'], default: 'FE' },
    passwordHash: { type: String, required: true },
    /** "online" = registered on the website, "spot" = added by the organiser on the day. */
    source: { type: String, enum: ['online', 'spot'], default: 'online' },
    /** Admin overrides per round number: { "1": true } = force qualify, false = force disqualify. */
    overrides: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);

/* ---------- round content ---------- */

// Round 1: multiple-choice question
const quizQuestionSchema = new Schema({
  text: { type: String, required: true },
  options: {
    type: [String],
    validate: { validator: (v) => v.length >= 2 && v.length <= 6, message: 'A question needs 2 to 6 options.' },
  },
  /** index of the correct option */
  correct: { type: Number, required: true, min: 0 },
});

// Round 2: a question has one wrong/correct version of the code per language
const variantSchema = new Schema(
  {
    language: { type: String, enum: LANGUAGES, required: true },
    wrongCode: { type: String, required: true },
    correctCode: { type: String, required: true },
  },
  { _id: false },
);
const fixQuestionSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  variants: { type: [variantSchema], default: [] },
});

// Round 3: a problem with input/expected-output test cases
const testSchema = new Schema(
  {
    input: { type: String, default: '' },
    expected: { type: String, required: true },
    /** sample tests are shown to students; the rest stay hidden */
    sample: { type: Boolean, default: false },
  },
  { _id: false },
);
const problemSchema = new Schema({
  title: { type: String, required: true, trim: true },
  statement: { type: String, required: true },
  points: { type: Number, required: true, min: 1 },
  tests: { type: [testSchema], default: [] },
});

const roundSchema = new Schema({
  n: { type: Number, required: true, unique: true },
  type: { type: String, enum: ROUND_TYPES },
  name: { type: String, required: true, trim: true },
  durationMin: { type: Number, required: true, min: 1 },
  qualifyScore: { type: Number, required: true, min: 0 },
  /** How many questions each student gets (random subset of the pool). 0 = all. Rounds 1 and 2. */
  questionCount: { type: Number, default: 0, min: 0 },
  /** Marks for each correct question (rounds 1 and 2). */
  marksPerQuestion: { type: Number, default: 1, min: 0 },
  /** Passcode students must enter to start this round. Only organisers can see it. */
  password: { type: String, default: '' },
  status: { type: String, enum: ['upcoming', 'open', 'closed'], default: 'upcoming' },
  /** Auto-submit a student's round after this many rule violations. 0 = never (violations are only recorded). */
  maxViolations: { type: Number, default: 0, min: 0 },
  quiz: { type: [quizQuestionSchema], default: [] },
  fixes: { type: [fixQuestionSchema], default: [] },
  problems: { type: [problemSchema], default: [] },
});

const attemptSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    round: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    /** Programming language chosen at the start (rounds 2 and 3). */
    language: { type: String, enum: [...LANGUAGES, null], default: null },
    /** This student's own random question order (ids). */
    order: { type: [String], default: [] },
    /** itemId -> chosen option index (quiz) or code text (rounds 2 and 3). */
    answers: { type: Schema.Types.Mixed, default: {} },
    /** itemId -> marks earned. Filled when the attempt is graded / as problems are judged. */
    points: { type: Schema.Types.Mixed, default: {} },
    /** coding round: itemId -> ms after round start when the best score was reached. */
    solved: { type: Schema.Types.Mixed, default: {} },
    /** coding round: itemId -> latest judge verdict. */
    verdicts: { type: Schema.Types.Mixed, default: {} },
    /** Exam-rule violations recorded by the browser (left full screen, switched tab ...). */
    violations: { type: [{ type: { type: String }, at: Number, _id: false }], default: [] },
  },
  { minimize: false },
);
attemptSchema.index({ student: 1, round: 1 }, { unique: true });
attemptSchema.index({ endedAt: 1 });

const notificationSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    type: {
      type: String,
      enum: ['result', 'qualified', 'not_qualified', 'round_open', 'announcement', 'override', 'info'],
      default: 'info',
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    round: { type: Number },
    read: { type: Boolean, default: false },
    /** Optional de-duplication key so the same event never notifies twice. */
    key: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

/** Small key/value store for competition-wide settings (registration open/closed, deadline). */
const settingSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, default: {} },
});

export const Student = model('Student', studentSchema);
export const Round = model('Round', roundSchema);
export const Attempt = model('Attempt', attemptSchema);
export const Notification = model('Notification', notificationSchema);
export const Setting = model('Setting', settingSchema);
