# Deepgram Voice Agent Fixes Applied

## Date: 2025-12-15

## Summary
Fixed critical issues preventing AI Voice Agent from connecting to Deepgram APIs, based on official Deepgram support guidance.

---

## Issues Fixed

### ❌ Issue #1: Voice Agent API Settings Parse Error
**Error:** `"Error parsing client message. Check the agent.listen.endpointing field against the API spec."`

**Root Cause:** Added invalid fields `endpointing` and `utterance_end_ms` to Voice Agent settings. These are only valid for Listen API URL parameters, NOT Voice Agent Settings.

**Fix:** Removed invalid fields from Voice Agent Settings schema.

---

### ❌ Issue #2: Listen API 400 Bad Request
**Error:** `"Unexpected server response: 400"` when connecting to Listen API

**Root Cause:** Advanced URL parameters (`utterance_end_ms`, `endpointing`) were causing API rejection.

**Fix:** Simplified Listen API URL parameters to well-tested core parameters only.

---

## Changes Applied

### ✅ 1. Voice Agent Settings (voice-agent.ts)

#### Changed Values:
| Field | Old Value | New Value | Status |
|-------|-----------|-----------|--------|
| `agent.listen.provider.model` | `nova-2` | `nova-3` | ✅ Confirmed by Deepgram |
| `agent.speak.provider.model` | `aura-asteria-en` | `aura-2-thalia-en` | ✅ Confirmed by Deepgram |
| `audio.input.sample_rate` | `16000` | `24000` | ✅ Recommended by Deepgram |
| `audio.output.sample_rate` | `16000` | `24000` | ✅ Recommended by Deepgram |
| `agent.language` | (missing) | `'en'` | ✅ Added per guidance |
| `agent.greeting` | (missing) | From config | ✅ Added for spoken welcome |

#### Removed Invalid Fields:
- ❌ `agent.listen.endpointing` - NOT valid in Voice Agent API
- ❌ `agent.listen.utterance_end_ms` - NOT valid in Voice Agent API

#### Final Settings Format:
```typescript
{
  type: 'Settings',
  audio: {
    input: { encoding: 'linear16', sample_rate: 24000 },
    output: { encoding: 'linear16', sample_rate: 24000, container: 'none' }
  },
  agent: {
    language: 'en',
    listen: {
      provider: { type: 'deepgram', model: 'nova-3' }
    },
    think: {
      provider: { type: 'open_ai', model: 'gpt-4o-mini', temperature: 0.7 },
      prompt: '...'
    },
    speak: {
      provider: { type: 'deepgram', model: 'aura-2-thalia-en' }
    },
    greeting: 'Hello! I\'m your AI wellness coach...'
  }
}
```

---

### ✅ 2. Listen API URL Parameters (opus-handler.ts)

#### Removed Problematic Parameters:
- ❌ `utterance_end_ms: '500'` - Can cause 400 errors
- ❌ `endpointing: '300'` - Can cause 400 errors

#### Final URL Parameters:
```typescript
{
  encoding: 'linear16',
  sample_rate: '24000',
  channels: '1',
  model: 'nova-2',
  punctuate: 'true',
  interim_results: 'true',
  vad_events: 'true'
}
```

---

### ✅ 3. Audio Sample Rate Updates (24kHz Throughout)

Updated all audio configurations to use 24kHz as recommended by Deepgram:

**Files Updated:**
- ✅ `services/ai-agent/src/connections/voice-agent.ts` - Voice Agent settings
- ✅ `services/ai-agent/src/audio/opus-handler.ts` - Audio configs
- ✅ `services/ai-agent/src/livekit-agent.ts` - AudioStream creation (3 locations)

**Specific Changes in livekit-agent.ts:**
1. `AudioStream(track, 24000, 1)` - Changed from 16000
2. `AudioSource(24000, 1, 10000)` - Changed from 16000  
3. `AudioFrame(samples, 24000, 1, samples.length)` - Changed from 16000

---

## Why These Changes Matter

### Voice Agent Settings Parse Error
The Voice Agent API has a **strict schema** for Settings messages. Adding fields that don't exist in the schema causes immediate rejection with `UNPARSABLE_CLIENT` error. The `endpointing` and `utterance_end_ms` fields are only valid for the standalone Listen API (used via URL parameters), not the Voice Agent API which handles turn detection internally.

### Listen API 400 Error
The Listen API is sensitive to parameter combinations. While `utterance_end_ms` and `endpointing` are valid parameters, they can conflict with other settings or be rejected depending on the model/encoding combination. Using minimal, well-tested parameters ensures reliable connections.

### 24kHz Sample Rate
Deepgram officially recommends 24kHz for Voice Agent:
- Better audio quality than 16kHz
- Lower latency than 48kHz
- Optimal balance for real-time conversation
- Native support in both nova-3 (STT) and aura-2-thalia-en (TTS)

---

## Expected Results

After applying these fixes, the AI Voice Agent should:

1. ✅ Connect successfully to Voice Agent API without parse errors
2. ✅ Connect successfully to Listen API without 400 errors
3. ✅ Receive and process client audio properly
4. ✅ Generate AI responses with nova-3 STT and aura-2-thalia-en TTS
5. ✅ Provide a spoken greeting when joining the room
6. ✅ Maintain stable connections throughout the session

---

## Testing Instructions

1. **Restart AI Agent Service** (to pick up new settings)
2. **Start a new coaching session**
3. **Check server logs for success indicators:**

```bash
# Voice Agent connection
[VoiceAgent] ✅ Connected to Voice Agent API
[VoiceAgent] 📤 Sending DEEPGRAM-CONFIRMED settings
[VoiceAgent] ⚙️ Settings sent with nova-3 + aura-2-thalia-en + 24kHz
[VoiceAgent] ⚙️ Settings applied

# Listen API connection  
[Transcription] ✅ Connected to Listen API

# Audio flow
[LiveKitAgent] ✅ FIRST FRAME received from client-xxxxx (client) - audio is flowing!
[DualConnection] ✅ FIRST AUDIO FRAME from client-xxxxx reached connection manager
[AudioRouter] ✅ FIRST FRAME sent to Deepgram Voice Agent
```

4. **Test interaction:**
   - Client speaks: "Hello"
   - AI should respond within 2-3 seconds with greeting
   - Check Orb visualization animates with AI voice
   - Verify transcript appears in coach view

---

## Files Modified

1. ✅ `services/ai-agent/src/connections/voice-agent.ts` - Voice Agent settings
2. ✅ `services/ai-agent/src/audio/opus-handler.ts` - Listen API URL + audio configs
3. ✅ `services/ai-agent/src/livekit-agent.ts` - Sample rate updates (3 locations)

---

## Key Takeaways

### What Works in Voice Agent API:
✅ `agent.listen.provider.model: 'nova-3'`
✅ `agent.speak.provider.model: 'aura-2-thalia-en'`
✅ `audio.*.sample_rate: 24000`
✅ `agent.language: 'en'`
✅ `agent.greeting: '...'`

### What DOESN'T Work in Voice Agent API:
❌ `agent.listen.endpointing` - Not a valid field
❌ `agent.listen.utterance_end_ms` - Not a valid field
❌ These are only for Listen API URL parameters

### Voice Agent vs Listen API:
- **Voice Agent** = Full conversational AI (STT + LLM + TTS) - Configure via Settings message
- **Listen API** = STT only - Configure via URL parameters

---

## Reference

- Deepgram Voice Agent API Docs: https://developers.deepgram.com/docs/configure-voice-agent
- Deepgram Listen API Docs: https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio
- Official Deepgram Support Confirmation: Received 2025-12-15

---

## Status: ✅ COMPLETE

All fixes have been applied. The AI Voice Agent should now connect successfully to both Deepgram APIs and handle client conversations properly.
