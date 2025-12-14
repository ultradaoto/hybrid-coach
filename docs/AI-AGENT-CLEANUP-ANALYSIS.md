# AI Agent Cleanup Analysis

## Executive Summary

The current AI agent spawning and cleanup implementation has **basic functionality** but **lacks automatic cleanup** when participants leave. Agents will continue running indefinitely until manually terminated or the API server restarts.

### Current State: ✅ Works, ⚠️ Manual Cleanup Required

**What Works:**
- ✅ Agents spawn correctly when participants join
- ✅ Duplicate prevention (one agent per room)
- ✅ Graceful shutdown on API server stop (SIGTERM/SIGINT)
- ✅ Agents self-clean from registry on process exit
- ✅ LiveKit integration functions properly

**What's Missing:**
- ❌ No automatic cleanup when all participants leave
- ❌ No grace period (60s wait for participants to rejoin)
- ❌ No health monitoring for orphaned agents
- ❌ No garbage collection for stale rooms
- ❌ No LiveKit webhook integration for participant tracking

---

## Current Architecture

### 1. Agent Spawning (apps/api/src/routes/livekit.ts)

```
Client/Coach requests token
        ↓
API generates LiveKit token
        ↓
API checks if agent exists for room
        ↓
If not exists → spawn agent process
        ↓
Track in Map<roomName, {process, startedAt}>
        ↓
Agent joins LiveKit room
```

**Implementation:**
- Uses Node.js `spawn()` to launch `npx tsx src/index.ts {roomName}`
- Tracks agents in `activeAgents` Map
- Prevents duplicate agents per room
- Logs stdout/stderr with room prefix

### 2. Agent Lifecycle (services/ai-agent/src/)

```
index.ts
  ↓
Creates LiveKitAgent instance
  ↓
livekit-agent.ts
  ↓
Connects to LiveKit room as "ai-coach-agent"
  ↓
Subscribes to participant audio tracks
  ↓
Connects to Deepgram (voice + transcription)
  ↓
Routes audio: LiveKit ↔ Deepgram
  ↓
Publishes AI audio back to LiveKit
  ↓
Runs until SIGTERM/SIGINT received
```

**No Automatic Exit Logic:**
- Agent doesn't track human participant count
- No self-termination when room becomes empty
- No grace period implementation
- Relies on external termination

---

## Identified Issues

### 🔴 Critical: No Automatic Cleanup

**Problem:**
When all humans (coach + client) leave the CallRoom, the AI agent continues running indefinitely.

**Impact:**
- Memory usage accumulates over time
- Deepgram connections stay open (cost)
- LiveKit room occupancy persists
- Process count increases with each session

**Example Scenario:**
1. Coach joins → Agent spawns ✅
2. Client joins → Session active ✅
3. Client leaves → Agent still running ⚠️
4. Coach leaves → Agent still running ⚠️
5. Agent never exits → Orphaned process ❌

### 🟡 Medium: No Grace Period

**Problem:**
If the system did automatically terminate agents, it would happen immediately when the last participant leaves. This doesn't account for brief disconnections (network issues, browser refresh, etc.).

**Best Practice:**
Wait 60 seconds after the last human leaves before terminating the agent. If anyone rejoins during this period, cancel the shutdown.

### 🟡 Medium: No Health Monitoring

**Problem:**
No periodic checks to detect:
- Agents running in rooms with no participants for extended periods
- Orphaned agents (API crashed but agent still running)
- Stale agent processes (zombie processes)

### 🟢 Low: No LiveKit Webhook Integration

**Problem:**
The API doesn't receive real-time notifications from LiveKit about:
- Participant joins/leaves
- Room lifecycle events
- Connection state changes

**Note:** This is less critical since agents can self-monitor their room state.

---

## Recommended Solutions

### Option 1: Quick Fix (Self-Terminating Agent) ⚡

**Minimal changes to enable automatic cleanup with grace period.**

#### Changes to `services/ai-agent/src/livekit-agent.ts`:

Add participant tracking and grace period logic:

```typescript
export class LiveKitAgent extends EventEmitter {
  // ... existing properties ...
  
  private shutdownTimer: NodeJS.Timeout | null = null;
  private readonly GRACE_PERIOD_MS = 60 * 1000; // 60 seconds
  
  private setupRoomEvents(): void {
    // ... existing handlers ...
    
    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log(`[LiveKitAgent] 👋 Participant disconnected: ${participant.identity}`);
      
      // Existing logic...
      this.participantRoles.delete(participant.identity);
      this.mutedParticipants.delete(participant.identity);
      this.connectionManager?.unregisterParticipant(participant.identity);
      
      this.emit('participant-left', { identity: participant.identity });
      
      // NEW: Check if we should start grace period
      this.checkRoomStatus();
    });
  }
  
  /**
   * Check if room is empty (no humans) and start/cancel grace period
   */
  private checkRoomStatus(): void {
    if (!this.room) return;
    
    // Count human participants (exclude AI)
    let humanCount = 0;
    this.room.remoteParticipants.forEach((participant) => {
      if (!participant.identity.startsWith('ai-')) {
        humanCount++;
      }
    });
    
    console.log(`[LiveKitAgent] 👥 Human participants: ${humanCount}`);
    
    if (humanCount === 0) {
      // All humans left - start grace period if not already started
      if (!this.shutdownTimer) {
        console.log(`[LiveKitAgent] ⏳ All humans left. Starting ${this.GRACE_PERIOD_MS / 1000}s grace period...`);
        this.shutdownTimer = setTimeout(() => {
          this.handleGracePeriodExpired();
        }, this.GRACE_PERIOD_MS);
      }
    } else {
      // Humans still present - cancel grace period if active
      if (this.shutdownTimer) {
        console.log('[LiveKitAgent] ✅ Human rejoined. Cancelling shutdown.');
        clearTimeout(this.shutdownTimer);
        this.shutdownTimer = null;
      }
    }
  }
  
  /**
   * Handle grace period expiration (no humans returned)
   */
  private async handleGracePeriodExpired(): Promise<void> {
    console.log('[LiveKitAgent] 🛑 Grace period expired. No humans in room. Shutting down...');
    
    this.shutdownTimer = null;
    
    // Disconnect gracefully
    await this.disconnect();
    
    // Exit process
    console.log('[LiveKitAgent] 👋 Goodbye!');
    process.exit(0);
  }
  
  /**
   * Also check on initial participant join (in case we missed the initial state)
   */
  private setupRoomEvents(): void {
    // ... existing handlers ...
    
    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`[LiveKitAgent] 👤 Participant connected: ${participant.identity}`);
      
      // Existing logic...
      const role = participant.identity.startsWith('coach-') ? 'coach' : 'client';
      this.participantRoles.set(participant.identity, role);
      this.connectionManager?.registerParticipant(participant.identity, role, participant.name);
      
      this.emit('participant-joined', { identity: participant.identity, role });
      
      // NEW: Check room status (may cancel grace period)
      this.checkRoomStatus();
    });
  }
  
  async disconnect(): Promise<void> {
    console.log('[LiveKitAgent] 🔌 Disconnecting...');
    
    // Clear any pending shutdown timer
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }
    
    // ... rest of existing disconnect logic ...
  }
}
```

#### Changes to `services/ai-agent/src/index.ts`:

Add periodic room check (failsafe):

```typescript
async function runAgent(config: AgentConfig): Promise<void> {
  console.log(`[Agent] 🚀 Starting agent for room: ${config.roomName}`);

  // ... existing agent creation and setup ...

  await agent.connect();

  console.log('[Agent] 🏃 Agent running. Press Ctrl+C to stop.');

  // Existing status interval
  const statusInterval = setInterval(() => {
    const status = agent?.getStatus();
    if (status && config.verbose) {
      console.log(`[Agent] 📊 Status: Room=${status.room.connected}, Deepgram=${status.deepgram.connected}, Participants=${status.room.participantCount}`);
      
      // NEW: Failsafe - if disconnected for >5 minutes, exit
      if (!status.room.connected) {
        if (!statusInterval['disconnectedSince']) {
          statusInterval['disconnectedSince'] = Date.now();
        } else {
          const disconnectedMs = Date.now() - statusInterval['disconnectedSince'];
          if (disconnectedMs > 5 * 60 * 1000) {
            console.log('[Agent] ⚠️ Disconnected for >5 minutes. Exiting...');
            process.exit(0);
          }
        }
      } else {
        delete statusInterval['disconnectedSince'];
      }
    }
  }, 30000);

  // ... rest of existing code ...
}
```

**Pros:**
- ✅ Self-contained (no API changes needed)
- ✅ 60-second grace period for reconnections
- ✅ Minimal code changes
- ✅ No external dependencies

**Cons:**
- ⚠️ Each agent manages its own lifecycle (no centralized control)
- ⚠️ No cross-room coordination
- ⚠️ Still possible to have brief race conditions on spawn

**Testing:**
1. Start agent
2. Join as coach
3. Join as client
4. Leave as client → should see "All humans left. Starting 60s grace period"
5. Rejoin as client within 60s → should see "Human rejoined. Cancelling shutdown"
6. Leave as client again
7. Leave as coach → grace period starts
8. Wait 60s → agent exits

---

### Option 2: Full AgentManager (Production-Ready) 🏗️

**Implements the architecture from AI-AGENT-SPAWN-CHECK.md**

This requires significant changes:

1. **Create AgentManager Service** (`apps/api/src/services/agent-manager/`)
   - Centralized agent lifecycle management
   - Room state tracking (empty, starting, active, grace_period, closing)
   - Garbage collection (runs every 30s)
   - Health monitoring (runs every 10s)
   - Participant tracking

2. **Configure LiveKit Webhooks**
   - Receive participant_joined/left events
   - Update room state in AgentManager
   - Trigger cleanup when appropriate

3. **Add API Endpoints**
   - `GET /api/livekit/rooms` - List all rooms
   - `GET /api/livekit/stats` - Manager statistics
   - `POST /api/livekit/rooms/:name/close` - Force close
   - `POST /api/livekit/gc` - Manual garbage collection

**Pros:**
- ✅ Production-grade reliability
- ✅ Centralized monitoring and control
- ✅ Handles edge cases (crashes, orphans, race conditions)
- ✅ Configurable grace periods, limits, intervals
- ✅ Observable (stats, room states, agent health)

**Cons:**
- ⚠️ Significant implementation effort (2-3 days)
- ⚠️ Requires LiveKit webhook configuration
- ⚠️ More complexity to maintain

---

## Recommendation

### For Current Needs: **Option 1 (Quick Fix)**

Given that you're using Bun and have a working system, the self-terminating agent approach is the pragmatic choice:

1. **Immediate value:** Agents clean up automatically
2. **Low risk:** Changes isolated to agent code
3. **Simple to test:** Observable in logs
4. **No infrastructure changes:** No webhooks or new services

### For Production Scale: **Option 2 (AgentManager)**

If you plan to scale to many concurrent sessions, implement the full AgentManager:

- Better resource management
- Centralized observability
- Handles edge cases
- Production-ready monitoring

---

## Implementation Priority

### Phase 1: Quick Wins (Implement Now) ✅
1. Add grace period to AI agent (Option 1)
2. Add failsafe disconnect check
3. Test with manual room joins/leaves

### Phase 2: Observability (Week 2) 📊
1. Add `/api/livekit/agents` endpoint (list running agents)
2. Add logging for agent lifecycle events
3. Monitor agent count in production

### Phase 3: Full Management (Month 2) 🏗️
1. Implement AgentManager service
2. Configure LiveKit webhooks
3. Add health monitoring
4. Add garbage collection

---

## Testing Checklist

### Manual Testing

- [ ] Agent spawns when first participant joins
- [ ] Only one agent spawns per room (no duplicates)
- [ ] Agent continues running while humans are present
- [ ] Grace period starts when all humans leave
- [ ] Grace period cancels if human rejoins
- [ ] Agent exits after grace period expires
- [ ] Agent cleans up Deepgram connections
- [ ] Agent removes LiveKit participant
- [ ] API removes agent from activeAgents Map
- [ ] New participant can join and spawn new agent

### Load Testing

- [ ] Multiple concurrent rooms
- [ ] Rapid join/leave cycles
- [ ] Network interruption during grace period
- [ ] Browser refresh during session
- [ ] API restart during active sessions

### Edge Cases

- [ ] Agent crashes during session → new agent spawns
- [ ] API crashes → agents eventually self-terminate
- [ ] LiveKit server unreachable → agents exit gracefully
- [ ] Deepgram connection fails → agent exits gracefully

---

## Monitoring Recommendations

### Key Metrics to Track

1. **Active Agent Count**
   - Query: `GET /api/livekit/agents`
   - Alert if > 50 agents

2. **Agent Uptime**
   - Track `startedAt` for each agent
   - Alert if any agent > 4 hours old

3. **Grace Period Events**
   - Log when grace periods start/cancel/expire
   - Track average grace period duration

4. **Process Exit Codes**
   - Code 0 = clean shutdown
   - Code 1 = error
   - Track crash rate

### Log Patterns to Monitor

```
🔴 Alert:
- "AI Agent spawn error"
- "Failed to spawn AI agent"
- "Disconnected for >5 minutes"

🟡 Warning:
- "All humans left. Starting grace period"
- "No humans returned, self-terminating"

🟢 Info:
- "Grace period expired. No humans in room"
- "Human rejoined. Cancelling shutdown"
```

---

## Summary

**Current State:**
- Spawning works correctly ✅
- Cleanup requires manual intervention ⚠️
- No automatic lifecycle management ❌

**Recommended Action:**
Implement **Option 1 (Self-Terminating Agent)** with grace period logic. This provides 80% of the value with 20% of the effort.

**Timeline:**
- Option 1: 2-4 hours implementation + testing
- Option 2: 2-3 days implementation + testing

**Risk Assessment:**
- Option 1: Low risk (changes isolated to agent)
- Option 2: Medium risk (requires coordination between API, agents, and LiveKit)
