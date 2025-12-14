/**
 * AI Agent Worker Entry Point
 * 
 * IMPORTANT: Run with Node.js, NOT Bun
 * LiveKit agents have compatibility issues with Bun runtime.
 * 
 * Usage:
 *   npm run dev    # Development with tsx
 *   npm run build  # Build TypeScript
 *   npm run start  # Production with Node.js
 * 
 * Referenced from: docs/HYBRID-COACH-ARCHITECTURE.md
 */

import { cli, defineAgent, type JobContext, type WorkerOptions } from '@livekit/agents';
import 'dotenv/config';

import { validateEnvironment } from './config/deepgram.js';
import { CoachingAgent, createMinimalAgent } from './coaching-agent.js';

// =============================================================================
// Environment Validation
// =============================================================================

console.log('='.repeat(60));
console.log('🤖 Hybrid-Coach AI Agent');
console.log('='.repeat(60));

try {
  validateEnvironment();
} catch (error) {
  console.error(error);
  process.exit(1);
}

// =============================================================================
// Agent Definition
// =============================================================================

/**
 * LiveKit Agent entry point
 * Called when a new job (room) is assigned to this worker
 */
export default defineAgent({
  entry: async (ctx: JobContext) => {
    console.log('='.repeat(60));
    console.log(`🚀 [AI Agent] Joining room: ${ctx.room.name}`);
    console.log(`📋 [AI Agent] Job ID: ${ctx.job.id}`);
    console.log('='.repeat(60));

    // Connect to the room
    await ctx.connect();
    console.log('[AI Agent] ✅ Connected to room');

    // Log room participants
    const participants = ctx.room.remoteParticipants;
    console.log(`[AI Agent] 👥 Participants in room: ${participants.size}`);
    for (const [id, participant] of participants) {
      console.log(`[AI Agent]    - ${participant.name || id} (${participant.identity})`);
    }

    // Create and start the coaching agent
    let agent: CoachingAgent | null = null;
    
    try {
      agent = await createMinimalAgent(ctx);
      console.log('[AI Agent] ✅ Coaching agent started');

      // Listen for room events
      ctx.room.on('participantConnected', (participant) => {
        console.log(`[AI Agent] 👤 Participant joined: ${participant.name || participant.identity}`);
      });

      ctx.room.on('participantDisconnected', (participant) => {
        console.log(`[AI Agent] 👋 Participant left: ${participant.name || participant.identity}`);
      });

      ctx.room.on('disconnected', () => {
        console.log('[AI Agent] 📡 Room disconnected');
      });

      // Keep agent running until room is closed
      await waitForRoomClose(ctx);

    } catch (error) {
      console.error('[AI Agent] ❌ Agent error:', error);
      throw error;
    } finally {
      // Cleanup
      if (agent) {
        await agent.stop();
      }
      console.log('[AI Agent] 🧹 Agent cleanup complete');
    }
  },
});

/**
 * Wait for the room to be closed or disconnected
 */
async function waitForRoomClose(ctx: JobContext): Promise<void> {
  return new Promise((resolve) => {
    ctx.room.on('disconnected', () => {
      resolve();
    });

    // Also handle process signals for graceful shutdown
    const cleanup = () => {
      console.log('[AI Agent] 🛑 Received shutdown signal');
      resolve();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * Worker options configuration
 */
const workerOptions: WorkerOptions = {
  agent: import.meta.filename,
  workerType: 'room',  // One worker per room
  numIdleProcesses: 1, // Keep one warm process ready
};

// Start the agent worker
console.log('[AI Agent] 🏃 Starting worker...');
console.log(`[AI Agent] 🔗 LiveKit URL: ${process.env.LIVEKIT_URL}`);

cli.runApp(new cli.WorkerOptions(workerOptions));
