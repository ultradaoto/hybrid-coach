export type UserRole = 'coach' | 'client' | 'admin';
export type MembershipTier = 'FREE' | 'VAGUS_MEMBER' | 'PREMIUM';

export type DbUser = {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  membershipTier: MembershipTier;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthGrant = {
  token: string;
  userId: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
};

// NOTE: This is a memory-backed "DB" to get the architecture wired end-to-end.
// The architecture doc expects a real DB (Prisma/Drizzle); swap these maps for DB calls.
const usersByEmail = new Map<string, DbUser>();
const usersById = new Map<string, DbUser>();
const grantsByToken = new Map<string, AuthGrant>();

export const db = {
  usersByEmail,
  usersById,
  grantsByToken,
};

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function defaultRoleForEmail(email: string): UserRole {
  const list = (process.env.DEV_COACH_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.includes(email)) return 'coach';
  return 'client';
}

export function defaultTierForRole(role: UserRole): MembershipTier {
  if (role === 'coach') return 'PREMIUM';
  return 'FREE';
}

export function getUserByEmail(emailRaw: string): DbUser | null {
  const email = normalizeEmail(emailRaw);
  return usersByEmail.get(email) ?? null;
}

export function getUserById(id: string): DbUser | null {
  return usersById.get(id) ?? null;
}

export function upsertUser(user: DbUser) {
  const email = normalizeEmail(user.email);
  const next: DbUser = { ...user, email, updatedAt: nowIso() };
  usersByEmail.set(email, next);
  usersById.set(next.id, next);
  return next;
}

export function putGrant(grant: AuthGrant) {
  grantsByToken.set(grant.token, grant);
}

export function getGrant(token: string) {
  return grantsByToken.get(token) ?? null;
}
