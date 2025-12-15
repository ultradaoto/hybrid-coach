import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma client
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
    log: process.env.NODE_ENV === 'development' 
      ? ['error', 'warn'] 
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ============================================
// Session Management Types
// ============================================

export interface CreateSessionParams {
  roomId: string;
  userId?: string;
  appointmentId?: string;
}

export interface MessageParams {
  sessionId: string;
  content: string;
  sender: 'client' | 'coach' | 'ai';
  userId?: string;
}

// ============================================
// Session Lifecycle Functions
// ============================================

/**
 * Create a new session when agent joins a room
 * Returns the session ID for tracking messages
 */
export async function createAgentSession(params: CreateSessionParams): Promise<string | null> {
  try {
    // Check if session already exists for this room (avoid duplicates)
    const existing = await prisma.session.findFirst({
      where: {
        roomId: params.roomId,
        status: 'active'
      },
      select: { id: true }
    });

    if (existing) {
      console.log(`[DB] Session already exists for room ${params.roomId}: ${existing.id}`);
      return existing.id;
    }

    // Try to find appointment linked to this room
    let appointmentId = params.appointmentId;
    let clientUserId = params.userId;

    if (!appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: { roomId: params.roomId },
        select: { id: true, clientId: true }
      });

      if (appointment) {
        appointmentId = appointment.id;
        clientUserId = clientUserId || appointment.clientId;
        console.log(`[DB] Found appointment ${appointmentId} for room`);
      }
    }

    // Create session - build data object explicitly to satisfy TypeScript
    const sessionData: {
      roomId: string;
      userId: string;
      appointmentId?: string;
      status: string;
      startedAt: Date;
      durationMinutes: number;
      warningsSent: number;
    } = {
      roomId: params.roomId,
      userId: clientUserId || 'ai-session', // Fallback for ad-hoc sessions
      status: 'active',
      startedAt: new Date(),
      durationMinutes: 30, // Expected duration, will be updated on completion
      warningsSent: 0,
    };
    
    // Only add appointmentId if it exists
    if (appointmentId) {
      sessionData.appointmentId = appointmentId;
    }
    
    const session = await prisma.session.create({
      data: sessionData as any, // Type assertion needed due to Prisma's strict typing
    });

    console.log(`[DB] ✅ Session created: ${session.id} for room: ${params.roomId}`);
    return session.id;

  } catch (error) {
    console.error('[DB] ❌ Failed to create session:', error);
    return null;
  }
}

/**
 * Store a message/transcript entry
 * Called for each transcript segment from Deepgram
 */
export async function storeMessage(params: MessageParams): Promise<boolean> {
  try {
    // Build message data explicitly to satisfy TypeScript
    const messageData: {
      sessionId: string;
      userId?: string;
      sender: 'client' | 'coach' | 'ai';
      content: string;
    } = {
      sessionId: params.sessionId,
      sender: params.sender,
      content: params.content,
    };
    
    if (params.userId) {
      messageData.userId = params.userId;
    }
    
    await prisma.message.create({
      data: messageData as any, // Type assertion needed due to Prisma's strict typing
    });

    // Log sparingly to avoid spam
    if (params.content.length > 50) {
      console.log(`[DB] 💬 Message stored: ${params.sender} - "${params.content.substring(0, 40)}..."`);
    }

    return true;

  } catch (error) {
    console.error('[DB] ❌ Failed to store message:', error);
    return false;
  }
}

/**
 * Complete a session when agent disconnects
 * Calculates duration and optionally stores final transcript
 */
export async function completeSession(
  sessionId: string,
  options?: {
    generateTranscript?: boolean;
    aiSummary?: string;
  }
): Promise<boolean> {
  try {
    // Get session start time for duration calculation
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { startedAt: true, roomId: true },
    });

    if (!session) {
      console.warn(`[DB] Session not found: ${sessionId}`);
      return false;
    }

    // Calculate actual duration
    const durationMs = Date.now() - session.startedAt.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    // Optionally generate transcript from messages
    let transcript: string | undefined;
    if (options?.generateTranscript) {
      const messages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        select: { sender: true, content: true },
      });

      transcript = messages
        .map(m => `${m.sender}: ${m.content}`)
        .join('\n');
    }

    // Update session as completed
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        endedAt: new Date(),
        durationMinutes,
        transcript,
        aiSummary: options?.aiSummary,
      },
    });

    console.log(`[DB] ✅ Session completed: ${sessionId} (${durationMinutes} min)`);
    return true;

  } catch (error) {
    console.error('[DB] ❌ Failed to complete session:', error);
    return false;
  }
}

/**
 * Parse participant identity to extract role and user ID
 * Handles formats like: "coach-abc123", "client-xyz789", "user-123"
 */
export function parseParticipantIdentity(identity: string): {
  role: 'client' | 'coach' | 'ai';
  userId: string | undefined;
} {
  const lowerIdentity = identity.toLowerCase();

  // Check for coach prefix
  if (lowerIdentity.startsWith('coach-')) {
    return {
      role: 'coach',
      userId: identity.substring(6), // Remove "coach-" prefix
    };
  }

  // Check for client prefix
  if (lowerIdentity.startsWith('client-')) {
    return {
      role: 'client',
      userId: identity.substring(7), // Remove "client-" prefix
    };
  }

  // Check for user prefix (generic)
  if (lowerIdentity.startsWith('user-')) {
    return {
      role: 'client', // Default to client
      userId: identity.substring(5), // Remove "user-" prefix
    };
  }

  // Check for AI identity
  if (lowerIdentity.includes('ai') || lowerIdentity.includes('agent') || lowerIdentity.includes('assistant')) {
    return {
      role: 'ai',
      userId: undefined,
    };
  }

  // Default: treat as client with identity as potential user ID
  return {
    role: 'client',
    userId: identity.length > 5 ? identity : undefined, // Only use if looks like an ID
  };
}

/**
 * Get message count for a session (useful for debugging)
 */
export async function getSessionMessageCount(sessionId: string): Promise<number> {
  try {
    const count = await prisma.message.count({
      where: { sessionId },
    });
    return count;
  } catch {
    return 0;
  }
}

// ============================================
// Cleanup Functions
// ============================================

/**
 * Mark abandoned sessions as cancelled
 * Call this on agent startup to clean up from crashes
 */
export async function cleanupAbandonedSessions(roomId?: string): Promise<number> {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const where = roomId
      ? { roomId, status: 'active' }
      : { status: 'active', startedAt: { lt: twoHoursAgo } };

    const result = await prisma.session.updateMany({
      where,
      data: {
        status: 'cancelled',
        endedAt: new Date(),
      },
    });

    if (result.count > 0) {
      console.log(`[DB] 🧹 Cleaned up ${result.count} abandoned sessions`);
    }

    return result.count;

  } catch (error) {
    console.error('[DB] Failed to cleanup sessions:', error);
    return 0;
  }
}
