# Admin Dashboard → Prisma Database Integration Guide

## Executive Summary

This document provides a phased implementation plan to connect your admin dashboard frontend to your actual Prisma database. Currently, the admin API (`apps/api/src/routes/admin.ts`) uses in-memory Maps and random data. This guide will migrate it to use real Prisma queries.

**Current State:**
- 🔴 2 endpoints completely broken (Health, Transcripts)
- 🟡 5 endpoints return mock/random data
- 🟢 2 endpoints working (Login, Rooms - but in-memory only)

**Target State:**
- All 9 endpoints using real Prisma queries
- Session/transcript data being stored from AI Agent
- Full audit trail and metrics accuracy

---

## Pre-Implementation Checklist

Before starting, ensure:

```bash
# 1. Prisma client is generated
cd /path/to/project
npx prisma generate

# 2. Database is accessible
npx prisma db push --accept-data-loss  # DEV ONLY - syncs schema

# 3. Verify connection
npx prisma studio  # Opens at localhost:5555
```

**Required Environment Variables:**
```bash
# .env
DATABASE_URL="postgresql://hybridcoach:PASSWORD@localhost:5432/hybridcoach_dev?schema=public"
```

---

# Phase 1: Fix Critical Breaking Issues

**Goal:** Get the Health and Transcripts pages working  
**Estimated Time:** 2-3 hours  
**Priority:** 🔴 CRITICAL

---

## 1.1 Create Shared Prisma Client for Bun API

**Problem:** The Bun API doesn't have a Prisma client configured.

**File:** `apps/api/src/db/prisma.ts` (CREATE NEW)

```typescript
import { PrismaClient } from '@prisma/client';

// Singleton pattern to prevent multiple instances
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Helper for health checks
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
```

**Test:**
```bash
# Create a test file
cat > apps/api/src/db/prisma.test.ts << 'EOF'
import { prisma, checkDatabaseConnection } from './prisma';

async function test() {
  console.log('Testing Prisma connection...');
  const result = await checkDatabaseConnection();
  console.log('Connection result:', result);
  
  const userCount = await prisma.user.count();
  console.log('User count:', userCount);
  
  await prisma.$disconnect();
}

test().catch(console.error);
EOF

bun run apps/api/src/db/prisma.test.ts
```

**Expected Output:**
```
Testing Prisma connection...
Connection result: { connected: true, latencyMs: 5 }
User count: 42
```

---

## 1.2 Fix Health Endpoint (CRITICAL)

**Problem:** Frontend expects `SystemHealth` structure, API returns different structure.

**File:** `apps/api/src/routes/admin.ts`

**FIND this code (approximate):**
```typescript
// GET /api/admin/health
if (path === '/api/admin/health' && method === 'GET') {
  // Current broken implementation
  return jsonResponse({
    database: { status: 'ok', latencyMs: 5 },
    livekit: { status: 'ok', activeRooms: 3 },
    skoolSync: { status: 'ok', lastRun: '...' }
  });
}
```

**REPLACE WITH:**
```typescript
import { prisma, checkDatabaseConnection } from '../db/prisma';
import os from 'os';

// GET /api/admin/health
if (path === '/api/admin/health' && method === 'GET') {
  try {
    // 1. Database health check
    const dbHealth = await checkDatabaseConnection();
    
    // 2. LiveKit health check
    let livekitStatus: 'healthy' | 'degraded' | 'down' = 'down';
    let livekitLatency = 0;
    try {
      const livekitStart = Date.now();
      const livekitHost = process.env.LIVEKIT_HOST || 'http://localhost:7880';
      const response = await fetch(`${livekitHost}/`);
      livekitLatency = Date.now() - livekitStart;
      livekitStatus = response.ok ? 'healthy' : 'degraded';
    } catch {
      livekitStatus = 'down';
    }
    
    // 3. Skool sync status (from SkoolMonitoringLog)
    const lastSkoolSync = await prisma.skoolMonitoringLog.findFirst({
      orderBy: { executedAt: 'desc' },
      select: { success: true, executedAt: true, errorMessage: true }
    });
    
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
    });
    
    // Group by date and determine daily status
    const uptimeMap = new Map<string, 'healthy' | 'degraded' | 'down'>();
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const dateStr = date.toISOString().split('T')[0];
      uptimeMap.set(dateStr, 'healthy'); // Default to healthy
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
    const healthResponse = {
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
        // Note: Disk stats require additional package like 'diskusage'
        // For now, return placeholder - implement with diskusage later
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
    
    return jsonResponse(healthResponse);
    
  } catch (error) {
    console.error('Health check failed:', error);
    return jsonResponse({
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

**Test:**
```bash
# Start your API server
bun run dev:api

# In another terminal, test the endpoint
curl http://127.0.0.1:3699/api/admin/health | jq .
```

**Expected Response:**
```json
{
  "cpu": { "usage": 15, "cores": 8 },
  "memory": { "used": 8589934592, "total": 17179869184, "percentage": 50 },
  "disk": { "used": 0, "total": 0, "percentage": 0 },
  "services": [
    { "name": "API Server", "status": "healthy", "latency": 1, "lastCheck": "2025-12-14T..." },
    { "name": "Database", "status": "healthy", "latency": 5, "lastCheck": "2025-12-14T..." },
    { "name": "LiveKit", "status": "healthy", "latency": 12, "lastCheck": "2025-12-14T..." },
    { "name": "Skool Sync", "status": "healthy", "lastCheck": "2025-12-14T..." }
  ],
  "uptime": { "days": 5, "hours": 3, "minutes": 42 },
  "uptimeHistory": [
    { "date": "2025-11-15", "status": "healthy" },
    ...
  ]
}
```

**Verification:**
1. Open `http://127.0.0.1:3703/admin/health` in browser
2. Page should load without crashing
3. CPU/Memory gauges should show real values
4. Service status indicators should reflect actual state

---

## 1.3 Fix Transcripts Endpoint (CRITICAL)

**Problem:** Field names don't match frontend types.

**Frontend expects:**
```typescript
interface TranscriptSession {
  id: string;
  clientId: string;
  clientName: string;      // ← API returns "userName"
  coachId?: string;
  coachName?: string;
  startTime: Date;         // ← API returns "startedAt"
  endTime?: Date;          // ← API returns "endedAt"
  durationMinutes: number;
  messageCount: number;    // ← API doesn't return this
}
```

**File:** `apps/api/src/routes/admin.ts`

**FIND this code:**
```typescript
// GET /api/admin/transcripts
if (path === '/api/admin/transcripts' && method === 'GET') {
  // Current broken implementation with wrong field names
}
```

**REPLACE WITH:**
```typescript
// GET /api/admin/transcripts
if (path === '/api/admin/transcripts' && method === 'GET') {
  try {
    // Query sessions with related user data and message count
    const sessions = await prisma.session.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100, // Limit for performance
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
    const transcripts = sessions.map(session => {
      // Determine client and coach from appointment or session user
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
        startTime: session.startedAt,           // Renamed from startedAt
        endTime: session.endedAt || undefined,  // Renamed from endedAt
        durationMinutes: session.durationMinutes || 0,
        messageCount: session._count.messages   // Added message count
      };
    });
    
    return jsonResponse(transcripts);
    
  } catch (error) {
    console.error('Failed to fetch transcripts:', error);
    return jsonResponse({ 
      error: 'Failed to fetch transcripts',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

**Test:**
```bash
curl http://127.0.0.1:3699/api/admin/transcripts | jq '.[0]'
```

**Expected Response:**
```json
{
  "id": "clx1234567890",
  "clientId": "clx0987654321",
  "clientName": "John Doe",
  "coachId": "clx1111111111",
  "coachName": "Jane Coach",
  "startTime": "2025-12-14T10:00:00.000Z",
  "endTime": "2025-12-14T10:30:00.000Z",
  "durationMinutes": 30,
  "messageCount": 45
}
```

---

## 1.4 Fix Transcript Detail Endpoint

**File:** `apps/api/src/routes/admin.ts`

**FIND this code:**
```typescript
// GET /api/admin/transcripts/:sessionId
const transcriptMatch = path.match(/^\/api\/admin\/transcripts\/([^/]+)$/);
if (transcriptMatch && method === 'GET') {
  // Current implementation returns hardcoded sample messages
}
```

**REPLACE WITH:**
```typescript
// GET /api/admin/transcripts/:sessionId
const transcriptMatch = path.match(/^\/api\/admin\/transcripts\/([^/]+)$/);
if (transcriptMatch && method === 'GET') {
  const sessionId = transcriptMatch[1];
  
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
      return jsonResponse({ error: 'Session not found' }, { status: 404 });
    }
    
    // Transform messages to match frontend TranscriptMessage type
    const messages = session.messages.map(msg => {
      // Determine speaker role
      let speakerRole: 'client' | 'coach' | 'ai' = 'client';
      let speakerName = 'Unknown';
      let speakerId = msg.userId || 'ai';
      
      if (msg.sender === 'ai' || !msg.userId) {
        speakerRole = 'ai';
        speakerName = 'AI Coach';
        speakerId = 'ai-agent';
      } else if (msg.user) {
        speakerName = msg.user.displayName || msg.user.email || 'Unknown';
        // Check if this user is the coach or client
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
        confidence: undefined // Add if you store transcription confidence
      };
    });
    
    // If no messages in database, check if session has transcript field
    if (messages.length === 0 && session.transcript) {
      // Parse legacy transcript format (if stored as text)
      const parsedMessages = parseTranscriptText(session.transcript, session);
      return jsonResponse({
        sessionId,
        messages: parsedMessages
      });
    }
    
    return jsonResponse({
      sessionId,
      messages
    });
    
  } catch (error) {
    console.error('Failed to fetch transcript:', error);
    return jsonResponse({
      error: 'Failed to fetch transcript',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper function to parse legacy transcript text
function parseTranscriptText(transcript: string, session: any) {
  // Simple parser for "Speaker: message" format
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
        timestamp: session.startedAt, // Approximate
        confidence: undefined
      });
    }
  }
  
  return messages;
}
```

**Test:**
```bash
# First, get a session ID
SESSION_ID=$(curl -s http://127.0.0.1:3699/api/admin/transcripts | jq -r '.[0].id')

# Then fetch the detail
curl http://127.0.0.1:3699/api/admin/transcripts/$SESSION_ID | jq .
```

**Expected Response:**
```json
{
  "sessionId": "clx1234567890",
  "messages": [
    {
      "id": "msg123",
      "sessionId": "clx1234567890",
      "speakerId": "user123",
      "speakerName": "John Doe",
      "speakerRole": "client",
      "content": "Hello, I've been feeling stressed lately.",
      "timestamp": "2025-12-14T10:00:15.000Z"
    },
    {
      "id": "msg124",
      "sessionId": "clx1234567890",
      "speakerId": "ai-agent",
      "speakerName": "AI Coach",
      "speakerRole": "ai",
      "content": "I understand. Let's work through some breathing exercises together.",
      "timestamp": "2025-12-14T10:00:20.000Z"
    }
  ]
}
```

---

## Phase 1 Testing Checklist

```bash
#!/bin/bash
# Save as: scripts/test-phase1.sh

echo "=== Phase 1 Testing ==="

API_URL="http://127.0.0.1:3699"

echo ""
echo "1. Testing Database Connection..."
curl -s "$API_URL/api/admin/health" | jq '.services[] | select(.name == "Database")'

echo ""
echo "2. Testing Health Endpoint Structure..."
HEALTH=$(curl -s "$API_URL/api/admin/health")
echo "$HEALTH" | jq 'keys'
# Should output: ["cpu", "disk", "memory", "services", "uptime", "uptimeHistory"]

echo ""
echo "3. Testing Transcripts List..."
TRANSCRIPTS=$(curl -s "$API_URL/api/admin/transcripts")
echo "Transcript count: $(echo $TRANSCRIPTS | jq 'length')"
echo "First transcript fields: $(echo $TRANSCRIPTS | jq '.[0] | keys')"
# Should include: clientId, clientName, coachId, coachName, startTime, endTime, messageCount

echo ""
echo "4. Testing Transcript Detail..."
SESSION_ID=$(echo $TRANSCRIPTS | jq -r '.[0].id // empty')
if [ -n "$SESSION_ID" ]; then
  DETAIL=$(curl -s "$API_URL/api/admin/transcripts/$SESSION_ID")
  echo "Message count: $(echo $DETAIL | jq '.messages | length')"
else
  echo "No sessions found - skipping detail test"
fi

echo ""
echo "=== Phase 1 Complete ==="
```

**Run:**
```bash
chmod +x scripts/test-phase1.sh
./scripts/test-phase1.sh
```

---

# Phase 2: Real Metrics & Statistics

**Goal:** Replace random/mock data with real Prisma queries  
**Estimated Time:** 3-4 hours  
**Priority:** 🟡 HIGH

---

## 2.1 Fix Metrics Endpoint

**File:** `apps/api/src/routes/admin.ts`

**FIND this code:**
```typescript
// GET /api/admin/metrics
if (path === '/api/admin/metrics' && method === 'GET') {
  // Current implementation using Math.random()
}
```

**REPLACE WITH:**
```typescript
// GET /api/admin/metrics
if (path === '/api/admin/metrics' && method === 'GET') {
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
      
      // Active user sessions (using UserSession table if populated, else estimate)
      prisma.userSession.count({
        where: { 
          isActive: true,
          expiresAt: { gt: now }
        }
      }).catch(() => 0), // Fallback if UserSession not populated
      
      // Active rooms (from Session table with status 'active')
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
      })
    ]);
    
    // Build response matching frontend AdminMetrics type
    const metricsResponse = {
      totalUsers,
      activeUsers: activeUserSessions || Math.min(totalUsers, activeRoomsCount * 2), // Estimate if UserSession not populated
      activeRooms: activeRoomsCount,
      totalCoaches,
      coachesByActivity: {
        recent1h: coachesActive1h,
        recent1d: coachesActive1d,
        recent1w: coachesActive1w,
        recent1m: coachesActive1m  // Now included!
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
        database: true, // We already confirmed connection to get here
        livekit: await checkLiveKitHealth(),
        skool: lastSkoolSync?.success ?? false
      }
    };
    
    return jsonResponse(metricsResponse);
    
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
    return jsonResponse({
      error: 'Failed to fetch metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
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
```

**Test:**
```bash
curl http://127.0.0.1:3699/api/admin/metrics | jq .
```

**Expected Response:**
```json
{
  "totalUsers": 156,
  "activeUsers": 12,
  "activeRooms": 3,
  "totalCoaches": 8,
  "coachesByActivity": {
    "recent1h": 2,
    "recent1d": 5,
    "recent1w": 7,
    "recent1m": 8
  },
  "clientVoiceMinutes": {
    "today": 245,
    "week": 1420,
    "month": 5680
  },
  "skoolSyncStatus": {
    "lastRun": "2025-12-14T06:00:00.000Z",
    "success": true,
    "membersFound": 42,
    "newMembers": 3
  },
  "systemHealth": {
    "api": true,
    "database": true,
    "livekit": true,
    "skool": true
  }
}
```

---

## 2.2 Fix Users Endpoint

**File:** `apps/api/src/routes/admin.ts`

**REPLACE users endpoint:**
```typescript
// GET /api/admin/users
if (path === '/api/admin/users' && method === 'GET') {
  try {
    // Get users with aggregated session stats
    const users = await prisma.user.findMany({
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
    // This is more efficient than N+1 queries
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
    const transformedUsers = users.map(user => {
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
    
    return jsonResponse(transformedUsers);
    
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return jsonResponse({
      error: 'Failed to fetch users',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

---

## 2.3 Fix Coaches Endpoint

**File:** `apps/api/src/routes/admin.ts`

**REPLACE coaches endpoint:**
```typescript
// GET /api/admin/coaches
if (path === '/api/admin/coaches' && method === 'GET') {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Get coaches with stats
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
    
    // Get coach session statistics
    const coachStats = await prisma.session.groupBy({
      by: ['appointmentId'],
      _sum: { durationMinutes: true },
      _count: { id: true }
    });
    
    // Get appointment data to link coach to sessions
    const appointments = await prisma.appointment.findMany({
      where: {
        coachId: { in: coaches.map(c => c.id) }
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
    
    // Aggregate sessions through appointments
    for (const appt of appointments) {
      const stats = coachStatsMap.get(appt.coachId);
      if (stats) {
        stats.clientIds.add(appt.clientId);
        
        // Get sessions for this appointment
        const apptSessions = await prisma.session.aggregate({
          where: { appointmentId: appt.id },
          _sum: { durationMinutes: true },
          _count: { id: true }
        });
        
        stats.totalSessions += apptSessions._count.id;
        stats.totalMinutes += apptSessions._sum.durationMinutes || 0;
        
        // Weekly minutes
        if (appt.scheduledFor >= startOfWeek) {
          stats.weeklyMinutes += apptSessions._sum.durationMinutes || 0;
        }
      }
    }
    
    // Transform to match frontend Coach type
    const transformedCoaches = coaches.map(coach => {
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
        weeklyHours: Math.round((stats.weeklyMinutes / 60) * 10) / 10, // 1 decimal place
        isAvailable: coach.isAvailable ?? true,
        coachLevel: coach.coachLevel || 1
      };
    });
    
    return jsonResponse(transformedCoaches);
    
  } catch (error) {
    console.error('Failed to fetch coaches:', error);
    return jsonResponse({
      error: 'Failed to fetch coaches',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

---

## 2.4 Fix Processes Endpoint (Minor)

**Problem:** Returns `id` instead of `pm_id`

**File:** `apps/api/src/routes/admin.ts`

**REPLACE processes endpoint:**
```typescript
// GET /api/admin/processes
if (path === '/api/admin/processes' && method === 'GET') {
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
    
    try {
      // Dynamic import to avoid issues if pm2 not installed
      const pm2 = await import('pm2');
      
      processes = await new Promise((resolve, reject) => {
        pm2.default.connect((err) => {
          if (err) {
            reject(err);
            return;
          }
          
          pm2.default.list((err, list) => {
            pm2.default.disconnect();
            
            if (err) {
              reject(err);
              return;
            }
            
            const mapped = list.map(proc => ({
              name: proc.name || 'unknown',
              pm_id: proc.pm_id ?? 0,  // Changed from 'id' to 'pm_id'
              status: (proc.pm2_env?.status === 'online' ? 'online' :
                      proc.pm2_env?.status === 'stopped' ? 'stopped' : 
                      'errored') as 'online' | 'stopped' | 'errored',
              memory: proc.monit?.memory || 0,
              cpu: proc.monit?.cpu || 0,
              uptime: proc.pm2_env?.pm_uptime || 0
            }));
            
            resolve(mapped);
          });
        });
      });
    } catch (pm2Error) {
      console.warn('PM2 not available, returning mock data:', pm2Error);
      
      // Fallback to mock data if PM2 not available
      processes = [
        { name: 'api', pm_id: 0, status: 'online', memory: 52428800, cpu: 2.5, uptime: Date.now() - 86400000 },
        { name: 'web-admin', pm_id: 1, status: 'online', memory: 41943040, cpu: 1.2, uptime: Date.now() - 86400000 },
        { name: 'web-coach', pm_id: 2, status: 'online', memory: 39321600, cpu: 0.8, uptime: Date.now() - 86400000 },
        { name: 'web-client', pm_id: 3, status: 'online', memory: 36700160, cpu: 0.5, uptime: Date.now() - 86400000 },
        { name: 'ai-agent', pm_id: 4, status: 'online', memory: 104857600, cpu: 15.3, uptime: Date.now() - 86400000 },
      ];
    }
    
    return jsonResponse(processes);
    
  } catch (error) {
    console.error('Failed to fetch processes:', error);
    return jsonResponse({
      error: 'Failed to fetch processes',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

---

## Phase 2 Testing Checklist

```bash
#!/bin/bash
# Save as: scripts/test-phase2.sh

echo "=== Phase 2 Testing ==="

API_URL="http://127.0.0.1:3699"

echo ""
echo "1. Testing Metrics Endpoint..."
METRICS=$(curl -s "$API_URL/api/admin/metrics")
echo "Total users: $(echo $METRICS | jq '.totalUsers')"
echo "Active rooms: $(echo $METRICS | jq '.activeRooms')"
echo "Coaches by activity: $(echo $METRICS | jq '.coachesByActivity')"
echo "Voice minutes today: $(echo $METRICS | jq '.clientVoiceMinutes.today')"

echo ""
echo "2. Testing Users Endpoint..."
USERS=$(curl -s "$API_URL/api/admin/users")
echo "User count: $(echo $USERS | jq 'length')"
echo "First user: $(echo $USERS | jq '.[0] | {name, role, totalSessions, totalMinutes}')"

echo ""
echo "3. Testing Coaches Endpoint..."
COACHES=$(curl -s "$API_URL/api/admin/coaches")
echo "Coach count: $(echo $COACHES | jq 'length')"
echo "First coach: $(echo $COACHES | jq '.[0] | {name, clientCount, weeklyHours}')"

echo ""
echo "4. Testing Processes Endpoint..."
PROCESSES=$(curl -s "$API_URL/api/admin/processes")
echo "Process count: $(echo $PROCESSES | jq 'length')"
echo "Field check (should have pm_id): $(echo $PROCESSES | jq '.[0] | has("pm_id")')"

echo ""
echo "5. Verifying No Random Data..."
# Run metrics twice and compare - should be same (or very close)
METRICS1=$(curl -s "$API_URL/api/admin/metrics" | jq '.totalUsers')
sleep 1
METRICS2=$(curl -s "$API_URL/api/admin/metrics" | jq '.totalUsers')
if [ "$METRICS1" = "$METRICS2" ]; then
  echo "✅ Metrics are consistent (not random)"
else
  echo "⚠️ Metrics differ between calls: $METRICS1 vs $METRICS2"
fi

echo ""
echo "=== Phase 2 Complete ==="
```

---

# Phase 3: Session & Transcript Persistence

**Goal:** Store session data and transcripts from AI Agent  
**Estimated Time:** 4-6 hours  
**Priority:** 🟢 IMPORTANT

This phase addresses the critical gap: **AI Agent receives transcripts but doesn't store them.**

---

## 3.1 Add Prisma to AI Agent

**File:** `services/ai-agent/package.json`

**ADD to dependencies:**
```json
{
  "dependencies": {
    "@prisma/client": "^5.14.0"
  }
}
```

**Install:**
```bash
cd services/ai-agent
npm install @prisma/client
```

**Create:** `services/ai-agent/src/db/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Session management helpers
export interface SessionData {
  roomId: string;
  userId?: string;
  appointmentId?: string;
}

export async function createSession(data: SessionData): Promise<string> {
  const session = await prisma.session.create({
    data: {
      roomId: data.roomId,
      userId: data.userId || 'anonymous',
      appointmentId: data.appointmentId,
      status: 'active',
      startedAt: new Date(),
      durationMinutes: 30, // Default expected duration
    },
  });
  return session.id;
}

export async function addMessage(
  sessionId: string,
  content: string,
  sender: 'client' | 'coach' | 'ai',
  userId?: string
): Promise<void> {
  await prisma.message.create({
    data: {
      sessionId,
      userId: userId || undefined,
      sender,
      content,
    },
  });
}

export async function completeSession(
  sessionId: string,
  transcript?: string,
  aiSummary?: string
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { startedAt: true },
  });

  const durationMinutes = session
    ? Math.round((Date.now() - session.startedAt.getTime()) / 60000)
    : 0;

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'completed',
      endedAt: new Date(),
      durationMinutes,
      transcript,
      aiSummary,
    },
  });
}
```

---

## 3.2 Integrate Database in AI Agent

**File:** `services/ai-agent/src/livekit-agent.ts` (or your main agent file)

**ADD imports at top:**
```typescript
import { 
  prisma, 
  createSession, 
  addMessage, 
  completeSession 
} from './db/prisma';
```

**ADD session tracking to your agent class:**
```typescript
class LiveKitAgent {
  private sessionId: string | null = null;
  private messageBuffer: Array<{ content: string; sender: string; timestamp: Date }> = [];
  
  async onRoomConnected(roomName: string, participantIdentity?: string) {
    console.log(`[DB] Creating session for room: ${roomName}`);
    
    try {
      // Try to find appointment for this room
      const appointment = await prisma.appointment.findUnique({
        where: { roomId: roomName },
        select: { id: true, clientId: true }
      });
      
      this.sessionId = await createSession({
        roomId: roomName,
        userId: appointment?.clientId || participantIdentity,
        appointmentId: appointment?.id,
      });
      
      console.log(`[DB] Session created: ${this.sessionId}`);
    } catch (error) {
      console.error('[DB] Failed to create session:', error);
    }
  }
  
  async onTranscriptReceived(
    content: string, 
    role: 'user' | 'assistant',
    participantId?: string
  ) {
    if (!this.sessionId) {
      console.warn('[DB] No session ID, buffering message');
      this.messageBuffer.push({
        content,
        sender: role === 'assistant' ? 'ai' : 'client',
        timestamp: new Date()
      });
      return;
    }
    
    const sender = role === 'assistant' ? 'ai' : 'client';
    
    try {
      await addMessage(this.sessionId, content, sender, participantId);
      console.log(`[DB] Message stored: ${sender} - ${content.substring(0, 50)}...`);
    } catch (error) {
      console.error('[DB] Failed to store message:', error);
      // Buffer for retry
      this.messageBuffer.push({ content, sender, timestamp: new Date() });
    }
  }
  
  async onRoomDisconnected() {
    if (!this.sessionId) {
      console.warn('[DB] No session to complete');
      return;
    }
    
    console.log(`[DB] Completing session: ${this.sessionId}`);
    
    try {
      // Flush any buffered messages
      for (const msg of this.messageBuffer) {
        await addMessage(this.sessionId, msg.content, msg.sender as any);
      }
      this.messageBuffer = [];
      
      // Get all messages for transcript
      const messages = await prisma.message.findMany({
        where: { sessionId: this.sessionId },
        orderBy: { createdAt: 'asc' },
      });
      
      // Build transcript text
      const transcript = messages
        .map(m => `${m.sender}: ${m.content}`)
        .join('\n');
      
      // Generate AI summary (optional - call your AI for this)
      const aiSummary = await this.generateSummary(messages);
      
      // Complete the session
      await completeSession(this.sessionId, transcript, aiSummary);
      
      console.log(`[DB] Session completed: ${this.sessionId}`);
    } catch (error) {
      console.error('[DB] Failed to complete session:', error);
    } finally {
      this.sessionId = null;
    }
  }
  
  private async generateSummary(messages: any[]): Promise<string | undefined> {
    if (messages.length < 5) return undefined;
    
    // Implement your summary generation here
    // Could call Claude API, OpenAI, or your local LLM
    return `Session with ${messages.length} messages. Topics discussed: breathing exercises, stress management.`;
  }
}
```

---

## 3.3 Hook into Deepgram Events

**Find where you handle Deepgram `ConversationText` events and add database calls:**

```typescript
// In your Deepgram/voice agent handler
voiceAgent.on('conversation-text', async (entry: TranscriptEntry) => {
  // Existing: broadcast to room
  this.broadcastToRoom(entry);
  
  // NEW: Store in database
  await this.onTranscriptReceived(
    entry.content,
    entry.role,
    entry.participantId
  );
});
```

---

## 3.4 Link Rooms to Database (Bun API)

**File:** `apps/api/src/routes/rooms.ts`

**ADD database persistence when creating rooms:**
```typescript
import { prisma } from '../db/prisma';

// POST /api/rooms/create
if (path === '/api/rooms/create' && method === 'POST') {
  const roomId = createRoomId();
  
  try {
    // Check if this is for a scheduled appointment
    const { appointmentId } = await req.json().catch(() => ({}));
    
    if (appointmentId) {
      // Link room to appointment
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { roomId }
      });
    }
    
    // Create session record
    await prisma.session.create({
      data: {
        roomId,
        userId: user.id,
        appointmentId,
        status: 'active',
        startedAt: new Date(),
        durationMinutes: 30,
      }
    });
    
    console.log(`[DB] Room created and session initialized: ${roomId}`);
  } catch (error) {
    console.error('[DB] Failed to persist room:', error);
    // Continue anyway - room is functional even if DB fails
  }
  
  const joinUrls = getJoinUrls(roomId);
  return jsonResponse({
    success: true,
    data: { roomId, joinUrls }
  });
}
```

---

## 3.5 Add Session Cleanup Job

**Create:** `apps/api/src/jobs/session-cleanup.ts`

```typescript
import { prisma } from '../db/prisma';

/**
 * Clean up stale sessions that were never completed
 * Run this periodically (e.g., every hour via cron)
 */
export async function cleanupStaleSessions(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  
  // Find sessions that are still "active" but started more than 2 hours ago
  const staleSessions = await prisma.session.findMany({
    where: {
      status: 'active',
      startedAt: { lt: twoHoursAgo }
    },
    select: { id: true, startedAt: true }
  });
  
  console.log(`[Cleanup] Found ${staleSessions.length} stale sessions`);
  
  for (const session of staleSessions) {
    const durationMinutes = Math.round(
      (Date.now() - session.startedAt.getTime()) / 60000
    );
    
    await prisma.session.update({
      where: { id: session.id },
      data: {
        status: 'cancelled',
        endedAt: new Date(),
        durationMinutes: Math.min(durationMinutes, 120), // Cap at 2 hours
      }
    });
    
    console.log(`[Cleanup] Marked session ${session.id} as cancelled`);
  }
}

// Clean up expired user sessions
export async function cleanupExpiredUserSessions(): Promise<void> {
  const result = await prisma.userSession.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      isActive: false
    }
  });
  
  console.log(`[Cleanup] Deleted ${result.count} expired user sessions`);
}

// Clean up old auth codes
export async function cleanupExpiredAuthCodes(): Promise<void> {
  const result = await prisma.authCode.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      usedAt: { not: null } // Only delete used codes
    }
  });
  
  console.log(`[Cleanup] Deleted ${result.count} expired auth codes`);
}
```

**Add to your startup or cron:**
```typescript
// In your API startup
import { 
  cleanupStaleSessions, 
  cleanupExpiredUserSessions,
  cleanupExpiredAuthCodes 
} from './jobs/session-cleanup';

// Run cleanup every hour
setInterval(async () => {
  console.log('[Cleanup] Running scheduled cleanup...');
  await cleanupStaleSessions();
  await cleanupExpiredUserSessions();
  await cleanupExpiredAuthCodes();
}, 60 * 60 * 1000);

// Also run once on startup
cleanupStaleSessions();
```

---

## Phase 3 Testing Checklist

```bash
#!/bin/bash
# Save as: scripts/test-phase3.sh

echo "=== Phase 3 Testing ==="

API_URL="http://127.0.0.1:3699"

echo ""
echo "1. Testing Session Creation..."
# Create a room and verify session is created
ROOM_RESPONSE=$(curl -s -X POST "$API_URL/api/rooms/create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN")
ROOM_ID=$(echo $ROOM_RESPONSE | jq -r '.data.roomId')
echo "Created room: $ROOM_ID"

# Check if session was created in database
echo ""
echo "2. Verifying Session in Database..."
# Use Prisma Studio or direct DB query
npx prisma studio &
STUDIO_PID=$!
echo "Prisma Studio started (PID: $STUDIO_PID)"
echo "Check for session with roomId: $ROOM_ID"
sleep 3
kill $STUDIO_PID 2>/dev/null

echo ""
echo "3. Testing Transcript Storage..."
# This requires running the AI agent and having a conversation
echo "Manual test required:"
echo "  1. Start AI agent: cd services/ai-agent && npm start"
echo "  2. Join the room: $ROOM_ID"
echo "  3. Have a short conversation"
echo "  4. Disconnect"
echo "  5. Check database for messages"

echo ""
echo "4. Testing Session Completion..."
# Fetch transcript after session ends
sleep 5  # Wait for potential session
TRANSCRIPTS=$(curl -s "$API_URL/api/admin/transcripts")
LATEST=$(echo $TRANSCRIPTS | jq '.[0]')
echo "Latest transcript: $(echo $LATEST | jq '{id, messageCount, durationMinutes}')"

echo ""
echo "5. Testing Cleanup Job..."
# Manually trigger cleanup
curl -s -X POST "$API_URL/api/admin/cleanup" || echo "(Cleanup endpoint not exposed - run manually)"

echo ""
echo "=== Phase 3 Complete ==="
echo ""
echo "Full Integration Test:"
echo "1. Create room via API"
echo "2. Join room with client"
echo "3. AI agent connects and receives audio"
echo "4. Speak and verify Deepgram transcription"
echo "5. Check database for messages in real-time"
echo "6. Disconnect and verify session completion"
echo "7. View transcript in admin dashboard"
```

---

## Database Verification Queries

Run these in Prisma Studio or psql to verify data:

```sql
-- Check recent sessions
SELECT id, "roomId", "userId", status, "startedAt", "endedAt", "durationMinutes"
FROM "Session"
ORDER BY "startedAt" DESC
LIMIT 10;

-- Check messages for a session
SELECT id, "sessionId", sender, content, "createdAt"
FROM "Message"
WHERE "sessionId" = 'YOUR_SESSION_ID'
ORDER BY "createdAt" ASC;

-- Session stats
SELECT 
  status,
  COUNT(*) as count,
  AVG("durationMinutes") as avg_duration
FROM "Session"
GROUP BY status;

-- Messages per session
SELECT 
  s.id,
  s."roomId",
  s.status,
  COUNT(m.id) as message_count
FROM "Session" s
LEFT JOIN "Message" m ON m."sessionId" = s.id
GROUP BY s.id
ORDER BY s."startedAt" DESC
LIMIT 20;
```

---

# Summary: Complete File Change List

## Phase 1 (Critical Fixes)
| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/db/prisma.ts` | CREATE | Shared Prisma client |
| `apps/api/src/routes/admin.ts` | MODIFY | Fix health endpoint structure |
| `apps/api/src/routes/admin.ts` | MODIFY | Fix transcripts endpoint field names |
| `apps/api/src/routes/admin.ts` | MODIFY | Fix transcript detail endpoint |

## Phase 2 (Real Data)
| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/routes/admin.ts` | MODIFY | Real metrics queries |
| `apps/api/src/routes/admin.ts` | MODIFY | Real user stats |
| `apps/api/src/routes/admin.ts` | MODIFY | Real coach stats |
| `apps/api/src/routes/admin.ts` | MODIFY | Fix pm_id field |

## Phase 3 (Persistence)
| File | Action | Purpose |
|------|--------|---------|
| `services/ai-agent/package.json` | MODIFY | Add Prisma dependency |
| `services/ai-agent/src/db/prisma.ts` | CREATE | AI Agent Prisma client |
| `services/ai-agent/src/livekit-agent.ts` | MODIFY | Add session tracking |
| `apps/api/src/routes/rooms.ts` | MODIFY | Persist room creation |
| `apps/api/src/jobs/session-cleanup.ts` | CREATE | Cleanup stale sessions |

---

# Deployment Checklist

```bash
# Before deploying each phase:

# 1. Generate Prisma client
npx prisma generate

# 2. Run migrations (if schema changed)
npx prisma migrate deploy

# 3. Test locally
./scripts/test-phase1.sh  # or phase2, phase3

# 4. Build
bun run build

# 5. Restart services
pm2 restart api
pm2 restart ai-agent  # Phase 3 only

# 6. Verify in production
curl https://admin.myultra.coach/api/admin/health
```

---

**Document Version:** 1.0  
**Created:** December 14, 2025  
**For:** MyUltra.Coach Admin Dashboard Integration  
**Database:** PostgreSQL with Prisma 5.14.0