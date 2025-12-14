# LiveKit Migration Guide: 3-Way Voice Coaching Rooms

## Mission

Replace the current Bun WebSocket + manual WebRTC system with **LiveKit** to enable true 3-way coaching calls: **Human Client + Human Coach + AI Orb**.

By the end of this guide, you'll have:
- ✅ Client joins LiveKit room, publishes mic/camera
- ✅ Coach joins same room, publishes mic/camera, sees client
- ✅ AI Agent joins as participant, publishes AI voice
- ✅ Orb animates based on AI audio track
- ✅ Coach can mute their audio from AI perception
- ✅ Full transcription via Deepgram

---

## Why LiveKit > WebSocket + WebRTC

| Feature | Current (WS + WebRTC) | LiveKit |
|---------|----------------------|---------|
| Multi-party | ❌ 1:1 only | ✅ Native N-way |
| Signaling | Manual WebSocket | ✅ Built-in |
| ICE/TURN | Manual config | ✅ Handled |
| AI as participant | ❌ Not possible | ✅ Native support |
| Track control | ❌ None | ✅ Subscribe/unsubscribe per track |
| Scaling | ❌ P2P doesn't scale | ✅ SFU architecture |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LiveKit Cloud                                      │
│                     (or self-hosted LiveKit Server)                          │
│                                                                              │
│                         ┌─────────────────┐                                  │
│                         │   LiveKit SFU   │                                  │
│                         │                 │                                  │
│                         │  Room: session-123                                 │
│                         │                 │                                  │
│                         └────────┬────────┘                                  │
│                                  │                                           │
│              ┌───────────────────┼───────────────────┐                      │
│              │                   │                   │                      │
│              ▼                   ▼                   ▼                      │
│    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐             │
│    │     Client      │ │      Coach      │ │    AI Agent     │             │
│    │   (Browser)     │ │    (Browser)    │ │    (Node.js)    │             │
│    │                 │ │                 │ │                 │             │
│    │ • Publishes mic │ │ • Publishes mic │ │ • Subscribes to │             │
│    │ • Publishes cam │ │ • Publishes cam │ │   client+coach  │             │
│    │ • Sees coach    │ │ • Sees client   │ │ • Publishes AI  │             │
│    │ • Sees AI orb   │ │ • Sees AI orb   │ │   voice track   │             │
│    │ • Hears AI      │ │ • Hears AI      │ │                 │             │
│    └─────────────────┘ │ • Can mute self │ └─────────────────┘             │
│                        │   from AI       │                                  │
│                        └─────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Install LiveKit Dependencies

### API Server (apps/api)

```bash
cd apps/api
bun add livekit-server-sdk
```

### Web Client (apps/web-client)

```bash
cd apps/web-client
bun add livekit-client @livekit/components-react
```

### Web Coach (apps/web-coach)

```bash
cd apps/web-coach
bun add livekit-client @livekit/components-react
```

### AI Agent (services/ai-agent)

```bash
cd services/ai-agent
npm install @livekit/rtc-node livekit-server-sdk
```

---

## Step 2: Environment Variables

Add to your `.env`:

```bash
# LiveKit Cloud (you already have this!)
LIVEKIT_URL=wss://myultracoach25-fmpbcrwc.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Or self-hosted:
# LIVEKIT_URL=wss://livekit.myultra.coach
```

---

## Step 3: API Token Generation

Create a new route for generating LiveKit tokens.

**File: `apps/api/src/routes/livekit.ts`**

```typescript
import { Hono } from 'hono';
import { AccessToken, VideoGrant } from 'livekit-server-sdk';
import { authMiddleware } from '../middleware/auth';

const livekit = new Hono();

interface TokenRequest {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  role: 'client' | 'coach' | 'ai-agent';
}

// POST /api/livekit/token
livekit.post('/token', authMiddleware, async (c) => {
  const { roomName, participantName, participantIdentity, role } = await c.req.json<TokenRequest>();
  
  if (!roomName || !participantIdentity) {
    return c.json({ success: false, error: 'Missing roomName or participantIdentity' }, 400);
  }
  
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    return c.json({ success: false, error: 'LiveKit not configured' }, 500);
  }
  
  // Create access token
  const token = new AccessToken(apiKey, apiSecret, {
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
    grant.canPublishSources = ['microphone'];
  }
  
  token.addGrant(grant);
  
  const jwt = await token.toJwt();
  
  return c.json({
    success: true,
    data: {
      token: jwt,
      url: process.env.LIVEKIT_URL,
      roomName,
    }
  });
});

// POST /api/livekit/create-room
livekit.post('/create-room', authMiddleware, async (c) => {
  const { roomName, emptyTimeout = 600 } = await c.req.json();
  
  // Room is created automatically when first participant joins
  // But we can pre-create with settings if needed
  
  // Generate a unique room name if not provided
  const finalRoomName = roomName || `session-${crypto.randomUUID()}`;
  
  return c.json({
    success: true,
    data: {
      roomName: finalRoomName,
      livekitUrl: process.env.LIVEKIT_URL,
    }
  });
});

export default livekit;
```

**Register the route in `apps/api/src/index.ts`:**

```typescript
import livekit from './routes/livekit';

// ... existing routes ...
app.route('/api/livekit', livekit);
```

---

## Step 4: LiveKit Room Hook

Create a reusable hook for LiveKit room connection.

**File: `packages/ui/src/hooks/useLiveKitRoom.ts`**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  LocalParticipant,
  ConnectionState,
} from 'livekit-client';

export interface ParticipantInfo {
  identity: string;
  name: string;
  isSpeaking: boolean;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  isLocal: boolean;
  metadata?: string;
}

export interface UseLiveKitRoomOptions {
  url: string;
  token: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onParticipantJoined?: (participant: ParticipantInfo) => void;
  onParticipantLeft?: (identity: string) => void;
  onError?: (error: Error) => void;
}

export interface UseLiveKitRoomReturn {
  room: Room | null;
  connectionState: ConnectionState;
  localParticipant: ParticipantInfo | null;
  remoteParticipants: Map<string, ParticipantInfo>;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  getParticipantAudioStream: (identity: string) => MediaStream | null;
}

export function useLiveKitRoom(options: UseLiveKitRoomOptions): UseLiveKitRoomReturn {
  const { url, token, onConnected, onDisconnected, onParticipantJoined, onParticipantLeft, onError } = options;
  
  const roomRef = useRef<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [localParticipant, setLocalParticipant] = useState<ParticipantInfo | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, ParticipantInfo>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  
  // Convert LiveKit participant to our ParticipantInfo
  const toParticipantInfo = useCallback((participant: Participant, isLocal: boolean): ParticipantInfo => {
    let audioTrack: MediaStreamTrack | null = null;
    let videoTrack: MediaStreamTrack | null = null;
    
    participant.trackPublications.forEach((pub) => {
      if (pub.track) {
        if (pub.track.kind === Track.Kind.Audio) {
          audioTrack = pub.track.mediaStreamTrack;
        } else if (pub.track.kind === Track.Kind.Video) {
          videoTrack = pub.track.mediaStreamTrack;
        }
      }
    });
    
    return {
      identity: participant.identity,
      name: participant.name || participant.identity,
      isSpeaking: participant.isSpeaking,
      audioTrack,
      videoTrack,
      isLocal,
      metadata: participant.metadata,
    };
  }, []);
  
  // Update remote participants map
  const updateRemoteParticipants = useCallback(() => {
    if (!roomRef.current) return;
    
    const newMap = new Map<string, ParticipantInfo>();
    roomRef.current.remoteParticipants.forEach((participant) => {
      newMap.set(participant.identity, toParticipantInfo(participant, false));
    });
    setRemoteParticipants(newMap);
  }, [toParticipantInfo]);
  
  // Connect to room
  const connect = useCallback(async () => {
    if (roomRef.current?.state === ConnectionState.Connected) {
      console.log('[LiveKit] Already connected');
      return;
    }
    
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 640, height: 480, frameRate: 24 },
      },
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    
    roomRef.current = room;
    
    // Set up event listeners
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('[LiveKit] Connection state:', state);
      setConnectionState(state);
      
      if (state === ConnectionState.Connected) {
        onConnected?.();
      } else if (state === ConnectionState.Disconnected) {
        onDisconnected?.();
      }
    });
    
    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log('[LiveKit] Participant joined:', participant.identity);
      updateRemoteParticipants();
      onParticipantJoined?.(toParticipantInfo(participant, false));
    });
    
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('[LiveKit] Participant left:', participant.identity);
      updateRemoteParticipants();
      onParticipantLeft?.(participant.identity);
    });
    
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('[LiveKit] Track subscribed:', track.kind, 'from', participant.identity);
      updateRemoteParticipants();
    });
    
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('[LiveKit] Track unsubscribed:', track.kind, 'from', participant.identity);
      updateRemoteParticipants();
    });
    
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      updateRemoteParticipants();
      if (room.localParticipant) {
        setLocalParticipant(toParticipantInfo(room.localParticipant, true));
      }
    });
    
    room.on(RoomEvent.LocalTrackPublished, () => {
      if (room.localParticipant) {
        setLocalParticipant(toParticipantInfo(room.localParticipant, true));
      }
    });
    
    try {
      // Connect to room
      await room.connect(url, token);
      console.log('[LiveKit] Connected to room:', room.name);
      
      // Enable camera and microphone
      await room.localParticipant.enableCameraAndMicrophone();
      console.log('[LiveKit] Camera and microphone enabled');
      
      setLocalParticipant(toParticipantInfo(room.localParticipant, true));
      updateRemoteParticipants();
      
    } catch (error) {
      console.error('[LiveKit] Connection error:', error);
      onError?.(error as Error);
      throw error;
    }
  }, [url, token, onConnected, onDisconnected, onParticipantJoined, onParticipantLeft, onError, toParticipantInfo, updateRemoteParticipants]);
  
  // Disconnect from room
  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  }, []);
  
  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;
    
    const enabled = roomRef.current.localParticipant.isMicrophoneEnabled;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!enabled);
    setIsAudioEnabled(!enabled);
  }, []);
  
  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;
    
    const enabled = roomRef.current.localParticipant.isCameraEnabled;
    await roomRef.current.localParticipant.setCameraEnabled(!enabled);
    setIsVideoEnabled(!enabled);
  }, []);
  
  // Get audio stream for a participant (for Orb visualization)
  const getParticipantAudioStream = useCallback((identity: string): MediaStream | null => {
    if (!roomRef.current) return null;
    
    const participant = identity === roomRef.current.localParticipant.identity
      ? roomRef.current.localParticipant
      : roomRef.current.remoteParticipants.get(identity);
    
    if (!participant) return null;
    
    let audioTrack: MediaStreamTrack | null = null;
    
    participant.trackPublications.forEach((pub) => {
      if (pub.track?.kind === Track.Kind.Audio) {
        audioTrack = pub.track.mediaStreamTrack;
      }
    });
    
    if (audioTrack) {
      return new MediaStream([audioTrack]);
    }
    
    return null;
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  return {
    room: roomRef.current,
    connectionState,
    localParticipant,
    remoteParticipants,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    getParticipantAudioStream,
  };
}
```

---

## Step 5: Update Client Room (apps/web-client)

Replace the WebSocket + WebRTC code with LiveKit.

**File: `apps/web-client/src/pages/CallRoom.tsx`**

```typescript
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Orb } from '@myultra/ui';
import { useLiveKitRoom, ParticipantInfo } from '@myultra/ui/hooks/useLiveKitRoom';
import { ConnectionState } from 'livekit-client';
import './room.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function CallRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiParticipant, setAiParticipant] = useState<ParticipantInfo | null>(null);
  const [coachParticipant, setCoachParticipant] = useState<ParticipantInfo | null>(null);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const coachVideoRef = useRef<HTMLVideoElement>(null);
  
  // Get token from API
  useEffect(() => {
    async function getToken() {
      try {
        const authToken = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/livekit/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            roomName: roomId,
            participantName: 'Client',
            participantIdentity: `client-${crypto.randomUUID().slice(0, 8)}`,
            role: 'client',
          }),
        });
        
        const data = await response.json();
        
        if (data.success) {
          setToken(data.data.token);
          setLivekitUrl(data.data.url);
        } else {
          setError(data.error || 'Failed to get token');
        }
      } catch (err) {
        setError('Network error');
        console.error(err);
      }
    }
    
    if (roomId) {
      getToken();
    }
  }, [roomId]);
  
  // LiveKit room connection
  const {
    room,
    connectionState,
    localParticipant,
    remoteParticipants,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    getParticipantAudioStream,
  } = useLiveKitRoom({
    url: livekitUrl || '',
    token: token || '',
    onParticipantJoined: (participant) => {
      console.log('[Room] Participant joined:', participant.identity, participant.name);
      
      // Identify AI agent by identity prefix
      if (participant.identity.startsWith('ai-')) {
        setAiParticipant(participant);
      } else if (participant.identity.startsWith('coach-')) {
        setCoachParticipant(participant);
      }
    },
    onParticipantLeft: (identity) => {
      console.log('[Room] Participant left:', identity);
      
      if (identity.startsWith('ai-')) {
        setAiParticipant(null);
      } else if (identity.startsWith('coach-')) {
        setCoachParticipant(null);
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });
  
  // Connect when token is ready
  useEffect(() => {
    if (token && livekitUrl) {
      connect();
    }
  }, [token, livekitUrl, connect]);
  
  // Attach local video
  useEffect(() => {
    if (localParticipant?.videoTrack && localVideoRef.current) {
      localVideoRef.current.srcObject = new MediaStream([localParticipant.videoTrack]);
    }
  }, [localParticipant?.videoTrack]);
  
  // Attach coach video
  useEffect(() => {
    if (coachParticipant?.videoTrack && coachVideoRef.current) {
      coachVideoRef.current.srcObject = new MediaStream([coachParticipant.videoTrack]);
    }
  }, [coachParticipant?.videoTrack]);
  
  // Get AI audio stream for Orb
  const aiAudioStream = aiParticipant 
    ? getParticipantAudioStream(aiParticipant.identity)
    : null;
  
  const handleExit = () => {
    disconnect();
    navigate('/dashboard');
  };
  
  if (error) {
    return (
      <div className="room-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }
  
  return (
    <div className="call-room">
      <header className="room-header">
        <h1>Your Coaching Session</h1>
        <span className="session-id">Room: {roomId}</span>
        <span className={`connection-status ${connectionState.toLowerCase()}`}>
          {connectionState === ConnectionState.Connected ? '🟢 Connected' : '🟡 ' + connectionState}
        </span>
      </header>
      
      <div className="status-bar">
        <span className="welcome-message">
          {aiParticipant ? 'AI Coach is here!' : 'Waiting for AI Coach...'}
          {coachParticipant ? ' Human coach is here!' : ''}
        </span>
      </div>
      
      <div className="participants-grid">
        {/* Local (Client) Video */}
        <div className="participant-tile local">
          <video ref={localVideoRef} autoPlay muted playsInline />
          <span className="participant-name">You</span>
        </div>
        
        {/* Coach Video */}
        <div className="participant-tile coach">
          {coachParticipant ? (
            <video ref={coachVideoRef} autoPlay playsInline />
          ) : (
            <div className="waiting-placeholder">Waiting for coach...</div>
          )}
          <span className="participant-name">Coach</span>
        </div>
        
        {/* AI Orb */}
        <div className="participant-tile ai-coach">
          <Orb 
            label="AI Coach"
            stream={aiAudioStream}  // ← Real AI audio makes the Orb animate!
            size={140}
          />
          <span className="participant-name">Ultra Coach</span>
          <span className="participant-role">AI Coach</span>
        </div>
      </div>
      
      <div className="controls-bar">
        <button 
          className={`control-btn ${!isVideoEnabled ? 'off' : ''}`}
          onClick={toggleVideo}
        >
          📹 Video {isVideoEnabled ? 'On' : 'Off'}
        </button>
        <button 
          className={`control-btn ${!isAudioEnabled ? 'off' : ''}`}
          onClick={toggleAudio}
        >
          🎤 Audio {isAudioEnabled ? 'On' : 'Off'}
        </button>
        <button className="control-btn exit" onClick={handleExit}>
          🚪 Exit
        </button>
      </div>
      
      {/* Hidden audio elements for playback */}
      {Array.from(remoteParticipants.values()).map((participant) => (
        participant.audioTrack && (
          <audio
            key={participant.identity}
            autoPlay
            ref={(el) => {
              if (el && participant.audioTrack) {
                el.srcObject = new MediaStream([participant.audioTrack]);
              }
            }}
          />
        )
      ))}
    </div>
  );
}

export default CallRoom;
```

---

## Step 6: Update Coach Room (apps/web-coach)

Similar to client, but with coach controls.

**File: `apps/web-coach/src/pages/CallRoom.tsx`**

```typescript
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Orb } from '@myultra/ui';
import { useLiveKitRoom, ParticipantInfo } from '@myultra/ui/hooks/useLiveKitRoom';
import { ConnectionState, DataPacket_Kind } from 'livekit-client';
import './room.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function CallRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiParticipant, setAiParticipant] = useState<ParticipantInfo | null>(null);
  const [clientParticipant, setClientParticipant] = useState<ParticipantInfo | null>(null);
  const [isMutedFromAI, setIsMutedFromAI] = useState(false);
  const [whisperText, setWhisperText] = useState('');
  const [transcript, setTranscript] = useState<Array<{ role: string; content: string; time: string }>>([]);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const clientVideoRef = useRef<HTMLVideoElement>(null);
  
  // Get token from API
  useEffect(() => {
    async function getToken() {
      try {
        const authToken = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/livekit/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            roomName: roomId,
            participantName: 'Coach',
            participantIdentity: `coach-${crypto.randomUUID().slice(0, 8)}`,
            role: 'coach',
          }),
        });
        
        const data = await response.json();
        
        if (data.success) {
          setToken(data.data.token);
          setLivekitUrl(data.data.url);
        } else {
          setError(data.error || 'Failed to get token');
        }
      } catch (err) {
        setError('Network error');
        console.error(err);
      }
    }
    
    if (roomId) {
      getToken();
    }
  }, [roomId]);
  
  // LiveKit room connection
  const {
    room,
    connectionState,
    localParticipant,
    remoteParticipants,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    getParticipantAudioStream,
  } = useLiveKitRoom({
    url: livekitUrl || '',
    token: token || '',
    onParticipantJoined: (participant) => {
      console.log('[Room] Participant joined:', participant.identity);
      
      if (participant.identity.startsWith('ai-')) {
        setAiParticipant(participant);
      } else if (participant.identity.startsWith('client-')) {
        setClientParticipant(participant);
      }
    },
    onParticipantLeft: (identity) => {
      if (identity.startsWith('ai-')) {
        setAiParticipant(null);
      } else if (identity.startsWith('client-')) {
        setClientParticipant(null);
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });
  
  // Listen for data messages (transcripts from AI agent)
  useEffect(() => {
    if (!room) return;
    
    const handleDataReceived = (payload: Uint8Array, participant: any) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload));
        
        if (message.type === 'transcript') {
          setTranscript((prev) => [...prev, {
            role: message.role,
            content: message.content,
            time: new Date().toLocaleTimeString(),
          }]);
        }
      } catch (e) {
        console.error('Failed to parse data message:', e);
      }
    };
    
    room.on('dataReceived', handleDataReceived);
    
    return () => {
      room.off('dataReceived', handleDataReceived);
    };
  }, [room]);
  
  // Connect when token is ready
  useEffect(() => {
    if (token && livekitUrl) {
      connect();
    }
  }, [token, livekitUrl, connect]);
  
  // Attach local video
  useEffect(() => {
    if (localParticipant?.videoTrack && localVideoRef.current) {
      localVideoRef.current.srcObject = new MediaStream([localParticipant.videoTrack]);
    }
  }, [localParticipant?.videoTrack]);
  
  // Attach client video
  useEffect(() => {
    if (clientParticipant?.videoTrack && clientVideoRef.current) {
      clientVideoRef.current.srcObject = new MediaStream([clientParticipant.videoTrack]);
    }
  }, [clientParticipant?.videoTrack]);
  
  // Get AI audio stream for Orb
  const aiAudioStream = aiParticipant 
    ? getParticipantAudioStream(aiParticipant.identity)
    : null;
  
  // Coach mute from AI (send data message to AI agent)
  const handleMuteFromAI = useCallback(() => {
    if (!room) return;
    
    const newMuted = !isMutedFromAI;
    setIsMutedFromAI(newMuted);
    
    // Send data message to AI agent
    const message = JSON.stringify({
      type: 'coach_mute',
      muted: newMuted,
      coachIdentity: localParticipant?.identity,
    });
    
    room.localParticipant.publishData(
      new TextEncoder().encode(message),
      { reliable: true }
    );
    
    console.log('[Coach] Mute from AI:', newMuted);
  }, [room, isMutedFromAI, localParticipant]);
  
  // Coach whisper (send silent context to AI)
  const handleWhisper = useCallback(() => {
    if (!room || !whisperText.trim()) return;
    
    const message = JSON.stringify({
      type: 'coach_whisper',
      text: whisperText.trim(),
    });
    
    room.localParticipant.publishData(
      new TextEncoder().encode(message),
      { reliable: true }
    );
    
    console.log('[Coach] Whisper sent:', whisperText);
    setWhisperText('');
  }, [room, whisperText]);
  
  const handleExit = () => {
    disconnect();
    navigate('/dashboard');
  };
  
  if (error) {
    return (
      <div className="room-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }
  
  return (
    <div className="call-room coach-view">
      <header className="room-header">
        <h1>Coaching Session</h1>
        <span className="session-id">Room: {roomId}</span>
        <span className={`connection-status ${connectionState.toLowerCase()}`}>
          {connectionState === ConnectionState.Connected ? '🟢 Connected' : '🟡 ' + connectionState}
        </span>
      </header>
      
      <div className="main-content">
        <div className="video-section">
          <div className="participants-grid">
            {/* Local (Coach) Video */}
            <div className="participant-tile local">
              <video ref={localVideoRef} autoPlay muted playsInline />
              <span className="participant-name">You (Coach)</span>
            </div>
            
            {/* Client Video */}
            <div className="participant-tile client">
              {clientParticipant ? (
                <video ref={clientVideoRef} autoPlay playsInline />
              ) : (
                <div className="waiting-placeholder">Waiting for client...</div>
              )}
              <span className="participant-name">Client</span>
            </div>
            
            {/* AI Orb */}
            <div className="participant-tile ai-coach">
              <Orb 
                label="AI Coach"
                stream={aiAudioStream}
                size={140}
              />
              <span className="participant-name">Ultra Coach</span>
            </div>
          </div>
          
          {/* Coach Controls */}
          <div className="coach-controls">
            <button 
              className={`control-btn ${!isVideoEnabled ? 'off' : ''}`}
              onClick={toggleVideo}
            >
              📹 Video
            </button>
            <button 
              className={`control-btn ${!isAudioEnabled ? 'off' : ''}`}
              onClick={toggleAudio}
            >
              🎤 Audio
            </button>
            <button 
              className={`control-btn ai-mute ${isMutedFromAI ? 'active' : ''}`}
              onClick={handleMuteFromAI}
            >
              {isMutedFromAI ? '🔇 Unmute from AI' : '🔊 Mute from AI'}
            </button>
            <button className="control-btn exit" onClick={handleExit}>
              🚪 Exit
            </button>
          </div>
          
          {/* Whisper Input */}
          <div className="whisper-section">
            <input
              type="text"
              placeholder="Whisper to AI (silent context)..."
              value={whisperText}
              onChange={(e) => setWhisperText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWhisper()}
            />
            <button onClick={handleWhisper}>Send Whisper</button>
          </div>
        </div>
        
        {/* Transcript Panel */}
        <div className="transcript-panel">
          <h3>Live Transcript</h3>
          <div className="transcript-content">
            {transcript.map((entry, i) => (
              <div key={i} className={`transcript-entry ${entry.role}`}>
                <span className="time">{entry.time}</span>
                <span className="role">{entry.role}:</span>
                <span className="content">{entry.content}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Hidden audio elements */}
      {Array.from(remoteParticipants.values()).map((participant) => (
        participant.audioTrack && (
          <audio
            key={participant.identity}
            autoPlay
            ref={(el) => {
              if (el && participant.audioTrack) {
                el.srcObject = new MediaStream([participant.audioTrack]);
              }
            }}
          />
        )
      ))}
    </div>
  );
}

export default CallRoom;
```

---

## Step 7: Update AI Agent to Join LiveKit Room

The AI agent joins as a LiveKit participant and publishes AI audio.

**File: `services/ai-agent/src/livekit-agent.ts`**

```typescript
import { Room, RoomEvent, LocalAudioTrack, TrackPublishOptions, AudioSource } from '@livekit/rtc-node';
import { AccessToken, VideoGrant } from 'livekit-server-sdk';
import { DualConnectionManager } from './connections/connection-manager';
import { EventEmitter } from 'events';

export class LiveKitAgent extends EventEmitter {
  private room: Room | null = null;
  private connectionManager: DualConnectionManager | null = null;
  private audioSource: AudioSource | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private mutedParticipants = new Set<string>();
  
  constructor(
    private livekitUrl: string,
    private apiKey: string,
    private apiSecret: string
  ) {
    super();
  }
  
  async joinRoom(roomName: string): Promise<void> {
    console.log(`[LiveKitAgent] Joining room: ${roomName}`);
    
    // Generate token for AI agent
    const token = await this.generateToken(roomName);
    
    // Create room instance
    this.room = new Room();
    
    // Set up event handlers
    this.setupRoomEvents();
    
    // Connect to room
    await this.room.connect(this.livekitUrl, token);
    console.log(`[LiveKitAgent] Connected to room: ${roomName}`);
    
    // Initialize Deepgram connection manager
    this.connectionManager = new DualConnectionManager();
    await this.connectionManager.initialize();
    
    // Set up AI audio output
    this.setupAudioOutput();
    
    // Handle incoming audio from Deepgram
    this.connectionManager.on('ai-audio', (audioBuffer: Buffer) => {
      this.publishAudioFrame(audioBuffer);
    });
    
    // Handle transcripts
    this.connectionManager.on('transcript', (data) => {
      this.broadcastTranscript(data);
    });
    
    console.log('[LiveKitAgent] Ready to process audio');
  }
  
  private async generateToken(roomName: string): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: `ai-coach-${Date.now()}`,
      name: 'Ultra Coach',
      ttl: '4h',
    });
    
    const grant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    };
    
    token.addGrant(grant);
    return token.toJwt();
  }
  
  private setupRoomEvents(): void {
    if (!this.room) return;
    
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log(`[LiveKitAgent] Participant connected: ${participant.identity}`);
    });
    
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log(`[LiveKitAgent] Participant disconnected: ${participant.identity}`);
      this.mutedParticipants.delete(participant.identity);
    });
    
    // Handle incoming audio from participants
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === 'audio') {
        console.log(`[LiveKitAgent] Subscribed to audio from: ${participant.identity}`);
        
        // Process audio frames
        track.on('audioFrame', (frame) => {
          // Check if this participant is muted from AI
          if (this.mutedParticipants.has(participant.identity)) {
            // Still send to transcription, but not voice agent
            this.connectionManager?.routeAudioMuted(
              frame.data,
              participant.identity,
              participant.name || participant.identity
            );
          } else {
            // Normal routing
            this.connectionManager?.routeAudio(
              frame.data,
              participant.identity,
              participant.name || participant.identity
            );
          }
        });
      }
    });
    
    // Handle data messages (coach commands)
    this.room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload));
        this.handleDataMessage(message, participant?.identity || 'unknown');
      } catch (e) {
        console.error('[LiveKitAgent] Failed to parse data message:', e);
      }
    });
  }
  
  private handleDataMessage(message: any, senderIdentity: string): void {
    console.log(`[LiveKitAgent] Data message from ${senderIdentity}:`, message.type);
    
    switch (message.type) {
      case 'coach_mute':
        if (message.muted) {
          this.mutedParticipants.add(message.coachIdentity || senderIdentity);
          this.connectionManager?.muteParticipant(message.coachIdentity || senderIdentity);
        } else {
          this.mutedParticipants.delete(message.coachIdentity || senderIdentity);
          this.connectionManager?.unmuteParticipant(message.coachIdentity || senderIdentity);
        }
        break;
        
      case 'coach_whisper':
        this.connectionManager?.sendCoachWhisper(message.text);
        break;
    }
  }
  
  private async setupAudioOutput(): Promise<void> {
    if (!this.room) return;
    
    // Create audio source for publishing AI voice
    this.audioSource = new AudioSource(16000, 1); // 16kHz mono
    this.localAudioTrack = LocalAudioTrack.createAudioTrack('ai-voice', this.audioSource);
    
    // Publish the track
    const options: TrackPublishOptions = {
      name: 'ai-voice',
      source: 'microphone',
    };
    
    await this.room.localParticipant.publishTrack(this.localAudioTrack, options);
    console.log('[LiveKitAgent] AI audio track published');
  }
  
  private publishAudioFrame(audioBuffer: Buffer): void {
    if (!this.audioSource) return;
    
    // Convert Buffer to Int16Array (Deepgram sends linear16 PCM)
    const int16Data = new Int16Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.length / 2
    );
    
    // Create audio frame
    const frame = {
      data: int16Data,
      sampleRate: 16000,
      channels: 1,
      samplesPerChannel: int16Data.length,
    };
    
    // Push to audio source
    this.audioSource.captureFrame(frame);
  }
  
  private broadcastTranscript(data: { role: string; content: string }): void {
    if (!this.room) return;
    
    const message = JSON.stringify({
      type: 'transcript',
      role: data.role,
      content: data.content,
      timestamp: Date.now(),
    });
    
    this.room.localParticipant.publishData(
      new TextEncoder().encode(message),
      { reliable: true }
    );
  }
  
  async leaveRoom(): Promise<void> {
    console.log('[LiveKitAgent] Leaving room');
    
    await this.connectionManager?.close();
    await this.room?.disconnect();
    
    this.room = null;
    this.connectionManager = null;
  }
}
```

---

## Step 8: Update AI Agent Entry Point

**File: `services/ai-agent/src/index.ts`**

```typescript
import { LiveKitAgent } from './livekit-agent';

async function main() {
  const roomName = process.env.ROOM_NAME || process.argv[2];
  
  if (!roomName) {
    console.error('Usage: npm run start -- <room-name>');
    console.error('Or set ROOM_NAME environment variable');
    process.exit(1);
  }
  
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  
  if (!livekitUrl || !apiKey || !apiSecret) {
    console.error('Missing LiveKit credentials in environment');
    process.exit(1);
  }
  
  console.log('============================================================');
  console.log('🤖 Hybrid-Coach AI Agent - LiveKit Mode');
  console.log('============================================================');
  console.log(`Room: ${roomName}`);
  console.log(`LiveKit URL: ${livekitUrl}`);
  console.log('');
  
  const agent = new LiveKitAgent(livekitUrl, apiKey, apiSecret);
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Agent] Shutting down...');
    await agent.leaveRoom();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n[Agent] Shutting down...');
    await agent.leaveRoom();
    process.exit(0);
  });
  
  try {
    await agent.joinRoom(roomName);
    console.log('[Agent] Running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('[Agent] Failed to start:', error);
    process.exit(1);
  }
}

main();
```

---

## Step 9: Remove Old WebSocket Signaling Code

These files can be deprecated/removed:

- `apps/api/src/ws/rooms.ts` (old signaling)
- Old `RTCPeerConnection` code in room pages
- Manual ICE/SDP exchange logic

The Bun server can still handle other things, but room signaling is now LiveKit's job.

---

## Testing Checklist

### 1. API Token Generation
```bash
curl -X POST http://localhost:3001/api/livekit/token \
  -H "Content-Type: application/json" \
  -d '{"roomName":"test-room","participantName":"Test","participantIdentity":"test-1","role":"client"}'
```

Should return `{ success: true, data: { token: "...", url: "wss://..." } }`

### 2. Client Joins Room
- Navigate to `/room/test-room` in web-client
- Should see local video
- Console shows `[LiveKit] Connected to room`

### 3. Coach Joins Same Room
- Navigate to `/room/test-room` in web-coach
- Should see client video appear
- Client should see coach video appear

### 4. AI Agent Joins
```bash
cd services/ai-agent
npm run start -- test-room
```

- Agent logs show successful connection
- Both client and coach see "AI Coach is here!"
- Orb appears in both UIs

### 5. Voice Interaction
- Client speaks → AI responds
- AI audio plays for both client and coach
- Orb animates when AI speaks

### 6. Coach Mute
- Coach clicks "Mute from AI"
- Coach speaks → AI doesn't respond
- Client speaks → AI responds normally

### 7. Coach Whisper
- Coach types whisper → sends
- AI incorporates context in next response
- Whisper text is NOT spoken

---

## Quick Reference: Identity Prefixes

| Participant | Identity Prefix | Example |
|-------------|-----------------|---------|
| Client | `client-` | `client-abc123` |
| Coach | `coach-` | `coach-xyz789` |
| AI Agent | `ai-` | `ai-coach-1234567890` |

This allows easy identification in room events.

---

## Troubleshooting

### "Failed to connect to LiveKit"
- Check `LIVEKIT_URL` is correct
- Check `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- Verify LiveKit Cloud project is active

### "No audio from AI"
- Check Deepgram API key is set
- Verify Voice Agent Settings format (see AI-AGENT-INNER-WORKINGS.md)
- Check AI agent logs for errors

### "Orb not animating"
- Verify `aiAudioStream` is not null
- Check that AI agent is publishing audio track
- Verify audio track is subscribed

### "Coach mute not working"
- Check data channel messages in logs
- Verify AI agent is receiving `coach_mute` message
- Check `mutedParticipants` set is updated

---

## File Summary

| File | Purpose |
|------|---------|
| `apps/api/src/routes/livekit.ts` | Token generation |
| `packages/ui/src/hooks/useLiveKitRoom.ts` | Reusable LiveKit hook |
| `apps/web-client/src/pages/CallRoom.tsx` | Client room (LiveKit) |
| `apps/web-coach/src/pages/CallRoom.tsx` | Coach room (LiveKit) |
| `services/ai-agent/src/livekit-agent.ts` | AI agent LiveKit integration |
| `services/ai-agent/src/index.ts` | Agent entry point |