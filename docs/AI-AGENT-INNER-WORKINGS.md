# AI Agent Inner Workings

This document describes the architecture and implementation of the Hybrid-Coach AI Agent service, which provides real-time voice coaching capabilities using LiveKit and Deepgram.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LiveKit Room                                       │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐                              │
│   │  Client  │    │  Coach   │    │ AI Agent │                              │
│   │  Audio   │    │  Audio   │    │ (speaks) │                              │
│   └────┬─────┘    └────┬─────┘    └────▲─────┘                              │
└────────┼───────────────┼───────────────┼────────────────────────────────────┘
         │               │               │
         ▼               ▼               │
┌────────────────────────────────────────┼────────────────────────────────────┐
│                  AI Agent Service (Node.js)                                  │
│                                        │                                     │
│   ┌────────────────────────────────────┴───────────────────────────────┐    │
│   │                    Audio Router / Gating Layer                      │    │
│   │                                                                     │    │
│   │  Client Audio ──────────────► Voice Agent WebSocket                 │    │
│   │                                                                     │    │
│   │  Coach Audio ───┬───────────► Voice Agent WebSocket (when unmuted)  │    │
│   │                 │                                                   │    │
│   │                 └───────────► Transcription WebSocket (always)      │    │
│   └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│   ┌─────────────────────────┐    ┌─────────────────────────┐                │
│   │  Voice Agent WebSocket  │    │  Transcription WebSocket │                │
│   │  (Deepgram Agent API)   │    │  (Deepgram Listen API)   │                │
│   │                         │    │                          │                │
│   │  • STT + LLM + TTS      │    │  • Always-on STT         │                │
│   │  • AI responses         │    │  • Full transcript log   │                │
│   │  • Function calling     │    │  • Coach muted periods   │                │
│   └─────────────────────────┘    └──────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Dual-Connection Pattern

The AI Agent uses **two simultaneous Deepgram WebSocket connections**:

### 1. Voice Agent Connection (`wss://agent.deepgram.com/v1/agent/converse`)

- Handles the conversational AI pipeline: STT → LLM → TTS
- Receives client audio (always) and coach audio (when unmuted)
- Outputs AI voice responses
- Supports function calling, prompt updates, and barge-in detection

### 2. Transcription Connection (`wss://api.deepgram.com/v1/listen`)

- Always-on speech-to-text for logging
- Receives coach audio even when muted from Voice Agent
- Provides full session transcript for records

## File Structure

```
services/ai-agent/
├── src/
│   ├── index.ts                    # Entry point, room connection
│   ├── coaching-agent.ts           # Main orchestration class
│   ├── config/
│   │   └── deepgram.ts             # Environment validation
│   ├── connections/
│   │   ├── voice-agent.ts          # Deepgram Voice Agent WebSocket
│   │   ├── transcription.ts        # Deepgram Listen API WebSocket
│   │   └── connection-manager.ts   # Manages both connections
│   ├── audio/
│   │   ├── router.ts               # Routes audio to connections
│   │   ├── gating.ts               # Coach mute logic + KeepAlive
│   │   └── opus-handler.ts         # Audio config constants
│   ├── features/
│   │   ├── coach-whisper.ts        # Silent prompt injection
│   │   ├── function-calling.ts     # AI function execution
│   │   └── index.ts                # Feature exports
│   ├── types/
│   │   └── deepgram-events.ts      # TypeScript event definitions
│   ├── deepgram-config.ts          # STT/TTS configuration
│   └── selective-audio.ts          # Participant filtering
├── package.json
├── tsconfig.json
└── README.md
```

## Deepgram Voice Agent API Settings

**This is the correct Settings format for Deepgram Voice Agent API v1:**

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
        "model": "nova-2"
      }
    },
    "think": {
      "provider": {
        "type": "open_ai",
        "model": "gpt-4o-mini",
        "temperature": 0.7
      },
      "prompt": "Your system prompt here..."
    },
    "speak": {
      "provider": {
        "type": "deepgram",
        "model": "aura-asteria-en"
      }
    }
  }
}
```

### Key Format Rules (Learned the Hard Way!)

| Field | Correct | Wrong |
|-------|---------|-------|
| LLM model | `think.provider.model` | `think.model` |
| System prompt | `think.prompt` | `think.instructions` |
| Temperature | `think.provider.temperature` | `think.temperature` |
| Listen model | `listen.provider.model` | `listen.model` |

## Event Types

### Server → Client Events

| Event | Description |
|-------|-------------|
| `Welcome` | Connection established, includes `request_id` |
| `SettingsApplied` | Settings accepted successfully |
| `Error` | Configuration or runtime error |
| `ConversationText` | Transcript of user or assistant speech |
| `UserStartedSpeaking` | Barge-in detection |
| `AgentAudioDone` | AI finished speaking |
| `FunctionCallRequest` | AI wants to call a function |
| `PromptUpdated` | Coach whisper applied |

### Client → Server Messages

| Message | Description |
|---------|-------------|
| `Settings` | Initial configuration |
| `UpdatePrompt` | Inject silent context (coach whisper) |
| `InjectUserMessage` | Simulate user saying something |
| `InjectAgentMessage` | Force agent to say something |
| `FunctionCallResponse` | Return function result |
| `KeepAlive` | Maintain connection during silence |

## Features

### 1. Coach Whisper

Allows the coach to silently inject context into the AI's prompt without speaking:

```typescript
connectionManager.sendCoachWhisper('Focus on breathing exercises for the next few minutes.');
```

### 2. Function Calling

The AI can call predefined functions mid-conversation:

- `get_client_history` - Fetch previous session notes
- `log_session_insight` - Log important breakthroughs
- `get_vagus_exercises` - Get recommended exercises

### 3. Audio Gating

When coach is muted:
- Audio stops flowing to Voice Agent
- KeepAlive messages sent every 8 seconds
- Audio continues flowing to Transcription for logging

### 4. Barge-In Handling

When `UserStartedSpeaking` is received:
- AI audio playback stops immediately
- Provides natural conversational flow

## Environment Variables

```bash
# Required
DEEPGRAM_API_KEY=xxx
LIVEKIT_URL=wss://your-livekit-server.livekit.cloud
LIVEKIT_API_KEY=xxx
LIVEKIT_API_SECRET=xxx
OPENAI_API_KEY=xxx

# Optional
DEEPGRAM_VOICE_MODEL=aura-asteria-en
DEEPGRAM_LLM_MODEL=gpt-4o-mini
```

## Running the Agent

```bash
# Development
npm run dev:ai-agent

# Production
npm run build:ai-agent
npm run start:ai-agent
```

## Successful Connection Sequence

```
[VoiceAgent] 🔌 Connecting to Voice Agent API...
[VoiceAgent] ✅ Connected to Voice Agent API
[VoiceAgent] 📤 Sending settings: { ... }
[VoiceAgent] ⚙️ Settings sent
[VoiceAgent] 📥 {"type":"Welcome","request_id":"..."}
[VoiceAgent] 👋 Welcome received
[VoiceAgent] 📥 {"type":"SettingsApplied"}
[VoiceAgent] ⚙️ Settings applied
```

## Troubleshooting

### Error: "Check the agent.think field against the API spec"

The Settings format is wrong. Common issues:
- Using `instructions` instead of `prompt`
- Putting `model` at wrong nesting level
- Using `temperature` instead of putting it inside `provider`

### Error: Code 1005 - No Status Received

Settings message was malformed. Check:
- All provider objects have `type` and `model`
- Audio encoding is `linear16` at `16000` Hz
- JSON is valid (no trailing commas, etc.)

### Connection closes immediately after Welcome

The Settings message is being rejected. Add logging to see the exact Settings JSON being sent and compare against the format documented above.

## Runtime Requirements

- **Node.js 18+** (required for LiveKit native bindings)
- Cannot run on Bun due to WebRTC native module requirements
- PM2 or similar for production process management

## Related Documentation

- [Deepgram Voice Agent API](https://developers.deepgram.com/docs/voice-agent)
- [Deepgram V1 Migration Guide](https://developers.deepgram.com/docs/voice-agent-v1-migration)
- [LiveKit RTC Node SDK](https://docs.livekit.io/realtime/libs/rtc-node/)
