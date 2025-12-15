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
import { prisma, checkDatabaseConnection } from '../db/prisma';
import os from 'os';

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
async function getMetrics() {
  try {
    const now = new Date();
    
    // Time boundaries
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Start of today/week/month for voice minutes
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Execute all queries in parallel for performance
    const [
      totalUsers,
      totalCoaches,
      activeUserSessions,
      activeRoomsCount,
      coachesActive1h,
      coachesActive1d,
      coachesActive1w,
      coachesActive1m,
      voiceMinutesToday,
      voiceMinutesWeek,
      voiceMinutesMonth,
      lastSkoolSync
    ] = await Promise.all([
      // Total users
      prisma.user.count(),
      
      // Total coaches
      prisma.user.count({
        where: { role: 'coach' }
      }),
      
      // Active user sessions
      prisma.userSession.count({
        where: { 
          isActive: true,
          expiresAt: { gt: now }
        }
      }).catch(() => 0),
      
      // Active rooms
      prisma.session.count({
        where: { status: 'active' }
      }),
      
      // Coaches active in last hour
      prisma.user.count({
        where: {
          role: 'coach',
          lastActive: { gte: oneHourAgo }
        }
      }),
      
      // Coaches active in last day
      prisma.user.count({
        where: {
          role: 'coach',
          lastActive: { gte: oneDayAgo }
        }
      }),
      
      // Coaches active in last week
      prisma.user.count({
        where: {
          role: 'coach',
          lastActive: { gte: oneWeekAgo }
        }
      }),
      
      // Coaches active in last month
      prisma.user.count({
        where: {
          role: 'coach',
          lastActive: { gte: oneMonthAgo }
        }
      }),
      
      // Voice minutes today
      prisma.session.aggregate({
        where: {
          startedAt: { gte: startOfToday },
          status: 'completed'
        },
        _sum: { durationMinutes: true }
      }),
      
      // Voice minutes this week
      prisma.session.aggregate({
        where: {
          startedAt: { gte: startOfWeek },
          status: 'completed'
        },
        _sum: { durationMinutes: true }
      }),
      
      // Voice minutes this month
      prisma.session.aggregate({
        where: {
          startedAt: { gte: startOfMonth },
          status: 'completed'
        },
        _sum: { durationMinutes: true }
      }),
      
      // Last Skool sync status
      prisma.skoolMonitoringLog.findFirst({
        orderBy: { executedAt: 'desc' },
        select: {
          success: true,
          executedAt: true,
          errorMessage: true,
          membersFound: true,
          newMembers: true
        }
      }).catch(() => null)
    ]);
    
    // Check LiveKit health
    const hasLiveKit = Boolean(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);
    const livekitHealthy = await checkLiveKitHealth();
    
    // Build response matching frontend AdminMetrics type
    return {
      totalUsers,
      activeUsers: activeUserSessions || Math.min(totalUsers, activeRoomsCount * 2),
      activeRooms: activeRoomsCount,
      totalCoaches,
      coachesByActivity: {
        recent1h: coachesActive1h,
        recent1d: coachesActive1d,
        recent1w: coachesActive1w,
        recent1m: coachesActive1m
      },
      clientVoiceMinutes: {
        today: voiceMinutesToday._sum.durationMinutes || 0,
        week: voiceMinutesWeek._sum.durationMinutes || 0,
        month: voiceMinutesMonth._sum.durationMinutes || 0
      },
      skoolSyncStatus: {
        lastRun: lastSkoolSync?.executedAt.toISOString() || 'Never',
        success: lastSkoolSync?.success ?? false,
        error: lastSkoolSync?.errorMessage || undefined,
        membersFound: lastSkoolSync?.membersFound,
        newMembers: lastSkoolSync?.newMembers
      },
      systemHealth: {
        api: true,
        database: true,
        livekit: livekitHealthy,
        skool: lastSkoolSync?.success ?? false
      }
    };
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
    throw error;
  }
}

// Helper function
async function checkLiveKitHealth(): Promise<boolean> {
  try {
    const livekitHost = process.env.LIVEKIT_HOST || 'http://localhost:7880';
    const response = await fetch(`${livekitHost}/`, { 
      signal: AbortSignal.timeout(2000) 
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get system health status
 */
async function getHealthStatus() {
  try {
    // 1. Database health check
    const dbHealth = await checkDatabaseConnection();
    
    // 2. LiveKit health check
    let livekitStatus: 'healthy' | 'degraded' | 'down' = 'down';
    let livekitLatency = 0;
    try {
      const livekitStart = Date.now();
      const livekitHost = process.env.LIVEKIT_HOST || 'http://localhost:7880';
      const response = await fetch(`${livekitHost}/`, { 
        signal: AbortSignal.timeout(2000) 
      });
      livekitLatency = Date.now() - livekitStart;
      livekitStatus = response.ok ? 'healthy' : 'degraded';
    } catch {
      livekitStatus = 'down';
    }
    
    // 3. Skool sync status (from SkoolMonitoringLog)
    const lastSkoolSync = await prisma.skoolMonitoringLog.findFirst({
      orderBy: { executedAt: 'desc' },
      select: { success: true, executedAt: true, errorMessage: true }
    }).catch(() => null);
    
    // 4. System metrics
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    // Calculate CPU usage (average across cores)
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;
    
    // 5. Build uptime history (last 30 days from SkoolMonitoringLog or create placeholder)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const syncLogs = await prisma.skoolMonitoringLog.findMany({
      where: { executedAt: { gte: thirtyDaysAgo } },
      orderBy: { executedAt: 'asc' },
      select: { executedAt: true, success: true }
    }).catch(() => []);
    
    // Group by date and determine daily status
    const uptimeMap = new Map<string, 'healthy' | 'degraded' | 'down'>();
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const dateStr = date.toISOString().split('T')[0];
      uptimeMap.set(dateStr, 'healthy');
    }
    
    // Mark days with failures
    syncLogs.forEach(log => {
      const dateStr = log.executedAt.toISOString().split('T')[0];
      if (!log.success && uptimeMap.has(dateStr)) {
        uptimeMap.set(dateStr, 'degraded');
      }
    });
    
    const uptimeHistory = Array.from(uptimeMap.entries()).map(([date, status]) => ({
      date,
      status
    }));
    
    // 6. Calculate uptime
    const uptimeSeconds = process.uptime();
    const uptimeDays = Math.floor(uptimeSeconds / 86400);
    const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    // 7. Build response matching frontend SystemHealth type
    return {
      cpu: {
        usage: Math.round(cpuUsage),
        cores: cpus.length
      },
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: Math.round((usedMemory / totalMemory) * 100)
      },
      disk: {
        used: 0,
        total: 0,
        percentage: 0
      },
      services: [
        {
          name: 'API Server',
          status: 'healthy' as const,
          latency: 1,
          lastCheck: new Date().toISOString()
        },
        {
          name: 'Database',
          status: dbHealth.connected ? 'healthy' as const : 'down' as const,
          latency: dbHealth.latencyMs,
          lastCheck: new Date().toISOString()
        },
        {
          name: 'LiveKit',
          status: livekitStatus,
          latency: livekitLatency,
          lastCheck: new Date().toISOString()
        },
        {
          name: 'Skool Sync',
          status: lastSkoolSync?.success ? 'healthy' as const : 'degraded' as const,
          lastCheck: lastSkoolSync?.executedAt.toISOString() || new Date().toISOString()
        }
      ],
      uptime: {
        days: uptimeDays,
        hours: uptimeHours,
        minutes: uptimeMinutes
      },
      uptimeHistory
    };
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
}

/**
 * Get all users with stats
 */
async function getUsers(roleFilter?: string) {
  try {
    // Get users with aggregated session stats
    const users = await prisma.user.findMany({
      where: roleFilter && roleFilter !== 'all' ? { role: roleFilter as any } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        lastActive: true,
        _count: {
          select: {
            sessionsAsClient: true,
            sessionsAsCoach: true
          }
        }
      }
    });
    
    // For total minutes, we need a separate aggregation
    const sessionStats = await prisma.session.groupBy({
      by: ['userId'],
      _sum: { durationMinutes: true },
      _count: { id: true }
    });
    
    // Create lookup map
    const statsMap = new Map(
      sessionStats.map(s => [s.userId, {
        totalSessions: s._count.id,
        totalMinutes: s._sum.durationMinutes || 0
      }])
    );
    
    // Transform to match frontend User type
    return users.map(user => {
      const stats = statsMap.get(user.id) || { totalSessions: 0, totalMinutes: 0 };
      
      return {
        id: user.id,
        email: user.email,
        name: user.displayName || user.email.split('@')[0],
        role: user.role?.toLowerCase() || 'client',
        createdAt: user.createdAt.toISOString(),
        lastSeen: user.lastActive?.toISOString() || user.createdAt.toISOString(),
        totalSessions: stats.totalSessions,
        totalMinutes: stats.totalMinutes
      };
    });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return [];
  }
}

/**
 * Get coaches with additional stats
 */
async function getCoaches() {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Get coaches
    const coaches = await prisma.user.findMany({
      where: { role: 'coach' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        coachName: true,
        role: true,
        createdAt: true,
        lastActive: true,
        isAvailable: true,
        coachLevel: true
      }
    });
    
    // Get appointments for these coaches to build stats
    const coachIds = coaches.map(c => c.id);
    const appointments = await prisma.appointment.findMany({
      where: {
        coachId: { in: coachIds }
      },
      select: {
        id: true,
        coachId: true,
        clientId: true,
        scheduledFor: true
      }
    });
    
    // Build stats per coach
    const coachStatsMap = new Map<string, {
      totalSessions: number;
      totalMinutes: number;
      clientIds: Set<string>;
      weeklyMinutes: number;
    }>();
    
    // Initialize all coaches
    coaches.forEach(coach => {
      coachStatsMap.set(coach.id, {
        totalSessions: 0,
        totalMinutes: 0,
        clientIds: new Set(),
        weeklyMinutes: 0
      });
    });
    
    // Get sessions for all appointments
    const appointmentIds = appointments.map(a => a.id);
    const sessions = await prisma.session.findMany({
      where: {
        appointmentId: { in: appointmentIds }
      },
      select: {
        appointmentId: true,
        durationMinutes: true,
        startedAt: true
      }
    });
    
    // Aggregate sessions by appointment
    const sessionsByAppointment = new Map<string, { total: number; totalMinutes: number; weeklyMinutes: number }>();
    sessions.forEach(session => {
      if (!session.appointmentId) return;
      const existing = sessionsByAppointment.get(session.appointmentId) || { total: 0, totalMinutes: 0, weeklyMinutes: 0 };
      existing.total += 1;
      existing.totalMinutes += session.durationMinutes || 0;
      if (session.startedAt >= startOfWeek) {
        existing.weeklyMinutes += session.durationMinutes || 0;
      }
      sessionsByAppointment.set(session.appointmentId, existing);
    });
    
    // Aggregate by coach
    for (const appt of appointments) {
      const stats = coachStatsMap.get(appt.coachId);
      if (stats) {
        stats.clientIds.add(appt.clientId);
        const apptStats = sessionsByAppointment.get(appt.id) || { total: 0, totalMinutes: 0, weeklyMinutes: 0 };
        stats.totalSessions += apptStats.total;
        stats.totalMinutes += apptStats.totalMinutes;
        stats.weeklyMinutes += apptStats.weeklyMinutes;
      }
    }
    
    // Transform to match frontend Coach type
    return coaches.map(coach => {
      const stats = coachStatsMap.get(coach.id)!;
      
      return {
        id: coach.id,
        email: coach.email,
        name: coach.coachName || coach.displayName || coach.email.split('@')[0],
        role: 'coach' as const,
        createdAt: coach.createdAt.toISOString(),
        lastSeen: coach.lastActive?.toISOString() || coach.createdAt.toISOString(),
        totalSessions: stats.totalSessions,
        totalMinutes: stats.totalMinutes,
        clientCount: stats.clientIds.size,
        weeklyHours: Math.round((stats.weeklyMinutes / 60) * 10) / 10,
        isAvailable: coach.isAvailable ?? true,
        coachLevel: coach.coachLevel || 1
      };
    });
  } catch (error) {
    console.error('Failed to fetch coaches:', error);
    return [];
  }
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
async function getSessions() {
  try {
    // Query sessions with related user data and message count
    const sessions = await prisma.session.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            role: true
          }
        },
        appointment: {
          include: {
            coach: {
              select: {
                id: true,
                displayName: true
              }
            },
            client: {
              select: {
                id: true,
                displayName: true
              }
            }
          }
        },
        _count: {
          select: { messages: true }
        }
      }
    });
    
    // Transform to match frontend TranscriptSession type
    return sessions.map(session => {
      const clientId = session.appointment?.clientId || session.userId;
      const clientName = session.appointment?.client?.displayName || 
                        session.user?.displayName || 
                        'Unknown Client';
      const coachId = session.appointment?.coachId || undefined;
      const coachName = session.appointment?.coach?.displayName || undefined;
      
      return {
        id: session.id,
        clientId,
        clientName,
        coachId,
        coachName,
        startTime: session.startedAt,
        endTime: session.endedAt || undefined,
        durationMinutes: session.durationMinutes || 0,
        messageCount: session._count.messages
      };
    });
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return [];
  }
}

/**
 * Get transcript for a session
 */
async function getTranscript(sessionId: string) {
  try {
    // Fetch session with messages
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                role: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            displayName: true,
            role: true
          }
        },
        appointment: {
          include: {
            coach: {
              select: { id: true, displayName: true }
            },
            client: {
              select: { id: true, displayName: true }
            }
          }
        }
      }
    });
    
    if (!session) {
      return null;
    }
    
    // Transform messages to match frontend TranscriptMessage type
    const messages = session.messages.map(msg => {
      let speakerRole: 'client' | 'coach' | 'ai' = 'client';
      let speakerName = 'Unknown';
      let speakerId = msg.userId || 'ai';
      
      if (msg.sender === 'ai' || !msg.userId) {
        speakerRole = 'ai';
        speakerName = 'AI Coach';
        speakerId = 'ai-agent';
      } else if (msg.user) {
        speakerName = msg.user.displayName || 'Unknown';
        if (session.appointment?.coachId === msg.userId) {
          speakerRole = 'coach';
        } else {
          speakerRole = 'client';
        }
      }
      
      return {
        id: msg.id,
        sessionId: msg.sessionId,
        speakerId,
        speakerName,
        speakerRole,
        content: msg.content,
        timestamp: msg.createdAt,
        confidence: undefined
      };
    });
    
    // If no messages in database, check if session has transcript field
    if (messages.length === 0 && session.transcript) {
      const parsedMessages = parseTranscriptText(session.transcript, session);
      return {
        sessionId,
        messages: parsedMessages
      };
    }
    
    return {
      sessionId,
      messages
    };
  } catch (error) {
    console.error('Failed to fetch transcript:', error);
    return null;
  }
}

// Helper function to parse legacy transcript text
function parseTranscriptText(transcript: string, session: any) {
  const lines = transcript.split('\n').filter(line => line.trim());
  const messages = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(client|coach|ai|assistant|user):\s*(.+)$/i);
    
    if (match) {
      const [, role, content] = match;
      const normalizedRole = role.toLowerCase() === 'assistant' ? 'ai' : 
                            role.toLowerCase() === 'user' ? 'client' :
                            role.toLowerCase() as 'client' | 'coach' | 'ai';
      
      messages.push({
        id: `legacy-${session.id}-${i}`,
        sessionId: session.id,
        speakerId: normalizedRole === 'ai' ? 'ai-agent' : 
                   normalizedRole === 'coach' ? (session.appointment?.coachId || 'unknown-coach') :
                   (session.userId || 'unknown-client'),
        speakerName: normalizedRole === 'ai' ? 'AI Coach' :
                    normalizedRole === 'coach' ? (session.appointment?.coach?.displayName || 'Coach') :
                    (session.user?.displayName || 'Client'),
        speakerRole: normalizedRole,
        content: content.trim(),
        timestamp: session.startedAt,
        confidence: undefined
      });
    }
  }
  
  return messages;
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
    try {
      const metrics = await getMetrics();
      return jsonResponse(metrics);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      return jsonResponse({
        error: 'Failed to fetch metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
  }

  // GET /api/admin/health - System health
  if (path === '/health' && method === 'GET') {
    try {
      const health = await getHealthStatus();
      return jsonResponse(health);
    } catch (error) {
      console.error('Health check failed:', error);
      return jsonResponse({
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
  }

  // GET /api/admin/users - List users
  if (path === '/users' && method === 'GET') {
    const roleFilter = url.searchParams.get('role') || 'all';
    const users = await getUsers(roleFilter);
    return jsonResponse(users);
  }

  // GET /api/admin/coaches - List coaches with extra stats
  if (path === '/coaches' && method === 'GET') {
    const coaches = await getCoaches();
    return jsonResponse(coaches);
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

  // GET /api/admin/processes - List PM2 processes
  if (path === '/processes' && method === 'GET') {
    try {
      // Try to get real PM2 data
      let processes: Array<{
        name: string;
        pm_id: number;
        status: 'online' | 'stopped' | 'errored';
        memory: number;
        cpu: number;
        uptime: number;
      }> = [];
      
      // For now, return mock data (PM2 integration would require pm2 package)
      // In production, you would use: const pm2 = await import('pm2');
      processes = [
        { name: 'api', pm_id: 0, status: 'online', memory: 52428800, cpu: 2.5, uptime: Date.now() - 86400000 },
        { name: 'web-admin', pm_id: 1, status: 'online', memory: 41943040, cpu: 1.2, uptime: Date.now() - 86400000 },
        { name: 'web-coach', pm_id: 2, status: 'online', memory: 39321600, cpu: 0.8, uptime: Date.now() - 86400000 },
        { name: 'web-client', pm_id: 3, status: 'online', memory: 36700160, cpu: 0.5, uptime: Date.now() - 86400000 },
        { name: 'ai-agent', pm_id: 4, status: 'online', memory: 104857600, cpu: 15.3, uptime: Date.now() - 86400000 },
      ];
      
      return jsonResponse(processes);
    } catch (error) {
      console.error('Failed to fetch processes:', error);
      return jsonResponse({
        error: 'Failed to fetch processes',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
  }

  // GET /api/admin/sessions - List sessions for transcripts
  // Also handle /api/admin/transcripts (for frontend compatibility)
  if ((path === '/sessions' || path === '/transcripts') && method === 'GET') {
    const sessions = await getSessions();
    return jsonResponse(sessions);
  }

  // GET /api/admin/transcripts/:sessionId - Get full transcript
  if (path.match(/^\/transcripts\/[^/]+$/) && method === 'GET') {
    const sessionId = path.split('/')[2];
    const transcript = await getTranscript(sessionId);
    if (!transcript) {
      return jsonResponse({ error: 'Session not found' }, { status: 404 });
    }
    return jsonResponse(transcript);
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
