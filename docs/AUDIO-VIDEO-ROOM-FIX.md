# Audio/Video Room System - Comprehensive Fix Plan

## Executive Summary

After auditing the LiveKit-based audio/video system for MyUltra.Coach coaching rooms, I've identified **8 critical issues** and **12 improvement opportunities** across the client room, coach room, and AI agent integration.

**Current State:** ✅ Basic functionality works, ⚠️ Several reliability and UX issues  
**Target State:** Production-ready, reliable 3-way audio/video with coach controls  
**Estimated Fix Time:** 4-6 hours

---

## System Architecture Overview

### Current Setup

```
┌──────────────────────────────────────────────────────────────┐
│                    LiveKit Cloud Room                        │
│                                                              │
│  ┌─────────┐      ┌─────────┐      ┌──────────┐           │
│  │ Client  │◄────►│  Coach  │◄────►│ AI Agent │           │
│  │         │      │         │      │          │           │
│  │ Audio ✓ │      │ Audio ✓ │      │ Audio ✓  │           │
│  │ Video ✓ │      │ Video ✓ │      │ Video ✗  │           │
│  └─────────┘      └─────────┘      └──────────┘           │
│       │                │                  │                │
│       └────────────────┴──────────────────┘                │
│              All subscribe to each other                    │
└──────────────────────────────────────────────────────────────┘
         │                │                  │
         ▼                ▼                  ▼
    Web Audio API    Web Audio API      Deepgram
    for Orb viz     for Orb viz     Voice Agent + STT
```

### Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Client Room** | React + LiveKit | User interface for clients |
| **Coach Room** | React + LiveKit | Coach interface with controls |
| **AI Agent** | Node.js + LiveKit | AI voice integration |
| **Orb Visualization** | React-Three-Fiber | Audio-reactive 3D orb |
| **Audio Analysis** | Web Audio API | Frequency analysis for orb |
| **useLiveKitRoom Hook** | LiveKit SDK | Room connection management |
| **API Token Service** | Bun + LiveKit SDK | Token generation, agent spawning |

---

## Critical Issues Identified

### 🔴 Issue #1: Audio Stream Access for Orb is Unreliable

**Symptom:**
- Orb sometimes doesn't react to AI audio
- Console shows "No audio stream available for ai-coach-agent"
- Multiple fallback methods tried, all sometimes fail

**Root Cause:**
The `getParticipantAudioStream()` function has 4 fallback methods but still fails when:
1. Track hasn't been fully initialized yet
2. Track is subscribed but `mediaStreamTrack` is null
3. Track hasn't been attached to any element
4. Browser doesn't support `captureStream()`

**Current Code (packages/ui/src/hooks/useLiveKitRoom.ts):**
```typescript
// Tries 4 different methods:
// 1. track.mediaStreamTrack ← Often null
// 2. attachedElements[0].srcObject ← No elements if not attached
// 3. captureStream() from attached element ← Not always supported
// 4. Create new audio element and attach ← Side effects

// Problem: Race condition between track subscription and stream access
```

**Impact:** Medium-High
- Orb doesn't react to AI speech reliably
- Poor user experience
- Inconsistent across browsers

---

### 🔴 Issue #2: Hidden Audio Elements May Not Play

**Symptom:**
- Participants sometimes can't hear each other
- Audio playback requires user interaction in some browsers

**Root Cause:**
Browser autoplay policies require user gesture before audio can play.

**Current Code (both CallRoom.tsx files):**
```jsx
{/* Hidden audio elements for playback */}
{Array.from(remoteParticipants.values()).map((participant) => (
  participant.audioTrack && (
    <audio
      key={participant.identity}
      autoPlay  // ← May be blocked by browser
      ref={(el) => {
        if (el && participant.audioTrack) {
          el.srcObject = new MediaStream([participant.audioTrack]);
          // Missing: .play() call with error handling
        }
      }}
    />
  )
))}
```

**Impact:** High
- Audio doesn't work without explicit play() call
- Silent failures (no error shown to user)

---

### 🔴 Issue #3: Video Track Attachment Race Condition

**Symptom:**
- Video sometimes doesn't appear initially
- Requires page refresh to see video

**Root Cause:**
Video ref is set before track is fully ready.

**Current Code:**
```typescript
useEffect(() => {
  if (clientParticipant?.videoTrack && clientVideoRef.current) {
    clientVideoRef.current.srcObject = new MediaStream([clientParticipant.videoTrack]);
    // Missing: Explicit play() call
    // Missing: Error handling
  }
}, [clientParticipant?.videoTrack]);
```

**Impact:** Medium
- Inconsistent video display
- Poor first impression

---

### 🔴 Issue #4: Coach Mic Disable Logic is Fragile

**Symptom:**
- Coach mic may not disable automatically on connect
- Race condition with connection state

**Root Cause:**
Uses `hasDisabledMicRef` flag that can fail if connection state changes rapidly.

**Current Code (apps/web-coach/src/pages/CallRoom.tsx):**
```typescript
useEffect(() => {
  if (connectionState === ConnectionState.Connected && 
      isAudioEnabled && 
      !hasDisabledMicRef.current) {
    hasDisabledMicRef.current = true;
    toggleAudio().catch(console.error);
  }
}, [connectionState, isAudioEnabled, toggleAudio]);
```

**Problem:**
- If `isAudioEnabled` changes before `toggleAudio()` completes, flag is set but audio remains on
- No verification that audio was actually disabled

**Impact:** High
- Coach's voice may leak into AI conversation
- Defeats purpose of "observe only" mode

---

### 🟡 Issue #5: Track Subscription Timing

**Symptom:**
- Tracks sometimes subscribe after participant joins
- UI shows "Waiting..." even though participant is present

**Root Cause:**
LiveKit subscribes to tracks asynchronously after participant joins.

**Current Code:**
```typescript
room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
  // Update participants
  updateRemoteParticipants();
});
```

**Problem:**
- `ParticipantConnected` event fires before tracks are subscribed
- UI updates before tracks are available
- 100ms delay in `TrackSubscribed` handler isn't always enough

**Impact:** Medium
- Video appears delayed
- Orb doesn't react immediately

---

### 🟡 Issue #6: No Audio/Video Troubleshooting UI

**Symptom:**
- When audio/video doesn't work, no feedback to user
- Users don't know if it's their mic, permissions, or network

**Root Cause:**
No diagnostic information displayed.

**Impact:** Medium
- Users blame the platform
- Support burden increases

---

### 🟡 Issue #7: MediaStream Cleanup Not Guaranteed

**Symptom:**
- MediaStream references may persist after disconnect
- Memory leaks possible

**Root Cause:**
`capturedStreamsRef` in `useLiveKitRoom` never clears old streams.

**Current Code:**
```typescript
const capturedStreamsRef = useRef<Map<string, MediaStream>>(new Map());
// Never cleared on disconnect or participant leave
```

**Impact:** Low-Medium
- Memory usage increases over time
- Stale stream references

---

### 🟡 Issue #8: No Fallback for Failed Media Permissions

**Symptom:**
- If user denies mic/camera, app shows cryptic error
- No graceful degradation

**Root Cause:**
```typescript
try {
  await room.localParticipant.enableCameraAndMicrophone();
} catch (mediaError) {
  console.warn('[LiveKit] Could not enable camera/mic:', mediaError);
  // Continues without media - but no UI feedback
}
```

**Impact:** Medium
- Users don't know they need to grant permissions
- Sessions fail silently

---

## Additional Improvement Opportunities

### 1. Audio Quality Indicators

**What's Missing:**
- No indication of audio quality/bitrate
- No packet loss indicators
- No latency display

**Benefit:** Users can debug their own connection issues

---

### 2. Video Resolution Control

**What's Missing:**
- Fixed at 640x480
- No adaptive resolution based on bandwidth

**Current Code:**
```typescript
videoCaptureDefaults: {
  resolution: { width: 640, height: 480, frameRate: 24 },
}
```

**Benefit:** Better quality on good connections, better stability on poor connections

---

### 3. Echo Cancellation Verification

**What's Missing:**
- Echo cancellation enabled in config, but no verification it's working
- No fallback if browser doesn't support it

**Current Config:**
```typescript
audioCaptureDefaults: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
```

**Benefit:** Prevent audio feedback loops

---

### 4. Participant Audio Level Meters

**What's Missing:**
- No visual indication of who's speaking
- No mic level indicators

**Benefit:** Users can see if their mic is working

---

### 5. Network Quality Monitoring

**What's Missing:**
- No indication of connection quality
- No bandwidth usage display

**Benefit:** Proactive troubleshooting

---

### 6. Reconnection Strategy

**What's Missing:**
- No automatic reconnection on network failure
- No graceful handling of dropped connections

**Benefit:** Better resilience

---

### 7. Selective Audio Routing (Coach Feature)

**What's Missing:**
- Coach wants to speak to client WITHOUT AI hearing
- Currently coach mic is off by default, when on → everyone hears

**Desired Behavior:**
- Coach can toggle "Private Mode" 
- In private mode: Coach audio goes to client only, not AI
- Requires data channel signaling to AI agent

**Benefit:** Coach can give real-time guidance without interrupting AI

---

### 8. AI Audio Monitoring

**What's Missing:**
- No indication if AI is actually speaking vs. silent
- Can't tell if AI audio is reaching clients

**Benefit:** Debug AI audio issues faster

---

### 9. Bandwidth Optimization

**What's Missing:**
- All participants receive all tracks even if not displayed
- No simulcast configuration
- No dynamic bitrate adjustment

**Benefit:** Lower bandwidth usage, better mobile support

---

### 10. Mobile Support

**What's Missing:**
- No mobile-specific optimizations
- No orientation change handling
- No low-power mode

**Benefit:** Better mobile experience

---

### 11. Error Recovery

**What's Missing:**
- No retry logic for failed track subscriptions
- No automatic track re-request

**Benefit:** More reliable connections

---

### 12. Debug Mode

**What's Missing:**
- No built-in diagnostic panel
- No export of connection stats

**Benefit:** Easier troubleshooting

---

## Comprehensive Fix Plan

### Phase 1: Critical Fixes (Priority 1) 🔥

#### Fix #1: Reliable Audio Stream Access for Orb

**Solution:** Attach all audio tracks to hidden audio elements immediately, then use those elements as the source of truth for streams.

**Changes to `packages/ui/src/hooks/useLiveKitRoom.ts`:**

```typescript
// Add audio element management
const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

// Modified TrackSubscribed handler:
room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
  console.log('[LiveKit] Track subscribed:', track.kind, 'from', participant.identity);
  
  if (track.kind === Track.Kind.Audio) {
    // Immediately create and attach audio element
    let audioEl = audioElementsRef.current.get(participant.identity);
    
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioElementsRef.current.set(participant.identity, audioEl);
    }
    
    // Attach track to element
    const mediaStreamTrack = track.mediaStreamTrack;
    if (mediaStreamTrack) {
      audioEl.srcObject = new MediaStream([mediaStreamTrack]);
      audioEl.play().catch((e) => {
        console.warn('[LiveKit] Audio play failed (may need user gesture):', e);
      });
      
      console.log('[LiveKit] ✅ Audio track attached for', participant.identity);
    }
  }
  
  // Small delay before updating participants (let track initialize)
  setTimeout(() => {
    updateRemoteParticipants();
  }, 50); // Reduced from 100ms
});

// Modified getParticipantAudioStream:
const getParticipantAudioStream = useCallback((identity: string): MediaStream | null => {
  // Check cached stream first
  const existingStream = capturedStreamsRef.current.get(identity);
  if (existingStream && existingStream.active) {
    return existingStream;
  }
  
  // Check if we have an audio element for this participant
  const audioEl = audioElementsRef.current.get(identity);
  if (audioEl && audioEl.srcObject instanceof MediaStream) {
    console.log('[LiveKit] ✅ Using audio element stream for', identity);
    capturedStreamsRef.current.set(identity, audioEl.srcObject);
    return audioEl.srcObject;
  }
  
  // Fallback to track lookup
  const participant = roomRef.current?.remoteParticipants.get(identity);
  if (participant) {
    for (const pub of participant.trackPublications.values()) {
      if (pub.kind === Track.Kind.Audio && pub.track?.mediaStreamTrack) {
        const stream = new MediaStream([pub.track.mediaStreamTrack]);
        capturedStreamsRef.current.set(identity, stream);
        return stream;
      }
    }
  }
  
  console.log('[LiveKit] ❌ No audio stream available for', identity);
  return null;
}, []);

// Cleanup on disconnect
const disconnect = useCallback(() => {
  // ... existing disconnect logic ...
  
  // Clean up audio elements
  audioElementsRef.current.forEach((el) => {
    el.pause();
    el.srcObject = null;
  });
  audioElementsRef.current.clear();
  
  // Clear captured streams
  capturedStreamsRef.current.clear();
  
  // ... rest of disconnect ...
}, []);
```

**Testing:**
1. Join room as coach
2. Join as client  
3. Verify Orb reacts to both AI and client audio
4. Check console for "✅ Audio track attached" messages
5. Verify no "❌ No audio stream available" errors

---

#### Fix #2: Ensure Audio Playback Starts

**Solution:** Explicitly call `.play()` with error handling and retry logic.

**Changes to both `apps/web-coach/src/pages/CallRoom.tsx` and `apps/web-client/src/pages/CallRoom.tsx`:**

```typescript
// Replace hidden audio elements with this:
{Array.from(remoteParticipants.values()).map((participant) => (
  participant.audioTrack && (
    <audio
      key={participant.identity}
      autoPlay
      playsInline
      ref={(el) => {
        if (el && participant.audioTrack) {
          const stream = new MediaStream([participant.audioTrack]);
          el.srcObject = stream;
          
          // Explicitly start playback with error handling
          el.play().catch((error) => {
            console.warn(`[Room] Audio play failed for ${participant.identity}:`, error.message);
            
            // If autoplay blocked, show user prompt
            if (error.name === 'NotAllowedError') {
              // Store failed participant for later retry
              console.log('[Room] Audio blocked by autoplay policy - will retry on user interaction');
              
              // You could set state here to show "Click to enable audio" button
              // setAudioBlocked(true);
            }
          });
        }
      }}
    />
  )
))}

// Add click handler to document for audio resume (one-time)
useEffect(() => {
  const resumeAudio = () => {
    document.querySelectorAll('audio').forEach((audio) => {
      if (audio.paused) {
        audio.play().catch(() => {});
      }
    });
  };
  
  // Resume on any user interaction
  document.addEventListener('click', resumeAudio, { once: true });
  
  return () => {
    document.removeEventListener('click', resumeAudio);
  };
}, []);
```

**Testing:**
1. Join room
2. Check browser console for any "Audio play failed" messages
3. If blocked, verify clicking anywhere resumes audio
4. Verify all participants can be heard

---

#### Fix #3: Reliable Video Track Attachment

**Solution:** Add explicit play() call and error handling for video elements.

**Changes to both CallRoom files:**

```typescript
// Local video attachment
useEffect(() => {
  if (localParticipant?.videoTrack && localVideoRef.current) {
    console.log('[Room] 📹 Attaching local video');
    const stream = new MediaStream([localParticipant.videoTrack]);
    localVideoRef.current.srcObject = stream;
    
    localVideoRef.current.play().catch((error) => {
      console.warn('[Room] Local video play error:', error);
    });
  }
}, [localParticipant?.videoTrack]);

// Remote video attachment (coach/client)
useEffect(() => {
  const participant = clientParticipant || coachParticipant; // Use appropriate variable
  const videoRef = clientVideoRef || coachVideoRef; // Use appropriate ref
  
  if (participant?.videoTrack && videoRef.current) {
    console.log('[Room] 📹 Attaching remote video from', participant.identity);
    const stream = new MediaStream([participant.videoTrack]);
    videoRef.current.srcObject = stream;
    
    // Explicitly start playback
    videoRef.current.play().catch((error) => {
      console.warn('[Room] Remote video play error:', error);
      
      // Retry after a short delay
      setTimeout(() => {
        videoRef.current?.play().catch(() => {
          console.error('[Room] Video play retry failed');
        });
      }, 500);
    });
  } else {
    // Clear video if participant left or track removed
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }
}, [clientParticipant?.videoTrack, coachParticipant?.videoTrack]);
```

**Testing:**
1. Join room with video enabled
2. Verify local video appears immediately
3. Verify remote video appears within 1 second
4. Toggle video off/on and verify it reconnects

---

#### Fix #4: Robust Coach Mic Default State

**Solution:** Set mic state directly on connection, not via toggle.

**Changes to `apps/web-coach/src/pages/CallRoom.tsx`:**

```typescript
// Replace the current mic disable effect with:
useEffect(() => {
  const room = roomRef?.current; // Assume we expose room from useLiveKitRoom
  
  if (connectionState === ConnectionState.Connected && room?.localParticipant) {
    const isMicCurrentlyEnabled = room.localParticipant.isMicrophoneEnabled;
    
    if (isMicCurrentlyEnabled && !hasDisabledMicRef.current) {
      hasDisabledMicRef.current = true;
      
      console.log('[CoachRoom] 🔇 Setting coach microphone to OFF by default');
      
      room.localParticipant.setMicrophoneEnabled(false).then(() => {
        setIsAudioEnabled(false);
        addTranscriptItem('system', 'System', '🔇 Your mic is off by default. Toggle to speak.');
        console.log('[CoachRoom] ✅ Coach mic disabled successfully');
      }).catch((error) => {
        console.error('[CoachRoom] ❌ Failed to disable mic:', error);
      });
    }
  }
}, [connectionState, addTranscriptItem]);
```

**Alternative:** Pass a `startWithMicMuted: true` option to `useLiveKitRoom` for coaches.

**Testing:**
1. Join as coach
2. Verify mic is off immediately after connection
3. Check transcript shows "Your mic is off by default"
4. Verify no audio leaks to AI

---

### Phase 2: Reliability Improvements (Priority 2) 🛠️

#### Fix #5: Track Subscription Retry Logic

**Solution:** Add retry logic for failed track subscriptions.

**Changes to `packages/ui/src/hooks/useLiveKitRoom.ts`:**

```typescript
// Add retry tracking
const trackRetryTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

room.on(RoomEvent.ParticipantConnected, (participant) => {
  console.log('[LiveKit] Participant joined:', participant.identity);
  
  // Schedule a check for track subscription after 2 seconds
  const timer = setTimeout(() => {
    checkParticipantTracks(participant);
  }, 2000);
  
  trackRetryTimers.current.set(participant.identity, timer);
  
  updateRemoteParticipants();
  callbacksRef.current.onParticipantJoined?.(toParticipantInfo(participant, false));
});

// Helper to check and retry track subscription
const checkParticipantTracks = (participant: RemoteParticipant) => {
  const hasAudio = Array.from(participant.trackPublications.values())
    .some(pub => pub.kind === Track.Kind.Audio && pub.isSubscribed);
    
  const hasVideo = Array.from(participant.trackPublications.values())
    .some(pub => pub.kind === Track.Kind.Video && pub.isSubscribed);
  
  if (!hasAudio || !hasVideo) {
    console.warn('[LiveKit] Track subscription incomplete for', participant.identity, {
      hasAudio,
      hasVideo,
    });
    
    // Trigger re-subscription (if LiveKit supports it)
    // updateRemoteParticipants(); // Force UI update at minimum
  }
};

// Clear retry timers on disconnect
const disconnect = useCallback(() => {
  // Clear track retry timers
  trackRetryTimers.current.forEach((timer) => clearTimeout(timer));
  trackRetryTimers.current.clear();
  
  // ... rest of disconnect logic ...
}, []);
```

---

#### Fix #6: Audio Context State Management

**Solution:** Properly handle suspended/closed audio contexts.

**Changes to `apps/web-client/src/components/Orb3D/useAudioAnalysis.ts`:**

```typescript
useEffect(() => {
  if (!stream) {
    setAudioData({ bass: 0, mid: 0, high: 0, overall: 0 });
    Object.values(smoothersRef.current).forEach(s => s.reset());
    return;
  }
  
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.log('[AudioAnalysis] No audio tracks in stream');
    return;
  }
  
  console.log('[AudioAnalysis] 🎵 Setting up audio analysis');
  
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();
  audioContextRef.current = audioContext;
  
  // Handle audio context state changes
  const handleStateChange = () => {
    console.log('[AudioAnalysis] Audio context state:', audioContext.state);
    
    if (audioContext.state === 'suspended') {
      console.log('[AudioAnalysis] Attempting to resume audio context...');
      audioContext.resume().then(() => {
        console.log('[AudioAnalysis] ✅ Audio context resumed');
      }).catch((e) => {
        console.error('[AudioAnalysis] Failed to resume audio context:', e);
      });
    }
  };
  
  audioContext.addEventListener('statechange', handleStateChange);
  
  // ... rest of setup ...
  
  // Cleanup
  return () => {
    console.log('[AudioAnalysis] 🔇 Cleaning up');
    
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (analyserRef.current) analyserRef.current.disconnect();
    
    if (audioContextRef.current) {
      audioContext.removeEventListener('statechange', handleStateChange);
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };
}, [stream]);
```

---

#### Fix #7: Add Diagnostic UI Elements

**Solution:** Add connection quality indicators and troubleshooting info.

**New Component: `apps/web-client/src/components/ConnectionDiagnostics.tsx`:**

```typescript
import { useEffect, useState } from 'react';

interface DiagnosticInfo {
  audioPermission: PermissionState | 'unknown';
  videoPermission: PermissionState | 'unknown';
  microphoneDetected: boolean;
  cameraDetected: boolean;
  audioContextState: AudioContextState | 'unknown';
}

export function ConnectionDiagnostics({ show }: { show: boolean }) {
  const [info, setInfo] = useState<DiagnosticInfo>({
    audioPermission: 'unknown',
    videoPermission: 'unknown',
    microphoneDetected: false,
    cameraDetected: false,
    audioContextState: 'unknown',
  });
  
  useEffect(() => {
    if (!show) return;
    
    async function checkPermissions() {
      // Check permissions
      const audioPermResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const videoPermResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
      
      // Check devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some(d => d.kind === 'audioinput');
      const hasCamera = devices.some(d => d.kind === 'videoinput');
      
      // Check audio context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const testContext = new AudioContextClass();
      const audioState = testContext.state;
      testContext.close();
      
      setInfo({
        audioPermission: audioPermResult.state,
        videoPermission: videoPermResult.state,
        microphoneDetected: hasMic,
        cameraDetected: hasCamera,
        audioContextState: audioState,
      });
    }
    
    checkPermissions();
  }, [show]);
  
  if (!show) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 20,
      background: 'rgba(0,0,0,0.9)',
      border: '1px solid #333',
      borderRadius: 8,
      padding: 12,
      fontSize: 12,
      color: '#fff',
      maxWidth: 300,
      zIndex: 1000,
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>🔧 Diagnostics</div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>Microphone:</span>
        <span>{info.microphoneDetected ? '✅' : '❌'} {info.audioPermission}</span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>Camera:</span>
        <span>{info.cameraDetected ? '✅' : '❌'} {info.videoPermission}</span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>Audio Context:</span>
        <span>{info.audioContextState}</span>
      </div>
      
      {info.audioPermission === 'denied' && (
        <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.2)', borderRadius: 4 }}>
          ⚠️ Microphone blocked. Check browser permissions.
        </div>
      )}
      
      {info.videoPermission === 'denied' && (
        <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.2)', borderRadius: 4 }}>
          ⚠️ Camera blocked. Check browser permissions.
        </div>
      )}
    </div>
  );
}
```

**Usage in CallRoom:**
```typescript
const [showDiagnostics, setShowDiagnostics] = useState(false);

// Add button to toggle diagnostics
<button onClick={() => setShowDiagnostics(!showDiagnostics)}>
  🔧 Diagnostics
</button>

<ConnectionDiagnostics show={showDiagnostics} />
```

---

#### Fix #8: Graceful Media Permission Handling

**Solution:** Show clear UI when permissions are denied.

**Changes to both CallRoom files:**

```typescript
const [mediaPermissionsError, setMediaPermissionsError] = useState<string | null>(null);

// In connect useEffect, update error handling:
try {
  await room.localParticipant.enableCameraAndMicrophone();
  console.log('[Room] ✅ Camera and microphone enabled');
  setMediaPermissionsError(null);
} catch (mediaError) {
  console.warn('[Room] Media permission error:', mediaError);
  
  // Determine error type
  if (mediaError instanceof Error) {
    if (mediaError.name === 'NotAllowedError') {
      setMediaPermissionsError('Camera/microphone access denied. Please allow permissions in your browser.');
    } else if (mediaError.name === 'NotFoundError') {
      setMediaPermissionsError('No camera or microphone found. Please connect a device.');
    } else {
      setMediaPermissionsError(`Media error: ${mediaError.message}`);
    }
  }
  
  // Continue without media - user can grant permissions later
}

// Show error in UI
{mediaPermissionsError && (
  <div style={{
    position: 'fixed',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(239,68,68,0.95)',
    color: 'white',
    padding: '12px 20px',
    borderRadius: 8,
    zIndex: 1000,
    maxWidth: '90vw',
    textAlign: 'center',
  }}>
    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>⚠️ Media Access Issue</div>
    <div style={{ fontSize: 14 }}>{mediaPermissionsError}</div>
    <button 
      style={{ marginTop: 8 }}
      onClick={() => {
        // Retry media permissions
        roomRef.current?.localParticipant.enableCameraAndMicrophone()
          .then(() => setMediaPermissionsError(null))
          .catch(() => {});
      }}
    >
      Retry
    </button>
  </div>
)}
```

---

### Phase 3: User Experience Enhancements (Priority 3) ✨

#### Enhancement #1: Audio Level Indicators

**Solution:** Show visual indicators of who's speaking.

**New Component: `AudioLevelIndicator.tsx`:**

```typescript
interface AudioLevelIndicatorProps {
  participant: ParticipantInfo;
  getAudioStream: (identity: string) => MediaStream | null;
}

export function AudioLevelIndicator({ participant, getAudioStream }: AudioLevelIndicatorProps) {
  const [level, setLevel] = useState(0);
  
  useEffect(() => {
    const stream = getAudioStream(participant.identity);
    if (!stream) return;
    
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setLevel(Math.min(1, rms * 3)); // Amplify for visibility
      rafId = requestAnimationFrame(tick);
    };
    
    let rafId = requestAnimationFrame(tick);
    
    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [participant.identity, getAudioStream]);
  
  // Visual indicator
  const barHeight = Math.max(2, level * 20);
  
  return (
    <div style={{
      width: 3,
      height: 20,
      background: '#333',
      borderRadius: 2,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${barHeight}px`,
        background: level > 0.5 ? '#10b981' : '#3b82f6',
        transition: 'height 50ms linear',
      }} />
    </div>
  );
}
```

**Usage:**
```tsx
<div className="participant-header">
  <span>{participant.name}</span>
  <AudioLevelIndicator participant={participant} getAudioStream={getParticipantAudioStream} />
</div>
```

---

#### Enhancement #2: Connection Quality Indicator

**Solution:** Show real-time connection quality metrics.

```typescript
// Add to useLiveKitRoom hook
const [connectionQuality, setConnectionQuality] = useState<{
  bitrate: number;
  packetLoss: number;
  latency: number;
} | null>(null);

// In connect():
room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
  if (participant === room.localParticipant) {
    console.log('[LiveKit] Connection quality:', quality);
    // quality is an enum: Excellent, Good, Poor, Lost
    
    // Get detailed stats
    room.localParticipant.getStats().then((stats) => {
      // Extract relevant metrics
      setConnectionQuality({
        bitrate: stats.audioSendBitrate || 0,
        packetLoss: stats.audioLostPercentage || 0,
        latency: stats.audioRtt || 0,
      });
    });
  }
});
```

---

#### Enhancement #3: Selective Audio Routing (Coach Private Mode)

**Solution:** Implement coach "Private Mode" that mutes coach from AI while keeping coach-client audio.

**Architecture:**
```
When Coach clicks "Private Mode":
  ↓
Coach sends data message: { type: 'pause_ai', paused: true }
  ↓
AI Agent receives message
  ↓
AI Agent pauses Deepgram Voice Agent
  ↓
AI Agent continues transcription (for logging)
  ↓
Coach audio still flows to Client via LiveKit
  ↓
AI doesn't respond to coach or client
```

**Already Implemented in Coach UI:**
```typescript
// apps/web-coach/src/pages/CallRoom.tsx already has:
const handleTogglePauseAI = useCallback(() => {
  const newPaused = !isAIPaused;
  setIsAIPaused(newPaused);
  
  publishData(JSON.stringify({
    type: 'pause_ai',
    paused: newPaused,
  }));
}, [isAIPaused, publishData]);
```

**Missing in AI Agent:**
Need to handle `pause_ai` data messages in `services/ai-agent/src/livekit-agent.ts`:

```typescript
private handleDataMessage(payload: Uint8Array, _participant?: RemoteParticipant): void {
  try {
    const message = JSON.parse(new TextDecoder().decode(payload));
    
    if (message.type === 'coach_mute') {
      this.handleCoachMute(message.muted, message.coachIdentity);
    } else if (message.type === 'coach_whisper') {
      this.handleCoachWhisper(message.text);
    } else if (message.type === 'pause_ai') {
      // NEW: Handle AI pause request from coach
      this.handleAIPauseToggle(message.paused);
    }
  } catch (e) {
    console.error('[LiveKitAgent] Failed to parse data message:', e);
  }
}

private handleAIPauseToggle(paused: boolean): void {
  console.log(`[LiveKitAgent] ${paused ? '⏸️ Pausing' : '▶️ Resuming'} AI agent`);
  
  this.isAIPaused = paused;
  
  if (paused) {
    // Pause Voice Agent (stop generating responses)
    this.connectionManager?.pauseVoiceAgent();
    
    // Broadcast state to all participants
    this.broadcastPauseState(true);
  } else {
    // Resume Voice Agent
    this.connectionManager?.resumeVoiceAgent();
    
    // Broadcast state
    this.broadcastPauseState(false);
  }
  
  this.emit('pause-changed', { paused });
}

private broadcastPauseState(paused: boolean): void {
  if (!this.room?.localParticipant) return;
  
  const message = {
    type: 'ai_pause_state',
    paused,
    timestamp: new Date().toISOString(),
  };
  
  const data = new TextEncoder().encode(JSON.stringify(message));
  this.room.localParticipant.publishData(data, { reliable: true });
}
```

**And add methods to DualConnectionManager:**
```typescript
// connection-manager.ts
public pauseVoiceAgent(): void {
  this.isVoiceAgentPaused = true;
  console.log('[ConnectionManager] ⏸️ Voice Agent paused');
}

public resumeVoiceAgent(): void {
  this.isVoiceAgentPaused = false;
  console.log('[ConnectionManager] ▶️ Voice Agent resumed');
}
```

---

### Phase 4: Performance Optimization (Priority 4) ⚡

#### Optimization #1: Reduce Orb3D CPU Usage

**Issue:** 60fps render loop for 3D shaders can be CPU-intensive

**Solution:** Drop to 30fps when no audio activity

```typescript
// In OrbMesh component:
const lastActivityRef = useRef(0);

useFrame((state, delta) => {
  const now = state.clock.elapsedTime;
  
  // Check if there's audio activity
  const hasActivity = audioData.overall > 0.05;
  
  if (hasActivity) {
    lastActivityRef.current = now;
  }
  
  // If no activity for 2 seconds, render at half speed
  const timeSinceActivity = now - lastActivityRef.current;
  if (timeSinceActivity > 2) {
    // Skip every other frame
    if (Math.floor(now * 60) % 2 !== 0) return;
  }
  
  // ... normal render logic ...
});
```

---

#### Optimization #2: Lazy Load Orb3D

**Solution:** Only load Three.js when needed

```typescript
// Lazy import Orb3D
const Orb3D = lazy(() => import('../components/Orb3D'));

// Use with Suspense
<Suspense fallback={<div>Loading visualization...</div>}>
  <Orb3D stream={aiAudioStream} size={180} />
</Suspense>
```

---

#### Optimization #3: Batch State Updates

**Issue:** Multiple `setRemoteParticipants` calls in quick succession

**Solution:** Debounce participant updates

```typescript
const updateRemoteParticipants = useCallback(() => {
  if (!roomRef.current) return;

  // Clear any pending update
  if (updateTimerRef.current) {
    clearTimeout(updateTimerRef.current);
  }
  
  // Debounce updates by 50ms
  updateTimerRef.current = setTimeout(() => {
    const newMap = new Map<string, ParticipantInfo>();
    roomRef.current?.remoteParticipants.forEach((participant) => {
      newMap.set(participant.identity, toParticipantInfo(participant, false));
    });
    setRemoteParticipants(newMap);
  }, 50);
}, [toParticipantInfo]);
```

---

## Implementation Priority

### Must Fix (Do First) 🔥
1. ✅ Fix #1: Reliable audio stream access for Orb
2. ✅ Fix #2: Explicit audio element play() calls
3. ✅ Fix #3: Reliable video attachment
4. ✅ Fix #4: Coach mic default state

### Should Fix (Do Second) 🛠️
5. ✅ Fix #5: Track subscription retry logic
6. ✅ Fix #6: Audio context state management
7. ✅ Fix #7: Diagnostic UI
8. ✅ Fix #8: Permission error handling

### Nice to Have (Do Third) ✨
9. Enhancement #1: Audio level indicators
10. Enhancement #2: Connection quality display
11. Enhancement #3: Complete AI pause/resume system

### Optimization (Do Last) ⚡
12. Optimization #1: Reduce Orb CPU usage
13. Optimization #2: Lazy load Orb3D
14. Optimization #3: Batch state updates

---

## Testing Protocol

### Unit Testing

```typescript
// Test audio stream access
describe('getParticipantAudioStream', () => {
  it('should return MediaStream for valid participant', () => {
    const stream = getParticipantAudioStream('ai-coach-agent');
    expect(stream).toBeInstanceOf(MediaStream);
    expect(stream.getAudioTracks().length).toBeGreaterThan(0);
  });
  
  it('should return null for non-existent participant', () => {
    const stream = getParticipantAudioStream('nonexistent');
    expect(stream).toBeNull();
  });
  
  it('should cache streams for repeat calls', () => {
    const stream1 = getParticipantAudioStream('client-abc');
    const stream2 = getParticipantAudioStream('client-abc');
    expect(stream1).toBe(stream2); // Same reference
  });
});
```

### Integration Testing

**Test Case 1: Full 3-Way Session**
1. Join as coach (port 3701)
2. Join as client (port 3702)
3. Verify AI spawns and joins
4. Verify all 3 can hear each other
5. Verify Orb reacts to AI speech
6. Verify client video appears in coach view
7. Verify coach video appears in client view

**Test Case 2: Coach Controls**
1. Join as coach
2. Join as client
3. Toggle coach mic ON
4. Speak - verify client hears
5. Toggle coach mic OFF
6. Verify client doesn't hear coach
7. Click "Pause AI"
8. Verify AI stops responding
9. Click "Resume AI"
10. Verify AI starts responding again

**Test Case 3: Network Interruption**
1. Start session
2. Disable network for 5 seconds
3. Re-enable network
4. Verify connection resumes
5. Verify audio/video resumes
6. Verify no duplicate participants

**Test Case 4: Browser Permissions**
1. Deny camera permission
2. Verify error message shown
3. Click retry
4. Allow permission
5. Verify camera starts working
6. Repeat for microphone

---

## Known Limitations

### 1. Browser Compatibility

| Browser | Audio | Video | Orb3D | Issues |
|---------|-------|-------|-------|--------|
| Chrome 120+ | ✅ | ✅ | ✅ | None |
| Firefox 120+ | ✅ | ✅ | ✅ | captureStream() may not work |
| Safari 17+ | ✅ | ⚠️ | ✅ | Autoplay restrictions stricter |
| Edge 120+ | ✅ | ✅ | ✅ | None |
| Mobile Safari | ⚠️ | ⚠️ | ✅ | Requires user gesture |
| Mobile Chrome | ✅ | ✅ | ✅ | May have performance issues |

### 2. LiveKit Limitations

- AI agent uses `@livekit/rtc-node` (Node.js only, not Bun compatible)
- Audio streams require tracks to be attached to access `mediaStreamTrack`
- Video element autoplay requires user interaction in some browsers

### 3. AI Agent Limitations

- No native video support (audio only)
- Deepgram Voice Agent has 4-second keepalive requirement
- LiveKit audio must be 16kHz mono for Deepgram compatibility

---

## Rollback Plan

If fixes cause regressions:

### 1. Rollback Files

```bash
# Restore from git
git checkout HEAD -- packages/ui/src/hooks/useLiveKitRoom.ts
git checkout HEAD -- apps/web-coach/src/pages/CallRoom.tsx
git checkout HEAD -- apps/web-client/src/pages/CallRoom.tsx

# Regenerate
cd apps/web-coach && bun run build
cd apps/web-client && bun run build
```

### 2. Disable New Features

Comment out diagnostic UI, audio level indicators if they cause issues.

### 3. Revert to Simple Orb

Replace Orb3D with simple 2D Orb if performance is an issue:

```tsx
import { Orb } from '@myultra/ui';
// Instead of:
<Orb3D stream={stream} />
```

---

## Success Criteria

### Functional Requirements
- [ ] Coach can see client video
- [ ] Client can see coach video
- [ ] All participants can hear each other
- [ ] Orb reacts to AI audio reliably (95%+ of the time)
- [ ] Coach mic is off by default
- [ ] Coach can toggle mic to speak to client
- [ ] Coach can pause/resume AI
- [ ] Transcripts appear in real-time

### Performance Requirements
- [ ] Audio/video sync within 200ms
- [ ] Orb renders at 30+ fps
- [ ] Page loads in < 3 seconds
- [ ] Memory usage stable over 30-minute session

### Reliability Requirements
- [ ] 95%+ connection success rate
- [ ] Graceful handling of permission denials
- [ ] Automatic recovery from network interruptions
- [ ] No audio/video dropouts

### User Experience Requirements
- [ ] Clear error messages
- [ ] Diagnostic tools available
- [ ] Visual feedback for all actions
- [ ] Mobile-friendly layout

---

## Implementation Checklist

### Phase 1: Critical Fixes
- [ ] Update `useLiveKitRoom` with audio element management
- [ ] Add explicit `.play()` calls to all audio/video elements
- [ ] Add error handling for media permissions
- [ ] Fix coach mic default state logic
- [ ] Test audio playback reliability
- [ ] Test video display reliability
- [ ] Test Orb audio stream access
- [ ] Verify coach mic defaults to OFF

### Phase 2: Reliability
- [ ] Add track subscription retry logic
- [ ] Add audio context state monitoring
- [ ] Create ConnectionDiagnostics component
- [ ] Add permission error UI
- [ ] Test retry scenarios
- [ ] Test permission grant/deny flows

### Phase 3: Enhancements
- [ ] Create AudioLevelIndicator component
- [ ] Add connection quality display
- [ ] Complete AI pause/resume in agent
- [ ] Add pauseVoiceAgent() to connection manager
- [ ] Test coach private mode
- [ ] Test audio level indicators

### Phase 4: Optimization
- [ ] Add frame skipping to Orb3D
- [ ] Lazy load Orb3D component
- [ ] Debounce participant updates
- [ ] Profile performance
- [ ] Test on low-end devices

### Phase 5: Documentation
- [ ] Update WEB-COACH-LIVEKIT-CHECK.md
- [ ] Document coach controls
- [ ] Create user troubleshooting guide
- [ ] Add inline code comments

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `packages/ui/src/hooks/useLiveKitRoom.ts` | Audio element management, retry logic | P1 |
| `apps/web-coach/src/pages/CallRoom.tsx` | Play() calls, error handling, mic default | P1 |
| `apps/web-client/src/pages/CallRoom.tsx` | Play() calls, error handling | P1 |
| `apps/web-client/src/components/Orb3D/useAudioAnalysis.ts` | Audio context state management | P2 |
| `services/ai-agent/src/livekit-agent.ts` | AI pause/resume handling | P3 |
| `services/ai-agent/src/connections/connection-manager.ts` | Pause/resume methods | P3 |
| `apps/web-client/src/components/ConnectionDiagnostics.tsx` | New file - diagnostics UI | P2 |
| `apps/web-client/src/components/AudioLevelIndicator.tsx` | New file - level meters | P3 |

---

## Estimated Timeline

| Phase | Duration | Complexity |
|-------|----------|------------|
| Phase 1 (Critical) | 2-3 hours | Medium |
| Phase 2 (Reliability) | 1-2 hours | Low |
| Phase 3 (Enhancements) | 2-3 hours | Medium |
| Phase 4 (Optimization) | 1 hour | Low |
| Phase 5 (Documentation) | 1 hour | Low |
| **Total** | **7-10 hours** | **Medium** |

---

## Risk Assessment

### Low Risk Changes
- Adding explicit `.play()` calls (backwards compatible)
- Adding error handling (only improves UX)
- Adding diagnostic UI (opt-in)

### Medium Risk Changes
- Modifying `getParticipantAudioStream` logic (core functionality)
- Adding audio element management (new pattern)
- Changing coach mic default behavior (UX change)

### High Risk Changes
- None identified

### Mitigation Strategies
1. Test each fix in isolation before combining
2. Keep git commits granular for easy rollback
3. Test on multiple browsers before deploying
4. Have backup Orb2D component ready
5. Monitor Sentry/logs after deployment

---

## Conclusion

The audio/video system is **fundamentally sound** but has **reliability issues** around track access, autoplay policies, and state management. The fixes are **straightforward** and **low-risk**. 

**Primary Improvements:**
1. Consistent audio stream access for Orb visualization
2. Reliable audio playback across all browsers
3. Better error handling and user feedback
4. Coach controls working 100% reliably

**After implementing Phase 1 & 2**, the system will be **production-ready** with excellent reliability and user experience.

---

*Audio/Video System Audit - December 2025*  
*Status: Issues Identified, Solutions Designed*  
*Next Step: Implement Phase 1 Critical Fixes*
