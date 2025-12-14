# ORB / ROOM / CLIENT REPORT

Date: 2025-12-14

## 0) Scope / What this report covers

This report summarizes:

1. **How the “AI Orb” is rendered in `apps/web-client` when a client joins a room** (what code is responsible, what inputs it has, and what it currently reacts to).
2. **How the AI agent’s `VoiceAgentConnection` (`services/ai-agent/src/connections/voice-agent.ts`) is set up** and how it is intended to be used inside the Node AI agent.
3. **How rooms currently work end-to-end** (client ↔ API WebSocket signaling ↔ WebRTC), and where that differs from the architecture needed to have the Node AI agent actually speak into the room.
4. Practical options to **keep the current Orb visuals** while hooking up “real voice” using the new `voice-agent.ts` architecture.

---

## 1) Current client room architecture (apps/web-client)

### 1.1 Entry point

* File: `apps/web-client/src/pages/CallRoom.tsx`
* Route: `/room/:roomId`

High-level flow:

1. On mount, `connect()` runs.
2. Requests local media via `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`.
3. Opens a WebSocket to the Bun API signaling endpoint:

   * `ws://{host}:{API_PORT}/ws/rooms`
   * computed by `apiWsUrl()`

4. Sends a join message:

   ```json
   {"type":"join","roomId":"...","role":"client","name":"Client"}
   ```

5. Creates a **single** `RTCPeerConnection` (1:1) with Google STUN:

   ```ts
   new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
   ```

6. Exchanges offer/answer/candidates via WebSocket messages of type `signal`.
7. Attaches local tracks to the peer connection and renders:
   * local stream → `<video ref={localVideoRef} muted />`
   * remote stream → `<video ref={remoteVideoRef} />` (used either for coach video or AI video depending on role)

### 1.2 Important limitation

The current `apps/web-client` room implementation is **1:1 WebRTC only**.

Even though the signaling server can broadcast to many peers, the client page maintains:

* a single `pcRef` (one RTCPeerConnection)
* a single `remoteVideoRef` / `remoteStreamRef`

So “tri-party” (Client + Coach + AI) is **not actually supported** in the current new-web apps.

---

## 2) How the AI Orb is rendered right now

### 2.1 Where the Orb component lives

* File: `packages/ui/src/Orb/Orb.tsx`
* Hook: `packages/ui/src/Orb/useAudioAnalyser.ts`

The Orb is a **simple DOM element** (not WebGL/canvas) with a radial gradient + box shadow.

```tsx
export function Orb({ stream = null, size = 140, label = 'Orb' }: OrbProps) {
  const { level } = useAudioAnalyser(stream);
  const glow = useMemo(() => 10 + level * 30, [level]);
  const scale = useMemo(() => 1 + level * 0.12, [level]);

  return (
    <div
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: '9999px',
        background: 'radial-gradient(...)',
        boxShadow: `0 0 ${glow}px ...`,
        transform: `scale(${scale})`,
        transition: 'transform 80ms linear, box-shadow 80ms linear',
      }}
    />
  );
}
```

### 2.2 Audio-reactivity mechanism

The Orb becomes “alive” only if it receives a `MediaStream` containing an audio track.

`useAudioAnalyser(stream)`:

* creates an `AudioContext`
* connects `MediaStreamAudioSourceNode` → `AnalyserNode`
* reads time-domain samples and computes RMS level per animation frame

```ts
analyser.getByteTimeDomainData(data);
// compute RMS and clamp [0..1]
```

### 2.3 What happens in the web-client room page

In `apps/web-client/src/pages/CallRoom.tsx`, the Orb is currently rendered like:

```tsx
<Orb label="AI Orb" />
```

No `stream` prop is passed.

**Result:** the Orb is currently **static** (level = 0). It does not reflect speaking activity.

### 2.4 What the Orb could react to (without changing the visuals)

To keep the exact Orb visual but make it “speak”:

* Pass a `MediaStream` that contains the AI’s audio track:

  ```tsx
  <Orb label="AI Orb" stream={aiAudioStream} />
  ```

This is the key to preserving the look while making it behave like a “voice orb”.

---

## 3) How rooms and signaling work today (apps/api)

### 3.1 Signaling server

* File: `apps/api/src/ws/rooms.ts`
* Endpoint: `GET /ws/rooms` (Bun WebSocket upgrade)

The server tracks:

* `rooms: Map<roomId, { peers: Map<peerId, ServerWebSocket> }>`

Messages:

* `join` – assigns `ws.data.role` = `coach | client | unknown`.
  * **There is no “ai” role** at the signaling layer.
* `signal` – forwards WebRTC offer/answer/candidate to peers.
* `ai_control`, `chat`, `presence` – broadcast-style data messages.

### 3.2 Implication: “AI peer joined” in logs

The API logs show:

```
[rooms-ws] peer_joined ... role=client
```

Based on code:

* If the peer shows up as `role=client`, it is **not distinguishable from a normal client**.
* The signaling server cannot label a participant as “ai” today.

So when you see “two clients” in logs, it is either:

* a second human/browser participant joining as client, or
* some automated process connecting but identifying itself as `client`.

There is not yet a code path where the Node AI agent joins this Bun WebSocket signaling server.

---

## 4) AI Agent architecture (services/ai-agent)

### 4.1 Runtime model

* `services/ai-agent` is a **Node.js** service.
* It is designed to join a **LiveKit** room using:
  * `@livekit/rtc-node` (client)
  * `livekit-server-sdk` (token generation)

Entry point:

* File: `services/ai-agent/src/index.ts`

This does **not** connect to the Bun `/ws/rooms` signaling server.

### 4.2 The new `VoiceAgentConnection` (Deepgram Voice Agent API)

* File: `services/ai-agent/src/connections/voice-agent.ts`
* Connects to: `wss://agent.deepgram.com/v1/agent/converse`
* This single socket handles:
  * STT
  * LLM
  * TTS
  * transcript events (`ConversationText`)
  * function calls
  * barge-in

#### Settings message

On connect, the agent sends a Settings payload shaped like:

```json
{
  "type": "Settings",
  "audio": {
    "input": {"encoding": "linear16", "sample_rate": 16000},
    "output": {"encoding": "linear16", "sample_rate": 16000, "container": "none"}
  },
  "agent": {
    "listen": {"provider": {"type": "deepgram", "model": "nova-2"}},
    "think": {"provider": {"type": "open_ai", "model": "gpt-4o-mini", "temperature": 0.7}, "prompt": "..."},
    "speak": {"provider": {"type": "deepgram", "model": "aura-asteria-en"}}
  }
}
```

#### Mixed message channel

The WebSocket receives:

* JSON control messages (Welcome, ConversationText, AgentStartedSpeaking, …)
* Binary audio frames (TTS audio) – surfaced as `this.emit('audio', buffer)`

### 4.3 Dual connection manager

* File: `services/ai-agent/src/connections/connection-manager.ts`

Creates and coordinates:

* `VoiceAgentConnection` (Deepgram voice agent)
* `TranscriptionConnection` (Deepgram Listen API)
* `AudioRouter` (routes audio based on participant role + gating)

Key design:

* Client audio → VoiceAgent only (transcripts come from `ConversationText`)
* Coach audio → always to Transcription, and to VoiceAgent only if unmuted

### 4.4 CoachingAgent integration

* File: `services/ai-agent/src/coaching-agent.ts`

The CoachingAgent listens to LiveKit events:

* `trackSubscribed` (audio tracks)
* then `track.on('audioFrame', ...)`

It routes frames to the DualConnectionManager:

```ts
this.connectionManager.routeAudio(buffer, participant.identity, participant.name);
```

And it receives AI audio (Deepgram TTS) as `ai-audio` events from the VoiceAgentConnection.

⚠️ **Important:** `publishAIAudio` is currently marked TODO and does not publish audio back into LiveKit yet.

---

## 5) Observed mismatches / gaps blocking “real AI orb voice in rooms” today

### 5.1 Room transport mismatch

* `apps/web-client` uses **direct browser WebRTC (1:1) + Bun WebSocket signaling**.
* `services/ai-agent` uses **LiveKit rooms**.

These are two separate universes right now.

If the AI agent is “in the room”, it would only be in a LiveKit room — but the web-client UI is not using LiveKit yet.

### 5.2 Audio encoding mismatch risk

`VoiceAgentConnection` settings claim:

* input encoding: `linear16` @ 16k
* output encoding: `linear16` @ 16k

However, `AudioRouter` / `opus-handler.ts` appears to assume “Opus passthrough” and validates via `isValidOpusFrame()`.

Additionally, `CoachingAgent` comments indicate LiveKit `AudioFrame` contains `Int16Array` samples (PCM), not Opus.

This suggests the audio pipeline may need correction:

* either truly send **linear16 PCM** matching the Voice Agent settings
* or change Voice Agent settings to match what’s actually being sent
* and/or resample to 16k if required by Deepgram Voice Agent

### 5.3 No “AI participant” identity in Bun rooms

The Bun signaling server supports only roles:

* `coach` / `client` / `unknown`

So even if an “AI process” connects to `/ws/rooms`, it cannot currently label itself as `ai`.

### 5.4 Orb is not wired to any audio stream

The Orb is audio-reactive *only if* a `MediaStream` is passed. Right now it is instantiated with no stream, so it is purely decorative.

---

## 6) Recommended way to keep the Orb visuals and use `voice-agent.ts`

### Recommendation A (most aligned with your current ai-agent code): Move rooms to LiveKit

This is the cleanest path because `services/ai-agent` is already designed around LiveKit.

Target state:

1. Client and coach join a LiveKit room (web SDK / components).
2. AI agent (`services/ai-agent`) joins the same room.
3. Client publishes mic; coach publishes mic.
4. AI agent consumes audio frames and feeds them into `VoiceAgentConnection`.
5. AI agent publishes Deepgram TTS output back to LiveKit as an audio track.
6. Web-client subscribes to AI audio → creates a `MediaStream` from that track → passes it to `<Orb stream={...} />`.

What stays the same:

* The Orb component (`packages/ui/src/Orb/Orb.tsx`) can remain unchanged.
* The client UI layout can remain unchanged.

What must be built:

* LiveKit token generation API routes (server)
* Web-client room connection via LiveKit SDK
* In `services/ai-agent`: implement the missing `publishAIAudio()` path

### Recommendation B (possible but higher friction): Keep current Bun WS + WebRTC and add a “server WebRTC peer”

This would require:

* Node process acting as a WebRTC participant (ai peer)
* ICE/TURN considerations
* Audio codec work (Deepgram Voice Agent produces linear16 PCM; WebRTC wants Opus)

This is technically feasible but significantly more work and more fragile than LiveKit.

### Recommendation C (fast prototype): WebSocket audio streaming (not WebRTC)

Browser streams mic PCM to API over WebSocket → AI agent returns PCM → browser plays it.

Pros: quick prototype.
Cons: not a real “room”; harder to add coach later; latency.

---

## 7) Practical wiring notes for the Orb (when AI audio exists)

Once the AI audio track exists on the client:

1. Attach AI audio to a hidden `<audio>` element (for playback).
2. Use the same `MediaStream` as the Orb’s `stream`.

Example shape:

```tsx
const aiStream = new MediaStream([aiAudioTrack]);
audioEl.srcObject = aiStream;
audioEl.play();

<Orb stream={aiStream} />
```

This keeps the exact Orb visuals and gives it real “speaking” energy.

---

## 8) Immediate next questions to decide (before coding)

1. **Are we committing to LiveKit now for rooms?**
   * If yes, the path is straightforward and aligns with `services/ai-agent`.
2. If not LiveKit, do you want:
   * a WebRTC AI peer (heavier), or
   * a WebSocket audio prototype (lighter)?

---

## 9) Source files referenced

Client / Room UI:

* `apps/web-client/src/pages/CallRoom.tsx`
* `apps/web-client/src/room.css`
* `packages/ui/src/Orb/Orb.tsx`
* `packages/ui/src/Orb/useAudioAnalyser.ts`

API signaling:

* `apps/api/src/ws/rooms.ts`

AI Agent / Voice Agent:

* `services/ai-agent/src/connections/voice-agent.ts`
* `services/ai-agent/src/connections/connection-manager.ts`
* `services/ai-agent/src/audio/router.ts`
* `services/ai-agent/src/audio/gating.ts`
* `services/ai-agent/src/connections/transcription.ts`
* `services/ai-agent/src/coaching-agent.ts`
* `services/ai-agent/src/index.ts`
