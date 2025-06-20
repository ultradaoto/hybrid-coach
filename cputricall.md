# CPU Tri-Call Architecture & Implementation Guide

## 🎯 Overview

This document outlines the CPU-side implementation for transforming the Hybrid Coach system from a 2-party video call with separate AI audio to a true 3-party WebRTC mesh network where the AI participates as a native video/audio stream with 80ms latency. Kinda getting there, only working on Coach - AI Orb calls now, excluding the Client now. Orb looks really good.

## 🏗️ Architecture Overview

### Current Architecture (2-Party + Separate AI)
```
Video: Coach ↔ Client (WebRTC via websocket-simple.js)
Audio: AI → Base64 Files → WebSocket → Browser Audio
Latency: 200-500ms for AI responses
```

### Target Architecture (3-Party WebRTC Mesh)
```
     Coach
      ↕  ↖
   Client ↔ AI Orb

Each participant maintains 2 peer connections:
- Coach: [→Client, →AI Orb]
- Client: [→Coach, →AI Orb]  
- AI Orb: [→Coach, →Client]

Latency: <80ms for AI responses
```

## 🔧 Core Components

### 1. OrbManager - Process Lifecycle Management

```javascript
// src/services/OrbManager.js
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export class OrbManager extends EventEmitter {
    constructor() {
        super();
        this.activeOrbs = new Map(); // roomId -> OrbProcess
        this.maxConcurrentOrbs = 8;
        this.roomParticipants = new Map(); // roomId -> Set<userId>
        this.cleanupTimers = new Map(); // roomId -> timeoutId
    }

    async spawnOrb(roomId, sessionId, appointment) {
        if (this.activeOrbs.size >= this.maxConcurrentOrbs) {
            throw new Error('Maximum orb capacity reached');
        }

        const orbProcess = spawn('node', [
            'aiorb.js',
            `--room=${roomId}`,
            `--session=${sessionId}`,
            `--coach=${appointment.coachId}`,
            `--client=${appointment.clientId}`,
            `--cpu-host=localhost:3000`,
            `--max-lifetime=7200000`, // 2 hours
            `--idle-timeout=300000`,  // 5 minutes
            appointment.status === 'test' ? '--test-mode' : ''
        ].filter(Boolean), {
            cwd: process.env.GPU_SERVER_PATH || '../gpu-server',
            env: { ...process.env, NODE_ENV: 'production' }
        });

        const orb = {
            process: orbProcess,
            pid: orbProcess.pid,
            roomId,
            sessionId,
            startTime: Date.now(),
            status: 'spawning',
            lastHeartbeat: Date.now()
        };

        this.activeOrbs.set(roomId, orb);
        this.setupOrbHandlers(roomId, orbProcess);
        
        console.log(`[OrbManager] 🚀 Spawned AI Orb for room ${roomId} (PID: ${orbProcess.pid})`);
        return orb;
    }

    async killOrbByRoom(roomId) {
        const orb = this.activeOrbs.get(roomId);
        if (!orb) return;

        console.log(`[OrbManager] 🔴 Killing orb for room ${roomId} (PID: ${orb.pid})`);
        
        // Send graceful shutdown signal
        orb.process.send({ type: 'shutdown_graceful', reason: 'room_cleanup' });
        
        // Force kill after 10 seconds if still running
        setTimeout(() => {
            if (!orb.process.killed) {
                process.kill(orb.pid, 'SIGTERM');
            }
        }, 10000);

        this.activeOrbs.delete(roomId);
        this.clearCleanupTimer(roomId);
        this.emit('orb_terminated', { roomId, pid: orb.pid });
    }

    trackParticipantJoin(roomId, userId, userRole) {
        if (!this.roomParticipants.has(roomId)) {
            this.roomParticipants.set(roomId, new Set());
        }
        
        this.roomParticipants.get(roomId).add(userId);
        
        // Reset cleanup timer on activity
        this.resetCleanupTimer(roomId);
        
        console.log(`[OrbManager] 👤 ${userRole} joined room ${roomId}`);
    }

    trackParticipantLeave(roomId, userId) {
        const participants = this.roomParticipants.get(roomId);
        if (participants) {
            participants.delete(userId);
            
            if (participants.size === 0) {
                console.log(`[OrbManager] 🏃 All participants left room ${roomId}`);
                this.setCleanupTimer(roomId, 60000); // 1 minute grace period
            }
        }
    }

    setCleanupTimer(roomId, delay) {
        this.clearCleanupTimer(roomId);
        
        const timer = setTimeout(async () => {
            if (this.isRoomEmpty(roomId)) {
                console.log(`[OrbManager] 🧹 Cleanup timer triggered for room ${roomId}`);
                await this.killOrbByRoom(roomId);
            }
        }, delay);
        
        this.cleanupTimers.set(roomId, timer);
    }

    resetCleanupTimer(roomId) {
        this.clearCleanupTimer(roomId);
        // Active session gets 30 minute cleanup timer
        this.setCleanupTimer(roomId, 1800000);
    }

    clearCleanupTimer(roomId) {
        const timer = this.cleanupTimers.get(roomId);
        if (timer) {
            clearTimeout(timer);
            this.cleanupTimers.delete(roomId);
        }
    }

    isRoomEmpty(roomId) {
        const participants = this.roomParticipants.get(roomId);
        return !participants || participants.size === 0;
    }

    hasOrbForRoom(roomId) {
        return this.activeOrbs.has(roomId);
    }

    getOrbStatus(roomId) {
        const orb = this.activeOrbs.get(roomId);
        return orb ? orb.status : null;
    }

    handleOrbMessage(roomId, message) {
        const orb = this.activeOrbs.get(roomId);
        if (!orb) return;

        switch (message.type) {
            case 'orb_ready':
                orb.status = 'ready';
                console.log(`[OrbManager] ✅ AI Orb ready for room ${roomId}`);
                this.emit('orb_ready', { roomId });
                break;
                
            case 'orb_heartbeat':
                orb.lastHeartbeat = Date.now();
                break;
                
            case 'orb_error':
                console.error(`[OrbManager] ❌ Orb error in room ${roomId}:`, message.error);
                orb.status = 'error';
                this.emit('orb_error', { roomId, error: message.error });
                break;
                
            case 'session_summary':
                console.log(`[OrbManager] 📝 Received session summary for room ${roomId}`);
                this.emit('session_summary', message);
                break;
        }
    }

    setupOrbHandlers(roomId, orbProcess) {
        orbProcess.on('message', (message) => {
            this.handleOrbMessage(roomId, message);
        });

        orbProcess.on('error', (error) => {
            console.error(`[OrbManager] ❌ Orb process error for room ${roomId}:`, error);
            this.activeOrbs.delete(roomId);
        });

        orbProcess.on('exit', (code, signal) => {
            console.log(`[OrbManager] 🛑 Orb exited for room ${roomId} (code: ${code}, signal: ${signal})`);
            this.activeOrbs.delete(roomId);
            this.clearCleanupTimer(roomId);
        });

        orbProcess.stdout.on('data', (data) => {
            console.log(`[Orb ${roomId}] ${data.toString().trim()}`);
        });

        orbProcess.stderr.on('data', (data) => {
            console.error(`[Orb ${roomId} ERROR] ${data.toString().trim()}`);
        });
    }

    // Health monitoring
    startHealthMonitoring() {
        setInterval(() => {
            const now = Date.now();
            
            this.activeOrbs.forEach((orb, roomId) => {
                const timeSinceHeartbeat = now - orb.lastHeartbeat;
                
                if (timeSinceHeartbeat > 60000) { // 1 minute without heartbeat
                    console.warn(`[OrbManager] ⚠️ Orb unresponsive for room ${roomId}`);
                    orb.status = 'unresponsive';
                    
                    // Consider killing and restarting
                    if (timeSinceHeartbeat > 120000) { // 2 minutes
                        this.killOrbByRoom(roomId);
                    }
                }
            });
        }, 30000); // Check every 30 seconds
    }

    // Graceful shutdown
    async shutdown() {
        console.log('[OrbManager] 🔄 Shutting down all orbs...');
        
        const shutdownPromises = Array.from(this.activeOrbs.keys()).map(roomId => {
            return this.killOrbByRoom(roomId);
        });
        
        await Promise.all(shutdownPromises);
        console.log('[OrbManager] ✅ All orbs terminated');
    }
}

// Singleton instance
export const orbManager = new OrbManager();
orbManager.startHealthMonitoring();
```

### 2. Enhanced WebSocket Protocol for 3-Party Mesh

```javascript
// src/routes/websocket-simple-enhanced.js
import { WebSocketServer } from 'ws';

const rooms = new Map(); // roomId -> Map<userId, participant>

export function initEnhancedWebSocket(httpServer) {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const pathParts = url.pathname.split('/');
        
        if (pathParts[1] === 'ws-simple' && pathParts[2]) {
            const roomId = pathParts[2];
            
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, roomId);
            });
        }
    });

    wss.on('connection', (ws, request, roomId) => {
        console.log(`[EnhancedWS] New connection for room ${roomId}`);
        
        let currentParticipant = null;

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
        }
        const room = rooms.get(roomId);

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                switch (data.type) {
                    case 'join':
                        handleJoin(ws, room, roomId, data);
                        currentParticipant = {
                            ws,
                            userId: data.userId,
                            userRole: data.userRole,
                            participantType: data.participantType || 'human'
                        };
                        room.set(data.userId, currentParticipant);
                        break;
                        
                    case 'offer':
                    case 'answer':
                    case 'ice-candidate':
                        handleSignaling(room, currentParticipant, data);
                        break;
                        
                    case 'leave':
                        handleLeave(room, roomId, currentParticipant);
                        break;
                        
                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                }
            } catch (err) {
                console.error('[EnhancedWS] Message error:', err);
            }
        });

        ws.on('close', () => {
            handleLeave(room, roomId, currentParticipant);
        });
    });

    function handleJoin(ws, room, roomId, data) {
        console.log(`[EnhancedWS] ${data.userRole} ${data.userName} joining room ${roomId}`);
        
        // Get existing participants
        const existingParticipants = Array.from(room.values())
            .filter(p => p.userId !== data.userId)
            .map(p => ({
                userId: p.userId,
                userRole: p.userRole,
                participantType: p.participantType
            }));

        // Send peer discovery to new participant
        ws.send(JSON.stringify({
            type: 'peer-discovery',
            peers: existingParticipants
        }));

        // Notify existing participants
        room.forEach(participant => {
            if (participant.userId !== data.userId && participant.ws.readyState === ws.OPEN) {
                participant.ws.send(JSON.stringify({
                    type: 'user-joined',
                    userId: data.userId,
                    userRole: data.userRole,
                    participantType: data.participantType || 'human',
                    shouldCreateOffer: shouldCreateOffer(participant, data)
                }));
            }
        });

        console.log(`[EnhancedWS] Room ${roomId} now has ${room.size + 1} participants`);
    }

    function shouldCreateOffer(existing, joining) {
        // Deterministic offer creation based on participant type and ID
        // AI always receives offers (never creates them)
        if (joining.participantType === 'ai') return true;
        if (existing.participantType === 'ai') return false;
        
        // For human-to-human, use ID comparison
        return existing.userId < joining.userId;
    }

    function handleSignaling(room, sender, data) {
        // Enhanced signaling for targeted peer connections
        const targetId = data.toId || data.targetId;
        
        if (targetId) {
            // Targeted signaling (for 3-way mesh)
            const target = room.get(targetId);
            if (target && target.ws.readyState === target.ws.OPEN) {
                target.ws.send(JSON.stringify({
                    ...data,
                    fromId: sender.userId
                }));
            }
        } else {
            // Broadcast to all other participants (legacy support)
            room.forEach(participant => {
                if (participant.userId !== sender.userId && 
                    participant.ws.readyState === participant.ws.OPEN) {
                    participant.ws.send(JSON.stringify({
                        ...data,
                        fromId: sender.userId
                    }));
                }
            });
        }
    }

    function handleLeave(room, roomId, participant) {
        if (!participant) return;
        
        room.delete(participant.userId);
        
        // Notify others
        room.forEach(p => {
            if (p.ws.readyState === p.ws.OPEN) {
                p.ws.send(JSON.stringify({
                    type: 'user-left',
                    userId: participant.userId,
                    userRole: participant.userRole
                }));
            }
        });
        
        console.log(`[EnhancedWS] ${participant.userRole} left room ${roomId}. Room size: ${room.size}`);
        
        // Clean up empty rooms
        if (room.size === 0) {
            rooms.delete(roomId);
            console.log(`[EnhancedWS] Room ${roomId} deleted (empty)`);
        }
    }

    console.log('[EnhancedWS] Enhanced WebSocket server initialized for 3-party mesh');
}
```

### 3. Room Route Integration

```javascript
// src/routes/room-enhanced.js
import { Router } from 'express';
import { orbManager } from '../services/OrbManager.js';

const router = Router();

router.get('/:roomId', ensureAuthenticated, async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const appointment = await prisma.appointment.findUnique({ 
            where: { roomId },
            include: {
                client: true,
                coach: true
            }
        });
        
        if (!appointment) {
            return res.status(404).send('Room not found');
        }

        // Track participant joining
        orbManager.trackParticipantJoin(roomId, req.user.id, req.user.role);

        // Spawn AI orb if this is the first participant
        if (!orbManager.hasOrbForRoom(roomId)) {
            try {
                console.log(`[Room] 🎯 First participant joined, spawning AI Orb`);
                await orbManager.spawnOrb(roomId, sessionId, appointment);
                
                // Wait briefly for orb to initialize
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (err) {
                console.error('[Room] Failed to spawn AI Orb:', err);
                // Continue without AI if spawn fails
            }
        }

        // Render appropriate view based on role
        const viewName = req.user.role === 'coach' ? 'room-coach' : 'room-client';
        
        res.render(viewName, {
            title: 'AI Hybrid Coaching',
            roomId,
            user: req.user,
            sessionId,
            appointment,
            orbStatus: orbManager.getOrbStatus(roomId)
        });
    } catch (err) {
        next(err);
    }
});

// Handle participant leaving
router.post('/:roomId/leave', ensureAuthenticated, (req, res) => {
    const { roomId } = req.params;
    
    orbManager.trackParticipantLeave(roomId, req.user.id);
    
    res.json({ success: true });
});

export default router;
```

### 4. Client-Side WebRTC Enhancement

```javascript
// src/public/js/tri-party-webrtc.js
class TriPartyWebRTC {
    constructor(roomId, userId, userRole) {
        this.roomId = roomId;
        this.userId = userId;
        this.userRole = userRole;
        this.peerConnections = new Map(); // peerId -> RTCPeerConnection
        this.remoteStreams = new Map(); // peerId -> MediaStream
        this.ws = null;
        this.localStream = null;
    }

    async initialize() {
        // Get local media
        await this.setupLocalMedia();
        
        // Connect to enhanced WebSocket
        this.connectWebSocket();
    }

    async setupLocalMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: true
            });
        } catch (err) {
            console.error('Failed to get local media:', err);
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws-simple/${this.roomId}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.ws.send(JSON.stringify({
                type: 'join',
                roomId: this.roomId,
                userId: this.userId,
                userRole: this.userRole,
                userName: this.userName,
                participantType: 'human'
            }));
        };

        this.ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'peer-discovery':
                    // Initialize connections to existing peers
                    for (const peer of data.peers) {
                        await this.createPeerConnection(peer.userId, peer.participantType);
                        if (this.shouldCreateOffer(peer)) {
                            await this.createOffer(peer.userId);
                        }
                    }
                    break;
                    
                case 'user-joined':
                    await this.handleUserJoined(data);
                    break;
                    
                case 'offer':
                    await this.handleOffer(data);
                    break;
                    
                case 'answer':
                    await this.handleAnswer(data);
                    break;
                    
                case 'ice-candidate':
                    await this.handleIceCandidate(data);
                    break;
                    
                case 'user-left':
                    this.handleUserLeft(data);
                    break;
            }
        };
    }

    async createPeerConnection(peerId, participantType) {
        const configuration = {
            iceServers: await this.getIceServers()
        };
        
        const pc = new RTCPeerConnection(configuration);
        this.peerConnections.set(peerId, pc);
        
        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        pc.ontrack = (event) => {
            this.remoteStreams.set(peerId, event.streams[0]);
            this.onRemoteStream(peerId, event.streams[0], participantType);
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    toId: peerId
                }));
            }
        };
        
        return pc;
    }

    async createOffer(peerId) {
        const pc = this.peerConnections.get(peerId);
        if (!pc) return;
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        this.ws.send(JSON.stringify({
            type: 'offer',
            offer: offer,
            toId: peerId
        }));
    }

    async handleOffer(data) {
        const peerId = data.fromId;
        let pc = this.peerConnections.get(peerId);
        
        if (!pc) {
            pc = await this.createPeerConnection(peerId, 'human');
        }
        
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        this.ws.send(JSON.stringify({
            type: 'answer',
            answer: answer,
            toId: peerId
        }));
    }

    async handleAnswer(data) {
        const pc = this.peerConnections.get(data.fromId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }

    async handleIceCandidate(data) {
        const pc = this.peerConnections.get(data.fromId);
        if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }

    handleUserLeft(data) {
        const pc = this.peerConnections.get(data.userId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(data.userId);
        }
        
        this.remoteStreams.delete(data.userId);
        this.onUserLeft(data.userId);
    }

    // Callbacks for UI updates
    onRemoteStream(userId, stream, participantType) {
        // Override in implementation
    }

    onUserLeft(userId) {
        // Override in implementation
    }
}
```

## 📊 WebSocket Message Protocol

### Enhanced Message Types for 3-Party Mesh

```javascript
// Join message with participant type
{
    type: 'join',
    roomId: 'room123',
    userId: 'user456',
    userRole: 'coach|client|ai',
    userName: 'John Doe',
    participantType: 'human|ai'
}

// Peer discovery for mesh topology
{
    type: 'peer-discovery',
    peers: [
        { userId: 'coach123', userRole: 'coach', participantType: 'human' },
        { userId: 'ai-orb-456', userRole: 'ai', participantType: 'ai' }
    ]
}

// Targeted signaling messages
{
    type: 'offer|answer|ice-candidate',
    fromId: 'sender123',
    toId: 'recipient456',
    offer|answer|candidate: RTCSessionDescription|RTCIceCandidate
}

// AI-specific messages
{
    type: 'ai_status',
    status: 'ready|speaking|listening|processing',
    sessionId: 'session123'
}
```

## 🔄 Process Communication Protocol

### CPU ↔ AI Orb Communication

```javascript
// Orb status messages (orb → CPU)
{
    type: 'orb_ready',
    roomId: 'room123',
    webrtcStatus: 'connected',
    participants: ['coach123', 'client456']
}

{
    type: 'orb_heartbeat',
    roomId: 'room123',
    timestamp: Date.now(),
    metrics: {
        cpu: 45,
        memory: 512,
        latency: 78
    }
}

{
    type: 'session_summary',
    roomId: 'room123',
    sessionId: 'session456',
    clientId: 'client789',
    summary: {
        duration: 1500000,
        keyTopics: ['anxiety', 'breathing'],
        progress: 'Good progress on breath awareness',
        recommendations: 'Continue daily practice',
        transcript: [...]
    }
}

// Control messages (CPU → orb)
{
    type: 'shutdown_graceful',
    reason: 'session_complete|room_cleanup|idle_timeout|max_lifetime'
}

{
    type: 'update_participants',
    participants: ['coach123', 'client456']
}
```

## 🧩 Room Architecture Split

### Modular Structure

```
src/views/
├── room-base-shared.ejs      # Core WebRTC, media handling, shared CSS
├── room-coach.ejs             # Extends base + coach controls
├── room-client.ejs            # Extends base + minimal UI
└── partials/
    ├── video-grid.ejs         # Shared video layout
    ├── webrtc-scripts.ejs     # Shared WebRTC JavaScript
    └── ai-avatar.ejs          # AI orb visualization
```

### Template Inheritance Example

```ejs
<!-- room-base-shared.ejs -->
<!DOCTYPE html>
<html>
<head>
    <title><%= title %></title>
    <%- include('partials/shared-styles') %>
    <% if (blocks.styles) { %><%- blocks.styles %><% } %>
</head>
<body>
    <div class="main-container">
        <%- include('partials/video-grid') %>
        <% if (blocks.sidePanel) { %><%- blocks.sidePanel %><% } %>
    </div>
    
    <%- include('partials/webrtc-scripts') %>
    <% if (blocks.scripts) { %><%- blocks.scripts %><% } %>
</body>
</html>

<!-- room-coach.ejs -->
<%- include('room-base-shared', { title: 'Coach View' }) %>

<% blocks.sidePanel = `
    <div class="ai-panel coach-view">
        <%- include('partials/coach-controls') %>
        <%- include('partials/transcript-viewer') %>
        <%- include('partials/session-timer') %>
    </div>
` %>

<% blocks.scripts = `
    <script src="/js/coach-features.js"></script>
` %>
```

## 🧪 Testing Strategies

### 1. Quick Join/Leave Testing
```javascript
// Test script for rapid participant cycling
async function testQuickJoinLeave() {
    const testClient = new TriPartyWebRTC('test-room-123', 'test-user', 'client');
    await testClient.initialize();
    
    // Leave after 5 seconds
    setTimeout(() => {
        testClient.disconnect();
        console.log('Test: Client left quickly');
    }, 5000);
    
    // Verify orb cleanup after 30 seconds
    setTimeout(() => {
        checkOrbStatus('test-room-123');
    }, 35000);
}
```

### 2. Multi-Orb Stress Test
```javascript
// Spawn multiple concurrent sessions
async function stressTestMultiOrb() {
    const sessions = [];
    
    for (let i = 0; i < 6; i++) {
        const roomId = `stress-test-${i}`;
        const session = createTestSession(roomId);
        sessions.push(session);
        
        // Stagger session starts
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Monitor resource usage
    monitorOrbResources();
}
```

### 3. Cleanup Verification
```javascript
// Verify proper cleanup triggers
async function testCleanupScenarios() {
    // Test 1: Normal session end
    await testNormalSessionEnd();
    
    // Test 2: Max lifetime reached
    await testMaxLifetimeCleanup();
    
    // Test 3: Idle timeout
    await testIdleTimeoutCleanup();
    
    // Test 4: Error recovery
    await testErrorRecoveryCleanup();
}
```

## 📈 Resource Management

### Limits and Monitoring

```javascript
const resourceLimits = {
    maxConcurrentOrbs: 8,
    maxMemoryPerOrb: 2048, // MB
    maxCpuPerOrb: 50, // percentage
    maxOrbLifetime: 7200000, // 2 hours
    idleTimeout: 300000, // 5 minutes
    testModeTimeout: 30000 // 30 seconds
};

// Resource monitoring dashboard
class OrbMonitor {
    async getOrbMetrics() {
        const metrics = [];
        
        for (const [roomId, orb] of orbManager.activeOrbs) {
            const usage = await this.getProcessUsage(orb.pid);
            metrics.push({
                roomId,
                pid: orb.pid,
                uptime: Date.now() - orb.startTime,
                cpu: usage.cpu,
                memory: usage.memory,
                status: orb.status
            });
        }
        
        return metrics;
    }
}
```

## 🚀 Deployment Checklist

### Pre-deployment
- [ ] Test WebSocket protocol with 3 participants
- [ ] Verify orb spawning and cleanup
- [ ] Test resource limits (8 concurrent orbs)
- [ ] Validate session summary generation
- [ ] Check graceful shutdown procedures

### Production Configuration
```javascript
// Environment variables
ENABLE_AI_ORBS=true
MAX_CONCURRENT_ORBS=8
GPU_SERVER_PATH=/path/to/gpu-server
ORB_LOG_LEVEL=info
ORB_HEALTH_CHECK_INTERVAL=30000
ORB_CLEANUP_GRACE_PERIOD=60000
```

### Monitoring
- CPU usage per orb process
- Memory consumption trends
- WebRTC connection success rate
- Average session latency
- Orb lifecycle events

## 🚀 Production Deployment Configuration

### Directory Structure
```
Production:
/var/www/
├── myultracoach/              # CPU Server
│   └── src/services/OrbManager.js
└── hybrid-coach-gpu/          # GPU Server  
    └── aiorb.js

Development:
project-root/
├── cpu-server/                # CPU development
└── gpu-server/                # GPU development
```

### Cross-Directory Process Spawning
```javascript
// OrbManager handles production deployment paths
const gpuServerPath = process.env.GPU_SERVER_PATH || '/var/www/hybrid-coach-gpu';

// Spawn with proper working directory
const orbProcess = spawn('node', ['aiorb.js', ...args], {
    cwd: gpuServerPath,           // Execute in GPU directory
    env: {
        ...process.env,
        PWD: gpuServerPath,       // Set working directory
        CPU_SERVER_HOST: cpuHost  // Pass CPU location
    }
});
```

### Environment Variables
```bash
# CPU Server (.env)
GPU_SERVER_PATH=/var/www/hybrid-coach-gpu
CPU_HOST=localhost:3000
MAX_CONCURRENT_ORBS=8
NODE_ENV=production

# GPU Server (.env)  
CPU_SERVER_URL=http://localhost:3000
CPU_WEBSOCKET_URL=ws://localhost:3000
```

### Deployment Command Example
```bash
# What CPU executes in production:
cd /var/www/hybrid-coach-gpu && node aiorb.js \
    --room=room123 \
    --session=abc456 \
    --cpu-host=localhost:3000 \
    --max-lifetime=7200000
```

## 🔗 Integration Points with GPU Claude

### 1. WebSocket Connection
```javascript
// AI Orb connects to CPU WebSocket (production paths handled automatically)
const cpuHost = process.argv.find(arg => arg.startsWith('--cpu-host=')).split('=')[1];
const ws = new WebSocket(`ws://${cpuHost}/ws-simple/room123`);
```

### 2. Signaling Protocol
- Follow enhanced 3-party mesh protocol
- Handle peer-discovery messages
- Implement targeted offer/answer/ICE

### 3. Health Monitoring
- Send heartbeat every 30 seconds
- Include resource metrics
- Report WebRTC connection status

### 4. Session Summary
- Generate comprehensive summary on session end
- Send via process message to CPU
- Include transcript and recommendations

### 5. Process Management
- Handle command-line arguments properly
- Implement built-in kill timers
- Support cross-directory execution
- Use proper working directory resolution

This architecture creates a scalable, robust tri-party WebRTC system with intelligent process management and seamless AI integration that works in both development and production environments.