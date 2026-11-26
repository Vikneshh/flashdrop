import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Admin-only routes (create/reset a drop, crash simulation, step-1 demo routes).
 *
 * - ADMIN_TOKEN set      → caller must send header `x-admin-token: <token>`
 * - no token, local dev  → allowed, so the demo scripts keep working
 * - no token, production → locked. A public server must never let a
 *                          stranger wipe the current drop.
 */
export function requireAdmin(req, res, next) {
  const token = config.adminToken;
  if (!token) {
    return config.isProduction ? res.status(403).json({ ok: false, reason: 'admin_disabled' }) : next();
  }
  const given = Buffer.from(String(req.get('x-admin-token') ?? ''));
  const expected = Buffer.from(token);
  // timingSafeEqual: comparing strings with === leaks (via timing) how many characters matched
  const ok = given.length === expected.length && timingSafeEqual(given, expected);
  return ok ? next() : res.status(401).json({ ok: false, reason: 'admin_token_required' });
}
