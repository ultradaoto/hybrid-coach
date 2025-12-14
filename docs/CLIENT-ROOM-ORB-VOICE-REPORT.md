# Coach Room / Client Room / Orb / Voice Report

Date: 2025-12-14

## 0) Scope

This report focuses on the **coach-side room implementation** in `apps/web-coach`, specifically:

1. How the coach joins/creates a room and establishes a connection.
2. How audio/video flows between **coach ↔ human client** today.
3. What the “Orb” is doing in the coach room UI and whether any audio is routed into it.
4. What is and is not currently wired for “AI voice” in the coach room.

---

## 1) Coach room entry points

### 1.1 Create room

* File: `apps/web-coach/src/pages/CreateRoom.tsx`

Flow:

1. Reads `auth_token` from `localStorage`.
2. Calls `POST /api/rooms/create`.
3. Navigates to `apps/web-coach` route: `/room/:roomId`.

This is the primary “instant room” bootstrap.

### 1.2 Join room view

* File: `apps/web-coach/src/pages/CallRoom.tsx`
* Route: `/room/:roomId`

This is the coach’s main room UI.

---

## 2) How the coach connects to the room (signaling + WebRTC)

### 2.1 Signaling transport

The coach uses a **Bun WebSocket signaling server** (not LiveKit) at:

* `ws(s)://{host}:{API_PORT}/ws/rooms`

Computed in `apps/web-coach/src/pages/CallRoom.tsx` via `apiWsUrl()`.

On WebSocket open, the coach sends:

```json
{ "type": "join", "roomId": "...", "role": "coach", "name": "Coach" }
```

The server responds with:

* `hello` (peer id assignment)
* `joined` (room join confirmation, includes `isOfferer`)
* `peer_joined` / `peer_left`
* `signal` (offer/answer/candidates)

### 2.2 Offerer selection

The signaling server decides who is the WebRTC offerer:

* First peer in an empty room → `isOfferer: true`
* Subsequent peers → `isOfferer: false`

In the coach UI:

* `isOfferer` is stored from the `joined` message.
* When a new peer arrives (`peer_joined`), if `isOfferer === true`, coach generates an offer.

### 2.3 WebRTC connection

The coach room maintains a **single** peer connection:

* `pcRef: RTCPeerConnection | null`

Peer connection config:

```ts
new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});
```

Signaling messages:

* Offer: `{ type: 'signal', data: { type: 'offer', sdp } }`
* Answer: `{ type: 'signal', data: { type: 'answer', sdp } }`
* ICE: `{ type: 'signal', data: { type: 'candidate', candidate } }`

### 2.4 Local media capture

On connect, the coach immediately calls:

```ts
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
```

That stream is stored in `localStreamRef`, set into React state, and also attached to the local preview `<video>`.

### 2.5 Track publishing (coach → client)

When the peer connection is created, the coach adds all local tracks:

```ts
for (const track of stream.getTracks()) {
  pc.addTrack(track, stream);
}
```

**Result:** once the WebRTC session is established, the coach’s mic/camera are published to the remote peer.

### 2.6 Remote media (client → coach)

The coach listens for:

```ts
pc.ontrack = (e) => {
  if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
  remoteStreamRef.current.addTrack(e.track);
  remoteVideoRef.current.srcObject = remoteStreamRef.current;
};
```

This `remoteStream` is displayed in the “Client” tile.

---

## 3) How audio flows today

### 3.1 Coach ↔ Human Client audio

**This is the only fully working audio path today** in the new `apps/*` room system.

* Coach mic track is added to the peer connection → client receives it in their `ontrack`.
* Client mic track is added to the peer connection → coach receives it in `pc.ontrack`.

There is no separate audio routing layer; it’s standard WebRTC track publication.

### 3.2 Mute/unmute in coach UI

The coach room “Audio” button toggles the local mic track:

```ts
track.enabled = !track.enabled;
```

This effectively stops sending microphone samples to the remote peer.

### 3.3 Screen share

The coach can screenshare by replacing the outgoing video sender track:

* `getDisplayMedia()` → `screenTrack`
* `sender.replaceTrack(screenTrack)`
* restore original camera track on stop

This only affects video; audio is still the mic track.

---

## 4) How the coach room UI represents the “AI Orb”

### 4.1 Where the Orb comes from

In `apps/web-coach/src/pages/CallRoom.tsx`:

```tsx
import { Orb } from '@myultra/ui';
...
<Orb label="AI Orb" />
```

The Orb component lives in:

* `packages/ui/src/Orb/Orb.tsx`

It is audio-reactive **only if** it is given a `MediaStream` prop (`stream`).

### 4.2 Current state: Orb is not connected to any audio

In the coach room, the Orb is rendered without a `stream` prop, so:

* It is a **visual placeholder only**.
* It does **not** animate based on AI voice or client voice.

### 4.3 What the coach room currently does for “AI controls”

The coach UI has buttons:

* Quick Pause
* Mute AI
* End Session

These send WebSocket broadcast messages via the signaling channel:

```ts
sendWs({ type: 'ai_control', roomId, data: { action: 'pause' } })
sendWs({ type: 'ai_control', roomId, data: { action: 'mute', muted: true } })
sendWs({ type: 'ai_control', roomId, data: { action: 'end_session' } })
```

In the coach UI, these messages are only appended to the transcript panel as “Control: …”.

**There is no code that turns these into actual audio gating or AI behavior yet**.

---

## 5) Data channels and “transcript” panel

### 5.1 WebRTC data channel

The coach peer connection:

* creates a data channel: `pc.createDataChannel('chat')`
* also listens for `pc.ondatachannel`

Messages received on either are appended to the right-hand “Live Transcript” panel.

### 5.2 Transcript panel is not speech-to-text

The coach transcript panel is currently:

* system logs (join/leave, signaling state)
* messages received over the data channel
* `ai_control` messages echoed back from the signaling server

It is not wired to Deepgram/LiveKit transcription yet.

---

## 6) Key limitations (important for AI voice/orb plans)

### 6.1 The coach room is effectively 1:1

The coach room maintains:

* one `RTCPeerConnection` (`pcRef`)
* one remote media slot (`remoteVideoRef`)

So it can robustly connect to **one** remote peer.

That means “Coach + Client + AI” simultaneous media is not supported in the new-web room code today.

### 6.2 No real AI audio track exists in this room system

The AI agent codebase (`services/ai-agent`) is LiveKit-based and currently lives outside this Bun signaling + WebRTC path.

So in the coach room as implemented today:

* the Orb is not driven by AI audio
* there is no AI audio being published into the WebRTC session

---

## 7) What it would take to “ensure audio gets to the Orb” (while keeping the Orb visuals)

The Orb can animate if it receives a `MediaStream` with an audio track.

Once the system has a real AI audio track on the coach side, the coach UI can do:

```tsx
<Orb stream={aiAudioStream} />
```

Where `aiAudioStream` is something like:

```ts
const aiAudioStream = new MediaStream([aiAudioTrack]);
```

Today, there is no `aiAudioTrack` in the coach room.

---

## 8) Summary

* The coach room (`apps/web-coach/src/pages/CallRoom.tsx`) uses **Bun WebSocket signaling** + a **single WebRTC peer connection**.
* Audio between coach and the human client works via standard WebRTC track publication.
* The Orb in the coach room is currently **a placeholder** (no audio stream passed into it).
* “AI control” buttons currently send WS events but do not affect an actual AI participant or audio path.
* True “AI orb voice” integration will require either:
  * moving rooms to **LiveKit** (aligns with `services/ai-agent`), or
  * building a server-side WebRTC AI peer (harder), then passing AI audio into the Orb.

---

## 9) Source files referenced

Coach web app:

* `apps/web-coach/src/pages/CreateRoom.tsx`
* `apps/web-coach/src/pages/CallRoom.tsx`
* `apps/web-coach/src/room.css`

Shared UI:

* `packages/ui/src/Orb/Orb.tsx`
* `packages/ui/src/Orb/useAudioAnalyser.ts`

API signaling:

* `apps/api/src/ws/rooms.ts`
