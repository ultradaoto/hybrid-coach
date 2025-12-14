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
  initSeedUsers,
  normalizeEmail,
  nowIso,
  upsertUser,
} from '../db/client';
import { pbkdf2Sha256, randomToken } from '../services/crypto';

async function ensurePasswordHash(password: string, salt: string) {
  return await pbkdf2Sha256(password, salt);
}

// Initialize seed users on module load
initSeedUsers(ensurePasswordHash).catch(console.error);

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
    if (typeof emailRaw !== 'string' || typeof password !== 'string') {
      return jsonResponse({ success: false, error: 'Missing email or password' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    const existing = getUserByEmail(email);

    // Production behavior: users must exist (created via seed or Skool sync)
    if (!existing) {
      console.log(`[Auth] Login attempt for unknown email: ${email}`);
      return jsonResponse({ 
        success: false, 
        error: 'Account not found. Please ensure you have an active Vagus Skool membership.' 
      }, { status: 401 });
    }

    // Verify password
    const ok = await verifyPassword(password, existing.passwordSalt, existing.passwordHash);
    if (!ok) {
      console.log(`[Auth] Invalid password for: ${email}`);
      return jsonResponse({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    console.log(`[Auth] Successful login: ${email} (${existing.role})`);

    const grant = createAuthGrant(existing.id);
    const redirectUrl = buildRedirectUrl(existing, grant.token);

    return jsonResponse({
      success: true,
      data: {
        grant: grant.token,
        redirectUrl,
        role: existing.role,
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
