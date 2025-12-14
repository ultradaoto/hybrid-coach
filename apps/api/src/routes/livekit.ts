/**
 * LiveKit Routes
 * 
 * Handles token generation for LiveKit room connections.
 * Also manages AI agent spawning for rooms.
 */

import { AccessToken, TrackSource, VideoGrant } from 'livekit-server-sdk';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

// Track running AI agent processes
const activeAgents = new Map<string, { process: ChildProcess; startedAt: Date }>();

interface TokenRequest {
  roomName: string;
  participantName?: string;
  participantIdentity: string;
  role: 'client' | 'coach' | 'ai-agent';
  spawnAgent?: boolean; // If true, spawn AI agent for this room
}

interface CreateRoomRequest {
  roomName?: string;
  emptyTimeout?: number;
  spawnAgent?: boolean;
}

interface SpawnAgentRequest {
  roomName: string;
}

/**
 * Validate LiveKit configuration
 */
function validateConfig(): { valid: boolean; error?: string } {
  if (!LIVEKIT_API_KEY) {
    return { valid: false, error: 'LIVEKIT_API_KEY not configured' };
  }
  if (!LIVEKIT_API_SECRET) {
    return { valid: false, error: 'LIVEKIT_API_SECRET not configured' };
  }
  if (!LIVEKIT_URL) {
    return { valid: false, error: 'LIVEKIT_URL not configured' };
  }
  return { valid: true };
}

/**
 * Generate a LiveKit access token
 */
async function generateToken(request: TokenRequest): Promise<string> {
  const { roomName, participantName, participantIdentity, role } = request;

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName || participantIdentity,
    ttl: '2h', // Token valid for 2 hours
  });

  // Define permissions based on role
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };

  // Coaches get admin permissions
  if (role === 'coach') {
    grant.roomAdmin = true;
    grant.roomRecord = true;
  }

  // AI agent gets specific permissions
  if (role === 'ai-agent') {
    grant.canUpdateOwnMetadata = true;
    // AI can publish audio but not video
    grant.canPublishSources = [TrackSource.MICROPHONE];
  }

  token.addGrant(grant);

  return await token.toJwt();
}

/**
 * Spawn AI agent for a room (Node.js process)
 */
async function spawnAgentForRoom(roomName: string): Promise<{ success: boolean; error?: string }> {
  // Check if agent already running for this room
  if (activeAgents.has(roomName)) {
    console.log(`[LiveKit] AI Agent already running for room: ${roomName}`);
    return { success: true };
  }

  // Check if required env vars are present
  if (!process.env.DEEPGRAM_API_KEY) {
    console.warn('[LiveKit] DEEPGRAM_API_KEY not set - cannot spawn AI agent');
    return { success: false, error: 'DEEPGRAM_API_KEY not configured' };
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[LiveKit] OPENAI_API_KEY not set - cannot spawn AI agent');
    return { success: false, error: 'OPENAI_API_KEY not configured' };
  }

  try {
    // Path to AI agent - cwd is the monorepo root when running via bun run dev
    // Try multiple possible paths
    const cwd = process.cwd();
    let agentPath = join(cwd, 'services', 'ai-agent');
    
    // Log for debugging
    console.log(`[LiveKit] 🤖 Spawning AI Agent for room: ${roomName}`);
    console.log(`[LiveKit]    CWD: ${cwd}`);
    console.log(`[LiveKit]    Agent path: ${agentPath}`);

    // Verify the path exists
    const fs = await import('fs');
    if (!fs.existsSync(agentPath)) {
      // Try alternative path (if cwd is apps/api)
      agentPath = join(cwd, '..', '..', 'services', 'ai-agent');
      console.log(`[LiveKit]    Trying alternative path: ${agentPath}`);
      
      if (!fs.existsSync(agentPath)) {
        console.error(`[LiveKit] ❌ AI Agent path not found!`);
        return { success: false, error: 'AI Agent path not found' };
      }
    }

    console.log(`[LiveKit]    Spawning: npx tsx src/index.ts ${roomName}`);

    // Spawn the AI agent process using npx to run tsx
    const agentProcess = spawn('npx', ['tsx', 'src/index.ts', roomName], {
      cwd: agentPath,
      env: {
        ...process.env,
        LIVEKIT_ROOM: roomName,
        VERBOSE: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false,
    });

    // Log agent output
    agentProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        console.log(`[AI-Agent:${roomName.slice(0, 8)}] ${line}`);
      }
    });

    agentProcess.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        console.error(`[AI-Agent:${roomName.slice(0, 8)}] ❌ ${line}`);
      }
    });

    agentProcess.on('exit', (code) => {
      console.log(`[LiveKit] AI Agent for ${roomName.slice(0, 8)}... exited with code ${code}`);
      activeAgents.delete(roomName);
    });

    agentProcess.on('error', (err) => {
      console.error(`[LiveKit] ❌ AI Agent spawn error:`, err);
      activeAgents.delete(roomName);
    });

    agentProcess.on('spawn', () => {
      console.log(`[LiveKit] ✅ AI Agent process spawned successfully (PID: ${agentProcess.pid})`);
    });

    activeAgents.set(roomName, { process: agentProcess, startedAt: new Date() });
    console.log(`[LiveKit] AI Agent registered for room, waiting for startup...`);
    
    return { success: true };
  } catch (error) {
    console.error('[LiveKit] Failed to spawn AI agent:', error);
    return { success: false, error: 'Failed to spawn AI agent process' };
  }
}

/**
 * Stop AI agent for a room
 */
function stopAgentForRoom(roomName: string): boolean {
  const agent = activeAgents.get(roomName);
  if (agent) {
    console.log(`[LiveKit] Stopping AI Agent for room: ${roomName}`);
    agent.process.kill('SIGTERM');
    activeAgents.delete(roomName);
    return true;
  }
  return false;
}

/**
 * JSON response helper
 */
function jsonResponse(data: unknown, options?: { status?: number }): Response {
  return new Response(JSON.stringify(data), {
    status: options?.status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * LiveKit routes handler
 */
export async function livekitRoutes(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace('/api/livekit', '');

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // POST /api/livekit/token - Generate access token
  if (path === '/token' && req.method === 'POST') {
    try {
      const configCheck = validateConfig();
      if (!configCheck.valid) {
        return jsonResponse({ success: false, error: configCheck.error }, { status: 500 });
      }

      const body = await req.json() as Partial<TokenRequest>;

      if (!body.roomName || !body.participantIdentity) {
        return jsonResponse(
          { success: false, error: 'Missing roomName or participantIdentity' },
          { status: 400 }
        );
      }

      const role = body.role || 'client';
      if (!['client', 'coach', 'ai-agent'].includes(role)) {
        return jsonResponse(
          { success: false, error: 'Invalid role. Must be client, coach, or ai-agent' },
          { status: 400 }
        );
      }

      const token = await generateToken({
        roomName: body.roomName,
        participantName: body.participantName,
        participantIdentity: body.participantIdentity,
        role: role as TokenRequest['role'],
      });

      console.log(`[LiveKit] Token generated for ${role} ${body.participantIdentity} in room ${body.roomName}`);

      // Auto-spawn AI agent when a room is joined (coach OR client).
      // This ensures the coach doesn't see "AI Offline" when they are the first to join.
      let agentSpawnStatus = 'not_requested';
      if ((role === 'client' || role === 'coach') && body.spawnAgent !== false) {
        console.log(`[LiveKit] ${role} requested AI agent spawn for room: ${body.roomName}`);
        const spawnResult = await spawnAgentForRoom(body.roomName);
        if (spawnResult.success) {
          agentSpawnStatus = 'spawning';
        } else {
          agentSpawnStatus = 'failed';
          console.warn(`[LiveKit] ⚠️ Could not spawn AI agent: ${spawnResult.error}`);
        }
      }

      return jsonResponse({
        success: true,
        data: {
          token,
          url: LIVEKIT_URL,
          roomName: body.roomName,
          agentStatus: agentSpawnStatus,
        },
      });
    } catch (error) {
      console.error('[LiveKit] Token generation error:', error);
      return jsonResponse(
        { success: false, error: 'Failed to generate token' },
        { status: 500 }
      );
    }
  }

  // POST /api/livekit/spawn-agent - Manually spawn AI agent
  if (path === '/spawn-agent' && req.method === 'POST') {
    try {
      const configCheck = validateConfig();
      if (!configCheck.valid) {
        return jsonResponse({ success: false, error: configCheck.error }, { status: 500 });
      }

      const body = await req.json() as SpawnAgentRequest;

      if (!body.roomName) {
        return jsonResponse({ success: false, error: 'roomName required' }, { status: 400 });
      }

      const result = await spawnAgentForRoom(body.roomName);
      
      return jsonResponse({
        success: result.success,
        error: result.error,
        data: {
          roomName: body.roomName,
          status: result.success ? 'spawning' : 'failed',
        },
      });
    } catch (error) {
      console.error('[LiveKit] Spawn agent error:', error);
      return jsonResponse({ success: false, error: 'Failed to spawn agent' }, { status: 500 });
    }
  }

  // DELETE /api/livekit/agent/:roomName - Stop AI agent
  if (path.startsWith('/agent/') && req.method === 'DELETE') {
    const roomName = path.replace('/agent/', '');
    const stopped = stopAgentForRoom(roomName);
    
    return jsonResponse({
      success: true,
      data: {
        roomName,
        stopped,
      },
    });
  }

  // GET /api/livekit/agents - List running agents
  if (path === '/agents' && req.method === 'GET') {
    const agents = Array.from(activeAgents.entries()).map(([roomName, info]) => ({
      roomName,
      startedAt: info.startedAt.toISOString(),
      pid: info.process.pid,
    }));

    return jsonResponse({
      success: true,
      data: { agents },
    });
  }

  // POST /api/livekit/create-room - Create/validate room
  if (path === '/create-room' && req.method === 'POST') {
    try {
      const configCheck = validateConfig();
      if (!configCheck.valid) {
        return jsonResponse({ success: false, error: configCheck.error }, { status: 500 });
      }

      const body = await req.json() as CreateRoomRequest;

      // Generate a unique room name if not provided
      const roomName = body.roomName || `session-${crypto.randomUUID()}`;

      console.log(`[LiveKit] Room created/validated: ${roomName}`);

      // Spawn agent if requested
      if (body.spawnAgent) {
        await spawnAgentForRoom(roomName);
      }

      return jsonResponse({
        success: true,
        data: {
          roomName,
          livekitUrl: LIVEKIT_URL,
          agentStatus: activeAgents.has(roomName) ? 'running' : 'not_started',
        },
      });
    } catch (error) {
      console.error('[LiveKit] Create room error:', error);
      return jsonResponse(
        { success: false, error: 'Failed to create room' },
        { status: 500 }
      );
    }
  }

  // GET /api/livekit/health - Health check
  if (path === '/health' && req.method === 'GET') {
    const configCheck = validateConfig();
    return jsonResponse({
      success: true,
      data: {
        configured: configCheck.valid,
        url: LIVEKIT_URL ? 'configured' : 'missing',
        deepgramKey: process.env.DEEPGRAM_API_KEY ? 'configured' : 'missing',
        openaiKey: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        activeAgents: activeAgents.size,
      },
    });
  }

  return jsonResponse({ success: false, error: 'Not found' }, { status: 404 });
}

// Cleanup agents on process exit
process.on('SIGINT', () => {
  console.log('[LiveKit] Cleaning up AI agents...');
  for (const [roomName] of activeAgents) {
    stopAgentForRoom(roomName);
  }
});

process.on('SIGTERM', () => {
  console.log('[LiveKit] Cleaning up AI agents...');
  for (const [roomName] of activeAgents) {
    stopAgentForRoom(roomName);
  }
});

export default livekitRoutes;
