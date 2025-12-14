/**
 * AI Agent Worker Entry Point
 * 
 * IMPORTANT: Run with Node.js, NOT Bun
 * LiveKit agents have compatibility issues with Bun runtime.
 * 
 * Architecture:
 * - Dual Deepgram WebSocket connections
 *   1. Voice Agent: STT + LLM + TTS for AI responses
 *   2. Transcription: Always-on logging for coach review
 * - Audio gating for coach mute functionality
 * - KeepAlive pattern during silence/mute periods
 * 
 * Usage:
 *   npm run dev    # Development with tsx
 *   npm run build  # Build TypeScript
 *   npm run start  # Production with Node.js
 * 
 * References:
 * - docs/HYBRID-COACH-ARCHITECTURE.md
 * - docs/DEEPGRAM-INTEGRATION.md
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from monorepo root (2 directories up from services/ai-agent/src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

import { Room, RoomEvent, RemoteParticipant, LocalParticipant } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';

import { validateEnvironment, getLiveKitConfig } from './config/deepgram.js';
import { CoachingAgent, createCoachingAgent } from './coaching-agent.js';

// =============================================================================
// Environment Validation
// =============================================================================

console.log('='.repeat(60));
console.log('🤖 Hybrid-Coach AI Agent - Dual Connection Architecture');
console.log('='.repeat(60));

let envConfig;
try {
  envConfig = validateEnvironment();
} catch (error) {
  console.error(error);
  process.exit(1);
}

// =============================================================================
// Configuration
// =============================================================================

const AGENT_IDENTITY = 'ai-coach-agent';
const AGENT_NAME = 'AI Wellness Coach';

interface AgentConfig {
  roomName: string;
  coachingPrompt?: string;
  greeting?: string;
  voiceModel?: string;
  verbose?: boolean;
}

// =============================================================================
// Agent Runner
// =============================================================================

/**
 * Run the AI agent in a LiveKit room
 */
async function runAgent(config: AgentConfig): Promise<void> {
  const { roomName } = config;
  
  console.log(`[Agent] 🚀 Starting agent for room: ${roomName}`);

  // Create LiveKit access token
  const livekitConfig = getLiveKitConfig();
  const token = new AccessToken(livekitConfig.apiKey, livekitConfig.apiSecret, {
    identity: AGENT_IDENTITY,
    name: AGENT_NAME,
    ttl: 3600 * 4, // 4 hours
  });
  
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const accessToken = await token.toJwt();

  // Create and connect to room
  const room = new Room();
  
  console.log(`[Agent] 🔌 Connecting to room: ${roomName}`);
  console.log(`[Agent] 🔗 LiveKit URL: ${livekitConfig.url}`);

  try {
    await room.connect(livekitConfig.url, accessToken, {
      autoSubscribe: true,
    });

    console.log(`[Agent] ✅ Connected to room: ${room.name}`);
    console.log(`[Agent] 📍 Local participant: ${room.localParticipant?.identity}`);

    // Log existing participants
    const participants = room.remoteParticipants;
    console.log(`[Agent] 👥 Participants in room: ${participants.size}`);
    for (const [id, participant] of participants) {
      console.log(`[Agent]    - ${participant.name || id} (${participant.identity})`);
    }

    // Create coaching agent
    const agent = createCoachingAgent({
      coachingPrompt: config.coachingPrompt,
      greeting: config.greeting,
      voiceModel: config.voiceModel,
      verbose: config.verbose ?? true,
    });

    // Set up agent event handlers
    setupAgentEvents(agent);

    // Start the agent
    await agent.start(room);

    // Set up room event handlers
    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`[Agent] 👤 Participant joined: ${participant.name || participant.identity}`);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log(`[Agent] 👋 Participant left: ${participant.name || participant.identity}`);
    });

    room.on(RoomEvent.Disconnected, async () => {
      console.log('[Agent] 📡 Room disconnected');
      await agent.stop();
    });

    // Handle shutdown signals
    const cleanup = async () => {
      console.log('[Agent] 🛑 Shutdown signal received');
      await agent.stop();
      await room.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep process running
    console.log('[Agent] 🏃 Agent running. Press Ctrl+C to stop.');

  } catch (error) {
    console.error('[Agent] ❌ Failed to connect:', error);
    throw error;
  }
}

/**
 * Set up coaching agent event handlers
 */
function setupAgentEvents(agent: CoachingAgent): void {
  agent.on('started', () => {
    console.log('[Agent] ✅ Coaching agent started');
  });

  agent.on('stopped', () => {
    console.log('[Agent] 🛑 Coaching agent stopped');
  });

  agent.on('transcript', (transcript) => {
    // Transcripts are already logged by the agent
  });

  agent.on('agent-speaking', () => {
    console.log('[Agent] 🔊 AI is speaking...');
  });

  agent.on('agent-done-speaking', () => {
    console.log('[Agent] 🔇 AI finished speaking');
  });

  agent.on('gate-event', (event) => {
    console.log(`[Agent] 🚪 Gate event: ${event.action} for ${event.participantId}`);
  });

  agent.on('error', (error) => {
    console.error('[Agent] ❌ Error:', error);
  });
}

// =============================================================================
// CLI Interface
// =============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(): AgentConfig {
  const args = process.argv.slice(2);
  
  // Default room name for development
  let roomName = process.env.LIVEKIT_ROOM || 'test-room';
  let verbose = true;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--room' && args[i + 1]) {
      roomName = args[i + 1];
      i++;
    }
    
    if (arg === '--quiet') {
      verbose = false;
    }
    
    if (arg === '--help') {
      console.log(`
Usage: node dist/index.js [options]

Options:
  --room <name>   LiveKit room name to join (default: test-room)
  --quiet         Reduce logging verbosity
  --help          Show this help message

Environment Variables:
  DEEPGRAM_API_KEY     Deepgram API key (required)
  LIVEKIT_URL          LiveKit server URL (required)
  LIVEKIT_API_KEY      LiveKit API key (required)
  LIVEKIT_API_SECRET   LiveKit API secret (required)
  OPENAI_API_KEY       OpenAI API key (required)
  LIVEKIT_ROOM         Default room name

Examples:
  npm run dev -- --room my-coaching-session
  node dist/index.js --room production-session-123
      `);
      process.exit(0);
    }
  }
  
  return {
    roomName,
    verbose,
  };
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  try {
    const config = parseArgs();
    await runAgent(config);
    
    // Keep process running (agent handles its own lifecycle)
    await new Promise(() => {}); // Never resolves
    
  } catch (error) {
    console.error('[Agent] ❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run
main();

// =============================================================================
// Exports for Testing
// =============================================================================

export { runAgent, AgentConfig };
