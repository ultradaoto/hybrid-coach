# ROOM SERVICE REQUIREMENTS

## Message for ROOM Service Claude Instance

### Overview

You are building a dedicated ROOM microservice for the Hybrid-Coach application. This service handles all WebRTC, video calling, and real-time communication functionality. The main Hybrid-Coach app will communicate with your service via HTTP APIs on localhost:3001.

### Architecture Context

The Hybrid-Coach application is being split into two services:
1. **Main App** (handles business logic, users, scheduling, database)
2. **ROOM Service** (your responsibility - handles all video calls, WebRTC, Spawning each AI Orb)
3. **GPU Service** (You are responsible for spawning the AI Orb - but the AI Orb itself will - with your parameters - know which room each AI Orb must join)

### What You Need to Build

#### Core Responsibilities:
1. **WebRTC Implementation**
   - MediaSoup server for production video calls
   - SimplePeer fallback for blocked environments
   - WebSocket relay for extremely restrictive networks
   - TURN/STUN server integration (Twilio)

2. **Room Management**
   - Create rooms when requested by main app
   - Track participant join/leave times
   - Monitor room status (waiting, active, ended)
   - Automatic room cleanup after sessions

3. **AI Orb Integration**
   - Spawn AI assistant when enabled
   - Manage AI voice streams
   - Track AI participation percentage
   - Handle tri-party coordination (Coach + Client + AI)

4. **Session Recording & Transcription**
   - Real-time transcription of conversations
   - Generate session summaries using AI
   - Track speaking time for each participant
   - Extract key topics and action items

5. **Event Broadcasting**
   - WebSocket events for room state changes
   - Participant join/leave notifications
   - Summary ready notifications
   - Error reporting

### API Endpoints You Must Implement

#### 1. POST /api/rooms/create
Receives:
```json
{
  "roomId": "uuid-from-main-app",
  "sessionId": "session-uuid",
  "participants": {
    "coach": {
      "id": "coach-user-id",
      "token": "jwt-with-name-embedded"
    },
    "client": {
      "id": "client-user-id",
      "token": "jwt-with-name-embedded"
    },
    "aiOrb": {
      "enabled": true,
      "personality": "supportive",
      "voiceModel": "default"
    }
  },
  "config": {
    "scheduledStartTime": "ISO-8601-date",
    "maxDuration": 3600,
    "features": {
      "recording": false,
      "transcription": true,
      "aiAssistance": true,
      "generateSummary": true
    }
  }
}
```

Returns:
```json
{
  "success": true,
  "roomId": "uuid",
  "sessionId": "session-uuid",
  "status": "ready",
  "connectionUrls": {
    "coach": "http://localhost:3001/room/uuid?token=xxx",
    "client": "http://localhost:3001/room/uuid?token=yyy",
    "websocket": "ws://localhost:3001/events/uuid"
  }
}
```

#### 2. GET /api/rooms/{roomId}/status
Returns current room state with participant details and durations.

#### 3. GET /api/rooms/{roomId}/summary
Returns AI-generated summary with:
- Text summary of the session
- Key topics discussed
- Action items
- Participant talk time statistics
- Attendance information

#### 4. POST /api/rooms/{roomId}/end
Gracefully ends a room session.

#### 5. GET /api/rooms/{roomId}/transcription
Returns session transcription in requested format.

#### 6. WebSocket endpoint: ws://localhost:3001/events/{roomId}
Broadcasts real-time events:
- participant-joined
- participant-left
- room-started
- room-ended
- summary-ready
- error

#### 7. GET /health
Health check endpoint with resource usage.

#### 8. POST /api/rooms/bulk-status
Check multiple room statuses at once.

#### 9. POST /api/rooms/{roomId}/pre-warm
Pre-allocate resources before scheduled start time.

### JWT Token Validation

Tokens from main app contain:
```json
{
  "userId": "user-uuid",
  "roomId": "room-uuid",
  "sessionId": "session-uuid",
  "role": "coach|client",
  "name": "Display Name",
  "permissions": ["video", "audio", "screen-share"],
  "exp": 1719759600
}
```

You must:
- Validate JWT signatures using shared secret
- Extract user name for display in room UI
- Enforce role-based permissions
- Reject expired tokens

### Room UI Requirements

When participants visit room URLs:
1. **Authentication**: Validate JWT token from URL
2. **Display**: Show participant name from JWT (not sent in API)
3. **Permissions**: Enable features based on JWT permissions
4. **Tri-party UI**: Support Coach + Client + AI Orb layout
5. **Connection Fallbacks**: Try MediaSoup → SimplePeer → WebSocket relay

### AI Orb Spawning & Management

This is a critical component moved from the main app's OrbManager.js. You must implement a comprehensive AI Orb spawning system.

#### Spawning Architecture

**Dual-Approach System**:
1. **Primary Method**: GPU Manager API (recommended)
2. **Fallback Method**: Direct Node.js process spawning

#### GPU Manager API Integration (Primary)

**Spawn AI Orb**:
```javascript
// POST to GPU Manager API
const response = await fetch(`${GPU_MANAGER_URL}/orbs/spawn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        roomId: roomId,
        sessionId: sessionId,
        options: {
            maxLifetime: 7200000,  // 2 hours production
            idleTimeout: 300000,   // 5 minutes
            testMode: process.env.ORB_TEST_MODE === 'true'
        }
    })
});

// Expected Response:
{
    "success": true,
    "orbId": "orb-uuid",
    "status": "spawning|active|failed",
    "processId": 12345,
    "heartbeatUrl": "/orbs/orb-uuid/heartbeat"
}
```

**Terminate AI Orb**:
```javascript
// DELETE to GPU Manager API
await fetch(`${GPU_MANAGER_URL}/orbs/${orbId}/terminate`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${API_KEY}` }
});
```

**Health Check**:
```javascript
// GET heartbeat status
const health = await fetch(`${GPU_MANAGER_URL}/orbs/${orbId}/heartbeat`);
```

#### Direct Process Spawning (Fallback)

When GPU Manager API is unavailable, spawn AI Orb processes directly:

```javascript
const { spawn } = require('child_process');

const args = [
    'aiorb.js',
    `--room=${roomId}`,
    `--session=${sessionId}`,
    `--coach=${coachId}`,
    `--client=${clientId}`,
    `--cpu-host=${CPU_HOST}`,
    `--max-lifetime=7200000`,
    `--idle-timeout=300000`
];

const orbProcess = spawn('node', args, {
    cwd: process.env.GPU_SERVER_PATH || '/var/www/hybrid-coach-gpu',
    env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'production',
        ROOM_ID: roomId,
        SESSION_ID: sessionId,
        CPU_SERVER_HOST: CPU_HOST
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
});
```

#### Spawning Triggers

**Coach-Only Activation**: AI Orbs should ONLY be spawned when a COACH joins the room:

```javascript
// In room join handler
if (userRole === 'coach' && aiOrbEnabled && !hasActiveOrbForRoom(roomId)) {
    spawnAIOrb(roomId, sessionId)
        .then(result => {
            console.log(`[AI-ORB] 🚀 Spawned successfully:`, result?.status);
            broadcastEvent('ai-orb-spawned', { roomId, orbId: result.orbId });
        })
        .catch(error => {
            console.error('[AI-ORB] ❌ Spawn failed:', error);
            broadcastEvent('ai-orb-spawn-failed', { roomId, error: error.message });
        });
}
```

#### Lifecycle Management

**Health Monitoring**:
- Heartbeat checks every 30 seconds
- Mark orb as unresponsive after 5+ minutes without heartbeat
- Automatic restart for unresponsive orbs (up to 3 attempts)

**Cleanup Triggers**:
- Room becomes empty: 1-minute grace period before cleanup
- Maximum lifetime reached: 2 hours (7200000ms) for production
- Idle timeout: 5 minutes (300000ms) of no activity
- Manual termination via API
- Service shutdown: Graceful SIGTERM, force SIGKILL after 10 seconds

**Participant Tracking**:
```javascript
class OrbManager {
    constructor() {
        this.activeOrbs = new Map(); // roomId -> orbInfo
        this.participantCounts = new Map(); // roomId -> count
        this.cleanupTimers = new Map(); // roomId -> timerId
    }

    updateParticipantCount(roomId, count) {
        this.participantCounts.set(roomId, count);
        
        if (count === 0 && this.activeOrbs.has(roomId)) {
            // Start 1-minute grace period
            const timerId = setTimeout(() => {
                this.terminateOrb(roomId);
            }, 60000);
            this.cleanupTimers.set(roomId, timerId);
        } else if (count > 0 && this.cleanupTimers.has(roomId)) {
            // Cancel cleanup if participants return
            clearTimeout(this.cleanupTimers.get(roomId));
            this.cleanupTimers.delete(roomId);
        }
    }
}
```

#### AI Orb Behavior

When AI is enabled:
1. **Activation**: Spawn when coach joins, NOT on room creation
2. **Personality**: Use personality setting from config
3. **Interaction**: Listen to conversation, provide insights when appropriate
4. **Speaking Time**: Aim for ~10-15% participation
5. **Summary**: Help generate session summary at end
6. **Lifecycle**: 2-hour max lifetime, 5-minute idle timeout

### Summary Generation

After each session:
1. **Process**: Analyze transcription using LLM
2. **Extract**: Key topics, action items, sentiment
3. **Statistics**: Calculate talk time percentages
4. **Format**: Structure summary as specified in API
5. **Notify**: Send 'summary-ready' event via WebSocket

### Technical Stack You Should Use

Based on removed files from main app:
- **WebRTC**: MediaSoup (primary), SimplePeer (fallback)
- **Signaling**: Protoo for MediaSoup
- **WebSockets**: ws or Socket.IO for events
- **Transcription**: Web Speech API or cloud service
- **AI/LLM**: For summary generation
- **Framework**: Express.js to match main app

### Environment Variables

Your service should use:
```env
# Core Service Configuration
PORT=3001
JWT_SIGNING_SECRET=shared-with-main-app

# WebRTC Configuration
TURN_SERVER_URL=twilio-turn-server
TURN_USERNAME=from-twilio
TURN_PASSWORD=from-twilio

# AI Orb Spawning Configuration
GPU_MANAGER_URL=http://127.0.0.1:8002
GPU_SERVER_PATH=/var/www/hybrid-coach-gpu
CPU_HOST=localhost:3000
MAX_CONCURRENT_ORBS=8
ORB_TEST_MODE=false

# AI Services
AI_SERVICE_URL=your-ai-endpoint
AI_TRANSCRIPTION_URL=your-transcription-service

# Optional Development Overrides
NODE_ENV=production
HEARTBEAT_INTERVAL=30000
CLEANUP_GRACE_PERIOD=60000
ORB_MAX_LIFETIME=7200000
ORB_IDLE_TIMEOUT=300000
```

#### Environment Variable Details

**GPU_MANAGER_URL**: Primary API endpoint for AI Orb management
- Default: `http://127.0.0.1:8002`
- Used for API-based orb spawning (recommended approach)

**GPU_SERVER_PATH**: Directory path for direct process spawning fallback
- Default: `/var/www/hybrid-coach-gpu`
- Must contain `aiorb.js` executable
- Used when GPU Manager API is unavailable

**CPU_HOST**: Host for CPU server communication
- Default: `localhost:3000`
- Used by AI Orbs to communicate back to main application

**MAX_CONCURRENT_ORBS**: Maximum simultaneous AI Orbs
- Default: `8`
- Prevents resource exhaustion
- Reject new orb spawns when limit reached

**ORB_TEST_MODE**: Enable test mode with shorter lifetimes
- Default: `false`
- When `true`: 30-second max lifetime instead of 2 hours
- Used for development and testing

**Timing Configuration**:
- **HEARTBEAT_INTERVAL**: Health check frequency (default: 30000ms)
- **CLEANUP_GRACE_PERIOD**: Delay before terminating empty rooms (default: 60000ms)
- **ORB_MAX_LIFETIME**: Maximum orb lifetime (default: 7200000ms = 2 hours)
- **ORB_IDLE_TIMEOUT**: Inactivity timeout (default: 300000ms = 5 minutes)

### Error Handling

Implement robust error handling:
1. **Connection Failures**: Fallback to simpler transports
2. **Resource Limits**: Reject new rooms when at capacity
3. **Crash Recovery**: Restore room state if service restarts
4. **Timeout Handling**: Auto-end rooms after max duration
5. **Network Issues**: Graceful degradation of features

### Security Requirements

1. **API Authentication**: Validate Bearer token on all endpoints
2. **CORS**: Only allow main app origin
3. **Rate Limiting**: Prevent API abuse
4. **Input Validation**: Sanitize all inputs
5. **Token Validation**: Verify JWT signatures

### Performance Considerations

1. **Scalability**: Design for horizontal scaling
2. **Resource Management**: Clean up rooms promptly
3. **Connection Pooling**: Reuse TURN connections
4. **Caching**: Cache room states in memory
5. **Monitoring**: Track resource usage per room

### Testing Requirements

Include tests for:
1. Room creation and lifecycle
2. Participant join/leave flows
3. AI Orb integration
4. Summary generation accuracy
5. WebSocket event delivery
6. Fallback mechanisms
7. Error scenarios

### Deployment Notes

The service will run on:
- Development: localhost:3001
- Production: Separate container/process from main app
- Resources: Dedicated CPU/memory for WebRTC processing

### Key Differences from Main App

Remember:
- You do NOT handle user authentication (only validate tokens)
- You do NOT access the PostgreSQL database
- You do NOT manage appointments or scheduling
- You do NOT send emails or notifications
- You ARE the sole handler of all video/WebRTC functionality

### Files Removed from Main App (For Reference)

These files were removed from the main app and their functionality should be implemented in your service:

**Core WebRTC & Room Management**:
```
/src/lib/mediasoupServer.js          - MediaSoup WebRTC server setup
/src/lib/protooSignaling.js          - Protoo signaling for MediaSoup
/src/routes/room.js                  - Room creation and joining logic
/src/routes/websocket-simple.js      - Simple WebSocket fallback
/src/routes/websocket-simple-enhanced.js - Enhanced WebSocket with tri-party
/src/services/sessionTimer.js       - Session duration management
/src/services/SessionSummaryHandler.js - Post-session summary generation
```

**AI Orb Management (Critical)**:
```
/src/services/OrbManager.js          - Complete AI Orb lifecycle management
/src/services/streamingAudioPlayer.js - AI voice streaming
/src/routes/ai-session-ws.js         - AI session WebSocket handlers
```

**Client-Side UI**:
```
/src/public/js/tri-party-webrtc.js   - Client-side WebRTC implementation
/src/views/room-coach.ejs            - Coach video call interface
/src/views/room-client.ejs           - Client video call interface  
/src/views/room-simple.ejs           - Simple room fallback view
/src/views/room-ai-hybrid.ejs        - AI hybrid tri-party view
/src/views/room-fallback.ejs         - WebSocket relay fallback view
/src/views/partials/room-base-styles.ejs - Room styling components
/src/views/debug-video.ejs           - Video debugging interface
```

**Testing & API Endpoints**:
```
/src/routes/api/ws-relay.js          - WebSocket relay API
/src/routes/api/websocket-test.js    - WebSocket testing endpoints
/src/routes/api/protoo-test.js       - Protoo testing endpoints
/src/routes/api/direct-ws-test.js    - Direct WebSocket tests
```

**Configuration & Setup**:
```
/setup-webrtc.js                    - WebRTC setup script
/diagnose-webrtc.js                 - WebRTC diagnostics
```

### Critical OrbManager.js Functionality to Recreate

The `OrbManager.js` file (733 lines) contained the complete AI Orb management system. Key components to reimplement:

**Class Structure**:
```javascript
class OrbManager {
    constructor() {
        this.orbs = new Map();                // roomId -> orbData
        this.participantCounts = new Map();   // roomId -> count
        this.cleanupTimers = new Map();       // roomId -> timer
        this.healthChecks = new Map();        // roomId -> interval
    }

    // Main methods to implement:
    async spawnOrb(roomId, sessionId, appointment)
    async terminateOrb(roomId)
    hasOrbForRoom(roomId)
    updateParticipantCount(roomId, count)
    getOrbStatus(roomId)
    cleanupAll()
}
```

**Key Features from Original OrbManager**:
1. **Dual spawning approach** (API + direct process)
2. **Health monitoring** with 30-second heartbeats
3. **Participant tracking** with cleanup timers
4. **Process lifecycle management** (spawn, monitor, terminate)
5. **Error handling** with automatic restarts
6. **Resource limits** (max concurrent orbs)
7. **Cross-directory execution** for GPU server
8. **Test mode support** with shorter lifetimes

### Success Criteria

Your ROOM service is successful when:
1. Main app can create rooms via API
2. Participants can join video calls via URLs
3. AI Orb participates naturally in conversations
4. Sessions generate useful summaries
5. Main app receives all necessary events
6. Service handles network issues gracefully
7. Performance remains stable under load

### Additional Considerations

1. **Stateless Design**: Rooms should be ephemeral, no persistent storage
2. **Event-Driven**: Use events for all state changes
3. **Fault Tolerance**: Handle component failures gracefully
4. **Observability**: Comprehensive logging and metrics
5. **Documentation**: Clear API docs and setup instructions

Build this service to be robust, scalable, and completely independent from the main Hybrid-Coach application while providing a seamless video calling experience.