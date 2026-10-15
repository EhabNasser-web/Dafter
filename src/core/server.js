/**
 * src/core/server.js
 * Express entry point for Daftar.
 * - Session auth (cookie-based)
 * - Admin router (/admin)
 * - Health check (/health)
 * - Static files from /public
 */

import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { adminRouter } from '../modules/admin/router.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { loadModules } from './moduleLoader.js';
import { chatRouter } from '../modules/chat/router.js';
import { startScheduler } from './scheduler.js';
import { runMigrations } from '../../scripts/migrate.js';


const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway proxy (essential for rate limiting & secure cookies)
app.set('trust proxy', 1);

process.on('uncaughtException', err => {
  console.error('💥 [server] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [server] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── CORS (allow credentials for session cookie) ──────────────────────────────
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || true,
    credentials: true,
  })
);

// ─── Security hardening ───────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// Phase 2.4 – same-origin check for mutating API calls (CSRF defense for
// cookie sessions; the SPA always sends same-origin requests).
app.use(['/api', '/admin'], (req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const referer = req.get('referer');
  const host = req.get('host');
  // Non-browser clients (curl, tests) send neither – allow them.
  if (!origin && !referer) return next();
  const bad = (v) => {
    try { return new URL(v).host !== host; } catch { return true; }
  };
  if ((origin && bad(origin)) || (referer && bad(referer))) {
    return res.status(403).json({ error: 'طلب مرفوض (مصدر غير موثوق).' });
  }
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'كثير من المحاولات، انتظر قليلاً.' },
});
app.use('/admin/login', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot', authLimiter);

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'كثير من الرسائل، انتظر قليلاً.' },
});
app.use('/api/chat', chatLimiter);

const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'كثير من الرسائل الصوتية، انتظر قليلاً.' },
});
app.use('/api/voice', voiceLimiter);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'طلبات كثيرة، انتظر قليلاً.' },
});
app.use('/api/summary', apiLimiter);
app.use('/api/export', apiLimiter);

// ─── Session ──────────────────────────────────────────────────────────────────

if (!process.env.SESSION_SECRET) {
  console.warn('[server] SESSION_SECRET is not set – using insecure default. Set it in .env!');
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'daftar-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
    },
  })
);

// ─── Health check (used by Railway + uptime monitors) ─────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'daftar', ts: new Date().toISOString() });
});

// ─── Admin API ────────────────────────────────────────────────────────────────
app.use('/admin', adminRouter);

// ─── Chat API ─────────────────────────────────────────────────────────────────
app.use('/api/chat', chatRouter);

(async () => {
  try {
    await runMigrations();
  } catch (migErr) {
    console.error('[server] Initial migration warning:', migErr.message);
  }

  // Each init step is isolated so a failure can never prevent app.listen().
  // Railway must always get a listening process for its /health check;
  // without this, a single broken module reports as CRASHED/Completed.
  try {
    await loadModules(app);
  } catch (modErr) {
    console.error('[server] Module loading failed – continuing in degraded mode:', modErr);
  }

  try {
    startScheduler();
  } catch (schedErr) {
    console.error('[server] Scheduler failed to start:', schedErr.message);
  }

  // ─── Static frontend (added in Step 1.4) ─────────────────────────────────────
  app.use(express.static(join(__dirname, '../../public')));

  // ─── 404 fallback ─────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'المسار غير موجود.' });
  });

  // ─── Global error handler ─────────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'خطأ غير متوقع في الخادم.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀  Daftar – http://0.0.0.0:${PORT}  [${process.env.NODE_ENV || 'development'}]`);
  });
})();

