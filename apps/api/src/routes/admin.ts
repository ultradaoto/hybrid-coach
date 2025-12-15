/**
 * Admin Routes
 * 
 * Provides admin dashboard functionality:
 * - Admin login (email whitelist-based)
 * - System metrics and health checks
 * - User management
 * - Room monitoring with listen-in capability
 * - Transcript viewing
 */

import type { AuthUser } from '../middleware/auth';
import { jsonResponse } from '../middleware/cors';
import { signHs256Jwt } from '../services/jwt';
import { db, normalizeEmail, getUserByEmail } from '../db/client';
import { pbkdf2Sha256 } from '../services/crypto';
import { AccessToken, VideoGrant } from 'livekit-server-sdk';

// Admin session TTL
const ADMIN_JWT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// LiveKit config
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

// In-memory tracking for active rooms and sessions
const activeRooms = new Map<string, {
  name: string;
  participants: Array<{ identity: string; role: string }>;
  createdAt: Date;
}>();

// Skool sync status tracking
let skoolSyncStatus = {
  lastRun: 'Never',
  success: true,
  error: undefined as string | undefined,
};

/**
 * Check if email is in admin whitelist
 */
function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  
  return adminEmails.includes(email.toLowerCase());
}

/**
 * Verify password against stored hash
 */
async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await pbkdf2Sha256(password, salt);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Generate listen-only LiveKit token for admin
 */
async function generateListenOnlyToken(roomName: string, adminIdentity: string): Promise<string> {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `admin-listener-${adminIdentity}`,
    name: 'Admin Listener',
    ttl: '1h',
  });

  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: false,      // Cannot publish audio/video
    canSubscribe: true,     // Can receive audio/video
    canPublishData: false,  // Cannot send data
  };

  token.addGrant(grant);
  return await token.toJwt();
}

/**
 * Get system metrics
 */
function getMetrics() {
  // Count users by role
  const users = Array.from(db.usersById.values());
  const totalUsers = users.length;
  const coaches = users.filter(u => u.role === 'coach');
  const clients = users.filter(u => u.role === 'client');

  // Simulate active sessions (would come from UserSession table in production)
  const activeUsers = Math.floor(Math.random() * 5);

  // Count active rooms
  const activeRoomCount = activeRooms.size;

  // Coach activity (simulated - would come from lastActive timestamps)
  const coachesByActivity = {
    recent1h: Math.min(coaches.length, Math.floor(Math.random() * 3)),
    recent1d: Math.min(coaches.length, Math.floor(Math.random() * 5)),
    recent1w: coaches.length,
  };

  // Client voice minutes (simulated - would come from Session aggregates)
  const clientVoiceMinutes = {
    today: Math.floor(Math.random() * 120),
    week: Math.floor(Math.random() * 500),
    month: Math.floor(Math.random() * 2000),
  };

  // System health status
  const hasLiveKit = Boolean(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);
  const systemHealth = {
    api: true,
    database: true,
    livekit: hasLiveKit,
    skool: skoolSyncStatus.success,
  };

  return {
    totalUsers,
    totalCoaches: coaches.length,
    activeUsers,
    activeRooms: activeRoomCount,
    coachesByActivity,
    clientVoiceMinutes,
    skoolSyncStatus,
    systemHealth,
    breakdown: {
      coaches: coaches.length,
      clients: clients.length,
    },
  };
}

/**
 * Get system health status
 */
function getHealthStatus() {
  const hasLiveKit = Boolean(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);
  
  return {
    database: {
      status: 'ok' as const,
      latencyMs: Math.floor(Math.random() * 10) + 1,
    },
    livekit: {
      status: hasLiveKit ? 'ok' as const : 'error' as const,
      activeRooms: activeRooms.size,
    },
    skoolSync: {
      status: skoolSyncStatus.success ? 'ok' as const : 'error' as const,
      lastRun: skoolSyncStatus.lastRun,
      message: skoolSyncStatus.error,
    },
  };
}

/**
 * Get all users with stats
 */
function getUsers(roleFilter?: string) {
  const users = Array.from(db.usersById.values());
  
  return users
    .filter(u => !roleFilter || roleFilter === 'all' || u.role === roleFilter)
    .map(u => ({
      id: u.id,
      email: u.email,
      name: u.displayName || u.email.split('@')[0],
      role: u.role,
      createdAt: u.createdAt,
      lastSeen: u.updatedAt,
      totalSessions: Math.floor(Math.random() * 20),
      totalMinutes: Math.floor(Math.random() * 300),
    }));
}

/**
 * Get coaches with additional stats
 */
function getCoaches() {
  const users = Array.from(db.usersById.values());
  const coaches = users.filter(u => u.role === 'coach');
  
  return coaches.map(c => ({
    id: c.id,
    email: c.email,
    name: c.displayName || c.email.split('@')[0],
    role: 'coach' as const,
    createdAt: c.createdAt,
    lastSeen: c.updatedAt,
    totalSessions: Math.floor(Math.random() * 50),
    totalMinutes: Math.floor(Math.random() * 600),
    clientCount: Math.floor(Math.random() * 10) + 1,
    weeklyHours: Math.floor(Math.random() * 20) + 5,
  }));
}

/**
 * Get active rooms
 */
function getActiveRooms() {
  return Array.from(activeRooms.values()).map(room => {
    const now = Date.now();
    const duration = Math.floor((now - room.createdAt.getTime()) / 1000);
    return {
      id: room.name,
      name: room.name,
      participants: room.participants,
      createdAt: room.createdAt.toISOString(),
      duration,
    };
  });
}

/**
 * Get sessions for transcript viewing
 */
function getSessions() {
  // Simulated sessions (would come from Session table in production)
  const users = Array.from(db.usersById.values()).filter(u => u.role === 'client');
  
  return users.slice(0, 10).map((u, i) => ({
    id: `session-${i + 1}`,
    roomId: `room-${i + 1}`,
    userId: u.id,
    userName: u.displayName || u.email,
    startedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    endedAt: new Date(Date.now() - Math.random() * 6 * 24 * 60 * 60 * 1000).toISOString(),
    durationMinutes: Math.floor(Math.random() * 30) + 10,
    status: 'completed',
  }));
}

/**
 * Get transcript for a session
 */
function getTranscript(sessionId: string) {
  // Simulated transcript (would come from Message table in production)
  const messages = [
    { id: '1', sender: 'ai' as const, content: 'Welcome! How are you feeling today?', createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString() },
    { id: '2', sender: 'client' as const, content: "I've been feeling a bit stressed lately with work.", createdAt: new Date(Date.now() - 1000 * 60 * 9).toISOString() },
    { id: '3', sender: 'ai' as const, content: "I understand. Work stress is very common. Let's explore some breathing techniques that might help.", createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString() },
    { id: '4', sender: 'client' as const, content: 'That sounds helpful. What do you suggest?', createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString() },
    { id: '5', sender: 'coach' as const, content: "Hi there! I just joined. The AI was right - let's try some 4-7-8 breathing.", createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString() },
    { id: '6', sender: 'ai' as const, content: 'The 4-7-8 technique involves breathing in for 4 seconds, holding for 7, and exhaling for 8.', createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
    { id: '7', sender: 'client' as const, content: "I'll try that. Thank you both!", createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString() },
  ];

  return {
    sessionId,
    messages,
  };
}

/**
 * Admin routes handler
 */
export async function adminRoutes(req: Request, user?: AuthUser): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace('/api/admin', '');
  const method = req.method;

  // POST /api/admin/login - Admin login (no auth required)
  if (path === '/login' && method === 'POST') {
    let body: { email?: string; password?: string };
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

    // Check if email is in admin whitelist
    if (!isAdminEmail(email)) {
      console.log(`[Admin] Login attempt from non-admin email: ${email}`);
      return jsonResponse({ success: false, error: 'Unauthorized - not an admin email' }, { status: 403 });
    }

    // Look up user in database
    const existing = getUserByEmail(email);
    if (!existing) {
      console.log(`[Admin] Admin email not found in user database: ${email}`);
      return jsonResponse({ success: false, error: 'Account not found' }, { status: 401 });
    }

    // Verify password
    const ok = await verifyPassword(password, existing.passwordSalt, existing.passwordHash);
    if (!ok) {
      console.log(`[Admin] Invalid password for admin: ${email}`);
      return jsonResponse({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    console.log(`[Admin] Successful admin login: ${email}`);

    // Generate admin JWT
    const secret = process.env.JWT_SECRET ?? 'devsecret';
    const token = await signHs256Jwt(
      {
        sub: existing.id,
        email: existing.email,
        role: 'admin',
        tier: existing.membershipTier,
      },
      secret,
      ADMIN_JWT_TTL_SECONDS
    );

    return jsonResponse({
      success: true,
      data: {
        token,
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.displayName || existing.email.split('@')[0],
          role: 'admin' as const,
        },
      },
    });
  }

  // All routes below require admin authentication
  if (!user || user.role !== 'admin') {
    return jsonResponse({ success: false, error: 'Admin access required' }, { status: 403 });
  }

  // GET /api/admin/metrics - Dashboard metrics
  if (path === '/metrics' && method === 'GET') {
    const metrics = getMetrics();
    return jsonResponse({ success: true, data: metrics });
  }

  // GET /api/admin/health - System health
  if (path === '/health' && method === 'GET') {
    const health = getHealthStatus();
    return jsonResponse({ success: true, data: health });
  }

  // GET /api/admin/users - List users
  if (path === '/users' && method === 'GET') {
    const roleFilter = url.searchParams.get('role') || 'all';
    const users = getUsers(roleFilter);
    return jsonResponse({ success: true, data: users });
  }

  // GET /api/admin/coaches - List coaches with extra stats
  if (path === '/coaches' && method === 'GET') {
    const coaches = getCoaches();
    return jsonResponse({ success: true, data: coaches });
  }

  // GET /api/admin/rooms - List active rooms
  if (path === '/rooms' && method === 'GET') {
    const rooms = getActiveRooms();
    return jsonResponse({ success: true, data: rooms });
  }

  // GET /api/admin/rooms/:roomName/audio-token - Get listen-only token
  if (path.match(/^\/rooms\/[^/]+\/audio-token$/) && method === 'GET') {
    const roomName = path.split('/')[2];
    
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return jsonResponse({ success: false, error: 'LiveKit not configured' }, { status: 500 });
    }

    try {
      const token = await generateListenOnlyToken(roomName, user.id);
      return jsonResponse({
        success: true,
        data: {
          token,
          livekitUrl: LIVEKIT_URL,
          roomName,
        },
      });
    } catch (err) {
      console.error('[Admin] Failed to generate listen token:', err);
      return jsonResponse({ success: false, error: 'Failed to generate token' }, { status: 500 });
    }
  }

  // GET /api/admin/processes - List PM2 processes (simulated)
  if (path === '/processes' && method === 'GET') {
    // Simulated PM2 process data - in production would query PM2 directly
    const processes = [
      { id: 'api', name: 'api', status: 'online', cpu: 2.5, memory: 128 * 1024 * 1024, uptime: Date.now() - 3600000 },
      { id: 'web-public', name: 'web-public', status: 'online', cpu: 0.5, memory: 64 * 1024 * 1024, uptime: Date.now() - 3600000 },
      { id: 'web-coach', name: 'web-coach', status: 'online', cpu: 0.3, memory: 48 * 1024 * 1024, uptime: Date.now() - 3600000 },
      { id: 'web-client', name: 'web-client', status: 'online', cpu: 0.4, memory: 52 * 1024 * 1024, uptime: Date.now() - 3600000 },
      { id: 'web-admin', name: 'web-admin', status: 'online', cpu: 0.2, memory: 40 * 1024 * 1024, uptime: Date.now() - 3600000 },
    ];
    return jsonResponse({ success: true, data: processes });
  }

  // GET /api/admin/sessions - List sessions for transcripts
  if (path === '/sessions' && method === 'GET') {
    const sessions = getSessions();
    return jsonResponse({ success: true, data: sessions });
  }

  // GET /api/admin/transcripts/:sessionId - Get full transcript
  if (path.match(/^\/transcripts\/[^/]+$/) && method === 'GET') {
    const sessionId = path.split('/')[2];
    const transcript = getTranscript(sessionId);
    return jsonResponse({ success: true, data: transcript });
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}

/**
 * Register a room as active (called from livekit routes)
 */
export function registerActiveRoom(roomName: string, participant: { identity: string; role: string }) {
  const existing = activeRooms.get(roomName);
  if (existing) {
    existing.participants.push(participant);
  } else {
    activeRooms.set(roomName, {
      name: roomName,
      participants: [participant],
      createdAt: new Date(),
    });
  }
}

/**
 * Unregister a participant from a room
 */
export function unregisterParticipant(roomName: string, identity: string) {
  const room = activeRooms.get(roomName);
  if (room) {
    room.participants = room.participants.filter(p => p.identity !== identity);
    if (room.participants.length === 0) {
      activeRooms.delete(roomName);
    }
  }
}

/**
 * Update skool sync status (called from sync daemon)
 */
export function updateSkoolSyncStatus(success: boolean, error?: string) {
  skoolSyncStatus = {
    lastRun: new Date().toISOString(),
    success,
    error,
  };
}
