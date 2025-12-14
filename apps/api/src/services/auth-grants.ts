import { db, getGrant, getUserById, putGrant } from '../db/client';
import type { AuthGrant, DbUser, UserRole } from '../db/client';
import { randomToken } from './crypto';
import { signHs256Jwt } from './jwt';

const GRANT_TTL_SECONDS = 5 * 60;
const SESSION_JWT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function getRedirectBaseUrl(role: UserRole) {
  const host = process.env.HOST ?? '127.0.0.1';
  const coachPort = Number(process.env.COACH_PORT ?? 3701);
  const clientPort = Number(process.env.CLIENT_PORT ?? 3702);

  const coachUrl = process.env.COACH_APP_URL ?? `http://${host}:${coachPort}`;
  const clientUrl = process.env.CLIENT_APP_URL ?? `http://${host}:${clientPort}`;

  return role === 'coach' ? coachUrl : clientUrl;
}

export function createAuthGrant(userId: string): AuthGrant {
  const token = randomToken(24);
  const now = Date.now();
  const grant: AuthGrant = {
    token,
    userId,
    createdAt: now,
    expiresAt: now + GRANT_TTL_SECONDS * 1000,
    used: false,
  };
  putGrant(grant);
  return grant;
}

export async function exchangeGrantForJwt(grantToken: string): Promise<string> {
  const grant = getGrant(grantToken);
  if (!grant) throw new Error('Invalid grant');
  if (grant.used) throw new Error('Grant already used');
  if (Date.now() > grant.expiresAt) throw new Error('Grant expired');

  const user = getUserById(grant.userId);
  if (!user) throw new Error('User not found');

  // Single-use.
  db.grantsByToken.set(grant.token, { ...grant, used: true });

  const secret = process.env.JWT_SECRET ?? 'devsecret';
  return await signHs256Jwt(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tier: user.membershipTier,
    },
    secret,
    SESSION_JWT_TTL_SECONDS
  );
}

export function buildRedirectUrl(user: DbUser, grantToken: string) {
  const base = getRedirectBaseUrl(user.role);
  const url = new URL('/auth/callback', base);
  url.searchParams.set('grant', grantToken);
  return url.toString();
}
