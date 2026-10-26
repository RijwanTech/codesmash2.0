import 'dotenv/config';

function need(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`\n✖ Missing ${name}. Copy server/.env.example to server/.env and fill it in.\n`);
    process.exit(1);
  }
  return v.trim();
}

function buildMongoUri() {
  if (process.env.MONGODB_URI?.trim()) return process.env.MONGODB_URI.trim();
  const user = need('MONGODB_USER');
  const pass = need('MONGODB_PASSWORD');
  const host = need('MONGODB_HOST');
  const db = process.env.MONGODB_DB?.trim() || 'codesmash';
  return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${db}?retryWrites=true&w=majority`;
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: buildMongoUri(),
  jwtSecret: need('JWT_SECRET'),
  adminUsername: need('ADMIN_USERNAME'),
  adminPassword: need('ADMIN_PASSWORD'),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  judge: {
    url: process.env.JUDGE0_URL?.trim() || '',
    authToken: process.env.JUDGE0_AUTH_TOKEN?.trim() || '',
    rapidApiKey: process.env.JUDGE0_RAPIDAPI_KEY?.trim() || '',
    langIds: Object.fromEntries(
      [
        ['python', process.env.JUDGE0_LANG_PYTHON],
        ['java', process.env.JUDGE0_LANG_JAVA],
        ['c', process.env.JUDGE0_LANG_C],
      ]
        .filter(([, v]) => v && Number(v))
        .map(([k, v]) => [k, Number(v)]),
    ),
  },
  smtp: {
    host: process.env.SMTP_HOST?.trim() || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER?.trim() || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM?.trim() || 'FORCES CodeSmash <no-reply@example.com>',
  },
};
