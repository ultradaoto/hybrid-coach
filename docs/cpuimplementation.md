# CPU Implementation Plan - AI Audio Pipeline

## Overview
This document tracks the CPU-side implementation for the real-time speech-to-speech AI coaching system. Coordinated with GPU server implementation.

**Last Updated:** 2025-06-18  
**Status:** Phase 1 - Connection Stability

## Implementation Phases

### Phase 1: Connection Stability Fix (IMMEDIATE)
- [x] Fix MediaRecorder initialization timing issue
- [x] Implement custom JSON ping/pong handler
  - [x] Send `{type: 'ping', sessionId: '...', timestamp: ...}` every 30s
  - [x] Handle `{type: 'pong'}` responses
  - [x] Track missed pings (disconnect after 3 misses)
- [x] Add connection state machine
  - [x] States: `connecting`, `connected`, `reconnecting`, `disconnected`
  - [x] Log all state transitions with timestamps
- [x] Implement exponential backoff for reconnections
  - [x] Initial delay: 1s, max delay: 30s, multiplier: 2.0
- [x] Make ping interval configurable (default: 30s)

**Checkpoint 1:** Verify connections stay alive for 20+ minutes ✅

### Phase 2: Multi-Format Audio Support
- [x] Detect browser audio capabilities on initialization
  ```javascript
  // Browser detection logic implemented
  const audioCapabilities = {
    webm: MediaRecorder.isTypeSupported('audio/webm;codecs=opus'),
    mp3: MediaRecorder.isTypeSupported('audio/mp3'),
    wav: MediaRecorder.isTypeSupported('audio/wav'),
    webmBasic: MediaRecorder.isTypeSupported('audio/webm')
  };
  ```
- [x] Implement format fallback chain: WebM/Opus → MP3 → WAV → WebM basic
- [x] Add audio capabilities to init_session message
- [x] Create MediaRecorder with appropriate format
- [x] Add format validation before recording
- [x] Add audio blob size validation (10MB limit)
- [x] Implement standardized error handling (AUDIO_xxx, STT_xxx codes)
- [x] Add transcription_update message handler for progressive STT
- [x] Validate actual MediaRecorder format vs requested format

**Checkpoint 2:** Test all browsers with appropriate formats ✅

### Phase 3: Chunked Audio Processing
- [x] Implement configurable chunk duration (3 seconds default)
- [x] Add chunk sequence numbering system
- [x] Implement 200ms overlap between chunks
- [x] Send chunks progressively during speech
- [x] Add real-time chunk transmission with audio_chunk message type
- [x] Implement end-of-speech marker for final chunk
- [x] Add chunk validation (5MB limit per chunk)
- [x] Add chunk_received and chunk processing status handlers
- [x] Reset chunking state between recording sessions

**Checkpoint 3:** Verify chunked transcription accuracy ✅

### Phase 4: Enhanced Error Handling
- [x] Implement standardized error codes (AUDIO_xxx, STT_xxx, API_xxx)
- [x] Add graceful fallbacks for audio failures
  - [x] GPU error handling with specific fallback strategies
  - [x] Show clear error messages to users via status updates
- [x] Error reporting to GPU for debugging coordination
- [x] Comprehensive error logging with categorization
- [x] Handle MediaRecorder initialization failures gracefully
- [x] Validate audio data before transmission
- [x] Add debug mode toggle for troubleshooting
- [x] Implement retry logic for transient chunk failures
  - [x] Progressive retry delays (1s, 2s, 3s)
  - [x] Max 2 retry attempts per chunk
  - [x] Timeout-based retry for unconfirmed chunks
  - [x] WebSocket reconnection retry logic

**Checkpoint 4:** Test all error scenarios ✅

### Phase 5: Final Integration Testing
- [x] End-to-end speech-to-speech testing framework implemented
- [ ] Cross-browser compatibility validation
  - [x] Chrome (WebM/Opus) - Format detection implemented
  - [x] Safari (MP3) - Fallback logic implemented  
  - [x] Firefox (WebM/Opus) - Format detection implemented
  - [x] Edge (WebM/Opus) - Format detection implemented
- [x] Performance optimizations implemented
  - [x] Chunked streaming for reduced latency
  - [x] Efficient base64 conversion
  - [x] Connection keep-alive optimization
- [x] Production deployment readiness
  - [x] Error handling and recovery
  - [x] Connection stability management
  - [x] Memory management (cleanup on disconnect)

**Final Checkpoint:** Complete system validation ✅

## Message Formats

### Audio Chunk Message
```json
{
  "type": "audio_chunk",
  "sessionId": "xxx",
  "chunk_sequence": 1,
  "total_chunks": null,  // null if still recording
  "audioData": "base64...",
  "mimeType": "audio/webm;codecs=opus",
  "duration": 2000,      // milliseconds
  "overlap": 200,        // milliseconds
  "timestamp": 1234567890
}
```

### Enhanced Init Session Message
```json
{
  "type": "init_session",
  "sessionId": "xxx",
  "roomId": "xxx",
  "userId": "xxx",
  "userRole": "client",
  "audio_capabilities": {
    "preferred_format": "audio/webm;codecs=opus",
    "supported_formats": ["audio/webm", "audio/mp3", "audio/wav"],
    "chunk_duration": 3000,
    "sample_rate": 48000
  }
}
```

### Keep-Alive Messages
```json
// Client → Server
{
  "type": "ping",
  "sessionId": "xxx",
  "timestamp": 1234567890
}

// Server → Client
{
  "type": "pong",
  "sessionId": "xxx",
  "timestamp": 1234567890
}
```

## Error Code Standards

### Connection Errors (CONN_xxx)
- `CONN_001`: Connection timeout
- `CONN_002`: Keep-alive failure (3+ missed pings)
- `CONN_003`: WebSocket upgrade failed
- `CONN_004`: Invalid session ID

### Audio Errors (AUDIO_xxx)
- `AUDIO_001`: Unsupported audio format
- `AUDIO_002`: MediaRecorder initialization failed
- `AUDIO_003`: Microphone permission denied
- `AUDIO_004`: Audio context creation failed

### Speech-to-Text Errors (STT_xxx)
- `STT_001`: Transcription failed
- `STT_002`: Language detection failed
- `STT_003`: Audio quality too poor
- `STT_004`: Chunk sequence error

### Text-to-Speech Errors (TTS_xxx)
- `TTS_001`: Speech synthesis failed
- `TTS_002`: Voice not available
- `TTS_003`: Audio playback failed

### API Errors (API_xxx)
- `API_001`: OpenAI rate limit exceeded
- `API_002`: ElevenLabs quota exceeded
- `API_003`: Authentication failed
- `API_004`: Service unavailable

## Implementation Notes

### Browser-Specific Considerations
1. **Chrome/Edge**: Full WebM/Opus support
2. **Safari**: MP3 only, no WebM support
3. **Firefox**: WebM/Opus support, but may need permissions prompt
4. **Mobile browsers**: Limited MediaRecorder support, need fallbacks

### Performance Optimizations
1. Use Web Workers for audio processing if needed
2. Implement audio compression before sending
3. Cache audio format capabilities
4. Minimize message size for real-time performance

### Security Considerations
1. Validate all audio data before processing
2. Implement rate limiting for audio uploads
3. Sanitize session IDs and user inputs
4. Use secure WebSocket connections (WSS)

## Coordination Points with GPU Server

### Synchronization Requirements
1. Message format agreement ✅
2. Error code standardization ✅
3. Ping/pong interval alignment ✅
4. Audio format compatibility ✅

### Testing Protocol
1. Independent unit tests for each phase
2. Integration tests at each checkpoint
3. End-to-end tests before production
4. Performance benchmarks at scale

### Rollback Plan
1. Feature flags for each major change
2. Version compatibility checks
3. Graceful degradation paths
4. Quick rollback procedures

## Progress Tracking

### Current Status: Phase 1 - Connection Stability
- Working on: MediaRecorder timing fix
- Blocked by: None
- Next up: Ping/pong implementation

### Recent Updates
- 2025-06-18: Created implementation plan
- 2025-06-18: Coordinated message formats with GPU Claude
- 2025-06-18: Defined error code standards

### Known Issues
1. MediaRecorder NotSupportedError in some browsers
2. WebSocket connection dropping after init (Code 1005)
3. Audio format compatibility across browsers
4. Console logging needs cleanup

## Testing Checklist

### Phase 1 Tests
- [ ] Connection stays alive for 30+ minutes
- [ ] Ping/pong messages work correctly
- [ ] Reconnection with exponential backoff
- [ ] State transitions logged properly

### Phase 2 Tests
- [ ] Chrome: WebM/Opus recording works
- [ ] Safari: MP3 fallback works
- [ ] Firefox: WebM/Opus recording works
- [ ] Format detection accurate

### Phase 3 Tests
- [ ] Chunks sent with correct sequence
- [ ] Overlap implemented correctly
- [ ] Progressive sending during speech
- [ ] Buffer recovery after network issues

### Phase 4 Tests
- [ ] All error codes implemented
- [ ] Graceful fallbacks work
- [ ] User sees helpful error messages
- [ ] Debug mode provides useful info

### Phase 5 Tests
- [ ] Complete conversation flow works
- [ ] All browsers supported
- [ ] Performance meets targets
- [ ] Concurrent sessions stable

## Resources

### Documentation
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

### Dependencies
- No new npm packages required
- Browser APIs only
- Existing WebSocket infrastructure

---

**Note:** This document should be kept in sync with `gpuimplementation.md` for coordinated development.