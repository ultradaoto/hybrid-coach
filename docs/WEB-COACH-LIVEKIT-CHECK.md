# Web-Coach LiveKit Integration Verification Checklist

## Purpose

This document is a comprehensive audit guide for verifying the LiveKit integration in `apps/web-coach`. Use this to ensure all components are correctly wired, all imports resolve, and the coach room functions properly in the 3-way coaching call system.

---

## 1. File Structure Verification

### Required Files

Verify these files exist in `apps/web-coach/`:

```
apps/web-coach/
├── src/
│   ├── pages/
│   │   ├── CallRoom.tsx          ✓ Main room component (LiveKit-based)
│   │   ├── CreateRoom.tsx        ✓ Room creation page
│   │   ├── Dashboard.tsx         ✓ Coach dashboard
│   │   └── Login.tsx             ✓ Authentication
│   ├── components/
│   │   └── (any shared components)
│   ├── hooks/
│   │   └── (should NOT have useAIVoice.ts - deleted in migration)
│   ├── App.tsx                   ✓ Router setup
│   ├── main.tsx                  ✓ Entry point
│   └── room.css                  ✓ Room styles
├── package.json                  ✓ Must have livekit-client
├── tsconfig.json
├── vite.config.ts
└── index.html
```

### Files That Should NOT Exist (Deleted in Migration)

```
❌ apps/web-coach/src/hooks/useAIVoice.ts (deleted)
❌ apps/web-coach/src/hooks/useAudioCapture.ts (deleted)
❌ Any WebSocket signaling code for rooms
❌ Any RTCPeerConnection code
```

---

## 2. Package.json Dependencies

### Required Dependencies

Open `apps/web-coach/package.json` and verify:

```json
{
  "dependencies": {
    "livekit-client": "^2.x.x",
    "@livekit/components-react": "^2.x.x",
    "react": "^18.x.x",
    "react-dom": "^18.x.x",
    "react-router-dom": "^6.x.x"
  }
}
```

### Verify Installation

```bash
cd apps/web-coach
bun install
```

Check for any missing peer dependencies or version conflicts.

---

## 3. Environment Variables

### Required in `.env` or `.env.local`

```bash
VITE_API_URL=http://localhost:3001
VITE_LIVEKIT_URL=wss://myultracoach25-fmpbcrwc.livekit.cloud
```

### Verify Access in Code

In any component, these should be accessible as:
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
```

---

## 4. CallRoom.tsx Deep Verification

This is the most critical file. Open `apps/web-coach/src/pages/CallRoom.tsx` and verify:

### 4.1 Imports

```typescript
// Required imports - verify ALL are present
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Orb } from '@myultra/ui';                    // Shared UI package
import { useLiveKitRoom } from '@myultra/ui/hooks/useLiveKitRoom';  // Shared hook
import { ConnectionState } from 'livekit-client';     // LiveKit types
```

### 4.2 Token Fetching

Verify the token fetch logic exists and is correct:

```typescript
// Should fetch token on mount with roomId
useEffect(() => {
  async function getToken() {
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
        role: 'coach',  // ← MUST be 'coach' for admin permissions
      }),
    });
    // ... handle response
  }
  
  if (roomId) {
    getToken();
  }
}, [roomId]);
```

**Check for these issues:**
- [ ] Is `role: 'coach'` being sent (not 'client')?
- [ ] Is the identity prefixed with `coach-`?
- [ ] Is the auth token being included?
- [ ] Is error handling present?

### 4.3 useLiveKitRoom Hook Usage

Verify the hook is called correctly:

```typescript
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
  onParticipantJoined: (participant) => { /* ... */ },
  onParticipantLeft: (identity) => { /* ... */ },
  onError: (err) => { /* ... */ },
});
```

**Check for these issues:**
- [ ] Are both `url` and `token` being passed?
- [ ] Are callbacks handling participant events?
- [ ] Is `getParticipantAudioStream` destructured (needed for Orb)?

### 4.4 Participant Identification

Verify participants are identified by prefix:

```typescript
onParticipantJoined: (participant) => {
  if (participant.identity.startsWith('ai-')) {
    setAiParticipant(participant);
  } else if (participant.identity.startsWith('client-')) {
    setClientParticipant(participant);
  }
  // Coach doesn't track itself
},
```

**Check for these issues:**
- [ ] Is `ai-` prefix checked for AI agent?
- [ ] Is `client-` prefix checked for client?
- [ ] Are state setters updating correctly?

### 4.5 Connect Trigger

Verify connection is triggered when token is ready:

```typescript
useEffect(() => {
  if (token && livekitUrl) {
    connect();
  }
}, [token, livekitUrl, connect]);
```

**Check for these issues:**
- [ ] Is `connect()` called only after token AND url are available?
- [ ] Is `connect` in the dependency array?

### 4.6 Video Attachment

Verify video refs are attached to streams:

```typescript
// Local (coach) video
useEffect(() => {
  if (localParticipant?.videoTrack && localVideoRef.current) {
    localVideoRef.current.srcObject = new MediaStream([localParticipant.videoTrack]);
  }
}, [localParticipant?.videoTrack]);

// Client video
useEffect(() => {
  if (clientParticipant?.videoTrack && clientVideoRef.current) {
    clientVideoRef.current.srcObject = new MediaStream([clientParticipant.videoTrack]);
  }
}, [clientParticipant?.videoTrack]);
```

**Check for these issues:**
- [ ] Are both effects present?
- [ ] Are refs created with `useRef<HTMLVideoElement>(null)`?
- [ ] Is `new MediaStream([track])` used to wrap the track?

### 4.7 AI Audio Stream for Orb

Verify the Orb receives the AI audio stream:

```typescript
// Get AI audio stream
const aiAudioStream = aiParticipant 
  ? getParticipantAudioStream(aiParticipant.identity)
  : null;

// In JSX:
<Orb 
  label="AI Coach"
  stream={aiAudioStream}  // ← This MUST be passed
  size={140}
/>
```

**Check for these issues:**
- [ ] Is `getParticipantAudioStream` being called with AI identity?
- [ ] Is the result passed to `<Orb stream={...} />`?
- [ ] Is there a null check before passing?

### 4.8 Coach Mute from AI

Verify the mute functionality:

```typescript
const [isMutedFromAI, setIsMutedFromAI] = useState(false);

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
}, [room, isMutedFromAI, localParticipant]);
```

**Check for these issues:**
- [ ] Is `room` available from the hook?
- [ ] Is `publishData` being called with correct format?
- [ ] Is `reliable: true` set for guaranteed delivery?
- [ ] Is the message JSON with `type: 'coach_mute'`?
- [ ] Is `coachIdentity` included so AI knows who to mute?

### 4.9 Coach Whisper

Verify the whisper functionality:

```typescript
const [whisperText, setWhisperText] = useState('');

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
  
  setWhisperText('');  // Clear input after send
}, [room, whisperText]);
```

**Check for these issues:**
- [ ] Is empty text prevented from sending?
- [ ] Is the message JSON with `type: 'coach_whisper'`?
- [ ] Is the input cleared after sending?

### 4.10 Data Message Receiving (Transcripts)

Verify transcript receiving:

```typescript
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
```

**Check for these issues:**
- [ ] Is `room.on('dataReceived', ...)` registered?
- [ ] Is cleanup happening in return function?
- [ ] Is JSON parsing wrapped in try-catch?
- [ ] Is transcript state being updated?

### 4.11 Hidden Audio Elements

Verify remote audio is played:

```typescript
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
```

**Check for these issues:**
- [ ] Is `remoteParticipants` being mapped?
- [ ] Is `autoPlay` set on audio elements?
- [ ] Is the callback ref attaching the stream?

### 4.12 Disconnect Cleanup

Verify disconnect on exit:

```typescript
const handleExit = () => {
  disconnect();
  navigate('/dashboard');
};

// Also cleanup on unmount (in useLiveKitRoom hook)
```

---

## 5. Shared Hook Verification

Open `packages/ui/src/hooks/useLiveKitRoom.ts` and verify:

### 5.1 Export from Package

Check `packages/ui/src/index.ts`:

```typescript
export { useLiveKitRoom } from './hooks/useLiveKitRoom';
export type { UseLiveKitRoomOptions, UseLiveKitRoomReturn, ParticipantInfo } from './hooks/useLiveKitRoom';
```

### 5.2 getParticipantAudioStream Function

This is critical for the Orb. Verify it exists:

```typescript
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
```

### 5.3 Room Event Handlers

Verify these events are handled:

- [ ] `RoomEvent.ConnectionStateChanged`
- [ ] `RoomEvent.ParticipantConnected`
- [ ] `RoomEvent.ParticipantDisconnected`
- [ ] `RoomEvent.TrackSubscribed`
- [ ] `RoomEvent.TrackUnsubscribed`
- [ ] `RoomEvent.ActiveSpeakersChanged`
- [ ] `RoomEvent.LocalTrackPublished`

---

## 6. Orb Component Verification

Open `packages/ui/src/Orb/Orb.tsx` and verify:

### 6.1 Props Interface

```typescript
interface OrbProps {
  stream?: MediaStream | null;
  size?: number;
  label?: string;
}
```

### 6.2 Audio Analyser Usage

```typescript
const { level } = useAudioAnalyser(stream);
```

The Orb should use the audio level to:
- Scale the orb size
- Adjust the glow intensity

---

## 7. API Route Verification

Open `apps/api/src/routes/livekit.ts` and verify:

### 7.1 Token Generation

```typescript
// POST /api/livekit/token
livekit.post('/token', async (c) => {
  const { roomName, participantName, participantIdentity, role } = await c.req.json();
  
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
  
  // Coach gets admin permissions
  if (role === 'coach') {
    grant.roomAdmin = true;
    grant.roomRecord = true;
  }
  
  token.addGrant(grant);
  // ...
});
```

### 7.2 Route Registration

Check `apps/api/src/index.ts`:

```typescript
import livekit from './routes/livekit';
app.route('/api/livekit', livekit);
```

---

## 8. TypeScript Compilation Check

Run these commands to verify no type errors:

```bash
# Check web-coach
cd apps/web-coach
bunx tsc --noEmit

# Check shared UI package
cd packages/ui
bunx tsc --noEmit

# Check API
cd apps/api
bunx tsc --noEmit
```

All should complete with no errors.

---

## 9. Runtime Verification Checklist

### 9.1 Start Services

```bash
# Terminal 1: API
cd apps/api && bun run dev

# Terminal 2: Web Coach
cd apps/web-coach && bun run dev
```

### 9.2 Browser Tests

1. **Navigate to room**: `http://localhost:5171/room/test-room`
   - [ ] Page loads without console errors
   - [ ] Token fetch succeeds (network tab shows 200)
   - [ ] "Connecting..." state appears briefly
   - [ ] "Connected" state appears

2. **Local video**:
   - [ ] Camera permission requested
   - [ ] Local video appears in "You (Coach)" tile
   - [ ] Video/Audio toggle buttons work

3. **When AI Agent joins**:
   - [ ] "AI Coach is here!" message appears
   - [ ] Orb appears in AI tile
   - [ ] Orb animates when AI speaks

4. **When Client joins**:
   - [ ] Client video appears in Client tile
   - [ ] Client audio is heard

5. **Coach controls**:
   - [ ] "Mute from AI" button toggles state
   - [ ] When muted, speaking doesn't trigger AI response
   - [ ] Whisper input accepts text
   - [ ] Whisper sends successfully (check AI agent logs)

6. **Transcript panel**:
   - [ ] Shows conversation entries
   - [ ] Updates in real-time
   - [ ] Shows both user and assistant roles

---

## 10. Common Issues & Fixes

### Issue: "Cannot find module '@myultra/ui'"

**Fix**: Ensure the package is properly linked in the monorepo.

```bash
# In project root
bun install
```

Or check `apps/web-coach/package.json` has:
```json
{
  "dependencies": {
    "@myultra/ui": "workspace:*"
  }
}
```

### Issue: "useLiveKitRoom is not exported"

**Fix**: Check `packages/ui/src/index.ts` exports the hook:

```typescript
export { useLiveKitRoom } from './hooks/useLiveKitRoom';
```

### Issue: "room is undefined"

**Fix**: The hook may not have connected yet. Ensure:
- Token is fetched before calling `connect()`
- `connect()` is in a useEffect that depends on token/url

### Issue: "No audio from participants"

**Fix**: Check hidden audio elements are rendering:
```typescript
{Array.from(remoteParticipants.values()).map((p) => (
  p.audioTrack && <audio key={p.identity} autoPlay ... />
))}
```

### Issue: "Orb not animating"

**Fix**: Verify:
1. `aiParticipant` state is set when AI joins
2. `getParticipantAudioStream(aiParticipant.identity)` returns a stream
3. Stream is passed to `<Orb stream={...} />`

### Issue: "Data messages not received"

**Fix**: Verify:
1. `room.on('dataReceived', ...)` is registered
2. AI agent is calling `room.localParticipant.publishData(...)`
3. Message format matches expected structure

### Issue: "Coach mute not working"

**Fix**: Check AI agent logs for:
```
[LiveKitAgent] Data message from coach-xxx: coach_mute
```

If not appearing, verify `publishData` is being called.

---

## 11. Integration Points Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COACH ROOM INTEGRATION MAP                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CallRoom.tsx                                                                │
│       │                                                                      │
│       ├──► useLiveKitRoom (packages/ui/src/hooks/)                          │
│       │         │                                                            │
│       │         ├──► Room connection to LiveKit Cloud                       │
│       │         ├──► Track subscription management                          │
│       │         └──► getParticipantAudioStream() ──► Orb                    │
│       │                                                                      │
│       ├──► Token fetch ──► /api/livekit/token (apps/api)                    │
│       │                                                                      │
│       ├──► Orb component (packages/ui/src/Orb/)                             │
│       │         │                                                            │
│       │         └──► useAudioAnalyser(stream) ──► Audio-reactive visuals    │
│       │                                                                      │
│       ├──► Coach Mute ──► room.publishData() ──► AI Agent                   │
│       │                                                                      │
│       ├──► Coach Whisper ──► room.publishData() ──► AI Agent                │
│       │                                                                      │
│       └──► Transcript ◄── room.on('dataReceived') ◄── AI Agent              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Final Checklist

Before considering the coach room complete:

- [ ] All required files exist
- [ ] All dependencies installed
- [ ] Environment variables set
- [ ] TypeScript compiles without errors
- [ ] Token fetch works
- [ ] Room connection succeeds
- [ ] Local video/audio works
- [ ] Remote participants appear
- [ ] AI Orb renders and animates
- [ ] Coach mute sends data message
- [ ] Coach whisper sends data message
- [ ] Transcript receives and displays messages
- [ ] Audio plays for all participants
- [ ] Disconnect/exit works cleanly

---

## 13. Files to Review (In Order)

1. `apps/web-coach/package.json` - Dependencies
2. `apps/web-coach/src/pages/CallRoom.tsx` - Main room logic
3. `packages/ui/src/hooks/useLiveKitRoom.ts` - Shared LiveKit hook
4. `packages/ui/src/Orb/Orb.tsx` - Orb component
5. `packages/ui/src/Orb/useAudioAnalyser.ts` - Audio analysis hook
6. `apps/api/src/routes/livekit.ts` - Token generation
7. `apps/api/src/index.ts` - Route registration