import { getAllSettings } from '../models/settingsModel.js';

const BYPASS_COOKIE = 'maintenance_bypass';
// One year - the cookie just needs to outlive a dev/QA session; there's no
// sensitive data in it, only proof the caller knows the shared bypass key.
const BYPASS_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

// Routes that must stay reachable even while maintenance mode is on, so
// admins can still authenticate and flip the flag back off.
const EXEMPT_PREFIXES = ['/api/auth', '/api/admin'];

function isExempt(path) {
  return EXEMPT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// Express has no built-in cookie parser (that's cookie-parser's job, which
// this app doesn't otherwise need) - just enough here to read one flag cookie.
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function hasValidBypass(req) {
  const configuredKey = process.env.MAINTENANCE_BYPASS_KEY;
  if (!configuredKey) return false;

  const suppliedKey = req.headers['x-bypass-key'] || req.query?.bypass_key;
  if (suppliedKey === configuredKey) return true;

  return readCookie(req, BYPASS_COOKIE) === configuredKey;
}

// Global gate: while maintenance mode is on, block every route except the
// auth/admin exemptions above, unless the caller presents a valid bypass key
// (header, query param, or a previously-set cookie from one of those).
export async function maintenanceGuard(req, res, next) {
  try {
    // Checked before the exempt-path shortcut below: a caller's very first
    // request often lands on an exempt route (e.g. hitting /api/auth/me to
    // "log in"), and the bypass key needs to work there too, not just on
    // routes the guard would otherwise block.
    const suppliedKey = req.headers['x-bypass-key'] || req.query?.bypass_key;
    const configuredKey = process.env.MAINTENANCE_BYPASS_KEY;
    if (suppliedKey && configuredKey && suppliedKey === configuredKey) {
      res.cookie(BYPASS_COOKIE, configuredKey, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: BYPASS_COOKIE_MAX_AGE_MS,
      });
    }

    if (isExempt(req.path)) return next();
    if (hasValidBypass(req)) return next();

    const settings = await getAllSettings();
    const isMaintenanceMode = settings.maintenanceMode ?? process.env.MAINTENANCE_MODE === 'true';
    if (!isMaintenanceMode) return next();

    return res.status(503).json({
      status: 'maintenance',
      message: 'System is under maintenance. Please check back shortly.',
    });
  } catch (error) {
    return next(error);
  }
}
