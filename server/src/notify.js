import { Notification } from './models.js';
import { emitToStudent } from './realtime.js';
import { sendMail } from './mailer.js';

export const serializeNotification = (n) => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  message: n.message,
  round: n.round ?? null,
  read: !!n.read,
  createdAt: n.createdAt,
});

/**
 * Save a notification for a student, push it to them live over WebSocket and (if SMTP is set up) email it.
 * `key` makes it idempotent: the same event never notifies twice.
 * `student` needs at least { _id, email?, name? }.
 */
export async function notifyStudent(student, { type, title, message, round, key, email = true }) {
  try {
    const doc = await Notification.create({ student: student._id, type, title, message, round, key });
    emitToStudent(student._id, 'notification', serializeNotification(doc));
    if (email && student.email) {
      sendMail(
        student.email,
        `[CodeSmash] ${title}`,
        `Hi ${student.name ?? 'participant'},\n\n${message}\n\n— FORCES CodeSmash 2.0`,
      );
    }
    return doc;
  } catch (err) {
    if (err?.code === 11000) return null; // duplicate key => already notified
    throw err;
  }
}
