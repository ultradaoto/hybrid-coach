# AI Agent Spawn & Lifecycle Management Guide

## Purpose

This document covers the complete lifecycle of AI Agent processes, including:

1. **Spawn verification** - Ensuring agents start correctly
2. **Garbage collection** - Cleaning up stale rooms and orphaned agents
3. **Grace period handling** - 60-second wait when participants leave
4. **Room lifecycle management** - Proper creation, monitoring, and teardown
5. **Best practices** - Optimal patterns for production deployment

---

## 1. Current Architecture Assessment

### 1.1 How Agents Are Currently Spawned

When a client requests a token, the API spawns an AI agent:

```typescript
// apps/api/src/routes/livekit.ts (current implementation)
livekit.post('/token', async (c) => {
  // ... generate token ...
  
  // Spawn AI agent for this room
  spawnAIAgent(roomName);
  
  return c.json({ success: true, data: { token, url } });
});
```

### 1.2 Current Limitations

| Issue | Impact |
|-------|--------|
| No duplicate check | Multiple agents could spawn for same room |
| No lifecycle tracking | Agents run forever even if room is empty |
| No grace period | Agent dies immediately when spawned, or never |
| No health monitoring | Crashed agents aren't detected |
| No cleanup | Orphaned processes accumulate |

---

## 2. Recommended Architecture

### 2.1 Agent Manager Service

Create a centralized Agent Manager that handles all lifecycle concerns:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT MANAGER                                      │
│                                                                              │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │  Room Registry  │   │ Process Manager │   │ Health Monitor  │          │
│   │                 │   │                 │   │                 │          │
│   │ • Active rooms  │   │ • Spawn process │   │ • Heartbeat     │          │
│   │ • Participant   │   │ • Kill process  │   │ • Restart dead  │          │
│   │   counts        │   │ • Track PIDs    │   │ • Log errors    │          │
│   │ • Last activity │   │ • IPC messages  │   │ • Metrics       │          │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘          │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                    Garbage Collector                         │          │
│   │                                                              │          │
│   │ • Runs every 30 seconds                                      │          │
│   │ • Checks for empty rooms past grace period                   │          │
│   │ • Kills orphaned agent processes                             │          │
│   │ • Cleans up room registry entries                            │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Room Lifecycle States

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  EMPTY   │────►│ STARTING │────►│  ACTIVE  │────►│  GRACE   │────►│ CLOSING  │
│          │     │          │     │          │     │  PERIOD  │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                                  │               │                │
     │                                  │               │                │
     │              Participant         │  All humans   │  Grace period  │
     │              joins               │  leave        │  expires       │
     │                                  │               │                │
     │                                  ▼               │                │
     │                           ┌──────────┐          │                │
     │                           │ Participant         │                │
     │                           │ rejoins  ├──────────┘                │
     │                           └──────────┘                           │
     │                                                                  │
     └──────────────────────────────────────────────────────────────────┘
                              Room deleted after close
```

---

## 3. Implementation: Agent Manager

### 3.1 Core Types

**File: `apps/api/src/services/agent-manager/types.ts`**

```typescript
export type RoomState = 'empty' | 'starting' | 'active' | 'grace_period' | 'closing';

export interface RoomInfo {
  roomName: string;
  state: RoomState;
  createdAt: Date;
  lastActivity: Date;
  
  // Participants
  participants: Map<string, ParticipantInfo>;
  humanCount: number;  // Excludes AI agent
  
  // Agent process
  agentPid: number | null;
  agentIdentity: string | null;
  agentStartedAt: Date | null;
  agentLastHeartbeat: Date | null;
  
  // Grace period
  graceStartedAt: Date | null;
  graceDurationMs: number;
}

export interface ParticipantInfo {
  identity: string;
  name: string;
  role: 'client' | 'coach' | 'ai-agent';
  joinedAt: Date;
  lastSeen: Date;
}

export interface AgentManagerConfig {
  gracePeriodMs: number;          // Default: 60000 (60 seconds)
  gcIntervalMs: number;           // Default: 30000 (30 seconds)
  healthCheckIntervalMs: number;  // Default: 10000 (10 seconds)
  maxAgentsPerRoom: number;       // Default: 1
  maxTotalAgents: number;         // Default: 50
  agentStartupTimeoutMs: number;  // Default: 30000 (30 seconds)
}

export interface SpawnResult {
  success: boolean;
  pid?: number;
  identity?: string;
  error?: string;
}
```

### 3.2 Agent Manager Implementation

**File: `apps/api/src/services/agent-manager/index.ts`**

```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import {
  RoomInfo,
  RoomState,
  ParticipantInfo,
  AgentManagerConfig,
  SpawnResult,
} from './types';

const DEFAULT_CONFIG: AgentManagerConfig = {
  gracePeriodMs: 60 * 1000,        // 60 seconds
  gcIntervalMs: 30 * 1000,         // 30 seconds
  healthCheckIntervalMs: 10 * 1000, // 10 seconds
  maxAgentsPerRoom: 1,
  maxTotalAgents: 50,
  agentStartupTimeoutMs: 30 * 1000, // 30 seconds
};

export class AgentManager extends EventEmitter {
  private rooms: Map<string, RoomInfo> = new Map();
  private processes: Map<number, ChildProcess> = new Map();
  private config: AgentManagerConfig;
  private gcInterval: NodeJS.Timeout | null = null;
  private healthInterval: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<AgentManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  start(): void {
    console.log('[AgentManager] Starting...');
    
    // Start garbage collector
    this.gcInterval = setInterval(() => {
      this.runGarbageCollection();
    }, this.config.gcIntervalMs);
    
    // Start health monitor
    this.healthInterval = setInterval(() => {
      this.runHealthCheck();
    }, this.config.healthCheckIntervalMs);
    
    console.log('[AgentManager] Started');
    console.log(`  Grace period: ${this.config.gracePeriodMs / 1000}s`);
    console.log(`  GC interval: ${this.config.gcIntervalMs / 1000}s`);
    console.log(`  Max agents: ${this.config.maxTotalAgents}`);
  }
  
  stop(): void {
    console.log('[AgentManager] Stopping...');
    
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
    
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    
    // Kill all agent processes
    for (const [pid, process] of this.processes) {
      console.log(`[AgentManager] Killing agent process ${pid}`);
      process.kill('SIGTERM');
    }
    
    this.rooms.clear();
    this.processes.clear();
    
    console.log('[AgentManager] Stopped');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  
  getOrCreateRoom(roomName: string): RoomInfo {
    let room = this.rooms.get(roomName);
    
    if (!room) {
      room = {
        roomName,
        state: 'empty',
        createdAt: new Date(),
        lastActivity: new Date(),
        participants: new Map(),
        humanCount: 0,
        agentPid: null,
        agentIdentity: null,
        agentStartedAt: null,
        agentLastHeartbeat: null,
        graceStartedAt: null,
        graceDurationMs: this.config.gracePeriodMs,
      };
      this.rooms.set(roomName, room);
      console.log(`[AgentManager] Created room: ${roomName}`);
    }
    
    return room;
  }
  
  getRoom(roomName: string): RoomInfo | undefined {
    return this.rooms.get(roomName);
  }
  
  getAllRooms(): RoomInfo[] {
    return Array.from(this.rooms.values());
  }
  
  getActiveRooms(): RoomInfo[] {
    return this.getAllRooms().filter(r => r.state === 'active');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PARTICIPANT TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  
  participantJoined(roomName: string, identity: string, name: string, role: 'client' | 'coach' | 'ai-agent'): void {
    const room = this.getOrCreateRoom(roomName);
    
    // Don't double-count
    if (room.participants.has(identity)) {
      console.log(`[AgentManager] Participant ${identity} already in room ${roomName}`);
      return;
    }
    
    const participant: ParticipantInfo = {
      identity,
      name,
      role,
      joinedAt: new Date(),
      lastSeen: new Date(),
    };
    
    room.participants.set(identity, participant);
    room.lastActivity = new Date();
    
    // Update human count (exclude AI)
    if (role !== 'ai-agent') {
      room.humanCount++;
    }
    
    console.log(`[AgentManager] Participant joined: ${identity} (${role}) in ${roomName}`);
    console.log(`[AgentManager] Room ${roomName}: ${room.humanCount} humans, ${room.participants.size} total`);
    
    // Cancel grace period if someone rejoins
    if (room.state === 'grace_period' && role !== 'ai-agent') {
      console.log(`[AgentManager] Cancelling grace period for ${roomName} - participant rejoined`);
      room.state = 'active';
      room.graceStartedAt = null;
    }
    
    // Update state to active if we have humans
    if (room.humanCount > 0 && room.state !== 'active') {
      room.state = 'active';
    }
    
    this.emit('participantJoined', { roomName, participant });
  }
  
  participantLeft(roomName: string, identity: string): void {
    const room = this.rooms.get(roomName);
    if (!room) return;
    
    const participant = room.participants.get(identity);
    if (!participant) return;
    
    room.participants.delete(identity);
    room.lastActivity = new Date();
    
    // Update human count
    if (participant.role !== 'ai-agent') {
      room.humanCount = Math.max(0, room.humanCount - 1);
    }
    
    console.log(`[AgentManager] Participant left: ${identity} from ${roomName}`);
    console.log(`[AgentManager] Room ${roomName}: ${room.humanCount} humans, ${room.participants.size} total`);
    
    // Start grace period if all humans left
    if (room.humanCount === 0 && room.state === 'active') {
      console.log(`[AgentManager] All humans left ${roomName}, starting ${this.config.gracePeriodMs / 1000}s grace period`);
      room.state = 'grace_period';
      room.graceStartedAt = new Date();
    }
    
    this.emit('participantLeft', { roomName, identity });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT SPAWNING
  // ═══════════════════════════════════════════════════════════════════════════
  
  async spawnAgentForRoom(roomName: string): Promise<SpawnResult> {
    const room = this.getOrCreateRoom(roomName);
    
    // Check if agent already exists for this room
    if (room.agentPid !== null) {
      console.log(`[AgentManager] Agent already running for ${roomName} (PID: ${room.agentPid})`);
      return {
        success: true,
        pid: room.agentPid,
        identity: room.agentIdentity || undefined,
      };
    }
    
    // Check total agent limit
    if (this.processes.size >= this.config.maxTotalAgents) {
      console.error(`[AgentManager] Max agents (${this.config.maxTotalAgents}) reached, cannot spawn for ${roomName}`);
      return {
        success: false,
        error: 'Max agent limit reached',
      };
    }
    
    // Spawn agent process
    const agentIdentity = `ai-coach-${Date.now()}`;
    const agentPath = path.resolve(process.cwd(), '../services/ai-agent');
    
    console.log(`[AgentManager] Spawning agent for ${roomName}...`);
    console.log(`[AgentManager] Agent path: ${agentPath}`);
    console.log(`[AgentManager] Agent identity: ${agentIdentity}`);
    
    room.state = 'starting';
    
    try {
      const childProcess = spawn('node', ['dist/index.js', roomName], {
        cwd: agentPath,
        env: {
          ...process.env,
          ROOM_NAME: roomName,
          AGENT_IDENTITY: agentIdentity,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      
      const pid = childProcess.pid!;
      
      // Track the process
      this.processes.set(pid, childProcess);
      room.agentPid = pid;
      room.agentIdentity = agentIdentity;
      room.agentStartedAt = new Date();
      
      // Handle stdout
      childProcess.stdout?.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          console.log(`[AI-Agent:${roomName}] ${line}`);
        }
      });
      
      // Handle stderr
      childProcess.stderr?.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          console.error(`[AI-Agent:${roomName}:ERROR] ${line}`);
        }
      });
      
      // Handle process exit
      childProcess.on('exit', (code, signal) => {
        console.log(`[AgentManager] Agent for ${roomName} exited (code: ${code}, signal: ${signal})`);
        this.handleAgentExit(roomName, pid, code, signal);
      });
      
      // Handle errors
      childProcess.on('error', (err) => {
        console.error(`[AgentManager] Agent spawn error for ${roomName}:`, err);
        this.handleAgentExit(roomName, pid, 1, null);
      });
      
      console.log(`[AgentManager] Agent spawned for ${roomName} (PID: ${pid})`);
      
      // Wait for agent to start (it should join as participant)
      // The state will transition to 'active' when we receive participantJoined for the AI
      
      return {
        success: true,
        pid,
        identity: agentIdentity,
      };
      
    } catch (error) {
      console.error(`[AgentManager] Failed to spawn agent for ${roomName}:`, error);
      room.state = 'empty';
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
  
  private handleAgentExit(roomName: string, pid: number, code: number | null, signal: string | null): void {
    // Remove from process map
    this.processes.delete(pid);
    
    // Update room info
    const room = this.rooms.get(roomName);
    if (room && room.agentPid === pid) {
      room.agentPid = null;
      room.agentIdentity = null;
      room.agentStartedAt = null;
      
      // Remove AI from participants
      for (const [identity, participant] of room.participants) {
        if (participant.role === 'ai-agent') {
          room.participants.delete(identity);
        }
      }
      
      // If there are still humans, try to restart the agent
      if (room.humanCount > 0 && code !== 0) {
        console.log(`[AgentManager] Agent crashed with humans in room, restarting...`);
        setTimeout(() => {
          this.spawnAgentForRoom(roomName);
        }, 2000); // Wait 2 seconds before restart
      }
    }
    
    this.emit('agentExited', { roomName, pid, code, signal });
  }
  
  killAgent(roomName: string): boolean {
    const room = this.rooms.get(roomName);
    if (!room || room.agentPid === null) {
      return false;
    }
    
    const process = this.processes.get(room.agentPid);
    if (process) {
      console.log(`[AgentManager] Killing agent for ${roomName} (PID: ${room.agentPid})`);
      process.kill('SIGTERM');
      return true;
    }
    
    return false;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GARBAGE COLLECTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  runGarbageCollection(): void {
    const now = new Date();
    const roomsToClose: string[] = [];
    
    console.log(`[AgentManager:GC] Running garbage collection...`);
    
    for (const [roomName, room] of this.rooms) {
      // Check grace period expiration
      if (room.state === 'grace_period' && room.graceStartedAt) {
        const elapsed = now.getTime() - room.graceStartedAt.getTime();
        const remaining = room.graceDurationMs - elapsed;
        
        if (remaining <= 0) {
          console.log(`[AgentManager:GC] Grace period expired for ${roomName}`);
          roomsToClose.push(roomName);
        } else {
          console.log(`[AgentManager:GC] Room ${roomName} in grace period: ${Math.ceil(remaining / 1000)}s remaining`);
        }
      }
      
      // Check for stale empty rooms (no activity for 5 minutes)
      if (room.state === 'empty') {
        const inactiveMs = now.getTime() - room.lastActivity.getTime();
        if (inactiveMs > 5 * 60 * 1000) {
          console.log(`[AgentManager:GC] Stale empty room: ${roomName}`);
          roomsToClose.push(roomName);
        }
      }
      
      // Check for orphaned rooms (has agent but no humans for too long)
      if (room.agentPid !== null && room.humanCount === 0 && room.state !== 'grace_period') {
        console.log(`[AgentManager:GC] Orphaned agent in room: ${roomName}`);
        roomsToClose.push(roomName);
      }
    }
    
    // Close rooms
    for (const roomName of roomsToClose) {
      this.closeRoom(roomName);
    }
    
    // Check for orphaned processes (processes not tracked by any room)
    for (const [pid, process] of this.processes) {
      let isTracked = false;
      for (const room of this.rooms.values()) {
        if (room.agentPid === pid) {
          isTracked = true;
          break;
        }
      }
      
      if (!isTracked) {
        console.log(`[AgentManager:GC] Orphaned process found: PID ${pid}`);
        process.kill('SIGTERM');
        this.processes.delete(pid);
      }
    }
    
    console.log(`[AgentManager:GC] Complete. Active rooms: ${this.rooms.size}, Active agents: ${this.processes.size}`);
  }
  
  closeRoom(roomName: string): void {
    const room = this.rooms.get(roomName);
    if (!room) return;
    
    console.log(`[AgentManager] Closing room: ${roomName}`);
    room.state = 'closing';
    
    // Kill the agent if running
    this.killAgent(roomName);
    
    // Remove from registry
    this.rooms.delete(roomName);
    
    this.emit('roomClosed', { roomName });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH MONITORING
  // ═══════════════════════════════════════════════════════════════════════════
  
  runHealthCheck(): void {
    for (const [roomName, room] of this.rooms) {
      if (room.agentPid !== null) {
        const process = this.processes.get(room.agentPid);
        
        if (!process) {
          console.warn(`[AgentManager:Health] Agent process missing for ${roomName}`);
          room.agentPid = null;
          
          // Restart if humans are present
          if (room.humanCount > 0) {
            this.spawnAgentForRoom(roomName);
          }
          continue;
        }
        
        // Check if process is still running
        if (process.killed || process.exitCode !== null) {
          console.warn(`[AgentManager:Health] Agent process dead for ${roomName}`);
          this.handleAgentExit(roomName, room.agentPid, process.exitCode, null);
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT HEARTBEAT (Called by agents via IPC or HTTP)
  // ═══════════════════════════════════════════════════════════════════════════
  
  agentHeartbeat(roomName: string, agentIdentity: string): void {
    const room = this.rooms.get(roomName);
    if (room && room.agentIdentity === agentIdentity) {
      room.agentLastHeartbeat = new Date();
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════
  
  getStats(): {
    totalRooms: number;
    activeRooms: number;
    roomsInGrace: number;
    totalAgents: number;
    totalParticipants: number;
  } {
    let activeRooms = 0;
    let roomsInGrace = 0;
    let totalParticipants = 0;
    
    for (const room of this.rooms.values()) {
      if (room.state === 'active') activeRooms++;
      if (room.state === 'grace_period') roomsInGrace++;
      totalParticipants += room.participants.size;
    }
    
    return {
      totalRooms: this.rooms.size,
      activeRooms,
      roomsInGrace,
      totalAgents: this.processes.size,
      totalParticipants,
    };
  }
}

// Singleton instance
let agentManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!agentManager) {
    agentManager = new AgentManager();
    agentManager.start();
  }
  return agentManager;
}

export function stopAgentManager(): void {
  if (agentManager) {
    agentManager.stop();
    agentManager = null;
  }
}
```

---

## 4. Integration with LiveKit Routes

### 4.1 Updated Token Route

**File: `apps/api/src/routes/livekit.ts` (updated)**

```typescript
import { Hono } from 'hono';
import { AccessToken, VideoGrant, RoomServiceClient } from 'livekit-server-sdk';
import { getAgentManager } from '../services/agent-manager';

const livekit = new Hono();

// POST /api/livekit/token
livekit.post('/token', async (c) => {
  const { roomName, participantName, participantIdentity, role } = await c.req.json();
  
  const apiKey = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;
  
  // Generate token
  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: '2h',
  });
  
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  
  if (role === 'coach') {
    grant.roomAdmin = true;
  }
  
  token.addGrant(grant);
  const jwt = await token.toJwt();
  
  // Register with agent manager and spawn agent
  const agentManager = getAgentManager();
  
  // Spawn AI agent for this room (if not already running)
  if (role === 'client' || role === 'coach') {
    const result = await agentManager.spawnAgentForRoom(roomName);
    if (!result.success) {
      console.warn(`[LiveKit] Failed to spawn agent: ${result.error}`);
    }
  }
  
  return c.json({
    success: true,
    data: {
      token: jwt,
      url: process.env.LIVEKIT_URL,
      roomName,
    }
  });
});

// Webhook for LiveKit room events
livekit.post('/webhook', async (c) => {
  const event = await c.req.json();
  const agentManager = getAgentManager();
  
  console.log(`[LiveKit:Webhook] ${event.event}`, event);
  
  switch (event.event) {
    case 'participant_joined':
      agentManager.participantJoined(
        event.room.name,
        event.participant.identity,
        event.participant.name || event.participant.identity,
        event.participant.identity.startsWith('ai-') ? 'ai-agent' :
        event.participant.identity.startsWith('coach-') ? 'coach' : 'client'
      );
      break;
      
    case 'participant_left':
      agentManager.participantLeft(
        event.room.name,
        event.participant.identity
      );
      break;
      
    case 'room_finished':
      agentManager.closeRoom(event.room.name);
      break;
  }
  
  return c.json({ success: true });
});

// GET /api/livekit/rooms - List all rooms with status
livekit.get('/rooms', async (c) => {
  const agentManager = getAgentManager();
  const rooms = agentManager.getAllRooms();
  
  return c.json({
    success: true,
    data: {
      rooms: rooms.map(room => ({
        roomName: room.roomName,
        state: room.state,
        humanCount: room.humanCount,
        participantCount: room.participants.size,
        hasAgent: room.agentPid !== null,
        agentIdentity: room.agentIdentity,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        graceRemaining: room.state === 'grace_period' && room.graceStartedAt
          ? Math.max(0, room.graceDurationMs - (Date.now() - room.graceStartedAt.getTime()))
          : null,
      })),
    }
  });
});

// GET /api/livekit/stats - Get manager statistics
livekit.get('/stats', async (c) => {
  const agentManager = getAgentManager();
  const stats = agentManager.getStats();
  
  return c.json({
    success: true,
    data: stats,
  });
});

// POST /api/livekit/rooms/:roomName/close - Force close a room
livekit.post('/rooms/:roomName/close', async (c) => {
  const { roomName } = c.req.param();
  const agentManager = getAgentManager();
  
  agentManager.closeRoom(roomName);
  
  return c.json({
    success: true,
    message: `Room ${roomName} closed`,
  });
});

// POST /api/livekit/gc - Manually trigger garbage collection
livekit.post('/gc', async (c) => {
  const agentManager = getAgentManager();
  agentManager.runGarbageCollection();
  
  return c.json({
    success: true,
    message: 'Garbage collection triggered',
  });
});

export default livekit;
```

---

## 5. LiveKit Webhook Configuration

To receive participant join/leave events, configure webhooks in LiveKit Cloud:

### 5.1 LiveKit Cloud Dashboard

1. Go to your LiveKit Cloud project
2. Navigate to Settings → Webhooks
3. Add webhook URL: `https://your-api.com/api/livekit/webhook`
4. Select events:
   - `participant_joined`
   - `participant_left`
   - `room_started`
   - `room_finished`

### 5.2 For Development (ngrok)

```bash
# Expose local API to internet
ngrok http 3001

# Use the ngrok URL in LiveKit webhook settings
# https://xxxx.ngrok.io/api/livekit/webhook
```

### 5.3 Alternative: Polling (No Webhooks)

If webhooks aren't feasible, poll the AI agent for room state:

```typescript
// In AI Agent - send periodic updates
setInterval(() => {
  const participants = room.remoteParticipants.size + 1;
  const humans = Array.from(room.remoteParticipants.values())
    .filter(p => !p.identity.startsWith('ai-')).length;
    
  // Report to API
  fetch(`${API_URL}/api/livekit/agent-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomName,
      agentIdentity,
      participants,
      humans,
    }),
  });
}, 5000);
```

---

## 6. AI Agent Updates for Graceful Shutdown

**File: `services/ai-agent/src/livekit-agent.ts` (additions)**

```typescript
export class LiveKitAgent extends EventEmitter {
  // ... existing code ...
  
  private isShuttingDown = false;
  private shutdownTimeout: NodeJS.Timeout | null = null;
  
  private setupRoomEvents(): void {
    // ... existing event handlers ...
    
    // Handle all humans leaving
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      // ... existing code ...
      
      // Check if we should prepare for shutdown
      this.checkForEmptyRoom();
    });
  }
  
  private checkForEmptyRoom(): void {
    if (!this.room) return;
    
    // Count human participants
    let humanCount = 0;
    this.room.remoteParticipants.forEach((p) => {
      if (!p.identity.startsWith('ai-')) {
        humanCount++;
      }
    });
    
    if (humanCount === 0) {
      console.log('[LiveKitAgent] All humans left, waiting for reconnection...');
      
      // The API's AgentManager handles the grace period
      // But we can also self-terminate after a timeout as a failsafe
      if (!this.shutdownTimeout) {
        this.shutdownTimeout = setTimeout(() => {
          if (this.getHumanCount() === 0) {
            console.log('[LiveKitAgent] No humans returned, self-terminating...');
            this.leaveRoom().then(() => {
              process.exit(0);
            });
          }
        }, 70000); // 70 seconds (slightly longer than API grace period)
      }
    } else {
      // Cancel shutdown if someone rejoined
      if (this.shutdownTimeout) {
        console.log('[LiveKitAgent] Human rejoined, cancelling shutdown');
        clearTimeout(this.shutdownTimeout);
        this.shutdownTimeout = null;
      }
    }
  }
  
  private getHumanCount(): number {
    if (!this.room) return 0;
    
    let count = 0;
    this.room.remoteParticipants.forEach((p) => {
      if (!p.identity.startsWith('ai-')) {
        count++;
      }
    });
    return count;
  }
  
  // Handle SIGTERM from AgentManager
  setupSignalHandlers(): void {
    process.on('SIGTERM', async () => {
      console.log('[LiveKitAgent] Received SIGTERM, shutting down gracefully...');
      this.isShuttingDown = true;
      await this.leaveRoom();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('[LiveKitAgent] Received SIGINT, shutting down gracefully...');
      this.isShuttingDown = true;
      await this.leaveRoom();
      process.exit(0);
    });
  }
}
```

---

## 7. Verification Checklist

### 7.1 Agent Manager Setup

- [ ] `AgentManager` class created in `apps/api/src/services/agent-manager/`
- [ ] Singleton pattern with `getAgentManager()`
- [ ] Started when API boots up
- [ ] Stopped when API shuts down

### 7.2 Room Lifecycle

- [ ] Room created when first participant requests token
- [ ] Room state transitions: empty → starting → active → grace_period → closing
- [ ] Grace period starts when last human leaves
- [ ] Grace period cancelled if human rejoins
- [ ] Room closed when grace period expires

### 7.3 Agent Spawning

- [ ] Agent spawned when client/coach requests token
- [ ] Duplicate agents prevented (one per room)
- [ ] Agent process tracked by PID
- [ ] Stdout/stderr logged with room prefix
- [ ] Exit handling cleans up state

### 7.4 Garbage Collection

- [ ] GC runs every 30 seconds
- [ ] Expired grace period rooms closed
- [ ] Stale empty rooms cleaned up
- [ ] Orphaned processes killed

### 7.5 Health Monitoring

- [ ] Health check runs every 10 seconds
- [ ] Dead processes detected
- [ ] Agents restarted if humans present

### 7.6 API Endpoints

- [ ] `GET /api/livekit/rooms` - List all rooms
- [ ] `GET /api/livekit/stats` - Manager statistics
- [ ] `POST /api/livekit/rooms/:name/close` - Force close room
- [ ] `POST /api/livekit/gc` - Manual GC trigger

---

## 8. Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `gracePeriodMs` | 60000 | Time to wait before closing empty room |
| `gcIntervalMs` | 30000 | How often GC runs |
| `healthCheckIntervalMs` | 10000 | How often health check runs |
| `maxAgentsPerRoom` | 1 | Maximum agents per room |
| `maxTotalAgents` | 50 | Maximum total concurrent agents |
| `agentStartupTimeoutMs` | 30000 | Time to wait for agent to connect |

---

## 9. Monitoring & Debugging

### 9.1 View All Rooms

```bash
curl http://localhost:3001/api/livekit/rooms | jq
```

### 9.2 View Statistics

```bash
curl http://localhost:3001/api/livekit/stats | jq
```

### 9.3 Manual GC

```bash
curl -X POST http://localhost:3001/api/livekit/gc
```

### 9.4 Force Close Room

```bash
curl -X POST http://localhost:3001/api/livekit/rooms/test-room/close
```

### 9.5 Expected Log Output

```
[AgentManager] Starting...
[AgentManager] Started
  Grace period: 60s
  GC interval: 30s
  Max agents: 50

[AgentManager] Created room: test-room
[AgentManager] Spawning agent for test-room...
[AgentManager] Agent spawned for test-room (PID: 12345)
[AI-Agent:test-room] Connected to LiveKit

[AgentManager] Participant joined: client-abc (client) in test-room
[AgentManager] Room test-room: 1 humans, 2 total

[AgentManager] Participant left: client-abc from test-room
[AgentManager] Room test-room: 0 humans, 1 total
[AgentManager] All humans left test-room, starting 60s grace period

[AgentManager:GC] Running garbage collection...
[AgentManager:GC] Room test-room in grace period: 45s remaining
[AgentManager:GC] Complete. Active rooms: 1, Active agents: 1

[AgentManager:GC] Running garbage collection...
[AgentManager:GC] Grace period expired for test-room
[AgentManager] Closing room: test-room
[AgentManager] Killing agent for test-room (PID: 12345)
[AgentManager:GC] Complete. Active rooms: 0, Active agents: 0
```

---

## 10. Production Recommendations

### 10.1 Use Process Manager (PM2)

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'apps/api/src/index.ts',
      interpreter: 'bun',
      // Agent processes are spawned by AgentManager, not PM2
    }
  ]
};
```

### 10.2 Resource Limits

Set environment variable limits:

```bash
# Maximum concurrent agents
MAX_TOTAL_AGENTS=50

# Memory limit per agent (in Node.js)
NODE_OPTIONS="--max-old-space-size=512"
```

### 10.3 Graceful API Shutdown

```typescript
// apps/api/src/index.ts
import { stopAgentManager } from './services/agent-manager';

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[API] Shutting down...');
  stopAgentManager();
  process.exit(0);
});
```

### 10.4 Alerts

Set up monitoring alerts for:
- Agent spawn failures
- High agent count (approaching limit)
- Rooms stuck in grace period
- Orphaned processes detected

---

## 11. Summary

This system provides:

1. **Automatic agent spawning** when participants join
2. **60-second grace period** when all humans leave
3. **Automatic cleanup** of stale rooms and orphaned agents
4. **Health monitoring** with automatic restart
5. **API endpoints** for monitoring and manual control
6. **Scalable architecture** with configurable limits

The key insight is treating the AI agent as a managed resource with a clear lifecycle, rather than a fire-and-forget subprocess.