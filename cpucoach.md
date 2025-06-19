# CPU Coach Integration Implementation Guide

## 🎯 Overview
Implement tri-party coaching system on the CPU side to handle coach audio transcription via GPU without triggering AI responses. This enables coaches to provide guidance during AI-client sessions while maintaining complete session documentation.

## 📊 Session Participant Roles

| Participant | Audio Processing | AI Response | Transcript Recording | CPU Implementation |
|-------------|------------------|-------------|---------------------|-------------------|
| **Client** | Audio → GPU STT → OpenAI → TTS | ✅ YES | ✅ YES | Existing `client_audio_data` pipeline |
| **Coach** | Audio → GPU STT only | ❌ NO | ✅ YES | **NEW** `coach_audio_data` pipeline |
| **AI** | TTS generation | N/A | ✅ YES | Existing audio playback system |

## 🔧 Implementation Components

### 1. **Audio Source Detection**
```javascript
function determineAudioSource() {
    return userRole === 'coach' ? 'coach' : 'client';
}
```

### 2. **Coach Audio Message Protocol**
```javascript
const coachChunkMessage = {
    type: 'coach_audio_data',        // NEW message type
    sessionId: sessionId,
    audioData: base64Audio,
    mimeType: currentMimeType,
    timestamp: new Date().toISOString(),
    speaker: 'coach',
    metadata: {
        aiWasPaused: isAIPaused,
        interventionType: getCurrentInterventionType(),
        coachId: userId,
        sessionPhase: 'active'
    }
};
```

### 3. **Enhanced WebSocket Handlers**
```javascript
case 'coach_transcription':
    // Display coach transcription without AI response
    addTranscriptItem('Coach', data.transcript, 'coach');
    updateStatus(`Coach: "${data.transcript.substring(0, 30)}..."`, 'info');
    break;

case 'coach_finished_speaking':
    // AI remains in listening state, no response triggered
    updateAIStatus('listening');
    break;
```

### 4. **Speech Coordination Updates**
```javascript
class SpeechCoordinator {
    handleCoachStartedSpeaking() {
        this.coachSpeaking = true;
        // AI can continue but coach audio gets separate processing
    }
    
    getBlockingReason() {
        if (this.isCoachSpeaking()) return 'coach speaking';
        // Existing logic...
    }
}
```

## 🎮 User Experience Flow

### For Coaches:
1. **Speak Naturally** → Audio automatically detected as coach source
2. **GPU Transcription** → Speech converted to text (no AI response)
3. **Transcript Display** → Coach intervention visible in session log
4. **AI Remains Ready** → Client can continue conversation with AI

### For Clients:
1. **Seamless Experience** → Coach interventions don't disrupt AI flow
2. **Professional Coaching** → Both AI and human guidance available
3. **Natural Conversation** → AI responds only to client, not coach

## 🔄 Audio Processing Pipeline

### Client Audio (Existing):
```
Client speaks → MediaRecorder → sendAudioChunk() → client_audio_data → GPU STT → OpenAI → TTS → AI Response
```

### Coach Audio (NEW):
```
Coach speaks → MediaRecorder → sendCoachAudioChunk() → coach_audio_data → GPU STT → coach_transcription → Display Only
```

## 📱 UI Enhancements

### Coach Control Panel:
- **Intervention Type Selector**: Guidance, Clarification, Redirect, Pause
- **Coach Mic Toggle**: Visual indicator when coach is speaking
- **Session Timer**: Track session duration
- **Enhanced Transcript**: Multi-party conversation view

### Enhanced Transcript Display:
```
👤 Client (14:23:15): I'm feeling anxious about my breathing
🤖 AI (14:23:18): Let's try the 4-7-8 breathing technique...
👨‍🏫 Coach (14:23:45): That's great - also notice how your shoulders relax
👤 Client (14:23:50): Yes, I can feel that difference now
```

## 🧪 Testing Scenarios

### Test Case 1: Coach Guidance During Session
1. Client asks about anxiety management
2. AI provides breathing technique  
3. Coach adds clarification: "Also notice your posture"
4. ✅ Coach transcription appears in transcript
5. ✅ AI does not respond to coach
6. Client responds to both AI and coach guidance

### Test Case 2: Coach Intervention Types
1. **Guidance**: Coach adds additional tips
2. **Clarification**: Coach simplifies AI explanation  
3. **Redirect**: Coach steers conversation direction
4. **Pause**: Coach pauses AI for private guidance

### Test Case 3: Error Recovery
1. Coach audio fails to transcribe
2. Fallback: Coach can type intervention
3. Session continues smoothly

## 🎯 Integration Checklist

- [x] Create `sendCoachAudioChunk()` function
- [x] Add coach message handlers to `handleAIMessage()`
- [x] Implement audio source detection
- [x] Enhance `SpeechCoordinator` for coach support
- [x] Add coach control panel UI
- [x] Update transcript display for multi-party
- [x] Implement intervention type selector
- [x] Add error handling for coach audio
- [x] Fix pauseAI function DOM timing issues
- [x] Align message formats with GPU specification
- [x] Add session timer with timeString format
- [x] Add coach_transcription_error handler
- [x] Update AI pause/resume commands to match GPU spec
- [ ] Test tri-party session flow
- [ ] Validate transcript accuracy

## 🌟 Expected Benefits

1. **Professional Coaching Environment**: Human oversight with AI assistance
2. **Complete Documentation**: All participants captured in session transcript
3. **Natural Conversation Flow**: Coach can guide without disrupting AI-client interaction
4. **Enhanced Session Analysis**: Tri-party dynamics tracked for continuous improvement
5. **Quality Assurance**: Human coaching expertise combined with AI consistency

---

*Implementation Status: 🚧 In Progress*  
*GPU Integration: ✅ Ready (gpucoach.md implemented)*  
*CPU Implementation: 🔄 Starting with audio pipeline modifications*