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
    updateLastLogin(user.id);
    req.user = { id: user.id, email: user.email };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Authentication required' });
  }
}
