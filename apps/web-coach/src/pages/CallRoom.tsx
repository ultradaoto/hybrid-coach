/**
 * CallRoom - Coach View with LiveKit
 * 
 * True 3-way coaching room with coach-specific controls:
 * - Mute from AI (AI can't hear coach)
 * - Whisper to AI (silent context injection)
 * - Live transcript panel
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConnectionState } from 'livekit-client';
import { useLiveKitRoom, type ParticipantInfo } from '@myultra/ui';
import { Orb3D } from '../components/Orb3D';
import '../dashboard.css';
import '../room.css';

// =============================================================================
// Types
// =============================================================================

type TranscriptKind = 'system' | 'coach' | 'client' | 'ai';

interface TranscriptItem {
  id: string;
  kind: TranscriptKind;
  speaker: string;
  text: string;
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

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  const [agentStatus, setAgentStatus] = useState<string>('unknown');
  const [aiParticipant, setAiParticipant] = useState<ParticipantInfo | null>(null);
  const [clientParticipant, setClientParticipant] = useState<ParticipantInfo | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [isMutedFromAI, setIsMutedFromAI] = useState(false);
  const [whisperText, setWhisperText] = useState('');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([
    {
      id: crypto.randomUUID(),
      kind: 'system',
      speaker: 'System',
      text: 'Session initialized. Waiting for participants to join...',
    },
  ]);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const clientVideoRef = useRef<HTMLVideoElement>(null);
  const transcriptBodyRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const participantIdRef = useRef<string>(`coach-${crypto.randomUUID().slice(0, 8)}`);
  const hasConnectedRef = useRef(false);
  const hasFetchedTokenRef = useRef(false);

  const roomShort = useMemo(() => (roomId ?? '').slice(0, 8), [roomId]);

  const clientJoinUrl = useMemo(() => {
    const host = window.location.hostname;
    return `http://${host}:3702/room/${roomId ?? ''}`;
  }, [roomId]);

  // Helper to add transcript items
  const addTranscriptItem = useCallback((kind: TranscriptKind, speaker: string, text: string) => {
    setTranscript((prev) => [...prev, { id: crypto.randomUUID(), kind, speaker, text }]);
  }, []);

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptBodyRef.current;
    if (!el) return;

    const thresholdPx = 120;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    shouldAutoScrollRef.current = distanceFromBottom <= thresholdPx;
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    transcriptEndRef.current?.scrollIntoView({ block: 'end' });
  }, [transcript.length]);

  // Handle data messages from AI agent
  const handleDataReceived = useCallback((payload: Uint8Array) => {
    try {
      const message = JSON.parse(new TextDecoder().decode(payload));

      if (message.type === 'transcript') {
        addTranscriptItem(
          message.role === 'assistant' ? 'ai' : 'client',
          message.role === 'assistant' ? 'AI Coach' : 'User',
          message.content
        );
      }
    } catch (e) {
      console.error('[Room] Failed to parse data message:', e);
    }
  }, [addTranscriptItem]);

  // Callbacks - memoized
  const handleConnected = useCallback(() => {
    addTranscriptItem('system', 'System', 'Connected to room');
  }, [addTranscriptItem]);

  const handleParticipantJoined = useCallback((participant: ParticipantInfo) => {
    console.log('[Room] Participant joined:', participant.identity);

    if (participant.identity.startsWith('ai-')) {
      setAiParticipant(participant);
      addTranscriptItem('system', 'System', 'AI Coach connected');
    } else if (participant.identity.startsWith('client-')) {
      setClientParticipant(participant);
      addTranscriptItem('system', 'System', 'Client joined the session');
    }
  }, [addTranscriptItem]);

  const handleParticipantLeft = useCallback((identity: string) => {
    console.log('[Room] Participant left:', identity);

    if (identity.startsWith('ai-')) {
      setAiParticipant(null);
      addTranscriptItem('system', 'System', 'AI Coach disconnected');
    } else if (identity.startsWith('client-')) {
      setClientParticipant(null);
      addTranscriptItem('system', 'System', 'Client left the session');
    }
  }, [addTranscriptItem]);

  const handleError = useCallback((err: Error) => {
    console.error('[Room] LiveKit error:', err);
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
    publishData,
  } = useLiveKitRoom({
    url: livekitUrl || '',
    token: token || '',
    onConnected: handleConnected,
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
          window.location.href = publicLoginUrl();
          return;
        }

        console.log('[Room] Fetching LiveKit token...');
        const response = await fetch(`${getApiUrl()}/api/livekit/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            roomName: roomId,
            participantName: 'Coach',
            participantIdentity: participantIdRef.current,
            role: 'coach',
            spawnAgent: true,
          }),
        });

        const data = (await response.json().catch(() => null)) as any;

        if (!response.ok) {
          setError(data?.error ?? `Failed to get token (HTTP ${response.status})`);
          return;
        }

        console.log('[Room] Token response:', data?.success ? 'success' : data?.error);

        if (data?.success) {
          const url = (data?.data?.url as string | undefined) || (import.meta.env.VITE_LIVEKIT_URL as string | undefined);
          if (!url) {
            setError('LiveKit URL missing (server did not return url and VITE_LIVEKIT_URL is not set)');
            return;
          }
          setToken(data.data.token);
          setLivekitUrl(url);
          setAgentStatus(String(data?.data?.agentStatus ?? 'unknown'));
        } else {
          setError(data?.error || 'Failed to get token');
        }
      } catch (err) {
        setError('Network error');
        console.error(err);
      }
    }

    getToken();
  }, [roomId]);

  // Connect when token is ready - only once
  useEffect(() => {
    if (!token || !livekitUrl || hasConnectedRef.current) return;
    hasConnectedRef.current = true;

    console.log('[Room] Token ready, connecting to LiveKit...');
    connect();
  }, [token, livekitUrl, connect]);

  // Session timer
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Attach local video
  useEffect(() => {
    if (localParticipant?.videoTrack && localVideoRef.current) {
      localVideoRef.current.srcObject = new MediaStream([localParticipant.videoTrack]);
    }
  }, [localParticipant?.videoTrack]);

  // Attach client video
  useEffect(() => {
    if (clientParticipant?.videoTrack && clientVideoRef.current) {
      clientVideoRef.current.srcObject = new MediaStream([clientParticipant.videoTrack]);
    }
  }, [clientParticipant?.videoTrack]);

  // Update participants from remoteParticipants
  // Always update to capture track changes
  useEffect(() => {
    let foundAiParticipant: ParticipantInfo | undefined;
    let foundClientParticipant: ParticipantInfo | undefined;

    remoteParticipants.forEach((participant) => {
      if (participant.identity.startsWith('ai-')) {
        foundAiParticipant = participant;
      } else if (participant.identity.startsWith('client-')) {
        foundClientParticipant = participant;
      }
    });

    // Always update AI participant to capture track changes
    if (foundAiParticipant !== undefined) {
      if (!aiParticipant || aiParticipant.identity !== foundAiParticipant.identity) {
        setAgentStatus('connected');
      }
      setAiParticipant(foundAiParticipant);
    } else if (aiParticipant) {
      setAiParticipant(null);
    }

    // Always update client participant to capture track changes
    if (foundClientParticipant !== undefined) {
      setClientParticipant(foundClientParticipant);
    } else if (clientParticipant) {
      setClientParticipant(null);
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
      console.log('[CoachRoom] 🔊 AI audio stream:', stream ? 'available' : 'null', 'for', aiIdentity);
      return stream;
    }
    return null;
  }, [remoteParticipants, getParticipantAudioStream]);

  // Coach controls
  const handleMuteFromAI = useCallback(() => {
    const newMuted = !isMutedFromAI;
    setIsMutedFromAI(newMuted);

    // Send data message to AI agent
    publishData(JSON.stringify({
      type: 'coach_mute',
      muted: newMuted,
      coachIdentity: participantIdRef.current,
    }));

    addTranscriptItem('coach', 'Coach', newMuted ? 'Muted from AI' : 'Unmuted from AI');
  }, [isMutedFromAI, publishData, addTranscriptItem]);

  const handleWhisper = useCallback(() => {
    if (!whisperText.trim()) return;

    publishData(JSON.stringify({
      type: 'coach_whisper',
      text: whisperText.trim(),
    }));

    addTranscriptItem('coach', 'Coach (whisper)', whisperText.trim());
    setWhisperText('');
  }, [whisperText, publishData, addTranscriptItem]);

  const handleEndSession = useCallback(() => {
    if (!confirm('End this coaching session?')) return;
    disconnect();
    navigate('/dashboard');
  }, [disconnect, navigate]);

  const handleCopyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(clientJoinUrl);
      addTranscriptItem('system', 'System', 'Copied client join link to clipboard.');
    } catch {
      addTranscriptItem('system', 'System', 'Could not copy invite link (clipboard permission).');
    }
  }, [clientJoinUrl, addTranscriptItem]);

  // Status indicators
  const isConnected = connectionState === ConnectionState.Connected;
  const statusDotClass = isConnected ? '' : connectionState === ConnectionState.Connecting ? 'warn' : 'err';
  const statusLabel = isConnected ? 'Ready' : connectionState === ConnectionState.Connecting ? 'Connecting...' : 'Error';

  const aiStatusLabel = useMemo(() => {
    if (isMutedFromAI) return 'AI Muted (from you)';
    if (aiParticipant) return aiParticipant.isSpeaking ? 'AI Speaking' : 'AI Coach Ready';
    if (agentStatus === 'spawning') return 'Starting AI Coach...';
    if (agentStatus === 'failed') return 'AI failed to start';
    return 'AI Offline';
  }, [agentStatus, aiParticipant, isMutedFromAI]);

  if (error) {
    return (
      <div className="coach-room">
        <div className="coach-room-shell">
          <div style={{ padding: '2rem' }}>
            <div className="alert alert-error">
              <strong>Error</strong>
              <div style={{ marginTop: '0.5rem' }}>{error}</div>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="coach-room">
      <div className="coach-room-shell">
        <section className="coach-room-left">
          <header className="coach-room-header">
            <div>
              <h2>Coach Room</h2>
              <div className="coach-room-subtitle">
                Room: {roomShort}...
              </div>
              <div className="coach-room-subtitle">
                Client link: <a href={clientJoinUrl} target="_blank" rel="noreferrer">{clientJoinUrl}</a>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="coach-room-status">
                <span className={`coach-room-status-dot ${statusDotClass}`} />
                <span>{statusLabel}</span>
              </div>
              <button className="btn btn-primary" type="button" onClick={handleCopyInvite}>
                Copy client invite
              </button>
              <button className="btn btn-primary" type="button" onClick={() => navigate('/dashboard')}>
                Exit
              </button>
            </div>
          </header>

          <div className="coach-room-video-grid">
            {/* Local (Coach) Video */}
            <div className="coach-room-tile">
              <video ref={localVideoRef} autoPlay playsInline muted />
              <div className="coach-room-tile-label">You (Coach)</div>
            </div>

            {/* Client Video */}
            <div className="coach-room-tile">
              {clientParticipant?.videoTrack ? (
                <video ref={clientVideoRef} autoPlay playsInline />
              ) : (
                <div className="coach-room-tile-placeholder">Waiting for client...</div>
              )}
              <div className="coach-room-tile-label">Client</div>
            </div>

            {/* AI Orb */}
            <div className="coach-room-tile">
              <div className="coach-room-tile-placeholder" style={{ flexDirection: 'column', gap: 16 }}>
                <Orb3D stream={aiAudioStream ?? undefined} size={150} />
                <div>{aiStatusLabel}</div>
              </div>
              <div className="coach-room-tile-label">AI Coach</div>
            </div>

            {/* Session Info */}
            <div className="coach-room-tile">
              <div className="coach-room-tile-placeholder">
                Participants: {1 + (clientParticipant ? 1 : 0) + (aiParticipant ? 1 : 0)}
              </div>
              <div className="coach-room-tile-label">Session</div>
            </div>
          </div>

          <div className="coach-room-controls">
            <button className="btn btn-primary" type="button" onClick={toggleVideo}>
              {isVideoEnabled ? '📹 Video' : '📹 Video Off'}
            </button>
            <button className="btn btn-primary" type="button" onClick={toggleAudio}>
              {isAudioEnabled ? '🎤 Audio' : '🎤 Muted'}
            </button>
          </div>
        </section>

        <aside className="coach-room-right">
          <div className="coach-ai-panel-header">
            <h3>AI Coach Controls</h3>
            <div className="coach-ai-controls">
              <button
                className={`btn ${isMutedFromAI ? 'btn-warning' : 'btn-primary'}`}
                type="button"
                onClick={handleMuteFromAI}
              >
                {isMutedFromAI ? '🔇 Unmute from AI' : '🔊 Mute from AI'}
              </button>
              <button className="btn btn-danger" type="button" onClick={handleEndSession}>
                End Session
              </button>
            </div>

            {/* Whisper Input */}
            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, opacity: 0.8 }}>
                Whisper to AI (silent context)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="e.g., Focus on breathing exercises..."
                  value={whisperText}
                  onChange={(e) => setWhisperText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleWhisper()}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: 4,
                    border: '1px solid #444',
                    background: '#1e1e1e',
                    color: 'white',
                  }}
                />
                <button className="btn btn-primary" onClick={handleWhisper}>
                  Send
                </button>
              </div>
            </div>
          </div>

          <div className="coach-transcript">
            <div className="coach-transcript-header">
              <div style={{ fontWeight: 700 }}>Live Transcript</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                AI: {aiParticipant ? 'connected' : 'offline'} · Client: {clientParticipant ? 'connected' : 'waiting'}
              </div>
            </div>
            <div
              className="coach-transcript-body"
              ref={transcriptBodyRef}
              onScroll={handleTranscriptScroll}
            >
              {transcript.map((t) => (
                <div key={t.id} className={`coach-transcript-item ${t.kind}`}>
                  <div className="coach-transcript-speaker">{t.speaker}</div>
                  <div>{t.text}</div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          <div className="coach-session-timer">
            <div className="time">{formatTime(seconds)}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Session Duration</div>
          </div>
        </aside>

        {/* Hidden audio elements for playback */}
        {Array.from(remoteParticipants.values()).map((participant) => (
          participant.audioTrack && (
            <audio
              key={participant.identity}
              autoPlay
              ref={(el) => {
                if (el && participant.audioTrack) {
                  el.srcObject = new MediaStream([participant.audioTrack]);
                }
              }}
            />
          )
        ))}
      </div>
    </div>
  );
}

export default CallRoomPage;
