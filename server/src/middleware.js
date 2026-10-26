import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { Student } from './models.js';
import { ah, HttpError } from './utils.js';

export const signToken = (payload) => jwt.sign(payload, config.jwtSecret, { expiresIn: '2d' });

export function parseToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), config.jwtSecret);
  } catch {
    return null;
  }
}

export const requireStudent = ah(async (req, _res, next) => {
  const payload = parseToken(req);
  if (!payload || payload.role !== 'student') throw new HttpError(401, 'Please log in.');
  const student = await Student.findById(payload.id).select('-passwordHash').lean();
  if (!student) throw new HttpError(401, 'Account not found. Please log in again.');
  req.student = student;
  next();
});

export const requireAdmin = (req, _res, next) => {
  const payload = parseToken(req);
  if (!payload || payload.role !== 'admin') return next(new HttpError(401, 'Organiser login required.'));
  req.admin = payload;
  next();
};

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.name === 'CastError') return res.status(400).json({ error: 'Invalid id.' });
  if (err?.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err?.code === 11000) return res.status(409).json({ error: 'That record already exists.' });
  if (/buffering timed out|MongoNetworkError|MongoServerSelectionError|topology/i.test(String(err?.message) + String(err?.name))) {
    console.error('Database problem:', err.message);
    return res.status(503).json({ error: 'The server cannot reach the database right now. Please try again in a moment.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}
