import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;

/**
 * Socket.IO rooms:
 *   student:<id>  – private notifications for one participant
 *   admins        – live activity feed for organisers
 * Everyone (even logged-out visitors) receives the throttled `data:changed` broadcast,
 * which tells pages to refresh their data (live leaderboard, round status, ...).
 */
export function initRealtime(httpServer, { origins, secret }) {
  io = new Server(httpServer, { cors: { origin: origins, credentials: true } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // anonymous visitors can watch the public leaderboard
    try {
      socket.data.user = jwt.verify(token, secret);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const u = socket.data.user;
    if (u?.role === 'student') socket.join(`student:${u.id}`);
    if (u?.role === 'admin') socket.join('admins');
  });

  return io;
}

export const emitToStudent = (studentId, event, payload) => io?.to(`student:${studentId}`).emit(event, payload);
export const emitToAdmins = (event, payload) => io?.to('admins').emit(event, payload);

// Many solves can happen at once; collapse them into at most one broadcast per ~1.2s.
let timer = null;
const reasons = new Set();
export function scheduleChanged(reason = 'update') {
  reasons.add(reason);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const list = [...reasons];
    reasons.clear();
    io?.emit('data:changed', { reasons: list });
  }, 1200);
}

export const activity = (text) =>
  emitToAdmins('activity', { id: Math.random().toString(36).slice(2), at: Date.now(), text });
