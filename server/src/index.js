import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import { errorHandler } from './middleware.js';
import { initRealtime } from './realtime.js';
import { seedOrMigrate } from './seed.js';
import { expireAttempts } from './competition.js';
import { mailEnabled } from './mailer.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import studentRoutes, { publicRouter } from './routes/student.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: '100kb' }));

// If the database connection is down, say so clearly instead of a vague "something went wrong".
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || mongoose.connection.readyState === 1) return next();
  res.status(503).json({ error: 'The server cannot reach the database right now. Please wait a few seconds and try again.' });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'codesmash', apiVersion: 3, db: mongoose.connection.readyState === 1, time: Date.now() }));
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRouter);
app.use('/api/admin', adminRoutes);
app.use('/api', studentRoutes); // must stay last: it requires a student login for everything under /api
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built React app when it exists (one deployment for UI + API).
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  console.log('✔ Serving the built client from', dist);
}

app.use(errorHandler);

const server = http.createServer(app);
initRealtime(server, { origins: config.clientOrigins, secret: config.jwtSecret });

async function main() {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    console.error('\n✖ Could not connect to MongoDB Atlas:', err.message);
    if (/auth/i.test(err.message)) console.error('  → Check the database user name and password in server/.env.');
    else
      console.error(
        '  → In Atlas open "Network Access" and allow your IP address (or 0.0.0.0/0 while testing), and check MONGODB_HOST.',
      );
    process.exit(1);
  }
  console.log('✔ Connected to MongoDB Atlas');
  await seedOrMigrate();

  // Auto-submit attempts whose time ran out, even if nobody is looking at the page.
  setInterval(() => expireAttempts().catch((e) => console.error('expireAttempts:', e.message)), 5000);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n✖ Port ${config.port} is already in use by another program (maybe an older copy of this server).`);
      console.error('  → Close the other terminal / end the other "node" process in Task Manager, or set PORT=5001 in server/.env');
      console.error('    (and change the port in client/vite.config.ts to match), then start again.');
    } else {
      console.error('✖ Server error:', err);
    }
    process.exit(1);
  });
  server.listen(config.port, () => {
    console.log(`✔ API + live notifications on http://localhost:${config.port}`);
    console.log(`  Email notifications: ${mailEnabled ? 'ON' : 'off (set SMTP_* in .env to enable)'}`);
  });
}

// Never let one failed request or database hiccup silently kill the whole server: log it and keep running.
process.on('unhandledRejection', (err) => console.error('⚠ Unhandled error (server keeps running):', err));
process.on('uncaughtException', (err) => console.error('⚠ Uncaught error (server keeps running):', err));

main().catch((err) => {
  console.error('\n✖ The server could not start:', err);
  process.exit(1);
});
