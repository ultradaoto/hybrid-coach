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

// Pre-seeded user accounts
export type SeedUser = {
  email: string;
  password: string;
  role: UserRole;
  displayName: string;
};

const SEED_USERS: SeedUser[] = [
  {
    email: 'sterling.cooley@gmail.com',
    password: 'MOONshot1!',
    role: 'client',
    displayName: 'Sterling Cooley',
  },
  {
    email: 'ultradaoto@gmail.com',
    password: 'MOONshot1!',
    role: 'coach',
    displayName: 'Ultra Coach',
  },
  // Admin user - add your email to ADMIN_EMAILS env var to enable admin login
  {
    email: 'admin@myultra.coach',
    password: 'MOONshot1!',
    role: 'admin',
    displayName: 'Admin User',
  },
  {
    email: 'evvargreen@hotmail.com',
    password: '1Sunny1',
    role: 'client',
    displayName: 'Mom',
  },
  // Demo account for hackathon judges
  {
    email: 'demo@gmail.com',
    password: 'password',
    role: 'client',
    displayName: 'Demo Judge',
  },
];

let seedInitialized = false;

export async function initSeedUsers(hashFn: (password: string, salt: string) => Promise<string>) {
  if (seedInitialized) return;
  seedInitialized = true;

  console.log('[Auth] Initializing seed users...');
  
  for (const seed of SEED_USERS) {
    const email = normalizeEmail(seed.email);
    if (usersByEmail.has(email)) {
      console.log(`[Auth] User ${email} already exists, skipping`);
      continue;
    }

    const salt = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const passwordHash = await hashFn(seed.password, salt);

    const user: DbUser = {
      id: crypto.randomUUID(),
      email,
      displayName: seed.displayName,
      role: seed.role,
      membershipTier: seed.role === 'coach' || seed.role === 'admin' ? 'PREMIUM' : 'VAGUS_MEMBER',
      passwordHash,
      passwordSalt: salt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    usersByEmail.set(email, user);
    usersById.set(user.id, user);
    console.log(`[Auth] Seeded user: ${email} (${seed.role})`);
  }

  console.log('[Auth] Seed users initialized');
}

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
