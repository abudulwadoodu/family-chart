import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { findOrCreateUserByCognitoSub, updateLastLogin } from '../models/userModel.js';

let verifier;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      clientId: process.env.COGNITO_CLIENT_ID,
      tokenUse: 'id',
    });
  }
  return verifier;
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = await getVerifier().verify(token);
    const user = findOrCreateUserByCognitoSub(payload.sub, payload.email);
    if (user.status === 'suspended') return res.status(403).json({ error: 'This account has been suspended' });
    updateLastLogin(user.id);
    req.user = { id: user.id, email: user.email, isAdmin: Boolean(user.is_admin), adminRole: user.admin_role || null };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Authentication required' });
  }
}
