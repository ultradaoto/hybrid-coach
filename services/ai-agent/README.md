# AI Agent Service

Voice coaching AI agent using LiveKit Agents framework with Deepgram STT/TTS.

## ⚠️ Important: Node.js Only

**This service must run on Node.js, NOT Bun.** LiveKit agents have compatibility issues with the Bun runtime.

## Features

- 🎙️ **Deepgram Nova-3 STT** - Real-time speech-to-text transcription
- 🔊 **Deepgram Aura-2 TTS** - Natural voice synthesis (Thalia voice)
- 🤖 **GPT-4o-mini LLM** - Fast, cost-effective AI responses
- 🔇 **Coach Mute** - Coaches can mute their audio from AI perception
- 📝 **Always-On Transcription** - All audio is transcribed for coach review
- 💰 **Cost-Optimized** - KeepAlive pattern to avoid billing for silence

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your API keys
# Required: DEEPGRAM_API_KEY, LIVEKIT_*, OPENAI_API_KEY

# Development (with hot reload)
npm run dev

# Production
npm run build
npm run start
```

## Architecture

```
src/
├── config/
│   └── deepgram.ts      # SDK client setup, environment validation
├── deepgram-config.ts   # STT/TTS configuration, KeepAlive pattern
├── selective-audio.ts   # Coach mute implementation
├── coaching-agent.ts    # Main agent with Deepgram integration
└── index.ts             # Agent worker entry point
```

## Coach Mute Feature

Coaches can mute their audio from AI perception while maintaining transcription:

```typescript
// From coach's client
import { sendMuteCommand } from './selective-audio';

// Mute coach from AI
await sendMuteCommand(room, true, 'coach-user-id');

// Unmute coach for AI
await sendMuteCommand(room, false, 'coach-user-id');
```

**Dual Routing:**
- AI Stream: Filters out muted participants
- Transcription Stream: Receives ALL audio (for coach review panel)

## Configuration

### STT (Speech-to-Text)

| Setting | Default | Description |
|---------|---------|-------------|
| model | nova-3 | Deepgram model |
| language | en-US | Recognition language |
| interimResults | true | Streaming transcription |
| encoding | linear16 | Audio format |
| sampleRate | 24000 | Sample rate (Hz) |

### TTS (Text-to-Speech)

| Setting | Default | Description |
|---------|---------|-------------|
| model | aura-2-thalia-en | Voice model |
| sampleRate | 24000 | Output sample rate |

### Available Voices

| Voice | ID | Description |
|-------|-----|-------------|
| Thalia | aura-2-thalia-en | Warm, professional (default) |
| Athena | aura-2-athena-en | Confident, authoritative |
| Luna | aura-2-luna-en | Calm, soothing |
| Stella | aura-2-stella-en | Energetic, motivational |
| Orion | aura-2-orion-en | Deep, reassuring |
| Arcas | aura-2-arcas-en | Friendly, approachable |

## Cost Control

The KeepAlive pattern prevents billing for silence:

```typescript
import { KeepAliveManager } from './deepgram-config';

const keepAlive = new KeepAliveManager(3000); // 3 second interval

// When user stops speaking
keepAlive.start(() => connection.keepAlive());

// When user starts speaking again
keepAlive.stop();
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DEEPGRAM_API_KEY | Yes | Deepgram API key |
| LIVEKIT_URL | Yes | LiveKit server URL |
| LIVEKIT_API_KEY | Yes | LiveKit API key |
| LIVEKIT_API_SECRET | Yes | LiveKit API secret |
| OPENAI_API_KEY | Yes | OpenAI API key |

## PM2 Deployment

```javascript
// ecosystem.config.js
{
  name: 'ai-agent',
  script: 'node',
  args: 'dist/index.js',
  interpreter: 'node',  // NOT Bun!
  env: {
    NODE_ENV: 'production',
    LIVEKIT_URL: 'wss://livekit.myultra.coach'
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
npm run dev
```

## Logs

The agent logs all activity with timestamps:

```
[2024-12-13T10:00:00.000Z] [CoachingAgent] 🤖 Coaching agent created
[2024-12-13T10:00:01.000Z] [CoachingAgent] 🚀 Starting coaching agent...
[2024-12-13T10:00:02.000Z] [CoachingAgent] ✅ Coaching agent started successfully
[2024-12-13T10:00:02.500Z] [CoachingAgent] 👋 Saying greeting...
[2024-12-13T10:00:05.000Z] [CoachingAgent] 📝 User said: "Hello, I'm feeling stressed"
```

## References

- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [Deepgram Plugin](https://github.com/livekit/agents-js/tree/main/plugins/deepgram)
- [Deepgram API Documentation](https://developers.deepgram.com/docs)
