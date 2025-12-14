# ROOM_HANDLER.md

## Overview

This document describes the architectural separation of room/WebRTC functionality from the main Hybrid-Coach application into a dedicated ROOMS microservice. The main app will communicate with the ROOMS service via HTTP API calls to manage video sessions while maintaining all business logic, user management, and scheduling functionality.

## Architecture Separation

### What Moves to ROOMS Service

All real-time communication and WebRTC-related functionality:
- WebRTC implementation (MediaSoup, SimplePeer, Protoo)
- WebSocket handlers for video/audio streaming
- Room lifecycle management (creation, joining, termination)
- AI Orb spawning and stream management
- TURN/STUN server integration
- Network fallback mechanisms
- Audio/video processing
- Tri-party call coordination
- Call transcription and summarization

### What Stays in Main App

All business logic and persistent data:
- User authentication and authorization
- Appointment scheduling and calendar sync
- User profiles and role management
- Payment processing
- Email notifications
- Database persistence (users, appointments, sessions, call summaries)
- Skool membership monitoring
- Session ratings and feedback
- Dashboard and non-video UI
- Room ID and Session ID generation
- JWT token generation for participants

## API Interface Definition

The main app communicates with the ROOMS service on localhost port 3001. Note: Participant names/emails are NOT sent to ROOMS service - they will be displayed client-side when users join with their tokens.

### 1. Create Room
```http
POST http://localhost:3001/api/rooms/create
Content-Type: application/json
Authorization: Bearer {ROOM_SERVICE_API_KEY}

{
  "roomId": "uuid-v4-generated-by-main-app",
  "sessionId": "session-uuid-generated-by-main-app",
  "participants": {
    "coach": {
      "id": "coach-user-id",
      "token": "jwt-token-with-name-role-embedded"
    },
    "client": {
      "id": "client-user-id",
      "token": "jwt-token-with-name-role-embedded"
    },
    "aiOrb": {
      "enabled": true,
      "personality": "supportive",
      "voiceModel": "default"
    }
  },
  "config": {
    "scheduledStartTime": "2025-06-30T15:00:00Z",
    "maxDuration": 3600,
    "features": {
      "recording": false,
      "transcription": true,
      "aiAssistance": true,
      "generateSummary": true
    }
  }
}

Response:
{
  "success": true,
  "roomId": "uuid-v4",
  "sessionId": "session-uuid",
  "status": "ready",
  "connectionUrls": {
    "coach": "http://localhost:3001/room/uuid-v4?token=xxx",
    "client": "http://localhost:3001/room/uuid-v4?token=yyy",
    "websocket": "ws://localhost:3001/events/uuid-v4"
  }
}
```

### 2. Get Room Status
```http
GET http://localhost:3001/api/rooms/{roomId}/status
Authorization: Bearer {ROOM_SERVICE_API_KEY}

Response:
{
  "roomId": "uuid-v4",
  "sessionId": "session-uuid",
  "status": "waiting|active|ended",
  "participants": {
    "coach": {
      "id": "coach-user-id",
      "connected": true,
      "joinedAt": "2025-06-30T15:00:00Z",
      "leftAt": null,
      "totalDuration": 1800
    },
    "client": {
      "id": "client-user-id", 
      "connected": false,
      "joinedAt": null,
      "leftAt": null,
      "totalDuration": 0
    },
    "aiOrb": {
      "connected": true,
      "joinedAt": "2025-06-30T15:00:05Z",
      "leftAt": null,
      "participationPercentage": 15
    }
  },
  "actualStartTime": "2025-06-30T15:00:00Z",
  "currentDuration": 1800
}
```

### 3. Get Session Summary
```http
GET http://localhost:3001/api/rooms/{roomId}/summary
Authorization: Bearer {ROOM_SERVICE_API_KEY}

Response:
{
  "roomId": "uuid-v4",
  "sessionId": "session-uuid",
  "summary": {
    "generatedAt": "2025-06-30T16:00:00Z",
    "textSummary": "During this 60-minute coaching session, the coach and client discussed strategies for managing work-life balance. Key topics included setting boundaries, prioritizing self-care, and developing a sustainable routine. The AI assistant provided supportive insights on stress management techniques. Action items: 1) Client will implement a morning routine, 2) Schedule weekly check-ins for accountability, 3) Practice the breathing exercises discussed.",
    "keyTopics": ["work-life balance", "boundaries", "self-care", "stress management"],
    "actionItems": [
      "Implement morning routine",
      "Schedule weekly check-ins",
      "Practice breathing exercises"
    ],
    "sentiment": "positive",
    "transcriptionAvailable": true,
    "participantStats": {
      "coach": {
        "talkTime": 1200,
        "talkPercentage": 40
      },
      "client": {
        "talkTime": 1500,
        "talkPercentage": 50
      },
      "aiOrb": {
        "talkTime": 300,
        "talkPercentage": 10
      }
    }
  },
  "attendance": {
    "coach": {
      "attended": true,
      "duration": 3600,
      "joinTime": "2025-06-30T15:00:00Z",
      "leaveTime": "2025-06-30T16:00:00Z"
    },
    "client": {
      "attended": true,
      "duration": 3600,
      "joinTime": "2025-06-30T15:00:00Z",
      "leaveTime": "2025-06-30T16:00:00Z"
    }
  }
}
```

### 4. End Room
```http
POST http://localhost:3001/api/rooms/{roomId}/end
Authorization: Bearer {ROOM_SERVICE_API_KEY}

{
  "reason": "session_completed|timeout|error|cancelled",
  "requestedBy": "system|coach-user-id|client-user-id"
}

Response:
{
  "success": true,
  "roomId": "uuid-v4",
  "endedAt": "2025-06-30T16:00:00Z",
  "finalDuration": 3600
}
```

### 5. Update Room Configuration
```http
PATCH http://localhost:3001/api/rooms/{roomId}/config
Authorization: Bearer {ROOM_SERVICE_API_KEY}

{
  "aiOrb": {
    "enabled": false
  },
  "features": {
    "recording": true
  }
}
```

### 6. Get Room Transcription
```http
GET http://localhost:3001/api/rooms/{roomId}/transcription
Authorization: Bearer {ROOM_SERVICE_API_KEY}

Response:
{
  "roomId": "uuid-v4",
  "transcription": {
    "format": "text|vtt|json",
    "content": "..."
  }
}
```

### 7. WebSocket Event Subscription
```javascript
// Main app subscribes to room events
const ws = new WebSocket('ws://localhost:3001/events/{roomId}?token={api_key}');

// Events emitted by ROOMS service:
ws.on('participant-joined', {
  roomId: 'uuid-v4',
  participantId: 'coach-user-id',
  participantType: 'coach|client|aiOrb',
  timestamp: '2025-06-30T15:00:00Z'
});

ws.on('participant-left', {
  roomId: 'uuid-v4',
  participantId: 'client-user-id',
  participantType: 'client',
  timestamp: '2025-06-30T15:45:00Z',
  duration: 2700
});

ws.on('room-started', {
  roomId: 'uuid-v4',
  timestamp: '2025-06-30T15:00:00Z'
});

ws.on('room-ended', {
  roomId: 'uuid-v4',
  timestamp: '2025-06-30T16:00:00Z',
  reason: 'session_completed',
  summaryReady: true
});

ws.on('summary-ready', {
  roomId: 'uuid-v4',
  timestamp: '2025-06-30T16:00:30Z'
});

ws.on('error', {
  roomId: 'uuid-v4',
  error: 'connection_failed',
  message: 'Unable to establish WebRTC connection'
});
```

## Additional Best Practice Endpoints

### 8. Health Check
```http
GET http://localhost:3001/health

Response:
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "activeRooms": 5,
  "resources": {
    "cpu": 45,
    "memory": 60,
    "connections": 15
  }
}
```

### 9. Bulk Room Status
```http
POST http://localhost:3001/api/rooms/bulk-status
Authorization: Bearer {ROOM_SERVICE_API_KEY}

{
  "roomIds": ["room1", "room2", "room3"]
}

Response:
{
  "rooms": {
    "room1": { "status": "active", "participants": 2 },
    "room2": { "status": "ended", "participants": 0 },
    "room3": { "status": "waiting", "participants": 1 }
  }
}
```

### 10. Pre-warm Room
```http
POST http://localhost:3001/api/rooms/{roomId}/pre-warm
Authorization: Bearer {ROOM_SERVICE_API_KEY}

{
  "scheduledStartTime": "2025-06-30T15:00:00Z"
}

Response:
{
  "success": true,
  "roomId": "uuid-v4",
  "resourcesAllocated": true
}
```

### 11. Room Analytics
```http
GET http://localhost:3001/api/rooms/{roomId}/analytics
Authorization: Bearer {ROOM_SERVICE_API_KEY}

Response:
{
  "roomId": "uuid-v4",
  "metrics": {
    "connectionQuality": {
      "coach": { "averageRTT": 25, "packetLoss": 0.1 },
      "client": { "averageRTT": 45, "packetLoss": 0.5 }
    },
    "bandwidth": {
      "peakUpload": 2500000,
      "peakDownload": 3500000,
      "averageUpload": 1500000,
      "averageDownload": 2000000
    },
    "reconnections": 2,
    "fallbacksUsed": ["TURN"]
  }
}
```

### 12. Configure Webhooks
```http
POST http://localhost:3001/api/webhooks
Authorization: Bearer {ROOM_SERVICE_API_KEY}

{
  "url": "https://main-app.com/webhooks/room-events",
  "events": ["room-ended", "summary-ready", "error"],
  "secret": "webhook-signing-secret"
}
```

## JWT Token Structure

The main app generates JWT tokens that embed participant information:

```javascript
{
  "userId": "user-uuid",
  "roomId": "room-uuid",
  "sessionId": "session-uuid",
  "role": "coach|client",
  "name": "John Doe",  // Display name for the room UI
  "permissions": ["video", "audio", "screen-share"],
  "exp": 1719759600
}
```

## Files Removed from Main App

### WebRTC Implementation (25 files)
```
/src/lib/mediasoupServer.js
/src/lib/protooSignaling.js
/src/public/js/tri-party-webrtc.js
/setup-webrtc.js
/diagnose-webrtc.js
/src/routes/websocket-simple.js
/src/routes/websocket-simple-enhanced.js
/src/routes/api/ws-relay.js
/src/routes/api/websocket-test.js
/src/routes/api/protoo-test.js
/src/routes/api/direct-ws-test.js
/src/views/room-coach.ejs
/src/views/room-client.ejs
/src/views/room-simple.ejs
/src/views/room-ai-hybrid.ejs
/src/views/room-fallback.ejs
/src/views/partials/room-base-styles.ejs
/src/views/debug-video.ejs
/src/routes/room.js
/src/routes/debug.js (if only contains room debugging)
/src/services/OrbManager.js
/src/routes/ai-session-ws.js
/src/services/streamingAudioPlayer.js
/src/services/sessionTimer.js
/src/services/SessionSummaryHandler.js
```

### Dependencies Removed from package.json
```json
{
  "mediasoup": "^3.x.x",
  "mediasoup-client": "^3.x.x",
  "protoo-client": "^4.x.x",
  "protoo-server": "^4.x.x",
  "simple-peer": "^9.x.x",
  "socket.io": "^4.x.x",
  "socket.io-client": "^4.x.x",
  "@twilio/webrtc": "^x.x.x"
}
```

## Files to Modify

### 1. `/src/app.js`
Remove:
- Socket.IO initialization and server attachment
- WebSocket upgrade handlers
- Room-related middleware
- Imports for removed routes

### 2. `/src/routes/schedule.js`
Modify:
- Keep roomId generation (done by main app)
- Add call to ROOMS service API when appointment is scheduled
- Store room connection URLs in appointment metadata

### 3. `/src/controllers/dashboardController.js`
Modify:
- Remove direct room joining logic
- Add redirect to ROOMS service URL with authentication token
- Show room status from ROOMS service API
- Add session summary display after calls

### 4. `/src/views/dashboard.ejs`
Modify:
- Change "Join Room" buttons to redirect to ROOMS service
- Add room status indicators from API calls
- Display session summaries and attendance

### 5. Database Schema (Prisma)
Add/Modify:
```prisma
model Session {
  // existing fields...
  summary        Json?     // Store the full summary object
  attendanceData Json?     // Store attendance details
  analytics      Json?     // Store connection quality metrics
}

model Appointment {
  // existing fields...
  roomConnectionUrls Json?  // Store ROOM service URLs
}
```

## Implementation Example

### RoomService Client
```javascript
// /src/services/roomService.js
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';

export class RoomService extends EventEmitter {
  constructor() {
    super();
    this.baseUrl = process.env.ROOM_SERVICE_URL || 'http://localhost:3001';
    this.apiKey = process.env.ROOM_SERVICE_API_KEY;
    this.webhookSecret = process.env.ROOM_WEBHOOK_SECRET;
  }

  async createRoom(appointment) {
    const roomId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    
    const participants = {
      coach: {
        id: appointment.coachId,
        token: this.generateParticipantToken({
          userId: appointment.coachId,
          roomId,
          sessionId,
          role: 'coach',
          name: appointment.coach.name
        })
      },
      client: {
        id: appointment.clientId,
        token: this.generateParticipantToken({
          userId: appointment.clientId,
          roomId,
          sessionId,
          role: 'client',
          name: appointment.client.name
        })
      },
      aiOrb: {
        enabled: appointment.includeAI || false,
        personality: 'supportive',
        voiceModel: 'default'
      }
    };

    const response = await fetch(`${this.baseUrl}/api/rooms/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        roomId,
        sessionId,
        participants,
        config: {
          scheduledStartTime: appointment.startTime,
          maxDuration: appointment.duration * 60, // convert to seconds
          features: {
            recording: false,
            transcription: true,
            aiAssistance: appointment.includeAI,
            generateSummary: true
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Room creation failed: ${response.statusText}`);
    }

    const roomData = await response.json();
    
    // Pre-warm room 5 minutes before scheduled time
    const preWarmTime = new Date(appointment.startTime).getTime() - 5 * 60 * 1000;
    setTimeout(() => {
      this.preWarmRoom(roomId);
    }, preWarmTime - Date.now());

    return { ...roomData, sessionId };
  }

  async getRoomStatus(roomId) {
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}/status`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    
    return response.json();
  }

  async getSessionSummary(roomId) {
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}/summary`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get summary: ${response.statusText}`);
    }
    
    return response.json();
  }

  async preWarmRoom(roomId) {
    await fetch(`${this.baseUrl}/api/rooms/${roomId}/pre-warm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
  }

  async endRoom(roomId, userId) {
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        reason: 'session_completed',
        requestedBy: userId
      })
    });
    
    return response.json();
  }

  subscribeToRoomEvents(roomId, handlers) {
    const ws = new WebSocket(`${this.baseUrl.replace('http', 'ws')}/events/${roomId}?token=${this.apiKey}`);
    
    ws.on('open', () => console.log(`Connected to room ${roomId} events`));
    ws.on('message', (data) => {
      const event = JSON.parse(data);
      if (handlers[event.type]) {
        handlers[event.type](event.data);
      }
    });
    ws.on('error', (error) => console.error(`Room ${roomId} WebSocket error:`, error));
    ws.on('close', () => console.log(`Disconnected from room ${roomId} events`));
    
    return ws;
  }

  generateParticipantToken(payload) {
    return jwt.sign({
      ...payload,
      permissions: ['video', 'audio', 'screen-share'],
      exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60) // 2 hours
    }, process.env.JWT_SIGNING_SECRET);
  }

  // Verify webhook signatures from ROOM service
  verifyWebhookSignature(payload, signature) {
    const expectedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return signature === expectedSig;
  }
}
```

### Modified Schedule Route with Session Management
```javascript
// /src/routes/schedule.js
import { RoomService } from '../services/roomService.js';

const roomService = new RoomService();

router.post('/schedule', async (req, res) => {
  try {
    // Create appointment in database
    const appointment = await prisma.appointment.create({
      data: {
        coachId: req.body.coachId,
        clientId: req.user.id,
        startTime: new Date(req.body.startTime),
        duration: 60,
        includeAI: req.body.includeAI || false
      },
      include: {
        coach: true,
        client: true
      }
    });

    // Create room in ROOMS service
    const roomData = await roomService.createRoom(appointment);
    
    // Update appointment with room details
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        roomId: roomData.roomId,
        roomConnectionUrls: roomData.connectionUrls
      }
    });

    // Create session record
    const session = await prisma.session.create({
      data: {
        id: roomData.sessionId,
        appointmentId: appointment.id,
        status: 'scheduled'
      }
    });

    // Subscribe to room events for this session
    const ws = roomService.subscribeToRoomEvents(roomData.roomId, {
      'room-started': async (data) => {
        await prisma.session.update({
          where: { id: session.id },
          data: {
            startTime: new Date(data.timestamp),
            status: 'active'
          }
        });
      },
      
      'participant-joined': async (data) => {
        // Track attendance
        console.log(`${data.participantType} joined at ${data.timestamp}`);
      },
      
      'room-ended': async (data) => {
        await prisma.session.update({
          where: { id: session.id },
          data: {
            endTime: new Date(data.timestamp),
            status: 'completed'
          }
        });
        
        // Close WebSocket
        ws.close();
      },
      
      'summary-ready': async (data) => {
        // Fetch and store the summary
        const summary = await roomService.getSessionSummary(roomData.roomId);
        
        await prisma.session.update({
          where: { id: session.id },
          data: {
            summary: summary.summary,
            attendanceData: summary.attendance,
            duration: summary.attendance.coach.duration || summary.attendance.client.duration
          }
        });
        
        // Send summary email to participants
        await sendSessionSummaryEmail(appointment, summary);
      }
    });

    res.json({ success: true, appointment, roomData });
  } catch (error) {
    console.error('Schedule error:', error);
    res.status(500).json({ error: 'Failed to schedule appointment' });
  }
});
```

## Environment Variables

Add to `.env`:
```env
# ROOMS Service Configuration
ROOM_SERVICE_URL=http://localhost:3001
ROOM_SERVICE_API_KEY=your-secure-api-key
ROOM_WEBHOOK_SECRET=webhook-signing-secret
JWT_SIGNING_SECRET=shared-secret-for-tokens

# Optional: Different ports for development/production
ROOM_SERVICE_PORT=3001
```

## Error Handling & Recovery

The RoomService should implement:
1. **Retry Logic**: Automatic retries for failed API calls
2. **Circuit Breaker**: Prevent cascading failures
3. **Fallback UI**: Show "service unavailable" when ROOM service is down
4. **Session Recovery**: Reconnect to existing rooms after network issues
5. **Graceful Degradation**: Allow scheduling even if ROOM service is temporarily unavailable

## Security Considerations

1. **API Key Rotation**: Implement periodic API key rotation
2. **Token Expiry**: Ensure participant tokens expire after session + buffer
3. **Rate Limiting**: Implement rate limits on ROOM service APIs
4. **Webhook Validation**: Always verify webhook signatures
5. **CORS**: Configure appropriate CORS policies for cross-origin requests

## Monitoring & Observability

Implement logging for:
- Room creation success/failure rates
- Average session duration
- Participant join/leave patterns  
- Summary generation time
- API response times
- WebSocket connection stability

## Message for ROOM Service Implementation

See the file `ROOM_SERVICE_REQUIREMENTS.md` for detailed requirements to pass to the ROOM service Claude instance.