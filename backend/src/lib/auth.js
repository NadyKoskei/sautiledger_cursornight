import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function secret() {
  return process.env.AUTH_SECRET || 'sautiledger-dev-secret';
}

export function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(String(pin), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPin(pin, stored) {
  const [salt, derived] = String(stored).split(':');
  if (!salt || !derived) return false;

  const candidate = scryptSync(String(pin), salt, 64);
  const expected = Buffer.from(derived, 'hex');
  if (candidate.length !== expected.length) return false;

  return timingSafeEqual(candidate, expected);
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createToken(businessId) {
  const payload = Buffer.from(
    JSON.stringify({ sub: businessId, exp: Date.now() + TOKEN_TTL_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string') return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!claims.exp || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const claims = readToken(header.replace(/^Bearer\s+/i, ''));

  if (!claims) {
    return res.status(401).json({ error: 'unauthorized', message: 'Please log in again.' });
  }

  req.businessId = claims.sub;
  return next();
}

export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+254')) return `0${digits.slice(4)}`;
  if (digits.startsWith('254')) return `0${digits.slice(3)}`;
  return digits;
}
