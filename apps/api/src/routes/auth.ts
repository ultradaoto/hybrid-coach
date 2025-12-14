import { jsonResponse } from '../middleware/cors';
import {
  createAuthGrant,
  buildRedirectUrl,
  exchangeGrantForJwt,
} from '../services/auth-grants';
import {
  defaultRoleForEmail,
  defaultTierForRole,
  getUserByEmail,
  normalizeEmail,
  nowIso,
  upsertUser,
} from '../db/client';
import { pbkdf2Sha256, randomToken } from '../services/crypto';

async function ensurePasswordHash(password: string, salt: string) {
  return await pbkdf2Sha256(password, salt);
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = await ensurePasswordHash(password, salt);
  return timingSafeEqual(actual, expectedHash);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function authRoutes(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // POST /api/auth/login
  if (path === '/api/auth/login' && method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const emailRaw = body?.email;
    const password = body?.password;
    const portal = body?.portal;
    if (typeof emailRaw !== 'string' || typeof password !== 'string') {
      return jsonResponse({ success: false, error: 'Missing email or password' }, { status: 400 });
    }

    const requestedRole = portal === 'coach' || portal === 'client' ? (portal as 'coach' | 'client') : null;

    const email = normalizeEmail(emailRaw);
    const existing = getUserByEmail(email);

    // Dev-first behavior: first login creates the account.
    // In production, swap this for real DB lookup + membership/tier enforcement.
    let user = existing;
    if (!user) {
      const role = requestedRole ?? defaultRoleForEmail(email);
      const salt = randomToken(12);
      const passwordHash = await ensurePasswordHash(password, salt);

      user = upsertUser({
        id: crypto.randomUUID(),
        email,
        displayName: email.split('@')[0] || 'User',
        role,
        membershipTier: defaultTierForRole(role),
        passwordHash,
        passwordSalt: salt,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    } else {
      const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
      if (!ok) {
        return jsonResponse({ success: false, error: 'Invalid credentials' }, { status: 401 });
      }
    }

    const grant = createAuthGrant(user.id);
    const redirectUrl = buildRedirectUrl(user, grant.token);

    return jsonResponse({
      success: true,
      data: {
        grant: grant.token,
        redirectUrl,
        role: user.role,
      },
    });
  }

  // POST /api/auth/exchange
  if (path === '/api/auth/exchange' && method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const grant = body?.grant;
    if (typeof grant !== 'string' || !grant) {
      return jsonResponse({ success: false, error: 'Missing grant' }, { status: 400 });
    }

    try {
      const token = await exchangeGrantForJwt(grant);
      return jsonResponse({ success: true, data: { token } });
    } catch {
      return jsonResponse({ success: false, error: 'Invalid grant' }, { status: 401 });
    }
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}
