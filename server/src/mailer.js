import nodemailer from 'nodemailer';
import { config } from './config.js';

const { host, port, user, pass, from } = config.smtp;

const transport = host
  ? nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined })
  : null;

export const mailEnabled = !!transport;

/** Fire-and-forget. Email is optional; failures never break the competition flow. */
export function sendMail(to, subject, text) {
  if (!transport || !to) return;
  transport.sendMail({ from, to, subject, text }).catch((err) => console.warn('Email failed:', err.message));
}
