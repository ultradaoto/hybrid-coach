# AI Agent Service - Dual Connection Architecture

Voice coaching AI agent using LiveKit with Deepgram dual WebSocket connections.

## ⚠️ Important: Node.js Only

**This service must run on Node.js, NOT Bun.** LiveKit agents have compatibility issues with the Bun runtime.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LiveKit Room                                       │
│                                                                              │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐                         │
│   │  Client  │      │  Coach   │      │ AI Agent │                         │
│   │  Audio   │      │  Audio   │      │ (speaks) │                         │
│   └────┬─────┘      └────┬─────┘      └────▲─────┘                         │
└────────┼─────────────────┼──────────────────┼───────────────────────────────┘
         │                 │                  │
         ▼                 ▼                  │
┌────────────────────────────────────────────────────────────────────────────┐
│                        AI Agent Service (Node.js)                           │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    Audio Router / Gating Layer                       │  │
│   │                                                                      │  │
│   │   Client Audio ───────────────────┬─────────────────────────────────│  │
│   │                                    │                                 │  │
│   │   Coach Audio ────┬────────────────┼─────────────────────────────────│  │
│   │                   │                │                                 │  │
│   │          [Mute Gate]               │                                 │  │
│   └───────────────────┼────────────────┼─────────────────────────────────┘  │
│                       │                │                                     │
│                       ▼                ▼                                     │
│   ┌──────────────────────────┐   ┌──────────────────────────┐              │
│   │   VOICE AGENT WebSocket  │   │    STT WebSocket         │              │
│   │   (Deepgram Agent API)   │   │    (Deepgram Listen)     │              │
│   │                          │   │                          │              │
│   │ • Client audio: ALWAYS   │   │ • Client audio: ALWAYS   │              │
│   │ • Coach audio: GATED     │   │ • Coach audio: ALWAYS    │              │
│   │                          │   │                          │              │
│   │ When coach muted:        │   │ Outputs:                 │              │
│   │ → Stop coach audio       │   │ → Full transcript log    │              │
│   │ → Send KeepAlive q/8s    │   │ → Speaker attribution    │              │
│   │                          │   │                          │              │
│   │ Outputs:                 │   │                          │              │
│   │ → AI voice responses ────┼───┼──────────────────────────┼──► LiveKit  │
│   └──────────────────────────┘   └──────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Features

- 🎙️ **Deepgram Nova-3 STT** - Real-time speech-to-text transcription
- 🔊 **Deepgram Aura-2 TTS** - Natural voice synthesis (Thalia voice)
- 🤖 **GPT-4o-mini LLM** - Fast, cost-effective AI responses
- 🔇 **Coach Mute** - Coaches can mute their audio from AI perception
- 📝 **Always-On Transcription** - All audio is transcribed for coach review
- 💰 **KeepAlive Pattern** - Prevents disconnection during silence/mute (8s interval)
- 🎵 **Opus Passthrough** - No decoding needed, direct to Deepgram

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your API keys

# Development (with hot reload)
npm run dev -- --room my-coaching-session

# Production
npm run build
npm run start -- --room production-session-123
```

## File Structure

```
src/
├── config/
│   └── deepgram.ts              # SDK client setup, environment validation
├── connections/
│   ├── voice-agent.ts           # Voice Agent WebSocket (AI responses)
│   ├── transcription.ts         # STT WebSocket (always-on logging)
│   └── connection-manager.ts    # Dual connection lifecycle
├── audio/
│   ├── router.ts                # Routes audio to appropriate connections
│   ├── gating.ts                # Coach mute logic with KeepAlive
│   └── opus-handler.ts          # Opus frame handling (no decode needed)
├── coaching-agent.ts            # Main agent orchestration
└── index.ts                     # Entry point with CLI
```

## Dual Connection Pattern

### Voice Agent Connection
- URL: `wss://agent.deepgram.com/v1/agent/converse`
- Purpose: AI responses (STT + LLM + TTS in one WebSocket)
- Input: Client audio (always) + Coach audio (when unmuted)
- Output: AI voice responses to LiveKit

### Transcription Connection
- URL: `wss://api.deepgram.com/v1/listen`
- Purpose: Always-on transcription for coach review panel
- Input: ALL audio (client + coach, regardless of mute state)
- Output: Transcript events with speaker attribution

## Coach Mute Feature

Coaches can mute their audio from AI perception while maintaining transcription:

```typescript
// From coach's client (via LiveKit data channel)
const command = {
  type: 'mute-from-ai',
  muted: true,
  participantId: 'coach-user-id'
};
room.localParticipant.publishData(JSON.stringify(command), { reliable: true });
```

**Dual Routing:**
- Voice Agent: Receives filtered audio (excludes muted participants)
- Transcription: Receives ALL audio (for coach review panel)

## Audio Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Encoding | opus | WebRTC native, no decoding needed |
| Sample Rate | 48000 | WebRTC default for voice |
| Channels | 1 | Mono |
| Frame Size | 20-60ms | Within Deepgram's 20-80ms recommendation |

## KeepAlive Pattern

Prevents Voice Agent disconnection during silence/mute:

```typescript
// When coach is muted and no client audio:
// → Stop sending audio chunks
// → Send KeepAlive every 8 seconds
// → Resume sending when audio resumes
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DEEPGRAM_API_KEY | Yes | Deepgram API key |
| LIVEKIT_URL | Yes | LiveKit server URL |
| LIVEKIT_API_KEY | Yes | LiveKit API key |
| LIVEKIT_API_SECRET | Yes | LiveKit API secret |
| OPENAI_API_KEY | Yes | OpenAI API key |
| LIVEKIT_ROOM | No | Default room name |

## CLI Options

```bash
node dist/index.js [options]

Options:
  --room <name>   LiveKit room name to join (default: test-room)
  --quiet         Reduce logging verbosity
  --help          Show help message
```

## Testing Milestones

- [ ] Voice Agent connection opens and responds to "hello"
- [ ] Transcription connection logs all audio to console
- [ ] Both connections receive the same client audio simultaneously
- [ ] Coach mute stops Voice Agent from responding to coach
- [ ] Transcription continues during coach mute
- [ ] KeepAlive prevents Voice Agent disconnection during extended mute
- [ ] Coach unmute resumes normal Voice Agent behavior

## PM2 Deployment

```javascript
// ecosystem.config.js
{
  name: 'ai-agent',
  script: 'node',
  args: 'dist/index.js --room production-session',
  interpreter: 'node',  // NOT Bun!
  env: {
    NODE_ENV: 'production'
  }
}
```

## Development

```bash
# Type check
npm run typecheck

# Build
npm run build

# Dev with hot reload
npm run dev -- --room test-room
```

## References

- [Deepgram Voice Agent API](https://developers.deepgram.com/docs/voice-agent-api)
- [Deepgram Listen API](https://developers.deepgram.com/docs/live-streaming-audio)
- [Deepgram KeepAlive](https://developers.deepgram.com/docs/audio-keep-alive)
- [LiveKit RTC Node](https://docs.livekit.io/realtime/client-sdks/livekit-rtc/)
