# AI Orb + Deepgram Voice Agent Integration Guide

## Purpose

This guide explains how to integrate the **new Deepgram Voice Agent system** (`services/ai-agent/`) with the **existing AI Orb room infrastructure** (`apps/web-client/`, `apps/api/`). The goal is to give the Orb a real voice using Deepgram's STT → LLM → TTS pipeline while preserving the current room architecture and Orb visuals.

---

## Current State Summary

### What's Working Now

1. **Room UI** (`apps/web-client/src/pages/CallRoom.tsx`)
   - Three-panel layout: Client video | Coach video | AI Orb
   - WebSocket signaling to Bun API (`/ws/rooms`)
   - Direct browser WebRTC for audio/video
   - AI Orb renders but is currently **static** (no audio stream connected)

2. **AI Orb Component** (`packages/ui/src/Orb/Orb.tsx`)
   - Audio-reactive DOM element with radial gradient + glow
   - Uses `useAudioAnalyser` hook to read audio levels from a `MediaStream`
   - **Key insight**: Pass it a `MediaStream` and it "comes alive"

3. **Room Signaling** (`apps/api/src/ws/rooms.ts`)
   - Bun WebSocket server at `/ws/rooms`
   - Handles `join`, `signal`, `ai_control`, `chat`, `presence` messages
   - Tracks peers by roomId with roles: `coach | client | unknown`

4. **New Voice Agent System** (`services/ai-agent/`)
   - Dual-connection Deepgram architecture (Voice Agent + Transcription)
   - Designed for LiveKit rooms (not yet connected to Bun WS rooms)
   - Produces AI audio via `VoiceAgentConnection.on('audio', buffer)`
   - Has coach whisper, function calling, and mute gating

### The Gap

The new `services/ai-agent` is designed around **LiveKit**, but the current room UI uses **Bun WebSocket + browser WebRTC**. We need a bridge.

---

## Integration Architecture

### Recommended Approach: WebSocket Audio Bridge

Rather than rewriting the entire room system to use LiveKit (significant effort), we can create a **WebSocket audio bridge** that:

1. Receives client microphone audio from the browser
2. Pipes it to the Deepgram Voice Agent
3. Returns AI audio (TTS) back to the browser
4. Browser plays AI audio AND feeds it to the Orb for visualization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Browser (web-client)                                │
│                                                                              │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐   │
│   │   Client    │     │   Coach     │     │        AI Orb               │   │
│   │   Video     │     │   Video     │     │   stream={aiAudioStream}    │   │
│   └──────┬──────┘     └─────────────┘     └──────────────▲──────────────┘   │
│          │                                               │                   │
│          │ getUserMedia                                  │ MediaStream       │
│          ▼                                               │                   │
│   ┌──────────────┐                              ┌────────┴────────┐         │
│   │  Mic Audio   │────► AudioWorklet ──────────►│  Audio Player   │         │
│   │  (PCM/Opus)  │      (capture)    WebSocket  │  + AI Stream    │         │
│   └──────────────┘           │       (binary)   └─────────────────┘         │
│                              │                          ▲                    │
└──────────────────────────────┼──────────────────────────┼────────────────────┘
                               │                          │
                               ▼                          │ AI Audio (PCM)
                    ┌──────────────────────┐              │
                    │  Bun API Server      │              │
                    │  /ws/ai-voice        │──────────────┘
                    │                      │
                    │  Routes audio to     │
                    │  AI Agent process    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────────────────────────────┐
                    │           AI Agent (Node.js)                  │
                    │                                               │
                    │   ┌─────────────────────────────────────┐    │
                    │   │    DualConnectionManager            │    │
                    │   │                                     │    │
                    │   │  VoiceAgentConnection ◄────────────►│    │
                    │   │  (Deepgram Agent API)               │    │
                    │   │                                     │    │
                    │   │  • Receives client PCM audio        │    │
                    │   │  • Sends to Deepgram STT → LLM → TTS│    │
                    │   │  • Returns AI audio (PCM)           │    │
                    │   └─────────────────────────────────────┘    │
                    └──────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Add AI Voice WebSocket Endpoint to Bun API

Create a new WebSocket endpoint that bridges browser audio to the AI Agent.

**File: `apps/api/src/ws/ai-voice.ts`**

```typescript
import { ServerWebSocket } from 'bun';

interface AIVoiceData {
  roomId: string;
  peerId: string;
  role: 'client' | 'coach';
}

// Connection to AI Agent process (will be IPC or internal WebSocket)
let aiAgentConnection: WebSocket | null = null;

// Map of room audio sessions
const audioSessions = new Map<string, {
  clients: Map<string, ServerWebSocket<AIVoiceData>>;
}>();

export function handleAIVoiceUpgrade(req: Request, server: any): boolean {
  const url = new URL(req.url);
  if (url.pathname === '/ws/ai-voice') {
    const roomId = url.searchParams.get('roomId');
    const peerId = url.searchParams.get('peerId');
    const role = url.searchParams.get('role') as 'client' | 'coach';
    
    if (!roomId || !peerId) {
      return false;
    }
    
    return server.upgrade(req, {
      data: { roomId, peerId, role }
    });
  }
  return false;
}

export const aiVoiceHandlers = {
  open(ws: ServerWebSocket<AIVoiceData>) {
    const { roomId, peerId, role } = ws.data;
    console.log(`[ai-voice] ${role} ${peerId} connected to room ${roomId}`);
    
    // Initialize room session if needed
    if (!audioSessions.has(roomId)) {
      audioSessions.set(roomId, { clients: new Map() });
    }
    
    audioSessions.get(roomId)!.clients.set(peerId, ws);
    
    // Notify AI Agent of new participant
    sendToAIAgent({
      type: 'participant_joined',
      roomId,
      peerId,
      role
    });
  },
  
  message(ws: ServerWebSocket<AIVoiceData>, message: string | Buffer) {
    const { roomId, peerId, role } = ws.data;
    
    if (message instanceof Buffer) {
      // Binary audio data from client microphone
      // Forward to AI Agent with metadata
      sendToAIAgent({
        type: 'audio',
        roomId,
        peerId,
        role,
        audio: message
      });
    } else {
      // JSON control messages
      try {
        const data = JSON.parse(message);
        handleControlMessage(ws, data);
      } catch (e) {
        console.error('[ai-voice] Invalid JSON:', e);
      }
    }
  },
  
  close(ws: ServerWebSocket<AIVoiceData>) {
    const { roomId, peerId, role } = ws.data;
    console.log(`[ai-voice] ${role} ${peerId} disconnected from room ${roomId}`);
    
    const session = audioSessions.get(roomId);
    if (session) {
      session.clients.delete(peerId);
      if (session.clients.size === 0) {
        audioSessions.delete(roomId);
      }
    }
    
    sendToAIAgent({
      type: 'participant_left',
      roomId,
      peerId
    });
  }
};

function handleControlMessage(ws: ServerWebSocket<AIVoiceData>, data: any) {
  switch (data.type) {
    case 'mute_ai':
      // Coach wants to mute AI from hearing them
      sendToAIAgent({
        type: 'mute_participant',
        roomId: ws.data.roomId,
        peerId: ws.data.peerId,
        muted: data.muted
      });
      break;
      
    case 'coach_whisper':
      // Coach sending silent context to AI
      sendToAIAgent({
        type: 'coach_whisper',
        roomId: ws.data.roomId,
        text: data.text
      });
      break;
  }
}

function sendToAIAgent(message: any) {
  // TODO: Connect to AI Agent process
  // Options:
  // 1. IPC via Bun.spawn() with ipc: true
  // 2. Internal WebSocket to AI Agent server
  // 3. HTTP POST for control messages, WS for audio
  console.log('[ai-voice] -> AI Agent:', message.type);
}

// Called by AI Agent when it has audio to send back
export function broadcastAIAudio(roomId: string, audioBuffer: Buffer) {
  const session = audioSessions.get(roomId);
  if (!session) return;
  
  // Send AI audio to all clients in the room
  for (const [peerId, ws] of session.clients) {
    if (ws.readyState === 1) {
      ws.send(audioBuffer);
    }
  }
}

// Called by AI Agent for control messages (transcripts, etc.)
export function broadcastAIMessage(roomId: string, message: any) {
  const session = audioSessions.get(roomId);
  if (!session) return;
  
  const json = JSON.stringify(message);
  for (const [peerId, ws] of session.clients) {
    if (ws.readyState === 1) {
      ws.send(json);
    }
  }
}
```

### Step 2: Update AI Agent to Accept Audio from Bun API

Modify `services/ai-agent` to receive audio from the Bun API bridge instead of LiveKit.

**File: `services/ai-agent/src/bridges/bun-bridge.ts`**

```typescript
import { EventEmitter } from 'events';
import WebSocket from 'ws';

interface RoomSession {
  roomId: string;
  participants: Map<string, { role: string; muted: boolean }>;
}

export class BunApiBridge extends EventEmitter {
  private ws: WebSocket | null = null;
  private sessions = new Map<string, RoomSession>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  constructor(private apiUrl: string) {
    super();
  }
  
  async connect() {
    return new Promise<void>((resolve, reject) => {
      // Connect to Bun API's internal bridge endpoint
      this.ws = new WebSocket(`${this.apiUrl}/internal/ai-agent`);
      
      this.ws.on('open', () => {
        console.log('[BunBridge] Connected to Bun API');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        if (data instanceof Buffer) {
          // Audio data from a participant
          // The first 36 bytes are roomId + peerId metadata
          const metadata = data.slice(0, 72).toString('utf8');
          const [roomId, peerId] = metadata.split(':');
          const audioBuffer = data.slice(72);
          
          this.emit('audio', {
            roomId: roomId.trim(),
            peerId: peerId.trim(),
            audio: audioBuffer
          });
        } else {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (e) {
            console.error('[BunBridge] Invalid message:', e);
          }
        }
      });
      
      this.ws.on('close', () => {
        console.log('[BunBridge] Disconnected, reconnecting...');
        this.scheduleReconnect();
      });
      
      this.ws.on('error', (err) => {
        console.error('[BunBridge] Error:', err);
        reject(err);
      });
    });
  }
  
  private handleMessage(message: any) {
    switch (message.type) {
      case 'participant_joined':
        this.addParticipant(message.roomId, message.peerId, message.role);
        this.emit('participant_joined', message);
        break;
        
      case 'participant_left':
        this.removeParticipant(message.roomId, message.peerId);
        this.emit('participant_left', message);
        break;
        
      case 'mute_participant':
        this.setParticipantMuted(message.roomId, message.peerId, message.muted);
        this.emit('mute_changed', message);
        break;
        
      case 'coach_whisper':
        this.emit('coach_whisper', message);
        break;
    }
  }
  
  private addParticipant(roomId: string, peerId: string, role: string) {
    if (!this.sessions.has(roomId)) {
      this.sessions.set(roomId, { roomId, participants: new Map() });
    }
    this.sessions.get(roomId)!.participants.set(peerId, { role, muted: false });
  }
  
  private removeParticipant(roomId: string, peerId: string) {
    const session = this.sessions.get(roomId);
    if (session) {
      session.participants.delete(peerId);
      if (session.participants.size === 0) {
        this.sessions.delete(roomId);
      }
    }
  }
  
  private setParticipantMuted(roomId: string, peerId: string, muted: boolean) {
    const session = this.sessions.get(roomId);
    const participant = session?.participants.get(peerId);
    if (participant) {
      participant.muted = muted;
    }
  }
  
  isParticipantMuted(roomId: string, peerId: string): boolean {
    return this.sessions.get(roomId)?.participants.get(peerId)?.muted ?? false;
  }
  
  getParticipantRole(roomId: string, peerId: string): string | undefined {
    return this.sessions.get(roomId)?.participants.get(peerId)?.role;
  }
  
  // Send AI audio back to a room
  sendAIAudio(roomId: string, audioBuffer: Buffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Prefix with room ID for routing
      const header = Buffer.alloc(36);
      header.write(roomId.padEnd(36, ' '));
      this.ws.send(Buffer.concat([header, audioBuffer]));
    }
  }
  
  // Send control message (transcript, etc.)
  sendMessage(roomId: string, message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...message, roomId }));
    }
  }
  
  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(console.error);
    }, 3000);
  }
}
```

### Step 3: Create Audio Capture Worklet for Browser

The browser needs to capture microphone audio in a format suitable for Deepgram.

**File: `apps/web-client/src/audio/capture-worklet.ts`**

```typescript
// AudioWorklet processor for capturing microphone audio
// This runs in a separate audio thread

class AudioCaptureProcessor extends AudioWorkletProcessor {
  private bufferSize = 2048;
  private buffer: Float32Array[] = [];
  private sampleCount = 0;
  
  constructor() {
    super();
  }
  
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    
    const samples = input[0];
    this.buffer.push(new Float32Array(samples));
    this.sampleCount += samples.length;
    
    // Send chunks of ~20ms (320 samples at 16kHz)
    if (this.sampleCount >= 320) {
      const combined = this.combineBuffers();
      const pcm16 = this.floatTo16BitPCM(combined);
      
      this.port.postMessage({
        type: 'audio',
        samples: pcm16.buffer
      }, [pcm16.buffer]);
      
      this.buffer = [];
      this.sampleCount = 0;
    }
    
    return true;
  }
  
  private combineBuffers(): Float32Array {
    const total = this.buffer.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Float32Array(total);
    let offset = 0;
    for (const arr of this.buffer) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }
  
  private floatTo16BitPCM(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
```

### Step 4: Update CallRoom.tsx to Use AI Voice WebSocket

**File: `apps/web-client/src/pages/CallRoom.tsx` (partial update)**

```typescript
// Add these to the existing CallRoom component

import { useAIVoice } from '../hooks/useAIVoice';

export function CallRoom() {
  const { roomId } = useParams();
  // ... existing state ...
  
  // AI Voice connection
  const { 
    aiAudioStream, 
    isAIConnected, 
    sendAudioToAI,
    coachMuteFromAI,
    sendCoachWhisper 
  } = useAIVoice({
    roomId: roomId!,
    peerId: peerIdRef.current,
    role: userRole, // 'client' or 'coach'
  });
  
  // Connect microphone to AI
  useEffect(() => {
    if (!localStream || !isAIConnected) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    
    // Set up audio worklet for capturing
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
    
    audioContext.audioWorklet.addModule('/audio/capture-worklet.js').then(() => {
      const processor = new AudioWorkletNode(audioContext, 'audio-capture-processor');
      
      processor.port.onmessage = (event) => {
        if (event.data.type === 'audio') {
          sendAudioToAI(new Uint8Array(event.data.samples));
        }
      };
      
      source.connect(processor);
    });
    
    return () => {
      audioContext.close();
    };
  }, [localStream, isAIConnected, sendAudioToAI]);
  
  // ... existing JSX ...
  
  return (
    <div className="call-room">
      {/* ... existing layout ... */}
      
      {/* AI Orb - now with real audio stream! */}
      <div className="participant-tile ai-coach">
        <Orb 
          label="AI Coach" 
          stream={aiAudioStream}  // ← This makes the Orb react to AI speech
          size={140}
        />
        <span className="participant-name">Ultra Coach</span>
        <span className="participant-role">AI Coach</span>
      </div>
      
      {/* Coach controls (only visible to coach) */}
      {userRole === 'coach' && (
        <div className="coach-controls">
          <button onClick={() => coachMuteFromAI(!isCoachMuted)}>
            {isCoachMuted ? 'Unmute from AI' : 'Mute from AI'}
          </button>
          <input 
            type="text" 
            placeholder="Whisper to AI..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                sendCoachWhisper(e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
```

### Step 5: Create useAIVoice Hook

**File: `apps/web-client/src/hooks/useAIVoice.ts`**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAIVoiceOptions {
  roomId: string;
  peerId: string;
  role: 'client' | 'coach';
}

interface UseAIVoiceReturn {
  aiAudioStream: MediaStream | null;
  isAIConnected: boolean;
  sendAudioToAI: (audio: Uint8Array) => void;
  coachMuteFromAI: (muted: boolean) => void;
  sendCoachWhisper: (text: string) => void;
  transcript: Array<{ role: string; content: string; timestamp: number }>;
}

export function useAIVoice({ roomId, peerId, role }: UseAIVoiceOptions): UseAIVoiceReturn {
  const [isAIConnected, setIsAIConnected] = useState(false);
  const [aiAudioStream, setAiAudioStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState<Array<{ role: string; content: string; timestamp: number }>>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  
  // Set up AI audio playback stream
  useEffect(() => {
    // Create an AudioContext for playing AI responses
    audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    
    // Create a MediaStreamDestination to get a stream we can pass to the Orb
    const dest = audioContextRef.current.createMediaStreamDestination();
    setAiAudioStream(dest.stream);
    
    return () => {
      audioContextRef.current?.close();
    };
  }, []);
  
  // Connect to AI Voice WebSocket
  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:3001/ws/ai-voice?roomId=${roomId}&peerId=${peerId}&role=${role}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.binaryType = 'arraybuffer';
    
    ws.onopen = () => {
      console.log('[useAIVoice] Connected');
      setIsAIConnected(true);
    };
    
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary = AI audio response
        handleAIAudio(new Uint8Array(event.data));
      } else {
        // JSON = control message
        try {
          const message = JSON.parse(event.data);
          handleAIMessage(message);
        } catch (e) {
          console.error('[useAIVoice] Invalid message:', e);
        }
      }
    };
    
    ws.onclose = () => {
      console.log('[useAIVoice] Disconnected');
      setIsAIConnected(false);
    };
    
    ws.onerror = (err) => {
      console.error('[useAIVoice] Error:', err);
    };
    
    return () => {
      ws.close();
    };
  }, [roomId, peerId, role]);
  
  // Handle incoming AI audio (linear16 PCM at 16kHz)
  const handleAIAudio = useCallback((pcmData: Uint8Array) => {
    if (!audioContextRef.current) return;
    
    // Convert Int16 PCM to Float32
    const int16 = new Int16Array(pcmData.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    
    // Create AudioBuffer
    const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 16000);
    audioBuffer.copyToChannel(float32, 0);
    
    // Queue for playback
    audioQueueRef.current.push(audioBuffer);
    
    if (!isPlayingRef.current) {
      playNextAudio();
    }
  }, []);
  
  const playNextAudio = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    
    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // Connect to destination (for Orb visualization)
    const dest = ctx.destination;
    source.connect(dest);
    
    source.onended = () => {
      playNextAudio();
    };
    
    source.start();
  }, []);
  
  // Handle AI control messages
  const handleAIMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'ConversationText':
        setTranscript(prev => [...prev, {
          role: message.role,
          content: message.content,
          timestamp: Date.now()
        }]);
        break;
        
      case 'UserStartedSpeaking':
        // Clear audio queue for barge-in
        audioQueueRef.current = [];
        break;
    }
  }, []);
  
  // Send audio to AI
  const sendAudioToAI = useCallback((audio: Uint8Array) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(audio);
    }
  }, []);
  
  // Coach mute control
  const coachMuteFromAI = useCallback((muted: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mute_ai',
        muted
      }));
    }
  }, []);
  
  // Coach whisper
  const sendCoachWhisper = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'coach_whisper',
        text
      }));
    }
  }, []);
  
  return {
    aiAudioStream,
    isAIConnected,
    sendAudioToAI,
    coachMuteFromAI,
    sendCoachWhisper,
    transcript
  };
}
```

### Step 6: Update AI Agent Entry Point

**File: `services/ai-agent/src/index.ts` (add bridge mode)**

```typescript
import { BunApiBridge } from './bridges/bun-bridge';
import { DualConnectionManager } from './connections/connection-manager';

const MODE = process.env.AI_AGENT_MODE || 'bridge'; // 'bridge' or 'livekit'

async function main() {
  if (MODE === 'bridge') {
    await runBridgeMode();
  } else {
    await runLiveKitMode();
  }
}

async function runBridgeMode() {
  console.log('[AI Agent] Starting in Bridge mode (Bun API connection)');
  
  const apiUrl = process.env.BUN_API_INTERNAL_URL || 'ws://localhost:3001';
  const bridge = new BunApiBridge(apiUrl);
  
  // Per-room connection managers
  const roomManagers = new Map<string, DualConnectionManager>();
  
  await bridge.connect();
  
  bridge.on('participant_joined', async ({ roomId, peerId, role }) => {
    console.log(`[AI Agent] ${role} ${peerId} joined room ${roomId}`);
    
    // Create connection manager for room if needed
    if (!roomManagers.has(roomId)) {
      const manager = new DualConnectionManager();
      await manager.initialize();
      roomManagers.set(roomId, manager);
      
      // Forward AI audio back to room
      manager.on('ai-audio', (audioBuffer: Buffer) => {
        bridge.sendAIAudio(roomId, audioBuffer);
      });
      
      // Forward transcripts
      manager.on('transcript', (data) => {
        bridge.sendMessage(roomId, {
          type: 'ConversationText',
          role: data.role,
          content: data.content
        });
      });
    }
  });
  
  bridge.on('participant_left', ({ roomId, peerId }) => {
    console.log(`[AI Agent] ${peerId} left room ${roomId}`);
    
    // Clean up if room is empty
    // (check participant count logic here)
  });
  
  bridge.on('audio', ({ roomId, peerId, audio }) => {
    const manager = roomManagers.get(roomId);
    if (!manager) return;
    
    const role = bridge.getParticipantRole(roomId, peerId);
    const isMuted = bridge.isParticipantMuted(roomId, peerId);
    
    // Route audio through the dual connection manager
    manager.routeAudio(audio, peerId, role || 'unknown', isMuted);
  });
  
  bridge.on('mute_changed', ({ roomId, peerId, muted }) => {
    console.log(`[AI Agent] ${peerId} mute changed to ${muted}`);
    // AudioGate in connection manager handles this
  });
  
  bridge.on('coach_whisper', ({ roomId, text }) => {
    const manager = roomManagers.get(roomId);
    if (manager) {
      manager.sendCoachWhisper(text);
    }
  });
  
  console.log('[AI Agent] Bridge mode running');
}

async function runLiveKitMode() {
  // ... existing LiveKit mode code ...
}

main().catch(console.error);
```

---

## Deepgram Voice Agent Settings (Correct Format!)

The Settings message that MUST be sent to Deepgram Voice Agent:

```json
{
  "type": "Settings",
  "audio": {
    "input": {
      "encoding": "linear16",
      "sample_rate": 16000
    },
    "output": {
      "encoding": "linear16",
      "sample_rate": 16000,
      "container": "none"
    }
  },
  "agent": {
    "listen": {
      "provider": {
        "type": "deepgram",
        "model": "nova-3"
      }
    },
    "think": {
      "provider": {
        "type": "open_ai",
        "model": "gpt-4o-mini",
        "temperature": 0.7
      },
      "prompt": "You are a supportive AI wellness coach specializing in vagus nerve health and stress management.\n\nYour approach:\n- Listen actively and reflect back what you hear\n- Ask open-ended questions to understand the client's current state\n- Provide evidence-based suggestions for vagus nerve stimulation\n- Be warm, encouraging, and non-judgmental\n- Keep responses concise and conversational (1-3 sentences)\n- If the client mentions serious mental health concerns, gently suggest professional help\n\nRemember: You're here to support wellness, not provide medical advice."
    },
    "speak": {
      "provider": {
        "type": "deepgram",
        "model": "aura-2-thalia-en"
      }
    }
  }
}
```

### Critical Format Rules

| Field | CORRECT | WRONG |
|-------|---------|-------|
| LLM model location | `think.provider.model` | `think.model` |
| System prompt field | `think.prompt` | `think.instructions` |
| Temperature location | `think.provider.temperature` | `think.temperature` |
| TTS model format | `aura-2-thalia-en` | `aura-asteria-en` (legacy) |
| STT model | `nova-3` | `nova-2` (older) |

---

## Audio Format Requirements

### Browser → AI Agent

- **Encoding**: linear16 (16-bit PCM)
- **Sample Rate**: 16000 Hz
- **Channels**: 1 (mono)
- **Chunk Size**: ~320 samples (20ms)

### AI Agent → Browser

- **Encoding**: linear16 (16-bit PCM)
- **Sample Rate**: 16000 Hz
- **Channels**: 1 (mono)

### Conversion in Browser

```typescript
// Float32 (Web Audio) → Int16 (Deepgram)
function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

// Int16 (Deepgram) → Float32 (Web Audio)
function int16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}
```

---

## Testing Checklist

1. **[ ] Deepgram Connection**
   - Voice Agent WebSocket connects without error
   - Receives `Welcome` then `SettingsApplied` (not `Error`)

2. **[ ] Audio Capture**
   - Browser captures mic at 16kHz
   - Audio worklet produces 16-bit PCM chunks
   - Chunks are ~20ms (320 samples)

3. **[ ] Audio Routing**
   - Client audio reaches Voice Agent
   - Coach audio reaches Voice Agent (when unmuted)
   - Coach audio reaches Transcription (always)

4. **[ ] AI Response**
   - AI audio returns to browser
   - Audio plays through speakers
   - Orb reacts to AI audio (scale + glow)

5. **[ ] Coach Controls**
   - Mute from AI works (AI stops responding to coach)
   - Whisper works (AI acknowledges context without speaking it)

6. **[ ] Transcripts**
   - `ConversationText` events received for user
   - `ConversationText` events received for assistant
   - Full transcript logged

---

## File Summary

| File | Purpose |
|------|---------|
| `apps/api/src/ws/ai-voice.ts` | WebSocket bridge between browser and AI Agent |
| `services/ai-agent/src/bridges/bun-bridge.ts` | AI Agent connection to Bun API |
| `apps/web-client/src/audio/capture-worklet.ts` | Browser audio capture processor |
| `apps/web-client/src/hooks/useAIVoice.ts` | React hook for AI voice connection |
| `apps/web-client/src/pages/CallRoom.tsx` | Updated room with AI audio integration |
| `services/ai-agent/src/connections/voice-agent.ts` | Deepgram Voice Agent connection |

---

## Migration to LiveKit (Future)

When ready to fully migrate to LiveKit:

1. Replace Bun WS signaling with LiveKit room connection
2. Use `@livekit/components-react` for participant tiles
3. AI Agent joins as LiveKit participant
4. Remove bridge layer (direct LiveKit ↔ AI Agent)

The Orb component stays the same — just pass it the AI participant's audio track as a MediaStream.