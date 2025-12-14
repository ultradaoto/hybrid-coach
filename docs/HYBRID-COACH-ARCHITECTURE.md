# Hybrid-Coach Voice Coaching Platform: Complete Architecture Specification

## Executive Summary

This document specifies the complete architecture for **myultra.coach**, a three-way voice coaching platform where AI coaching agents (orbs) interact with human clients, with optional human coach participation. The platform uses self-hosted LiveKit on DigitalOcean, Deepgram for voice AI, and a Bun/TypeScript monorepo structure.

**Key differentiator**: The AI agent participates as a full room member with its own audio channel, and human coaches can selectively mute their audio from the AI's perception while maintaining always-on transcription.

---

## Legacy Code Reference

### Archive Location: `/Archive/`

The following legacy Node.js projects contain substantial reusable logic and should be referenced during implementation:

| Archive Directory | Contains | Port To |
|-------------------|----------|---------|
| `/Archive/Hybrid-Coach/` | Homepage, login system, coach/client portal views with gated auth routing | `apps/web-public/`, `apps/web-coach/`, `apps/web-client/` |
| `/Archive/Hybrid-Coach-GPU/` | AI Orb headless widget container, browser automation, audio streaming | `services/orb-renderer/` |
| `/Archive/Hybrid-Coach-Rooms/` | Room spawning logic, orb launching, WebRTC coordination | `services/room-manager/`, `services/ai-agent/` |

### Migration Strategy

When implementing each component, developers should:

1. **Review the archive first** — Understand existing patterns before rewriting
2. **Extract business logic** — Port validation rules, state machines, and domain logic directly
3. **Modernize infrastructure** — Replace raw WebRTC with LiveKit, socket.io with Bun WebSockets
4. **Preserve UI/UX patterns** — The coach and client views have been user-tested; maintain their structure

---

## Project Structure

```
/hybrid-coach
├── apps/
│   ├── api/                          # Main Bun API server (port 3001)
│   │   ├── src/
│   │   │   ├── index.ts              # Server entry point
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts           # Unified auth (issues tokens for all apps)
│   │   │   │   ├── rooms.ts          # Room CRUD, LiveKit token generation
│   │   │   │   ├── sessions.ts       # Coaching session management
│   │   │   │   ├── users.ts          # User profile, tier lookup
│   │   │   │   └── webhooks.ts       # LiveKit webhooks, Skool sync triggers
│   │   │   ├── services/
│   │   │   │   ├── livekit.ts        # LiveKit server SDK wrapper
│   │   │   │   ├── auth-grants.ts    # Cross-domain auth token service
│   │   │   │   ├── tier-service.ts   # Membership tier logic
│   │   │   │   └── usage-tracker.ts  # Session time tracking per user
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # JWT validation
│   │   │   │   └── tier-check.ts     # Enforce usage limits by tier
│   │   │   └── db/
│   │   │       ├── schema.ts         # Drizzle/Prisma schema
│   │   │       └── client.ts
│   │   └── package.json
│   │
│   ├── web-public/                   # Landing page + unified login (port 5170)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── Home.tsx          # Marketing landing page
│   │   │   │   ├── Login.tsx         # Unified login (routes to coach/client)
│   │   │   │   ├── Pricing.tsx
│   │   │   │   └── AuthCallback.tsx  # Handles auth grant redirects
│   │   │   └── components/
│   │   └── package.json
│   │
│   ├── web-coach/                    # Coach dashboard (port 5171)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx     # Overview, upcoming sessions
│   │   │   │   ├── Clients.tsx       # Client management
│   │   │   │   ├── Calendar.tsx      # Schedule management
│   │   │   │   ├── CallRoom.tsx      # Coach view of coaching room
│   │   │   │   └── Settings.tsx
│   │   │   ├── components/
│   │   │   │   ├── AIControlPanel.tsx      # Mute AI, inject prompts
│   │   │   │   ├── ClientDataSidebar.tsx   # Real-time client info
│   │   │   │   ├── TranscriptPanel.tsx     # Live transcription view
│   │   │   │   └── OrbVisualization.tsx    # Audio-reactive orb (observer)
│   │   │   └── hooks/
│   │   │       ├── useLiveKitRoom.ts
│   │   │       └── useCoachControls.ts
│   │   └── package.json
│   │
│   └── web-client/                   # Client portal (port 5172)
│       ├── src/
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx     # Session history, reports
│       │   │   ├── BookSession.tsx   # Schedule with AI or human coach
│       │   │   ├── WaitingRoom.tsx   # Pre-session with music
│       │   │   ├── CallRoom.tsx      # Client view of coaching room
│       │   │   └── Reports.tsx       # AI-generated insights
│       │   ├── components/
│       │   │   ├── MusicPlayer.tsx         # Favorite song playback
│       │   │   ├── OrbVisualization.tsx    # Audio-reactive orb (interactive)
│       │   │   ├── SessionTimer.tsx        # Usage tracking display
│       │   │   └── TierBanner.tsx          # Shows remaining time (free tier)
│       │   └── hooks/
│       │       ├── useLiveKitRoom.ts
│       │       └── useSessionTimer.ts
│       └── package.json
│
├── services/
│   ├── room-manager/                 # Room lifecycle supervisor
│   │   ├── src/
│   │   │   ├── index.ts              # Process supervisor entry
│   │   │   ├── room.worker.ts        # Individual room process
│   │   │   ├── spawn.ts              # Room spawning logic
│   │   │   └── health.ts             # Health monitoring, restart logic
│   │   └── package.json
│   │
│   ├── ai-agent/                     # LiveKit Agent (NODE.JS ONLY - NOT BUN)
│   │   ├── src/
│   │   │   ├── index.ts              # Agent worker entry
│   │   │   ├── coaching-agent.ts     # Voice AI personality/prompts
│   │   │   ├── selective-audio.ts    # Coach mute implementation
│   │   │   └── deepgram-config.ts    # STT/TTS configuration
│   │   ├── package.json              # Uses node, not bun
│   │   └── tsconfig.json
│   │
│   ├── orb-renderer/                 # Headless orb for streaming (optional)
│   │   ├── src/
│   │   │   ├── index.ts              # Puppeteer orchestration
│   │   │   ├── orb-widget.tsx        # Standalone orb component
│   │   │   └── audio-bridge.ts       # Audio capture/injection
│   │   └── Dockerfile
│   │
│   └── skool-sync/                   # Nightly membership sync
│       ├── src/
│       │   ├── index.ts              # Cron entry point
│       │   ├── skool-scraper.ts      # Puppeteer login & scrape
│       │   ├── membership-sync.ts    # Update DB with tier info
│       │   └── notifications.ts      # Alert on sync failures
│       └── package.json
│
├── packages/
│   ├── shared/                       # Shared types and utilities
│   │   └── src/
│   │       ├── types/
│   │       │   ├── user.ts           # User, Coach, Client types
│   │       │   ├── room.ts           # Room, Session types
│   │       │   ├── tier.ts           # MembershipTier enum + limits
│   │       │   └── auth.ts           # AuthGrant, TokenPayload
│   │       ├── constants/
│   │       │   └── tiers.ts          # Tier limits configuration
│   │       └── utils/
│   │           └── time.ts           # Duration formatting
│   │
│   ├── ui/                           # Shared React components
│   │   └── src/
│   │       ├── Orb/
│   │       │   ├── Orb.tsx           # Audio-reactive orb component
│   │       │   ├── useAudioAnalyser.ts
│   │       │   └── orb.canvas.ts     # Canvas 2D rendering
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       └── VideoTile.tsx
│   │
│   └── livekit/                      # LiveKit utilities
│       └── src/
│           ├── token.ts              # Token generation helpers
│           ├── room-service.ts       # Room management wrapper
│           └── hooks/                # React hooks for LiveKit
│               ├── useRoom.ts
│               ├── useParticipant.ts
│               └── useTrack.ts
│
├── prisma/
│   ├── schema.prisma                 # Database schema
│   └── migrations/
│
├── scripts/
│   ├── setup-livekit.sh              # LiveKit server setup
│   └── dev.ts                        # Development orchestration
│
├── docker/
│   ├── docker-compose.yml            # Local development stack
│   ├── docker-compose.prod.yml       # Production stack
│   └── livekit/
│       └── livekit.yaml              # LiveKit server config
│
├── package.json                      # Workspace root
├── turbo.json                        # Turborepo task config
├── ecosystem.config.js               # PM2 production config
└── .env.example
```

---

## Authentication Architecture

### The Auth Grant Flow

Since coach and client portals run on separate ports/domains, authentication requires a **cross-domain auth grant** system. All initial authentication happens through `web-public`, which then issues transferable grants.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED LOGIN FLOW                                │
│                                                                          │
│  1. User visits myultra.coach/login (web-public:5170)                   │
│  2. User submits email + password                                        │
│  3. API validates credentials against database                           │
│  4. API checks user.role from database (coach or client)                │
│  5. API generates AuthGrant token (short-lived, single-use)             │
│  6. web-public redirects to appropriate portal with grant:              │
│     • Coach → myultra.coach:5171/auth/callback?grant=xxx                │
│     • Client → myultra.coach:5172/auth/callback?grant=xxx               │
│  7. Portal exchanges grant for session JWT                               │
│  8. Portal stores JWT, user proceeds to dashboard                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Schema for Auth

```prisma
// prisma/schema.prisma

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  role          UserRole  // COACH or CLIENT - set by nightly Skool sync
  
  // Membership tier (updated nightly by skool-sync service)
  membershipTier  MembershipTier  @default(FREE)
  skoolMemberId   String?         @unique
  tierLastChecked DateTime?
  
  // Usage tracking
  monthlyMinutesUsed  Int       @default(0)
  monthlyResetAt      DateTime?
  
  // Relations
  coachProfile    CoachProfile?
  clientProfile   ClientProfile?
  sessions        Session[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum UserRole {
  COACH
  CLIENT
}

enum MembershipTier {
  FREE          // 1 session/month, 20 min cap
  VAGUS_MEMBER  // Unlimited sessions, full reports
  PREMIUM       // Unlimited + human coach access
}

model AuthGrant {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  expiresAt DateTime // 5 minutes from creation
  used      Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

### Auth Implementation

```typescript
// apps/api/src/services/auth-grants.ts

import { db } from '../db/client';
import { sign, verify } from 'jsonwebtoken';
import { nanoid } from 'nanoid';

const GRANT_EXPIRY_MINUTES = 5;
const JWT_EXPIRY = '7d';

interface AuthGrantPayload {
  userId: string;
  role: 'COACH' | 'CLIENT';
  tier: MembershipTier;
}

export async function createAuthGrant(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { role: true, membershipTier: true }
  });
  
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + GRANT_EXPIRY_MINUTES * 60 * 1000);
  
  await db.authGrant.create({
    data: { userId, token, expiresAt }
  });
  
  return token;
}

export async function exchangeGrant(grantToken: string): Promise<string> {
  const grant = await db.authGrant.findUnique({
    where: { token: grantToken },
    include: { user: true }
  });
  
  if (!grant || grant.used || grant.expiresAt < new Date()) {
    throw new Error('Invalid or expired auth grant');
  }
  
  // Mark as used (single-use)
  await db.authGrant.update({
    where: { id: grant.id },
    data: { used: true }
  });
  
  // Generate session JWT
  const jwt = sign(
    {
      userId: grant.user.id,
      role: grant.user.role,
      tier: grant.user.membershipTier
    },
    process.env.JWT_SECRET!,
    { expiresIn: JWT_EXPIRY }
  );
  
  return jwt;
}

export function getRedirectUrl(role: UserRole): string {
  const baseUrls = {
    COACH: process.env.COACH_APP_URL || 'http://localhost:5171',
    CLIENT: process.env.CLIENT_APP_URL || 'http://localhost:5172'
  };
  return `${baseUrls[role]}/auth/callback`;
}
```

### Login Route

```typescript
// apps/api/src/routes/auth.ts

import { Hono } from 'hono';
import { createAuthGrant, exchangeGrant, getRedirectUrl } from '../services/auth-grants';
import { db } from '../db/client';
import { compare } from 'bcrypt';

const auth = new Hono();

// POST /api/auth/login - Unified login endpoint
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await compare(password, user.passwordHash))) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }
  
  // Create auth grant for cross-domain transfer
  const grant = await createAuthGrant(user.id);
  const redirectUrl = getRedirectUrl(user.role);
  
  return c.json({
    success: true,
    data: {
      grant,
      redirectUrl: `${redirectUrl}?grant=${grant}`,
      role: user.role
    }
  });
});

// POST /api/auth/exchange - Exchange grant for JWT (called by portal apps)
auth.post('/exchange', async (c) => {
  const { grant } = await c.req.json();
  
  try {
    const jwt = await exchangeGrant(grant);
    return c.json({ success: true, data: { token: jwt } });
  } catch (error) {
    return c.json({ success: false, error: 'Invalid grant' }, 401);
  }
});

export default auth;
```

### Frontend Login Component

```typescript
// apps/web-public/src/pages/Login.tsx

import { useState } from 'react';
import { apiClient } from '@hybrid/utils';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/api/auth/login', { email, password });
      
      if (response.success) {
        // Redirect to appropriate portal with auth grant
        // The portal will exchange the grant for a JWT
        window.location.href = response.data.redirectUrl;
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h1 className="text-2xl font-bold text-center mb-6">Sign In to MyUltra.Coach</h1>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>
        )}
        
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="w-full p-3 border rounded-lg mb-4"
          required
        />
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full p-3 border rounded-lg mb-6"
          required
        />
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        
        <p className="text-center text-gray-500 mt-4 text-sm">
          Your role (coach or client) is determined by your Vagus Skool membership.
        </p>
      </form>
    </div>
  );
}
```

### Auth Callback (Portal Side)

```typescript
// apps/web-coach/src/pages/AuthCallback.tsx (same pattern for web-client)

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@hybrid/utils';

export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const grant = searchParams.get('grant');
    if (!grant) {
      setError('No auth grant provided');
      return;
    }

    async function exchangeGrant() {
      try {
        const response = await apiClient.post('/api/auth/exchange', { grant });
        
        if (response.success) {
          // Store JWT in localStorage (or httpOnly cookie via API)
          localStorage.setItem('auth_token', response.data.token);
          navigate('/dashboard');
        } else {
          setError('Failed to authenticate. Please login again.');
          setTimeout(() => {
            window.location.href = process.env.PUBLIC_APP_URL + '/login';
          }, 2000);
        }
      } catch (err) {
        setError('Authentication error');
      }
    }

    exchangeGrant();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse">Authenticating...</div>
    </div>
  );
}
```

---

## Membership Tier System

### Tier Definitions

```typescript
// packages/shared/src/constants/tiers.ts

export enum MembershipTier {
  FREE = 'FREE',
  VAGUS_MEMBER = 'VAGUS_MEMBER',
  PREMIUM = 'PREMIUM'
}

export interface TierLimits {
  sessionsPerMonth: number | null;  // null = unlimited
  maxSessionMinutes: number | null; // null = unlimited
  humanCoachAccess: boolean;
  aiReportsEnabled: boolean;
  prioritySupport: boolean;
}

export const TIER_LIMITS: Record<MembershipTier, TierLimits> = {
  [MembershipTier.FREE]: {
    sessionsPerMonth: 1,
    maxSessionMinutes: 20,
    humanCoachAccess: false,
    aiReportsEnabled: false,
    prioritySupport: false
  },
  [MembershipTier.VAGUS_MEMBER]: {
    sessionsPerMonth: null,        // Unlimited
    maxSessionMinutes: null,       // Unlimited
    humanCoachAccess: false,       // AI only
    aiReportsEnabled: true,        // Full reports & suggestions
    prioritySupport: false
  },
  [MembershipTier.PREMIUM]: {
    sessionsPerMonth: null,
    maxSessionMinutes: null,
    humanCoachAccess: true,        // Can schedule with human coaches
    aiReportsEnabled: true,
    prioritySupport: true
  }
};
```

### Tier Enforcement Middleware

```typescript
// apps/api/src/middleware/tier-check.ts

import { Context, Next } from 'hono';
import { db } from '../db/client';
import { TIER_LIMITS, MembershipTier } from '@hybrid/shared/constants/tiers';

export async function tierCheckMiddleware(c: Context, next: Next) {
  const userId = c.get('userId');
  
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      membershipTier: true,
      monthlyMinutesUsed: true,
      monthlyResetAt: true
    }
  });
  
  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }
  
  const limits = TIER_LIMITS[user.membershipTier];
  
  // Check if monthly reset is needed
  const now = new Date();
  if (!user.monthlyResetAt || user.monthlyResetAt < now) {
    await db.user.update({
      where: { id: userId },
      data: {
        monthlyMinutesUsed: 0,
        monthlyResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
      }
    });
    user.monthlyMinutesUsed = 0;
  }
  
  // Calculate remaining allowance
  const remainingMinutes = limits.maxSessionMinutes 
    ? limits.maxSessionMinutes - user.monthlyMinutesUsed
    : Infinity;
  
  // Attach tier info to context for downstream use
  c.set('tier', user.membershipTier);
  c.set('tierLimits', limits);
  c.set('remainingMinutes', remainingMinutes);
  
  // Block if no time remaining (for limited tiers)
  if (remainingMinutes <= 0 && limits.maxSessionMinutes !== null) {
    return c.json({
      success: false,
      error: 'Monthly session limit reached',
      data: {
        tier: user.membershipTier,
        upgradeUrl: '/pricing'
      }
    }, 403);
  }
  
  await next();
}
```

---

## Nightly Skool Membership Sync

### Overview

A separate Node.js service runs every night (via cron) that:
1. Logs into Skool.com using Puppeteer
2. Scrapes the Vagus Skool membership list
3. Compares against the local database
4. Updates user tiers accordingly

```typescript
// services/skool-sync/src/index.ts

import cron from 'node-cron';
import { syncMemberships } from './membership-sync';
import { sendSyncReport } from './notifications';

// Run at 3 AM every night
cron.schedule('0 3 * * *', async () => {
  console.log('[Skool Sync] Starting nightly membership sync...');
  
  try {
    const result = await syncMemberships();
    
    console.log(`[Skool Sync] Complete:
      - Total members checked: ${result.totalChecked}
      - Upgraded to VAGUS_MEMBER: ${result.upgraded}
      - Downgraded to FREE: ${result.downgraded}
      - New users created: ${result.newUsers}
      - Errors: ${result.errors.length}
    `);
    
    if (result.errors.length > 0) {
      await sendSyncReport(result);
    }
  } catch (error) {
    console.error('[Skool Sync] Fatal error:', error);
    await sendSyncReport({ error: error.message });
  }
});

// Also expose manual trigger endpoint
if (process.env.ENABLE_MANUAL_SYNC === 'true') {
  Bun.serve({
    port: 3005,
    fetch: async (req) => {
      if (req.url.endsWith('/trigger') && req.method === 'POST') {
        const result = await syncMemberships();
        return Response.json(result);
      }
      return new Response('Not found', { status: 404 });
    }
  });
}
```

### Skool Scraper

```typescript
// services/skool-sync/src/skool-scraper.ts

import puppeteer from 'puppeteer';

interface SkoolMember {
  email: string;
  name: string;
  membershipLevel: 'free' | 'paid';
  joinedAt: Date;
}

export async function scrapeSkoolMembers(): Promise<SkoolMember[]> {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Login to Skool
    await page.goto('https://www.skool.com/login');
    await page.waitForSelector('input[name="email"]');
    
    await page.type('input[name="email"]', process.env.SKOOL_EMAIL!);
    await page.type('input[name="password"]', process.env.SKOOL_PASSWORD!);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    
    // Navigate to Vagus Skool members page
    await page.goto('https://www.skool.com/vagus-skool/members');
    await page.waitForSelector('[data-testid="member-list"]', { timeout: 10000 });
    
    // Scroll to load all members (Skool uses infinite scroll)
    await autoScroll(page);
    
    // Extract member data
    const members = await page.evaluate(() => {
      const memberElements = document.querySelectorAll('[data-testid="member-card"]');
      return Array.from(memberElements).map((el) => ({
        email: el.querySelector('[data-testid="member-email"]')?.textContent || '',
        name: el.querySelector('[data-testid="member-name"]')?.textContent || '',
        membershipLevel: el.querySelector('[data-testid="paid-badge"]') ? 'paid' : 'free',
        joinedAt: el.querySelector('[data-testid="join-date"]')?.getAttribute('datetime') || ''
      }));
    });
    
    return members.map(m => ({
      ...m,
      joinedAt: new Date(m.joinedAt)
    }));
    
  } finally {
    await browser.close();
  }
}

async function autoScroll(page: puppeteer.Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}
```

### Membership Sync Logic

```typescript
// services/skool-sync/src/membership-sync.ts

import { db } from './db';
import { scrapeSkoolMembers } from './skool-scraper';
import { MembershipTier } from '@hybrid/shared/types';

interface SyncResult {
  totalChecked: number;
  upgraded: number;
  downgraded: number;
  newUsers: number;
  errors: Array<{ email: string; error: string }>;
}

export async function syncMemberships(): Promise<SyncResult> {
  const result: SyncResult = {
    totalChecked: 0,
    upgraded: 0,
    downgraded: 0,
    newUsers: 0,
    errors: []
  };
  
  // Fetch current Skool members
  const skoolMembers = await scrapeSkoolMembers();
  const skoolEmails = new Set(skoolMembers.map(m => m.email.toLowerCase()));
  
  result.totalChecked = skoolMembers.length;
  
  // Process each Skool member
  for (const member of skoolMembers) {
    try {
      const email = member.email.toLowerCase();
      const newTier = member.membershipLevel === 'paid' 
        ? MembershipTier.VAGUS_MEMBER 
        : MembershipTier.FREE;
      
      const existingUser = await db.user.findUnique({
        where: { email },
        select: { id: true, membershipTier: true }
      });
      
      if (existingUser) {
        // Update tier if changed
        if (existingUser.membershipTier !== newTier) {
          await db.user.update({
            where: { email },
            data: {
              membershipTier: newTier,
              tierLastChecked: new Date()
            }
          });
          
          if (newTier === MembershipTier.VAGUS_MEMBER) {
            result.upgraded++;
          } else {
            result.downgraded++;
          }
        }
      } else {
        // Create placeholder user (they'll set password on first login)
        await db.user.create({
          data: {
            email,
            passwordHash: '', // Will be set during account claim
            role: 'CLIENT',
            membershipTier: newTier,
            skoolMemberId: member.email,
            tierLastChecked: new Date()
          }
        });
        result.newUsers++;
      }
    } catch (error) {
      result.errors.push({
        email: member.email,
        error: error.message
      });
    }
  }
  
  // Downgrade users no longer in Skool (except PREMIUM - those are manual)
  const localUsers = await db.user.findMany({
    where: {
      membershipTier: MembershipTier.VAGUS_MEMBER,
      skoolMemberId: { not: null }
    },
    select: { email: true }
  });
  
  for (const user of localUsers) {
    if (!skoolEmails.has(user.email.toLowerCase())) {
      await db.user.update({
        where: { email: user.email },
        data: {
          membershipTier: MembershipTier.FREE,
          tierLastChecked: new Date()
        }
      });
      result.downgraded++;
    }
  }
  
  return result;
}
```

---

## LiveKit Integration Points

### Server Configuration

```yaml
# docker/livekit/livekit.yaml

port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 50200
  tcp_port: 7881
  use_external_ip: true

turn:
  enabled: true
  domain: turn.myultra.coach
  tls_port: 443
  udp_port: 443

keys:
  # Generated during setup - keep secret!
  APIxxxxxx: secretxxxxxx

logging:
  level: info
```

### LiveKit Service Wrapper

```typescript
// packages/livekit/src/room-service.ts

import {
  RoomServiceClient,
  AccessToken,
  VideoGrant
} from 'livekit-server-sdk';

const roomService = new RoomServiceClient(
  process.env.LIVEKIT_URL!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

export interface CreateRoomOptions {
  sessionId: string;
  maxParticipants?: number;
  emptyTimeout?: number;
}

export async function createRoom(options: CreateRoomOptions) {
  return roomService.createRoom({
    name: `session-${options.sessionId}`,
    emptyTimeout: options.emptyTimeout || 600,  // 10 min
    maxParticipants: options.maxParticipants || 4  // coach + client + AI + buffer
  });
}

export async function deleteRoom(sessionId: string) {
  return roomService.deleteRoom(`session-${sessionId}`);
}

export async function generateToken(
  sessionId: string,
  participantId: string,
  participantName: string,
  isCoach: boolean
): Promise<string> {
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: participantId,
      name: participantName,
      ttl: '2h'
    }
  );
  
  const grant: VideoGrant = {
    room: `session-${sessionId}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  };
  
  // Coaches get admin permissions
  if (isCoach) {
    grant.roomAdmin = true;
    grant.roomRecord = true;
  }
  
  token.addGrant(grant);
  return token.toJwt();
}

// Coach mute control - stops AI from hearing coach
export async function setCoachMuteForAI(
  sessionId: string,
  coachTrackSid: string,
  muted: boolean
) {
  const roomName = `session-${sessionId}`;
  const aiIdentity = 'ai-coach-agent';
  
  await roomService.updateSubscriptions(
    roomName,
    aiIdentity,
    [coachTrackSid],
    !muted  // subscribe = !muted
  );
}

// Get all participants in a room
export async function getRoomParticipants(sessionId: string) {
  return roomService.listParticipants(`session-${sessionId}`);
}
```

### Room API Routes

```typescript
// apps/api/src/routes/rooms.ts

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { tierCheckMiddleware } from '../middleware/tier-check';
import * as livekit from '@hybrid/livekit';
import { db } from '../db/client';

const rooms = new Hono();

// POST /api/rooms/create - Create a new coaching room
rooms.post('/create', authMiddleware, tierCheckMiddleware, async (c) => {
  const userId = c.get('userId');
  const tierLimits = c.get('tierLimits');
  
  // Create session in database
  const session = await db.session.create({
    data: {
      clientId: userId,
      status: 'WAITING',
      scheduledAt: new Date()
    }
  });
  
  // Create LiveKit room
  await livekit.createRoom({
    sessionId: session.id,
    emptyTimeout: tierLimits.maxSessionMinutes 
      ? tierLimits.maxSessionMinutes * 60 
      : 3600
  });
  
  // Generate client token
  const token = await livekit.generateToken(
    session.id,
    userId,
    c.get('userName'),
    false  // not a coach
  );
  
  return c.json({
    success: true,
    data: {
      sessionId: session.id,
      token,
      roomName: `session-${session.id}`,
      livekitUrl: process.env.LIVEKIT_URL
    }
  });
});

// POST /api/rooms/:sessionId/join-coach - Coach joins existing room
rooms.post('/:sessionId/join-coach', authMiddleware, async (c) => {
  const { sessionId } = c.req.param();
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  
  if (userRole !== 'COACH') {
    return c.json({ success: false, error: 'Not authorized' }, 403);
  }
  
  const token = await livekit.generateToken(
    sessionId,
    userId,
    c.get('userName'),
    true  // is coach
  );
  
  return c.json({
    success: true,
    data: {
      token,
      roomName: `session-${sessionId}`,
      livekitUrl: process.env.LIVEKIT_URL
    }
  });
});

// POST /api/rooms/:sessionId/mute-ai - Coach toggles AI hearing them
rooms.post('/:sessionId/mute-ai', authMiddleware, async (c) => {
  const { sessionId } = c.req.param();
  const { muted, trackSid } = await c.req.json();
  
  await livekit.setCoachMuteForAI(sessionId, trackSid, muted);
  
  return c.json({ success: true, data: { muted } });
});

export default rooms;
```

---

## AI Agent (Orb) Implementation

### Agent Entry Point

```typescript
// services/ai-agent/src/index.ts
// IMPORTANT: Run with Node.js, NOT Bun (LiveKit agents have compatibility issues with Bun)

import { cli, defineAgent, JobContext, multimodal } from '@livekit/agents';
import { CoachingAgent } from './coaching-agent';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    console.log(`[AI Agent] Joining room: ${ctx.room.name}`);
    
    await ctx.connect();
    
    const agent = new CoachingAgent(ctx);
    await agent.start();
  }
});

// Start the agent worker
cli.runApp(new cli.WorkerOptions({
  entrypoint: import.meta.filename
}));
```

### Coaching Agent with Selective Audio

```typescript
// services/ai-agent/src/coaching-agent.ts

import {
  JobContext,
  voice,
  RoomIO
} from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import { Track, RemoteParticipant } from 'livekit-client';

export class CoachingAgent {
  private ctx: JobContext;
  private session: voice.AgentSession | null = null;
  private mutedParticipants = new Set<string>();
  
  constructor(ctx: JobContext) {
    this.ctx = ctx;
  }
  
  async start() {
    // Configure STT/TTS with Deepgram
    const stt = new deepgram.STT({
      model: 'nova-3',
      language: 'en-US',
      punctuate: true,
      interimResults: true
    });
    
    const tts = new deepgram.TTS({
      model: 'aura-2-thalia-en',  // Natural female voice
      sampleRate: 24000
    });
    
    // Create agent with coaching personality
    const agent = new voice.Agent({
      instructions: `You are a supportive AI wellness coach specializing in vagus nerve health and stress management.

Your approach:
- Listen actively and reflect back what you hear
- Ask open-ended questions to understand the client's current state
- Provide evidence-based suggestions for vagus nerve stimulation
- Be warm, encouraging, and non-judgmental
- If the client mentions serious mental health concerns, gently suggest professional help

Remember: You're here to support wellness, not provide medical advice.`,
    });
    
    // Create voice session
    this.session = new voice.AgentSession({
      stt,
      llm: 'openai/gpt-4o-mini',  // Fast, cost-effective
      tts,
      turnDetection: voice.TurnDetection.SERVER_VAD
    });
    
    // Use custom RoomIO for selective audio
    const roomIO = new SelectiveRoomIO(
      this.session,
      this.ctx.room,
      this.mutedParticipants
    );
    
    // Listen for mute commands from data channel
    this.ctx.room.on('dataReceived', (data, participant) => {
      const message = JSON.parse(new TextDecoder().decode(data));
      if (message.type === 'mute-from-ai') {
        if (message.muted) {
          this.mutedParticipants.add(participant.identity);
        } else {
          this.mutedParticipants.delete(participant.identity);
        }
      }
    });
    
    await this.session.start({
      agent,
      roomIO
    });
  }
  
  async stop() {
    await this.session?.close();
  }
}

// Custom RoomIO that filters audio from muted participants
class SelectiveRoomIO extends RoomIO {
  constructor(
    session: voice.AgentSession,
    room: any,
    private mutedParticipants: Set<string>
  ) {
    super(session, room);
  }
  
  protected shouldProcessTrack(
    track: Track,
    participant: RemoteParticipant
  ): boolean {
    // Skip audio from muted participants
    if (this.mutedParticipants.has(participant.identity)) {
      return false;
    }
    return super.shouldProcessTrack(track, participant);
  }
}
```

---

## Audio-Reactive Orb Component

### React Orb Component

```typescript
// packages/ui/src/Orb/Orb.tsx

import { useRef, useEffect, useState } from 'react';
import { useAudioAnalyser } from './useAudioAnalyser';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';

interface OrbProps {
  audioTrack?: TrackReferenceOrPlaceholder;
  size?: number;
  baseColor?: string;
  activeColor?: string;
  className?: string;
}

export function Orb({
  audioTrack,
  size = 200,
  baseColor = 'hsl(220, 60%, 30%)',
  activeColor = 'hsl(260, 80%, 60%)',
  className = ''
}: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioLevel = useAudioAnalyser(audioTrack);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // High DPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    
    let phase = 0;
    
    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      
      const cx = size / 2;
      const cy = size / 2;
      const baseRadius = size * 0.3;
      
      // Audio-reactive radius expansion
      const audioBoost = audioLevel * 0.4;
      const radius = baseRadius * (1 + audioBoost);
      
      // Pulsing animation
      phase += 0.02 + audioLevel * 0.05;
      const pulse = Math.sin(phase) * 0.05;
      const finalRadius = radius * (1 + pulse);
      
      // Outer glow (more intense with audio)
      const glowIntensity = 20 + audioLevel * 60;
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = glowIntensity;
      
      // Main orb with radial gradient (fake 3D)
      const gradient = ctx.createRadialGradient(
        cx - finalRadius * 0.3,
        cy - finalRadius * 0.3,
        0,
        cx,
        cy,
        finalRadius
      );
      
      // Color shifts with audio level
      const hue = 220 + audioLevel * 40;
      const saturation = 60 + audioLevel * 20;
      const lightness = 50 + audioLevel * 20;
      
      gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`);
      gradient.addColorStop(0.5, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
      gradient.addColorStop(1, `hsl(${hue}, ${saturation - 20}%, ${lightness - 20}%)`);
      
      ctx.beginPath();
      ctx.arc(cx, cy, finalRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Inner highlight
      const highlightGradient = ctx.createRadialGradient(
        cx - finalRadius * 0.3,
        cy - finalRadius * 0.3,
        0,
        cx - finalRadius * 0.2,
        cy - finalRadius * 0.2,
        finalRadius * 0.4
      );
      highlightGradient.addColorStop(0, `hsla(${hue}, 100%, 90%, 0.6)`);
      highlightGradient.addColorStop(1, `hsla(${hue}, 100%, 90%, 0)`);
      
      ctx.beginPath();
      ctx.arc(cx, cy, finalRadius, 0, Math.PI * 2);
      ctx.fillStyle = highlightGradient;
      ctx.fill();
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioLevel, size, baseColor, activeColor]);
  
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="rounded-full"
      />
      {/* Optional: AI speaking indicator */}
      {audioLevel > 0.1 && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-indigo-400 animate-pulse">
          AI Coach is speaking...
        </div>
      )}
    </div>
  );
}
```

### Audio Analyser Hook

```typescript
// packages/ui/src/Orb/useAudioAnalyser.ts

import { useState, useEffect, useRef } from 'react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';

export function useAudioAnalyser(trackRef?: TrackReferenceOrPlaceholder): number {
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>();
  
  useEffect(() => {
    // Get the actual MediaStreamTrack from LiveKit track reference
    const track = trackRef?.publication?.track;
    if (!track || track.kind !== 'audio') {
      setAudioLevel(0);
      return;
    }
    
    // Create audio context
    audioContextRef.current = new AudioContext();
    const audioContext = audioContextRef.current;
    
    // Create analyser
    analyserRef.current = audioContext.createAnalyser();
    const analyser = analyserRef.current;
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    
    // Connect track to analyser
    const stream = new MediaStream([track.mediaStreamTrack]);
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    // Don't connect to destination (we don't want to hear double)
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume (0-1)
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const avg = sum / dataArray.length / 255;
      
      // Apply some smoothing and boost
      const boosted = Math.min(1, avg * 2);
      setAudioLevel(boosted);
      
      animationRef.current = requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [trackRef?.publication?.track]);
  
  return audioLevel;
}
```

---

## Room Manager Service

### Process Spawning

```typescript
// services/room-manager/src/index.ts

import { Hono } from 'hono';

interface ActiveRoom {
  process: Bun.Subprocess;
  sessionId: string;
  startedAt: Date;
  restartCount: number;
}

const activeRooms = new Map<string, ActiveRoom>();

const app = new Hono();

// Spawn a new room process
app.post('/spawn', async (c) => {
  const { sessionId, config } = await c.req.json();
  
  if (activeRooms.has(sessionId)) {
    return c.json({ success: false, error: 'Room already exists' }, 400);
  }
  
  const room = spawnRoom(sessionId, config);
  activeRooms.set(sessionId, room);
  
  return c.json({ success: true, data: { sessionId } });
});

// Terminate a room
app.post('/terminate/:sessionId', async (c) => {
  const { sessionId } = c.req.param();
  const room = activeRooms.get(sessionId);
  
  if (!room) {
    return c.json({ success: false, error: 'Room not found' }, 404);
  }
  
  room.process.kill();
  activeRooms.delete(sessionId);
  
  return c.json({ success: true });
});

// Health check
app.get('/health', (c) => {
  return c.json({
    success: true,
    data: {
      activeRooms: activeRooms.size,
      rooms: Array.from(activeRooms.entries()).map(([id, room]) => ({
        sessionId: id,
        uptime: Date.now() - room.startedAt.getTime(),
        restarts: room.restartCount
      }))
    }
  });
});

function spawnRoom(sessionId: string, config: any): ActiveRoom {
  const proc = Bun.spawn(['bun', 'run', 'room.worker.ts'], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      ROOM_SESSION_ID: sessionId,
      ROOM_CONFIG: JSON.stringify(config)
    },
    ipc(message) {
      handleRoomMessage(sessionId, message);
    },
    onExit(proc, exitCode, signalCode) {
      console.log(`[Room ${sessionId}] Exited with code ${exitCode}`);
      
      const room = activeRooms.get(sessionId);
      if (room && exitCode !== 0 && room.restartCount < 3) {
        // Auto-restart on crash
        console.log(`[Room ${sessionId}] Restarting (attempt ${room.restartCount + 1})...`);
        const newRoom = spawnRoom(sessionId, config);
        newRoom.restartCount = room.restartCount + 1;
        activeRooms.set(sessionId, newRoom);
      } else if (room) {
        activeRooms.delete(sessionId);
      }
    }
  });
  
  // Send initial config
  proc.send({ type: 'init', config });
  
  return {
    process: proc,
    sessionId,
    startedAt: new Date(),
    restartCount: 0
  };
}

function handleRoomMessage(sessionId: string, message: any) {
  switch (message.type) {
    case 'participant_joined':
      console.log(`[Room ${sessionId}] Participant joined: ${message.identity}`);
      break;
    case 'participant_left':
      console.log(`[Room ${sessionId}] Participant left: ${message.identity}`);
      break;
    case 'session_ended':
      console.log(`[Room ${sessionId}] Session ended`);
      activeRooms.get(sessionId)?.process.kill();
      activeRooms.delete(sessionId);
      break;
    case 'health':
      // Update health metrics
      break;
  }
}

export default {
  port: 3003,
  fetch: app.fetch
};
```

### Room Worker Process

```typescript
// services/room-manager/src/room.worker.ts

import { Room, RoomEvent } from 'livekit-client';

const sessionId = process.env.ROOM_SESSION_ID!;
const config = JSON.parse(process.env.ROOM_CONFIG || '{}');

let room: Room;

// Handle messages from parent
process.on('message', async (message: any) => {
  switch (message.type) {
    case 'init':
      await initializeRoom(message.config);
      break;
    case 'shutdown':
      await shutdown();
      break;
  }
});

async function initializeRoom(config: any) {
  console.log(`[Room Worker] Initializing room for session ${sessionId}`);
  
  room = new Room({
    adaptiveStream: true,
    dynacast: true
  });
  
  // Set up event listeners
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    process.send?.({
      type: 'participant_joined',
      identity: participant.identity,
      name: participant.name
    });
  });
  
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    process.send?.({
      type: 'participant_left',
      identity: participant.identity
    });
    
    // Check if room is empty
    if (room.numParticipants === 0) {
      process.send?.({ type: 'session_ended' });
    }
  });
  
  room.on(RoomEvent.Disconnected, () => {
    process.send?.({ type: 'session_ended' });
  });
  
  // Start health reporting
  setInterval(() => {
    process.send?.({
      type: 'health',
      status: {
        participants: room.numParticipants,
        state: room.state,
        memory: process.memoryUsage()
      }
    });
  }, 5000);
  
  console.log(`[Room Worker] Room initialized for session ${sessionId}`);
}

async function shutdown() {
  console.log(`[Room Worker] Shutting down room ${sessionId}`);
  await room?.disconnect();
  process.exit(0);
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

## Development Scripts

### Root package.json

```json
{
  "name": "hybrid-coach",
  "private": true,
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "dev:api": "turbo run dev --filter=api",
    "dev:web": "turbo run dev --filter=web-*",
    "build": "turbo run build",
    "test": "turbo run test",
    "db:push": "bunx prisma db push",
    "db:migrate": "bunx prisma migrate dev",
    "db:studio": "bunx prisma studio",
    "livekit:setup": "bash scripts/setup-livekit.sh",
    "skool:sync": "bun run services/skool-sync/src/index.ts"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

### Turbo Configuration

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

### PM2 Ecosystem Config

```javascript
// ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'api',
      script: 'bun',
      args: 'run apps/api/src/index.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'room-manager',
      script: 'bun',
      args: 'run services/room-manager/src/index.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      }
    },
    {
      name: 'ai-agent',
      script: 'node',  // NOT Bun - LiveKit agents require Node.js
      args: 'services/ai-agent/dist/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        LIVEKIT_URL: 'wss://livekit.myultra.coach'
      }
    },
    {
      name: 'skool-sync',
      script: 'bun',
      args: 'run services/skool-sync/src/index.ts',
      cron_restart: '0 3 * * *',  // Run at 3 AM daily
      autorestart: false
    },
    {
      name: 'web-public',
      script: 'bun',
      args: 'run apps/web-public/dist/server.js',
      env: { PORT: 5170 }
    },
    {
      name: 'web-coach',
      script: 'bun',
      args: 'run apps/web-coach/dist/server.js',
      env: { PORT: 5171 }
    },
    {
      name: 'web-client',
      script: 'bun',
      args: 'run apps/web-client/dist/server.js',
      env: { PORT: 5172 }
    }
  ]
};
```

---

## Environment Variables

```bash
# .env.example

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/hybrid_coach"

# Auth
JWT_SECRET="your-super-secret-jwt-key-change-in-production"

# LiveKit (self-hosted)
LIVEKIT_URL="wss://livekit.myultra.coach"
LIVEKIT_API_KEY="APIxxxxxxxx"
LIVEKIT_API_SECRET="secretxxxxxxxx"

# Deepgram
DEEPGRAM_API_KEY="your-deepgram-key"

# OpenAI (for LLM)
OPENAI_API_KEY="sk-your-openai-key"

# Skool Sync
SKOOL_EMAIL="admin@myultra.coach"
SKOOL_PASSWORD="skool-password"
SKOOL_COMMUNITY_URL="https://www.skool.com/vagus-skool"

# App URLs (for auth redirects)
PUBLIC_APP_URL="https://myultra.coach"
COACH_APP_URL="https://myultra.coach:5171"
CLIENT_APP_URL="https://myultra.coach:5172"

# Feature flags
ENABLE_MANUAL_SYNC="false"
```

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd hybrid-coach
bun install

# 2. Set up environment
cp .env.example .env
# Edit .env with your credentials

# 3. Set up database
bun run db:push

# 4. Set up LiveKit (first time only)
bun run livekit:setup

# 5. Start all services
bun run dev

# Services will be available at:
# - API: http://localhost:3001
# - Public site: http://localhost:5170
# - Coach portal: http://localhost:5171
# - Client portal: http://localhost:5172
# - Room manager: http://localhost:3003
```

---

## Migration Path from Archive

| Phase | Task | Source | Target |
|-------|------|--------|--------|
| 1 | Auth system | `/Archive/Hybrid-Coach/auth/` | `apps/api/src/routes/auth.ts` |
| 1 | Database schema | `/Archive/Hybrid-Coach/db/` | `prisma/schema.prisma` |
| 2 | Login UI | `/Archive/Hybrid-Coach/pages/login/` | `apps/web-public/src/pages/Login.tsx` |
| 2 | Coach dashboard | `/Archive/Hybrid-Coach/pages/coach/` | `apps/web-coach/src/pages/` |
| 2 | Client portal | `/Archive/Hybrid-Coach/pages/client/` | `apps/web-client/src/pages/` |
| 3 | Room spawning | `/Archive/Hybrid-Coach-Rooms/` | `services/room-manager/` |
| 3 | Orb rendering | `/Archive/Hybrid-Coach-GPU/` | `packages/ui/src/Orb/` |
| 4 | Voice integration | `/Archive/Hybrid-Coach-GPU/audio/` | `services/ai-agent/` |
| 4 | WebRTC (replace) | `/Archive/Hybrid-Coach-Rooms/webrtc/` | LiveKit SDK |

---

## Key Architectural Decisions

1. **Single login, multiple portals**: Auth happens at `web-public`, issues grants that portals exchange for JWTs
2. **Database determines role**: The nightly Skool sync sets `role` field; login just reads it
3. **Tiers enforced server-side**: Never trust client claims; always check DB
4. **LiveKit agents run on Node.js**: Bun has WebRTC compatibility issues
5. **Child processes over workers**: Crashing room won't crash the server
6. **PM2 over Kubernetes**: Until >100 concurrent sessions, K8s is overkill
7. **Canvas 2D for orb**: Zero bundle size impact, performant enough for audio reactivity

---

## Cost Estimate (20 concurrent sessions)

| Component | Monthly Cost |
|-----------|--------------|
| DigitalOcean Droplet (16GB) | $168 |
| Managed PostgreSQL | $15 |
| Managed Redis | $15 |
| Deepgram (est. 500 hrs) | $450 |
| OpenAI API (GPT-4o-mini) | $50 |
| **Total** | **~$700/month** |

Break-even at ~35 paying subscribers at $20/month.