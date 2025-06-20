# Video Stream Architecture Documentation

## Overview
This document describes the ONLY WORKING video streaming architecture for the Hybrid Coach tri-party system (Coach ↔ Client ↔ AI Orb). The system uses **Enhanced WebSocket** protocol exclusively for all 3-way video calls.

**IMPORTANT**: This is a 3-way call application. Socket.IO and other WebRTC implementations DO NOT WORK. Only use Enhanced WebSocket as documented here.

## Working Implementation: Enhanced WebSocket ONLY

### Enhanced WebSocket Details
- **Endpoint**: `/ws-simple/{roomId}`
- **Purpose**: Tri-party mesh network (Coach ↔ Client ↔ AI Orb)
- **Status**: WORKING - This is the ONLY working protocol
- **File**: `/src/routes/websocket-simple-enhanced.js`
- **Protocol**: Native WebSocket (NOT Socket.IO, NOT any other WebRTC)

## AI Orb WebSocket Connection Instructions

### Connection URL
```javascript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${CPU_HOST}/ws-simple/${roomId}`;
const ws = new WebSocket(wsUrl);
```

### Join Message Format
```javascript
ws.send(JSON.stringify({
    type: 'join',
    roomId: roomId,
    userId: 'ai-orb-' + sessionId,  // Unique AI orb ID
    userName: 'AI Assistant',
    userRole: 'ai',
    participantType: 'ai'  // CRITICAL: Must be 'ai' for proper routing
}));
```

## Message Types to Handle

### 1. Peer Discovery (Initial Room State)
```javascript
{
    type: 'peer-discovery',
    peers: [
        {
            userId: 'coach-123',
            userName: 'Coach Name',
            userRole: 'coach',
            participantType: 'human'
        },
        {
            userId: 'client-456',
            userName: 'Client Name',
            userRole: 'client',
            participantType: 'human'
        }
    ]
}
```

### 2. User Joined (New Participant)
```javascript
{
    type: 'user-joined',
    userId: 'participant-id',
    userName: 'Participant Name',
    userRole: 'coach' | 'client',
    participantType: 'human',
    shouldCreateOffer: false  // AI NEVER creates offers
}
```
**Important**: When `shouldCreateOffer` is false, wait for the other party to send an offer.

**WebRTC Offer Logic Explained**:
- Coach creates offers to both Client and AI Orb
- Client creates offers to AI Orb (if Coach not present)
- AI Orb ONLY answers offers (prevents conflicts)
- This ensures deterministic mesh connection setup

### 3. WebRTC Signaling
```javascript
// Incoming Offer
{
    type: 'offer',
    offer: { type: 'offer', sdp: '...' },
    fromId: 'sender-user-id'
}

// Send Answer
ws.send(JSON.stringify({
    type: 'answer',
    answer: { type: 'answer', sdp: '...' },
    toId: 'sender-user-id'  // Target the offer sender
}));

// ICE Candidates
{
    type: 'ice-candidate',
    candidate: { ... },
    fromId: 'sender-user-id'
}

// Send ICE Candidate
ws.send(JSON.stringify({
    type: 'ice-candidate',
    candidate: { ... },
    toId: 'target-user-id'
}));
```

### 4. User Left
```javascript
{
    type: 'user-left',
    userId: 'leaving-user-id'
}
```

## WebRTC Configuration
```javascript
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
        // TURN servers will be provided by CPU instance if needed
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};
```

## AI Orb Specific Messages

### Status Updates (Send to room)
```javascript
ws.send(JSON.stringify({
    type: 'ai_status',
    status: 'ready' | 'listening' | 'thinking' | 'speaking' | 'paused',
    sessionId: sessionId
}));
```

### Heartbeat (Every 30 seconds)
```javascript
ws.send(JSON.stringify({
    type: 'ping'
}));
// Expect { type: 'pong' } response
```

### Shutdown Notification
```javascript
ws.send(JSON.stringify({
    type: 'ai-orb-shutdown',
    sessionId: sessionId,
    reason: 'session_complete' | 'timeout' | 'error'
}));
```

## Critical Implementation Notes

1. **Participant Type**: Always set `participantType: 'ai'` for AI orb connections
2. **Offer Creation**: AI orb should NEVER create offers, only answer them
3. **User ID**: Use format `'ai-orb-' + sessionId` for unique identification
4. **Connection Order**: AI orb can join at any time after coach joins
5. **Mesh Network**: AI orb needs 2 peer connections (one to coach, one to client)
6. **Protocol**: Use ONLY Enhanced WebSocket - no Socket.IO, no other WebRTC

## Example Connection Flow for AI Orb

```javascript
// 1. Connect to Enhanced WebSocket (ONLY WORKING METHOD)
const ws = new WebSocket(`ws://${CPU_HOST}/ws-simple/${roomId}`);

// 2. On connection open, join room
ws.onopen = () => {
    ws.send(JSON.stringify({
        type: 'join',
        roomId: roomId,
        userId: 'ai-orb-' + sessionId,
        userName: 'AI Assistant',
        userRole: 'ai',
        participantType: 'ai'
    }));
};

// 3. Handle peer discovery
ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
        case 'peer-discovery':
            // Create peer connections for each existing participant
            for (const peer of data.peers) {
                await createPeerConnection(peer.userId);
                // Wait for them to send offers
            }
            break;
            
        case 'user-joined':
            // New participant joined
            await createPeerConnection(data.userId);
            // Wait for offer if shouldCreateOffer is false
            break;
            
        case 'offer':
            // Handle incoming offer and send answer
            const pc = getPeerConnection(data.fromId);
            await pc.setRemoteDescription(data.offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            ws.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                toId: data.fromId
            }));
            break;
            
        case 'ice-candidate':
            // Add ICE candidate to appropriate peer connection
            const peerConnection = getPeerConnection(data.fromId);
            await peerConnection.addIceCandidate(data.candidate);
            break;
    }
};

// 4. Setup heartbeat
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
    }
}, 30000);
```

## Testing Connection
To test the Enhanced WebSocket connection from GPU server:
```bash
# Install wscat if needed
npm install -g wscat

# Connect to Enhanced WebSocket
wscat -c ws://localhost:3000/ws-simple/test-room-id

# Send join message
{"type":"join","roomId":"test-room-id","userId":"ai-orb-test","userName":"AI Test","userRole":"ai","participantType":"ai"}
```

## Debugging AI Orb Connection Issues

### 1. Check if AI Orb is attempting WebSocket connection
Look for these log messages in AI Orb:
```
[AI-Orb] 🔗 Connecting to Enhanced WebSocket: ws://CPU_HOST/ws-simple/ROOM_ID
[AI-Orb] ✅ Enhanced WebSocket connected
[AI-Orb] 📤 Sending join message: {"type":"join",...}
```

### 2. Check Enhanced WebSocket server logs
On CPU server, look for:
```
[EnhancedWS] New connection for room ROOM_ID
[EnhancedWS] ai AI Assistant joining room ROOM_ID
[EnhancedWS] Room ROOM_ID now has X participants
```

✅ **CONFIRMED WORKING**: Enhanced WebSocket connection is working correctly!
- AI Orb successfully connects to `/ws-simple/{roomId}`
- Receives `user-joined` messages from Coach/Client
- Coach/Client can see AI Orb in participant list
- Speaking indicators work for all participants

### 3. Common Issues and Solutions

**Issue**: AI Orb not connecting to WebSocket
- **Check**: Is AI Orb using correct CPU_HOST URL?
- **Check**: Is Enhanced WebSocket server running on CPU?
- **Fix**: Verify `CPU_HOST` environment variable
- **Test**: Run `node test-enhanced-ws.js` on CPU server

**Issue**: WebRTC RTCPeerConnection constructor fails
- **Symptom**: `TypeError: this.RTCPeerConnection is not a constructor`
- **Cause**: AI Orb not properly importing/initializing wrtc library in Node.js
- **Fix**: Properly import and initialize wrtc library
- **Example**: 
  ```javascript
  import wrtc from 'wrtc';
  this.RTCPeerConnection = wrtc.RTCPeerConnection;
  this.MediaStream = wrtc.MediaStream;
  this.MediaStreamTrack = wrtc.MediaStreamTrack;
  ```
- **Check**: Ensure all WebRTC APIs are from wrtc library

**Issue**: WebRTC media stream creation fails  
- **Symptom**: `TypeError: This is not an instance of MediaStreamTrack`
- **Cause**: AI Orb using wrong MediaStream constructor for Node.js
- **Fix**: Use wrtc library's MediaStream constructor
- **Example**: `new wrtc.MediaStream([videoTrack, audioTrack])`
- **Check**: Ensure video/audio tracks are from wrtc library

**Issue**: AI Orb joins but doesn't receive offers
- **Check**: Are Coach/Client using Enhanced WebSocket endpoint?
- **Check**: Is `participantType: 'ai'` set correctly?
- **Fix**: Ensure all participants use `/ws-simple/{roomId}` endpoint
- **Verify**: Check logs for "shouldCreateOffer: true" from humans to AI

**Issue**: AI Orb connects but no video appears
- **Check**: Is AI Orb sending proper video MediaStreamTrack?
- **Check**: Are offer/answer SDP negotiations completing?
- **Fix**: Monitor WebRTC connection states in logs
- **Debug**: Check if ICE candidates are being exchanged

**Issue**: Three participants but mesh incomplete
- **Check**: Are all connections established? Should see 3 total connections:
  - Coach ↔ Client (1 connection)
  - Coach ↔ AI Orb (1 connection)  
  - Client ↔ AI Orb (1 connection)
- **Fix**: Ensure each participant can create offers to newcomers

**Issue**: Database session creation errors
- **Symptom**: `Invalid prisma.session.create() invocation: Argument appointment is missing`
- **Symptom**: `Unique constraint failed on the fields: (id)`
- **Cause**: Session records require appointmentId and userId fields
- **Fix**: ✅ FIXED - Session utilities updated to not create invalid records
- **Note**: Each user gets their own session record, but shares sessionId for AI coordination

### 4. Manual Testing Steps
1. Start CPU server with Enhanced WebSocket
2. Have Coach join room (should spawn AI Orb)
3. Check AI Orb logs for WebSocket connection
4. Have Client join room
5. Verify tri-party mesh connections established

### 5. Expected Connection Flow
1. ✅ Coach joins → Spawns AI Orb via OrbManager
2. ✅ AI Orb connects to `/ws-simple/{roomId}`
3. ✅ Coach receives `user-joined` for AI Orb
4. ❌ Coach creates offers to AI Orb (BLOCKED by wrtc library issue)
5. ❌ AI Orb answers offers (BLOCKED by wrtc library issue)
6. ✅ Client joins and repeats process
7. ❌ Result: Coach ↔ Client ↔ AI Orb mesh (BLOCKED)

### 6. Current Status Analysis

**✅ WORKING:**
- Enhanced WebSocket connection (AI Orb ↔ CPU Server)
- Session management and database integration
- AI Orb spawning when Coach joins
- Participant discovery and user-joined messages
- Speaking indicator visual feedback
- Coach ↔ Client video connection

**❌ BLOCKED:**
- AI Orb WebRTC peer connections (`this.RTCPeerConnection is not a constructor`)
- AI Orb video/audio streaming
- Tri-party mesh completion

**🔧 NEXT STEP FOR GPU CLAUDE:**
Fix the wrtc library initialization in the AI Orb's WebRTC manager:
```javascript
// At the top of webrtcManager.js
import wrtc from 'wrtc';

// In the constructor or initialization method
this.RTCPeerConnection = wrtc.RTCPeerConnection;
this.MediaStream = wrtc.MediaStream;
this.RTCSessionDescription = wrtc.RTCSessionDescription;
this.RTCIceCandidate = wrtc.RTCIceCandidate;
```

## What NOT to Use (These DO NOT WORK)

1. **DO NOT** use Socket.IO - it does not work for 3-way calls
2. **DO NOT** use any other WebRTC implementation 
3. **DO NOT** change the `/ws-simple/` endpoint path
4. **DO NOT** try to use 2-party video protocols
5. **DO NOT** have the AI orb create WebRTC offers

## Summary
The ONLY working video system for this 3-way call application:
- **Enhanced WebSocket** protocol exclusively
- Native WebSocket (not Socket.IO) at `/ws-simple/{roomId}`
- Mesh topology where each participant connects to all others
- AI orb as a passive participant that only answers offers
- ALL participants (coach, client, AI orb) use the same Enhanced WebSocket protocol

This is a 3-way call application. The Enhanced WebSocket protocol documented above is the ONLY working implementation.