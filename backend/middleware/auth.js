import { verifyAccessToken } from '../utils/jwt.js';

export const ACCESS_TOKEN_COOKIE = 'family_chart.at';
export const REFRESH_TOKEN_COOKIE = 'family_chart.rt';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Authentication required' });
  }
}
