import { config } from '../config.js';

/**
 * CORS: lets the dashboard on another domain (e.g. flashdrop.onrender.com)
 * call this API. Browsers block cross-domain requests unless the server says
 * that domain is allowed. Only our own dashboard's origin is allowed.
 *
 * Locally this never kicks in: Vite (dev) and Nginx (Docker) serve the
 * dashboard and the API from the same origin.
 */
export function cors(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin === config.corsOrigin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'content-type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Max-Age', '600'); // cache the preflight for 10 minutes
  }
  // Preflight: the browser asks "may I send this POST?" before sending it
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}
