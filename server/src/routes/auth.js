import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { Student } from '../models.js';
import { parseToken, signToken } from '../middleware.js';
import { activity, scheduleChanged } from '../realtime.js';
import { ah, HttpError } from '../utils.js';
import { getRegistration } from '../registration.js';

const r = Router();

const studentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: true, legacyHeaders: false, validate: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, validate: false });

const view = (s) => ({
  role: 'student',
  id: String(s._id),
  name: s.name,
  rollNo: s.rollNo,
  email: s.email,
  year: s.year,
  source: s.source ?? 'online',
});

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

r.post(
  '/register',
  studentLimiter,
  ah(async (req, res) => {
    const reg = await getRegistration();
    if (!reg.effectiveOpen) {
      throw new HttpError(
        403,
        reg.deadlinePassed
          ? 'The registration deadline has passed. Registration is closed.'
          : 'Registration is closed. Please contact the organisers for spot registration.',
      );
    }
    const name = String(req.body.name ?? '').trim();
    const rollNo = String(req.body.rollNo ?? '').trim().toUpperCase();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    const year = ['FE', 'SE', 'TE', 'BE'].includes(req.body.year) ? req.body.year : 'FE';

    if (name.length < 2) throw new HttpError(400, 'Please enter your full name.');
    if (!rollNo) throw new HttpError(400, 'Roll number / PRN is required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');

    if (await Student.exists({ rollNo })) {
      throw new HttpError(409, 'This roll number is already registered. Try logging in instead.');
    }
    const student = await Student.create({ name, rollNo, email, year, passwordHash: await bcrypt.hash(password, 10) });
    activity(`${student.name} (${student.rollNo}) registered`);
    scheduleChanged('registration');
    res.status(201).json({ token: signToken({ role: 'student', id: String(student._id) }), user: view(student) });
  }),
);

r.post(
  '/login',
  studentLimiter,
  ah(async (req, res) => {
    const rollNo = String(req.body.rollNo ?? '').trim().toUpperCase();
    const password = String(req.body.password ?? '');
    const student = await Student.findOne({ rollNo });
    const ok = student && (await bcrypt.compare(password, student.passwordHash));
    if (!ok) throw new HttpError(401, 'Invalid roll number or password.');
    res.json({ token: signToken({ role: 'student', id: String(student._id) }), user: view(student) });
  }),
);

r.post(
  '/admin-login',
  adminLimiter,
  ah(async (req, res) => {
    const { username, password } = req.body ?? {};
    const ok = safeEqual(username ?? '', config.adminUsername) && safeEqual(password ?? '', config.adminPassword);
    if (!ok) throw new HttpError(401, 'Incorrect organiser username or password.');
    res.json({ token: signToken({ role: 'admin' }), user: { role: 'admin', name: 'Organiser' } });
  }),
);

// Restores a session after a page refresh (works for students and for the organiser).
r.get(
  '/me',
  ah(async (req, res) => {
    const payload = parseToken(req);
    if (!payload) throw new HttpError(401, 'Please log in.');
    if (payload.role === 'admin') return res.json({ user: { role: 'admin', name: 'Organiser' } });
    const student = await Student.findById(payload.id).lean();
    if (!student) throw new HttpError(401, 'Account not found. Please log in again.');
    res.json({ user: view(student) });
  }),
);

export default r;
