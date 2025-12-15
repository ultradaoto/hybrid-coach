/**
 * AI Agent Worker Entry Point
 * 
 * IMPORTANT: Run with Node.js, NOT Bun
 * LiveKit agents have compatibility issues with Bun runtime.
 * 
 * Architecture:
 * - Native LiveKit room participant
 * - Dual Deepgram WebSocket connections
 *   1. Voice Agent: STT + LLM + TTS for AI responses
 *   2. Transcription: Always-on logging for coach review
 * - Audio gating for coach mute functionality
 * - KeepAlive pattern during silence/mute periods
 * 
 * Usage:
 *   npm run dev              # Development with tsx
 *   npm run dev -- room-name # Join specific room
 *   npm run build            # Build TypeScript
 *   npm run start            # Production with Node.js
 * 
 * References:
 * - docs/HYBRID-COACH-ARCHITECTURE.md
 * - docs/DEEPGRAM-INTEGRATION.md
 * - docs/AI-AGENT-INNER-WORKINGS.md
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from monorepo root (2 directories up from services/ai-agent/src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

import { createLiveKitAgent, type LiveKitAgent } from './livekit-agent.js';
import { cleanupAbandonedSessions } from './db/index.js';

// =============================================================================
// Banner
// =============================================================================

console.log('='.repeat(60));
console.log('🤖 Hybrid-Coach AI Agent - LiveKit Native Mode');
console.log('   Version: 2.0.0');
console.log('='.repeat(60));

// =============================================================================
// Environment Validation
// =============================================================================

function validateEnvironment(): void {
  const required = [
    'DEEPGRAM_API_KEY',
    'OPENAI_API_KEY',
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(`[AI Agent] ❌ Missing required environment variables:`);
    for (const key of missing) {
      console.error(`   - ${key}`);
    }
    process.exit(1);
  }

  console.log('[AI Agent] ✅ Environment validated');
  console.log(`   LiveKit URL: ${process.env.LIVEKIT_URL}`);
}

// =============================================================================
// Configuration
// =============================================================================

interface AgentConfig {
  roomName: string;
  coachingPrompt?: string;
  greeting?: string;
  voiceModel?: string;
  llmModel?: string;
  verbose?: boolean;
}

// =============================================================================
// CLI Interface
// =============================================================================

function parseArgs(): AgentConfig {
  const args = process.argv.slice(2);

  // Default room name for development
  let roomName = process.env.LIVEKIT_ROOM || 'test-room';
  let verbose = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // First non-flag argument is the room name
    if (!arg.startsWith('--') && !arg.startsWith('-')) {
      roomName = arg;
      continue;
    }

    if (arg === '--room' && args[i + 1]) {
      roomName = args[i + 1];
      i++;
    }

    if (arg === '--quiet' || arg === '-q') {
      verbose = false;
    }

    if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node dist/index.js [room-name] [options]

Arguments:
  room-name           LiveKit room name to join (default: test-room)

Options:
  --room <name>       LiveKit room name to join
  -q, --quiet         Reduce logging verbosity
  -h, --help          Show this help message

Environment Variables:
  DEEPGRAM_API_KEY     Deepgram API key (required)
  LIVEKIT_URL          LiveKit server URL (required)
  LIVEKIT_API_KEY      LiveKit API key (required)
  LIVEKIT_API_SECRET   LiveKit API secret (required)
  OPENAI_API_KEY       OpenAI API key (required)
  LIVEKIT_ROOM         Default room name
  COACHING_PROMPT      Custom coaching system prompt
  AI_GREETING          Custom greeting message
  TTS_VOICE_MODEL      Deepgram voice model (default: aura-asteria-en)
  LLM_MODEL            OpenAI model (default: gpt-4o-mini)
  VERBOSE              Enable verbose logging (true/false)

Examples:
  npm run dev                          # Join default test-room
  npm run dev my-coaching-session      # Join specific room
  npm run dev -- --room session-123    # Alternative room syntax
  node dist/index.js production-room   # Production mode
      `);
      process.exit(0);
    }
  }

  return {
    roomName,
    coachingPrompt: process.env.COACHING_PROMPT,
    greeting: process.env.AI_GREETING || "Hello! I'm your Ultra Coach. How are you feeling today?",
    voiceModel: process.env.TTS_VOICE_MODEL || 'aura-asteria-en',
    llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
    verbose: verbose && process.env.VERBOSE !== 'false',
  };
}

// =============================================================================
// Agent Runner
// =============================================================================

let agent: LiveKitAgent | null = null;

async function runAgent(config: AgentConfig): Promise<void> {
  console.log(`[Agent] 🚀 Starting agent for room: ${config.roomName}`);

  // Create the LiveKit agent
  agent = createLiveKitAgent(config.roomName, {
    coachingPrompt: config.coachingPrompt,
    greeting: config.greeting,
    voiceModel: config.voiceModel,
    llmModel: config.llmModel,
    verbose: config.verbose,
  });

  // Set up event handlers
  agent.on('connected', () => {
    console.log('[Agent] ✅ Connected to room');
  });

  agent.on('disconnected', () => {
    console.log('[Agent] 📴 Disconnected from room');
  });

  agent.on('participant-joined', ({ identity, role }) => {
    console.log(`[Agent] 👤 ${role} joined: ${identity}`);
  });

  agent.on('participant-left', ({ identity }) => {
    console.log(`[Agent] 👋 Participant left: ${identity}`);
  });

  agent.on('speaking', (isSpeaking: boolean) => {
    if (isSpeaking) {
      console.log('[Agent] 🔊 AI is speaking...');
    } else {
      console.log('[Agent] 🔇 AI finished speaking');
    }
  });

  agent.on('mute-changed', ({ identity, muted }) => {
    console.log(`[Agent] 🔇 ${identity} ${muted ? 'muted from' : 'unmuted for'} AI`);
  });

  agent.on('whisper-received', ({ text }) => {
    console.log(`[Agent] 💬 Coach whisper received: ${text.slice(0, 50)}...`);
  });

  agent.on('error', (error: Error) => {
    console.error('[Agent] ❌ Error:', error.message);
  });

  // Connect to the room
  await agent.connect();

  console.log('[Agent] 🏃 Agent running. Press Ctrl+C to stop.');

  // Log status periodically and check for stale disconnections
  let disconnectedSince: number | null = null;
  const statusInterval = setInterval(() => {
    const status = agent?.getStatus();
    if (status && config.verbose) {
      console.log(`[Agent] 📊 Status: Room=${status.room.connected}, Deepgram=${status.deepgram.connected}, Participants=${status.room.participantCount}`);
    }
    
    // Failsafe: If disconnected from LiveKit for >5 minutes, exit
    if (status && !status.room.connected) {
      if (disconnectedSince === null) {
        disconnectedSince = Date.now();
        console.log('[Agent] ⚠️ Detected disconnection from LiveKit room');
      } else {
        const disconnectedMs = Date.now() - disconnectedSince;
        const disconnectedMinutes = Math.floor(disconnectedMs / 60000);
        
        if (disconnectedMs > 5 * 60 * 1000) {
          console.log('[Agent] 🛑 Disconnected for >5 minutes. Self-terminating...');
          clearInterval(statusInterval);
          process.exit(0);
        } else if (disconnectedMinutes > 0 && disconnectedMs % 60000 < 30000) {
          // Log every minute
          console.log(`[Agent] ⏳ Still disconnected (${disconnectedMinutes} minutes)`);
        }
      }
    } else {
      // Reset disconnect tracking when reconnected
      if (disconnectedSince !== null) {
        console.log('[Agent] ✅ Reconnected to LiveKit room');
      }
      disconnectedSince = null;
    }
  }, 30000);

  // Handle shutdown
  const cleanup = async () => {
    console.log('[Agent] 🛑 Shutdown signal received');
    clearInterval(statusInterval);
    if (agent) {
      await agent.disconnect();
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  try {
    // Validate environment
    validateEnvironment();

    // Clean up any abandoned sessions from previous crashes
    console.log('[Startup] Checking for abandoned sessions...');
    const cleaned = await cleanupAbandonedSessions();
    if (cleaned > 0) {
      console.log(`[Startup] Cleaned up ${cleaned} abandoned sessions`);
    }

    // Parse CLI arguments
    const config = parseArgs();

    // Run the agent
    await runAgent(config);

    // Keep process running
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
