/**
 * CallRoom - Client View with LiveKit
 * 
 * True 3-way coaching room: Client + Coach + AI Agent
 * All participants join via LiveKit for native multi-party support.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConnectionState } from 'livekit-client';
import { useLiveKitRoom, type ParticipantInfo } from '@myultra/ui';
import { Orb3D } from '../components/Orb3D';
import '../styles.css';
import '../room.css';

// =============================================================================
// Types
// =============================================================================

type ToastKind = 'info' | 'success' | 'error';

interface TranscriptEntry {
  role: string;
  content: string;
  time: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getApiUrl(): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '');
  // If not set, rely on Vite's `/api` proxy (dev) or same-origin `/api` (prod).
  return base || '';
}

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

function publicLoginUrl(): string {
  const host = import.meta.env.VITE_PUBLIC_APP_URL || '';
  if (host) return `${host.replace(/\/+$/, '')}/login`;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3700/login`;
}

// Console log with prefix for easy filtering
function log(...args: unknown[]) {
  console.log('[CallRoom]', ...args);
}

function logError(...args: unknown[]) {
  console.error('[CallRoom] ❌', ...args);
}

// =============================================================================
// Component
// =============================================================================

export function CallRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  // State
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiParticipant, setAiParticipant] = useState<ParticipantInfo | null>(null);
  const [coachParticipant, setCoachParticipant] = useState<ParticipantInfo | null>(null);
  const [toast, setToast] = useState<{ kind: ToastKind; text: string } | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [agentStatus, setAgentStatus] = useState<string>('unknown');
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Refs to prevent duplicate operations
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const coachVideoRef = useRef<HTMLVideoElement>(null);
  const hasConnectedRef = useRef(false);
  const hasFetchedTokenRef = useRef(false);

  const roomShort = useMemo(() => (roomId ?? '').slice(0, 8), [roomId]);

  // Toast helper
  const showToast = useCallback((kind: ToastKind, text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  // Handle data messages (transcripts from AI)
  const handleDataReceived = useCallback((payload: Uint8Array) => {
    try {
      const message = JSON.parse(new TextDecoder().decode(payload));
      log('📨 Data message received:', message.type);
      
      if (message.type === 'transcript') {
        setTranscript((prev) => [...prev, {
          role: message.role,
          content: message.content,
          time: new Date().toLocaleTimeString(),
        }]);
      }
    } catch (e) {
      logError('Failed to parse data message:', e);
    }
  }, []);

  // Callbacks - memoized to prevent hook recreation
  const handleConnected = useCallback(() => {
    log('✅ Connected to LiveKit room');
    showToast('success', 'Connected to room');
  }, [showToast]);

  const handleDisconnected = useCallback(() => {
    log('📴 Disconnected from LiveKit room');
    showToast('info', 'Disconnected from room');
  }, [showToast]);

  const handleParticipantJoined = useCallback((participant: ParticipantInfo) => {
    log('👤 Participant joined:', participant.identity, participant.name);
    
    if (participant.identity.startsWith('ai-')) {
      log('🤖 AI Agent connected!');
      setAiParticipant(participant);
      setAgentStatus('connected');
      showToast('success', 'AI Coach connected');
    } else if (participant.identity.startsWith('coach-')) {
      log('👨‍🏫 Coach connected!');
      setCoachParticipant(participant);
      showToast('success', 'Coach joined the session');
    }
  }, [showToast]);

  const handleParticipantLeft = useCallback((identity: string) => {
    log('👋 Participant left:', identity);
    
    if (identity.startsWith('ai-')) {
      setAiParticipant(null);
      setAgentStatus('disconnected');
      showToast('info', 'AI Coach disconnected');
    } else if (identity.startsWith('coach-')) {
      setCoachParticipant(null);
      showToast('info', 'Coach left the session');
    }
  }, [showToast]);

  const handleError = useCallback((err: Error) => {
    logError('LiveKit error:', err);
    setError(err.message);
  }, []);

  // LiveKit room connection
  const {
    connectionState,
    localParticipant,
    remoteParticipants,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    getParticipantAudioStream,
  } = useLiveKitRoom({
    url: livekitUrl || '',
    token: token || '',
    onConnected: handleConnected,
    onDisconnected: handleDisconnected,
    onParticipantJoined: handleParticipantJoined,
    onParticipantLeft: handleParticipantLeft,
    onDataReceived: handleDataReceived,
    onError: handleError,
  });

  // Fetch token from API - only once
  useEffect(() => {
    if (!roomId || hasFetchedTokenRef.current) return;
    hasFetchedTokenRef.current = true;

    async function getToken() {
      try {
        const authToken = getAuthToken();
        if (!authToken) {
          log('⚠️ No auth token, redirecting to login');
          window.location.href = publicLoginUrl();
          return;
        }

        // Extract user ID from JWT token
        let userId = 'unknown';
        try {
          const payload = JSON.parse(atob(authToken.split('.')[1]));
          userId = payload.sub || payload.userId || payload.id || 'unknown';
          // Prominent logging for debugging
          console.log('%c[CallRoom] 🎤 SESSION STARTING', 'background: #2196F3; color: white; padding: 4px 8px; border-radius: 4px;');
          console.log('%c  User ID: ' + userId, 'color: #2196F3; font-weight: bold;');
          console.log('%c  Email: ' + (payload.email || 'unknown'), 'color: #2196F3;');
          console.log('%c  Room: ' + roomId, 'color: #2196F3;');
          console.log('%c  Identity will be: client-' + userId, 'color: #2196F3; font-weight: bold;');
        } catch (e) {
          logError('Failed to decode auth token:', e);
        }

        const apiUrl = getApiUrl();
        log('🔑 Fetching LiveKit token from:', apiUrl || '(proxy)');
        log('📍 Room ID:', roomId);

        const response = await fetch(`${apiUrl}/api/livekit/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            roomName: roomId,
            participantName: 'Client',
            participantIdentity: `client-${userId}`,  // Use actual user ID from JWT
            role: 'client',
            spawnAgent: true, // Request AI agent to be spawned for this room
          }),
        });

        const data = (await response.json().catch(() => null)) as any;

        if (!response.ok) {
          const errorMsg = data?.error ?? `Failed to get token (HTTP ${response.status})`;
          logError('Token request failed:', errorMsg);
          setError(errorMsg);
          return;
        }

        log('✅ Token response:', data?.success ? 'success' : data?.error);
        log('🤖 Agent status:', data?.data?.agentStatus);

        if (data?.success) {
          const url = (data?.data?.url as string | undefined) || (import.meta.env.VITE_LIVEKIT_URL as string | undefined);
          if (!url) {
            setError('LiveKit URL missing (server did not return url and VITE_LIVEKIT_URL is not set)');
            return;
          }
          log('🔗 LiveKit URL:', url);
          setToken(data.data.token);
          setLivekitUrl(url);
          setAgentStatus(data.data.agentStatus || 'spawning');
        } else {
          setError(data?.error || 'Failed to get token');
        }
      } catch (err) {
        logError('Token fetch error:', err);
        setError('Network error - could not reach API');
      }
    }

    getToken();
  }, [roomId]);

  // Connect when token is ready - only once
  useEffect(() => {
    if (!token || !livekitUrl || hasConnectedRef.current) return;
    hasConnectedRef.current = true;

    log('🚀 Token ready, connecting to LiveKit...');
    log('   URL:', livekitUrl);
    connect();
  }, [token, livekitUrl, connect]);

  // Log connection state changes
  useEffect(() => {
    log('📡 Connection state:', connectionState);
  }, [connectionState]);

  // Log participant changes
  useEffect(() => {
    log('👥 Remote participants:', remoteParticipants.size);
    remoteParticipants.forEach((p) => {
      log(`   - ${p.identity} (${p.name}) audio:${!!p.audioTrack} video:${!!p.videoTrack}`);
    });
  }, [remoteParticipants]);

  // Attach local video
  useEffect(() => {
    const videoEl = localVideoRef.current;
    const track = localParticipant?.videoTrack;
    
    if (!videoEl) return;
    
    // Clear previous
    videoEl.srcObject = null;
    
    if (track) {
      log('📹 Attaching local video');
      // Use LiveKit's native attach method
      track.attach(videoEl);
      videoEl.play().catch((e) => {
        log('Local video play failed:', e);
      });
    }
    
    return () => {
      if (track) {
        track.detach(videoEl);
      }
    };
  }, [localParticipant?.videoTrack]);

  // Attach coach video
  useEffect(() => {
    const videoEl = coachVideoRef.current;
    const track = coachParticipant?.videoTrack;
    
    log('📹 Coach video check:', {
      hasCoachParticipant: !!coachParticipant,
      coachIdentity: coachParticipant?.identity,
      hasVideoTrack: !!track,
      hasVideoRef: !!videoEl,
    });
    
    if (!videoEl) return;
    
    // Clear previous
    videoEl.srcObject = null;
    
    if (track) {
      log('📹 Attaching coach video track');
      // Use LiveKit's native attach method
      track.attach(videoEl);
      videoEl.play().catch((e) => {
        log('Coach video play error:', e);
        // Retry after short delay
        setTimeout(() => videoEl.play().catch(() => {}), 500);
      });
    }
    
    return () => {
      if (track) {
        track.detach(videoEl);
      }
    };
  }, [coachParticipant?.videoTrack, coachParticipant?.identity]);

  // Handle autoplay-blocked audio with one-time click handler
  useEffect(() => {
    const resumeAudio = () => {
      document.querySelectorAll('audio').forEach((audio) => {
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      });
      setAudioBlocked(false);
    };
    
    // Resume on any user interaction
    document.addEventListener('click', resumeAudio, { once: true });
    
    return () => {
      document.removeEventListener('click', resumeAudio);
    };
  }, []);

  // Update AI/Coach participants from remoteParticipants
  // Always update to capture track changes
  useEffect(() => {
    let foundAiParticipant: ParticipantInfo | undefined;
    let foundCoachParticipant: ParticipantInfo | undefined;

    remoteParticipants.forEach((participant) => {
      if (participant.identity.startsWith('ai-')) {
        foundAiParticipant = participant;
      } else if (participant.identity.startsWith('coach-')) {
        foundCoachParticipant = participant;
      }
    });

    // Update AI participant (always update to capture track changes)
    if (foundAiParticipant !== undefined) {
      if (!aiParticipant || aiParticipant.identity !== foundAiParticipant.identity) {
        log('🤖 Found AI participant:', foundAiParticipant.identity);
        setAgentStatus('connected');
      }
      setAiParticipant(foundAiParticipant);
    } else if (aiParticipant) {
      log('🤖 AI participant left');
      setAiParticipant(null);
    }

    // Update coach participant
    if (foundCoachParticipant !== undefined) {
      if (!coachParticipant || coachParticipant.identity !== foundCoachParticipant.identity) {
        log('👨‍🏫 Found coach participant:', foundCoachParticipant.identity, {
          hasAudio: !!foundCoachParticipant.audioTrack,
          hasVideo: !!foundCoachParticipant.videoTrack,
        });
      }
      // Always update to capture track changes
      setCoachParticipant(foundCoachParticipant);
    } else if (coachParticipant) {
      log('👨‍🏫 Coach participant left');
      setCoachParticipant(null);
    }
  }, [remoteParticipants]); // Only depend on remoteParticipants

  // Get AI audio stream for Orb - get fresh from room
  const aiAudioStream = useMemo(() => {
    // Find AI participant from remoteParticipants directly
    let aiIdentity: string | null = null;
    remoteParticipants.forEach((p) => {
      if (p.identity.startsWith('ai-')) {
        aiIdentity = p.identity;
      }
    });
    
    if (aiIdentity) {
      const stream = getParticipantAudioStream(aiIdentity);
      log('🔊 AI audio stream:', stream ? 'available' : 'null', 'for', aiIdentity);
      return stream;
    }
    return null;
  }, [remoteParticipants, getParticipantAudioStream]);

  const handleExit = useCallback(() => {
    log('🚪 Exiting room');
    disconnect();
    navigate('/dashboard');
  }, [disconnect, navigate]);

  // Status indicators
  const isConnected = connectionState === ConnectionState.Connected;
  const isCoachConnected = !!coachParticipant;
  const isAiConnected = !!aiParticipant;

  const connectionStatusText = 
    connectionState === ConnectionState.Connected ? 'Connected' :
    connectionState === ConnectionState.Connecting ? 'Connecting...' :
    connectionState === ConnectionState.Reconnecting ? 'Reconnecting...' :
    'Disconnected';

  const connectionQuality = 
    connectionState === ConnectionState.Connected ? 'good' :
    connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting ? 'fair' :
    'poor';

  const aiStatusText = 
    isAiConnected && aiParticipant?.isSpeaking ? 'AI is speaking' :
    isAiConnected ? 'AI Coach Ready' :
    agentStatus === 'spawning' ? 'Starting AI Coach...' :
    'Waiting for AI Coach...';

  const aiIndicatorClass =
    isAiConnected && aiParticipant?.isSpeaking ? 'speaking' :
    isAiConnected ? 'ready' :
    'thinking';

  if (error) {
    return (
      <div className="client-room">
        <div className="client-room-shell">
          <div className="client-room-errors">
            <div className="alert alert-error">
              <strong>Error</strong>
              <div style={{ marginTop: '0.5rem' }}>{error}</div>
            </div>
            <button className="btn" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="client-room">
      <div className="client-room-shell">
        <header className="client-room-top">
          <div className="client-room-roominfo">
            <h2>Your Coaching Session</h2>
            <div className="client-room-subtitle">
              Session: {roomShort}...
            </div>
          </div>

          <div className="client-room-ai-status">
            <div className={`client-room-ai-indicator ${aiIndicatorClass}`} />
            <span>{aiStatusText}</span>
          </div>
        </header>

        <div className="client-room-info">
          <div className="client-room-info-title">Welcome to your coaching session!</div>
          <div className="client-room-info-sub">
            {isCoachConnected
              ? 'Your coach is here — the AI assistant can support the flow.'
              : isAiConnected
                ? 'AI coach is listening — your human coach can join anytime.'
                : 'Your coach and AI assistant will join shortly.'}
          </div>

          <div className="client-room-status-row">
            <div className="client-room-connection">
              <span>Connection:</span>
              <span className={`client-room-quality ${connectionQuality}`} />
              <span>{connectionStatusText}</span>
            </div>
            <div className="client-room-ai-session">
              {isAiConnected ? (
                <span className="client-room-pill ok">AI voice active</span>
              ) : agentStatus === 'spawning' ? (
                <span className="client-room-pill warn">Starting AI...</span>
              ) : (
                <span className="client-room-pill warn">Waiting for AI...</span>
              )}
            </div>
          </div>
        </div>

        <div className="client-room-grid">
          {/* Local (Client) Video */}
          <div className="client-room-tile">
            <video ref={localVideoRef} autoPlay playsInline muted />
            <div className="client-room-label">You</div>
          </div>

          {/* Coach Video */}
          <div className="client-room-tile">
            {coachParticipant?.videoTrack ? (
              <video ref={coachVideoRef} autoPlay playsInline />
            ) : (
              <div className="client-room-placeholder">Waiting for coach...</div>
            )}
            <div className="client-room-label">Coach</div>
          </div>

          {/* AI Orb */}
          <div className="client-room-tile">
            <div className="client-room-orb">
              <Orb3D
                stream={aiAudioStream ?? undefined}
                size={180}
              />
              <div className="client-room-orb-caption">
                Ultra Coach {isAiConnected ? '🟢' : agentStatus === 'spawning' ? '🟡' : '⚪'}
              </div>
            </div>
            <div className="client-room-label">AI Coach</div>
          </div>
        </div>

        <div className="client-room-controls">
          <button className="btn" type="button" onClick={toggleVideo}>
            {isVideoEnabled ? '📹 Video' : '📹 Video Off'}
          </button>
          <button className="btn" type="button" onClick={toggleAudio}>
            {isAudioEnabled ? '🎤 Audio' : '🎤 Muted'}
          </button>
          <button className="btn btn-exit" type="button" onClick={handleExit}>
            🏠 Exit
          </button>
        </div>

        {/* Transcript panel (if any) */}
        {transcript.length > 0 && (
          <div className="client-room-transcript">
            {transcript.slice(-5).map((entry, i) => {
              // Format speaker name based on role
              const speakerName = 
                entry.role === 'assistant' ? 'Ultra Coach' :
                entry.role === 'user' ? (localParticipant?.name || 'Client') :
                entry.role;
              
              // Icon for speaker
              const icon = entry.role === 'assistant' ? '🟣' : '🔵';
              
              return (
                <div key={i} className={`transcript-entry transcript-${entry.role}`}>
                  <span className="transcript-icon">{icon}</span>
                  <span className="transcript-speaker">{speakerName}:</span>
                  <span className="transcript-content">{entry.content}</span>
                  <span className="transcript-time">{entry.time}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Hidden audio elements for playback */}
        {Array.from(remoteParticipants.values()).map((participant) => (
          participant.audioTrack && (
            <audio
              key={participant.identity}
              autoPlay
              playsInline
              ref={(el) => {
                if (!el) return;
                
                const track = participant.audioTrack;
                if (track) {
                  // Use LiveKit's attach method
                  track.attach(el);
                  
                  // Explicitly start playback with error handling
                  el.play().catch((error) => {
                    log(`Audio play failed for ${participant.identity}:`, error.message);
                    
                    // If autoplay blocked, show notification
                    if (error.name === 'NotAllowedError') {
                      log('Audio blocked by autoplay policy');
                      setAudioBlocked(true);
                    }
                  });
                }
              }}
            />
          )
        ))}

        {/* Click-to-enable audio UI when blocked by autoplay policy */}
        {audioBlocked && (
          <div 
            onClick={() => {
              document.querySelectorAll('audio').forEach(a => a.play().catch(() => {}));
              setAudioBlocked(false);
            }}
            style={{
              position: 'fixed',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#3b82f6',
              color: 'white',
              padding: '12px 24px',
              borderRadius: 8,
              cursor: 'pointer',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              fontWeight: 600,
            }}
          >
            🔊 Click to Enable Audio
          </div>
        )}

        {toast ? <div className={`client-room-toast ${toast.kind}`}>{toast.text}</div> : null}
      </div>
    </div>
  );
}

export default CallRoomPage;
