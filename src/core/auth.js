/**
 * src/core/auth.js
 * Middleware helpers for session-based authentication.
 *
 * requireAuth    – any logged-in user
 * requireAdmin   – only users with role === 'admin'
 */

/** Attach this to any route that needs a logged-in session. */
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'غير مسموح – يرجى تسجيل الدخول أولاً.' });
  }
  next();
}

/** Attach this to admin-only routes. */
export function requireAdmin(req, res, next) {
  if (!req.session?.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'غير مسموح – هذه الصفحة للمسؤولين فقط.' });
  }
  next();
}
