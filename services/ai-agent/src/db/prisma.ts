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

    // We need at least a userId (appointmentId is now optional for ad-hoc sessions)
    if (!clientUserId) {
      console.log(`[DB] Cannot create session without userId`);
      return null;
    }

    // Determine session type
    const sessionType = appointmentId ? 'scheduled' : 'adhoc';

    // Create session data - use connectOrCreate to auto-create users if they don't exist
    const sessionData: any = {
      roomId: params.roomId,
      status: 'active',
      startedAt: new Date(),
      durationMinutes: 30, // Expected duration, will be updated on completion
      warningsSent: 0,
      sessionType,
      user: {
        connectOrCreate: {
          where: { id: clientUserId },
          create: {
            id: clientUserId,
            email: `auto-${clientUserId}@myultra.coach`,
            role: 'client',
            displayName: `Client ${clientUserId.slice(0, 8)}`,
          }
        }
      }
    };

    // Add appointment relation if available (for scheduled sessions)
    if (appointmentId) {
      sessionData.appointment = {
        connect: { id: appointmentId }
      };
    }

    const session = await prisma.session.create({
      data: sessionData,
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
    // Get session to find userId if not provided
    let userId = params.userId;
    if (!userId) {
      const session = await prisma.session.findUnique({
        where: { id: params.sessionId },
        select: { userId: true }
      });
      
      if (!session) {
        console.warn(`[DB] Session not found: ${params.sessionId}`);
        return false;
      }
      
      userId = session.userId;
    }
    
    // Message model has NO user relation - just use direct userId field
    await prisma.message.create({
      data: {
        sessionId: params.sessionId,
        sender: params.sender,
        content: params.content,
        userId: userId || null,  // Direct field assignment
      },
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
    generateSummary?: boolean;
    aiSummary?: string;
  }
): Promise<boolean> {
  try {
    console.log(`[DB] 📊 Starting session completion for: ${sessionId}`);
    console.log(`[DB] Options: transcript=${options?.generateTranscript}, summary=${options?.generateSummary}`);
    
    // Get session start time for duration calculation
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { startedAt: true, roomId: true, userId: true },
    });

    if (!session) {
      console.warn(`[DB] ⚠️ Session not found: ${sessionId}`);
      return false;
    }

    console.log(`[DB] ✅ Found session for user: ${session.userId}`);

    // Calculate actual duration
    const durationMs = Date.now() - session.startedAt.getTime();
    const durationMinutes = Math.round(durationMs / 60000);
    console.log(`[DB] ⏱️ Session duration: ${durationMinutes} minutes`);

    // Generate clean transcript from messages (NO timestamps to save tokens)
    let transcript: string | undefined;
    if (options?.generateTranscript) {
      console.log(`[DB] 📝 Fetching messages for transcript...`);
      const messages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        select: { sender: true, content: true },
      });

      console.log(`[DB] 💬 Found ${messages.length} messages`);

      // Format: "AI: Hello\nClient: Hi there\n"
      transcript = messages
        .map(m => {
          const speaker = m.sender === 'ai' ? 'AI' : 
                         m.sender === 'coach' ? 'Coach' : 'Client';
          return `${speaker}: ${m.content}`;
        })
        .join('\n');
      
      console.log(`[DB] 📄 Generated transcript: ${transcript.length} characters`);
    }

    // Update session as completed
    console.log(`[DB] 💾 Updating session status to completed...`);
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

    // Generate AI summary (AWAIT to ensure it completes before process exits)
    if (options?.generateSummary && transcript) {
      console.log(`[DB] 🤖 Generating AI summary (waiting for completion)...`);
      
      try {
        // Import dynamically to avoid circular dependencies
        const { generateSessionSummary } = await import('../services/summary-generator.js');
        
        // AWAIT the summary generation - process must wait for OpenAI to respond
        await generateSessionSummary(sessionId, session.userId, transcript);
        
        console.log(`[DB] ✅ AI summary generation completed`);
      } catch (err) {
        console.error('[DB] ❌ Failed to generate summary:', err);
      }
    } else {
      if (!options?.generateSummary) {
        console.log(`[DB] ⏭️ Summary generation not requested`);
      } else if (!transcript) {
        console.log(`[DB] ⏭️ No transcript available for summary generation`);
      }
    }

    return true;

  } catch (error) {
    console.error('[DB] ❌ Failed to complete session:', error);
    console.error('[DB] Error details:', error instanceof Error ? error.stack : error);
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
