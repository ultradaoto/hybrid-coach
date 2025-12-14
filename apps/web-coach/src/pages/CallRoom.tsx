/**
 * CallRoom - Coach View with LiveKit
 * 
 * Coach-specific features:
 * - Coach can see and hear client + AI
 * - Coach audio is OFF by default (doesn't send to AI)
 * - Coach can toggle mic to speak to client only
 * - Live transcript panel
 * - Mute controls
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
  time: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getApiUrl(): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '');
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

function getTimeString(): string {
  return new Date().toLocaleTimeString();
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
  const [whisperText, setWhisperText] = useState('');
  const [isAIPaused, setIsAIPaused] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([
    {
      id: crypto.randomUUID(),
      kind: 'system',
      speaker: 'System',
      text: 'Session initialized. Waiting for participants...',
      time: getTimeString(),
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
  const hasDisabledMicRef = useRef(false);

  const roomShort = useMemo(() => (roomId ?? '').slice(0, 8), [roomId]);

  // Generate client join URL based on environment
  const clientJoinUrl = useMemo(() => {
    const isProd = import.meta.env.PROD;
    if (isProd) {
      return `https://myultra.coach/client/room/${roomId ?? ''}`;
    }
    const host = window.location.hostname;
    return `http://${host}:3702/room/${roomId ?? ''}`;
  }, [roomId]);

  // Helper to add transcript items
  const addTranscriptItem = useCallback((kind: TranscriptKind, speaker: string, text: string) => {
    console.log(`[Transcript] ${speaker}: ${text}`);
    setTranscript((prev) => [...prev, { 
      id: crypto.randomUUID(), 
      kind, 
      speaker, 
      text,
      time: getTimeString(),
    }]);
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

  // Handle data messages from AI agent (transcripts, pause state)
  const handleDataReceived = useCallback((payload: Uint8Array) => {
    try {
      const text = new TextDecoder().decode(payload);
      console.log('[CoachRoom] 📨 Data received:', text.slice(0, 100));
      
      const message = JSON.parse(text);

      if (message.type === 'transcript') {
        const isAI = message.role === 'assistant';
        addTranscriptItem(
          isAI ? 'ai' : 'client',
          isAI ? 'AI Coach' : 'Client',
          message.content
        );
      } else if (message.type === 'agent_state') {
        addTranscriptItem('system', 'System', `AI Agent: ${message.state}`);
      } else if (message.type === 'ai_pause_state') {
        // Sync pause state from AI agent
        setIsAIPaused(message.paused);
        addTranscriptItem('system', 'System', message.paused ? '⏸️ AI Paused' : '▶️ AI Resumed');
      }
    } catch (e) {
      console.error('[CoachRoom] Failed to parse data message:', e);
    }
  }, [addTranscriptItem]);

  // Callbacks
  const handleConnected = useCallback(() => {
    addTranscriptItem('system', 'System', 'Connected to room');
  }, [addTranscriptItem]);

  const handleDisconnected = useCallback(() => {
    addTranscriptItem('system', 'System', 'Disconnected from room');
  }, [addTranscriptItem]);

  const handleParticipantJoined = useCallback((participant: ParticipantInfo) => {
    console.log('[CoachRoom] 👤 Participant joined:', participant.identity);

    if (participant.identity.startsWith('ai-')) {
      setAiParticipant(participant);
      setAgentStatus('connected');
      addTranscriptItem('system', 'System', '🤖 AI Coach connected');
    } else if (participant.identity.startsWith('client-')) {
      setClientParticipant(participant);
      addTranscriptItem('system', 'System', '👤 Client joined the session');
    }
  }, [addTranscriptItem]);

  const handleParticipantLeft = useCallback((identity: string) => {
    console.log('[CoachRoom] 👋 Participant left:', identity);

    if (identity.startsWith('ai-')) {
      setAiParticipant(null);
      setAgentStatus('disconnected');
      addTranscriptItem('system', 'System', '🤖 AI Coach disconnected');
    } else if (identity.startsWith('client-')) {
      setClientParticipant(null);
      addTranscriptItem('system', 'System', '👤 Client left the session');
    }
  }, [addTranscriptItem]);

  const handleError = useCallback((err: Error) => {
    console.error('[CoachRoom] ❌ LiveKit error:', err);
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
    onDisconnected: handleDisconnected,
    onParticipantJoined: handleParticipantJoined,
    onParticipantLeft: handleParticipantLeft,
    onDataReceived: handleDataReceived,
    onError: handleError,
  });

  // Fetch token from API
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

        console.log('[CoachRoom] 🔑 Fetching LiveKit token...');
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

        const data = await response.json().catch(() => null) as any;

        if (!response.ok) {
          setError(data?.error ?? `Failed to get token (HTTP ${response.status})`);
          return;
        }

        console.log('[CoachRoom] ✅ Token received');

        if (data?.success) {
          const url = data?.data?.url || import.meta.env.VITE_LIVEKIT_URL;
          if (!url) {
            setError('LiveKit URL missing');
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

  // Connect when token is ready
  useEffect(() => {
    if (!token || !livekitUrl || hasConnectedRef.current) return;
    hasConnectedRef.current = true;
    console.log('[CoachRoom] 🚀 Connecting to LiveKit...');
    connect();
  }, [token, livekitUrl, connect]);

  // IMPORTANT: Disable coach microphone by default after connection
  // Coach should observe, not interfere with AI-client conversation
  useEffect(() => {
    if (connectionState === ConnectionState.Connected && isAudioEnabled && !hasDisabledMicRef.current) {
      hasDisabledMicRef.current = true;
      console.log('[CoachRoom] 🔇 Disabling coach microphone by default');
      toggleAudio().catch(console.error);
      addTranscriptItem('system', 'System', 'Your mic is off by default. Toggle to speak to client.');
    }
  }, [connectionState, isAudioEnabled, toggleAudio, addTranscriptItem]);

  // Session timer
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Attach local video
  useEffect(() => {
    if (localParticipant?.videoTrack && localVideoRef.current) {
      console.log('[CoachRoom] 📹 Attaching local video');
      localVideoRef.current.srcObject = new MediaStream([localParticipant.videoTrack]);
    }
  }, [localParticipant?.videoTrack]);

  // Attach client video
  useEffect(() => {
    if (clientParticipant?.videoTrack && clientVideoRef.current) {
      console.log('[CoachRoom] 📹 Attaching client video');
      clientVideoRef.current.srcObject = new MediaStream([clientParticipant.videoTrack]);
    }
  }, [clientParticipant?.videoTrack]);

  // Update participants from remoteParticipants
  useEffect(() => {
    let foundAi: ParticipantInfo | undefined;
    let foundClient: ParticipantInfo | undefined;

    remoteParticipants.forEach((participant) => {
      console.log('[CoachRoom] 👥 Remote participant:', participant.identity, {
        hasAudio: !!participant.audioTrack,
        hasVideo: !!participant.videoTrack,
      });
      
      if (participant.identity.startsWith('ai-')) {
        foundAi = participant;
      } else if (participant.identity.startsWith('client-')) {
        foundClient = participant;
      }
    });

    if (foundAi) {
      if (!aiParticipant || aiParticipant.identity !== foundAi.identity) {
        setAgentStatus('connected');
      }
      setAiParticipant(foundAi);
    } else if (aiParticipant) {
      setAiParticipant(null);
    }

    if (foundClient) {
      setClientParticipant(foundClient);
    } else if (clientParticipant) {
      setClientParticipant(null);
    }
  }, [remoteParticipants]);

  // Get AI audio stream for Orb
  const aiAudioStream = useMemo(() => {
    let aiIdentity: string | null = null;
    remoteParticipants.forEach((p) => {
      if (p.identity.startsWith('ai-')) {
        aiIdentity = p.identity;
      }
    });
    
    if (aiIdentity) {
      const stream = getParticipantAudioStream(aiIdentity);
      return stream;
    }
    return null;
  }, [remoteParticipants, getParticipantAudioStream]);

  // Coach controls
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
      addTranscriptItem('system', 'System', '📋 Copied client join link');
    } catch {
      addTranscriptItem('system', 'System', '❌ Could not copy link');
    }
  }, [clientJoinUrl, addTranscriptItem]);

  const handleToggleMic = useCallback(async () => {
    await toggleAudio();
    addTranscriptItem('system', 'System', isAudioEnabled ? '🔇 Mic OFF' : '🎤 Mic ON');
  }, [toggleAudio, isAudioEnabled, addTranscriptItem]);

  const handleToggleVideo = useCallback(async () => {
    await toggleVideo();
    addTranscriptItem('system', 'System', isVideoEnabled ? '📹 Camera OFF' : '📹 Camera ON');
  }, [toggleVideo, isVideoEnabled, addTranscriptItem]);

  // Toggle AI pause state
  const handleTogglePauseAI = useCallback(() => {
    const newPaused = !isAIPaused;
    setIsAIPaused(newPaused);
    
    publishData(JSON.stringify({
      type: 'pause_ai',
      paused: newPaused,
    }));

    addTranscriptItem('coach', 'Coach', newPaused 
      ? '⏸️ Paused AI - you can now speak privately with client' 
      : '▶️ Resumed AI - AI will respond to client again');
  }, [isAIPaused, publishData, addTranscriptItem]);

  // Status indicators
  const isConnected = connectionState === ConnectionState.Connected;
  const statusDotClass = isConnected ? 'ok' : connectionState === ConnectionState.Connecting ? 'warn' : 'err';
  const statusLabel = isConnected ? 'Connected' : connectionState === ConnectionState.Connecting ? 'Connecting...' : 'Disconnected';

  const aiStatusLabel = useMemo(() => {
    if (isAIPaused) return '⏸️ Paused';
    if (aiParticipant) return aiParticipant.isSpeaking ? '🗣️ Speaking' : '🟢 Ready';
    if (agentStatus === 'spawning') return '🟡 Starting...';
    if (agentStatus === 'failed') return '🔴 Failed';
    return '⚪ Offline';
  }, [agentStatus, aiParticipant, isAIPaused]);

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
              <h2>🎯 Coach Room</h2>
              <div className="coach-room-subtitle">
                Room: {roomShort}... • <span className={`status-dot ${statusDotClass}`}></span> {statusLabel}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button className="btn btn-sm" type="button" onClick={handleCopyInvite}>
                📋 Copy Invite
              </button>
              <button className="btn btn-sm btn-danger" type="button" onClick={handleEndSession}>
                End
              </button>
            </div>
          </header>

          {/* Video Grid */}
          <div className="coach-room-video-grid">
            {/* Coach Video */}
            <div className="coach-room-tile">
              {isVideoEnabled ? (
                <video ref={localVideoRef} autoPlay playsInline muted />
              ) : (
                <div className="coach-room-tile-placeholder">📹 Camera Off</div>
              )}
              <div className="coach-room-tile-label">
                You (Coach) {isAudioEnabled ? '🎤' : '🔇'}
              </div>
            </div>

            {/* Client Video */}
            <div className="coach-room-tile">
              {clientParticipant?.videoTrack ? (
                <video ref={clientVideoRef} autoPlay playsInline />
              ) : (
                <div className="coach-room-tile-placeholder">
                  {clientParticipant ? '👤 Client (no video)' : '⏳ Waiting for client...'}
                </div>
              )}
              <div className="coach-room-tile-label">
                Client {clientParticipant ? '🟢' : '⚪'}
              </div>
            </div>

            {/* AI Orb */}
            <div className="coach-room-tile">
              <div className="coach-room-tile-placeholder" style={{ flexDirection: 'column', gap: 12 }}>
                <Orb3D stream={aiAudioStream ?? undefined} size={140} />
                <div style={{ fontSize: '0.9rem' }}>{aiStatusLabel}</div>
              </div>
              <div className="coach-room-tile-label">AI Coach</div>
            </div>

            {/* Session Info */}
            <div className="coach-room-tile">
              <div className="coach-room-tile-placeholder" style={{ flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{formatTime(seconds)}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                  {1 + (clientParticipant ? 1 : 0) + (aiParticipant ? 1 : 0)} participants
                </div>
              </div>
              <div className="coach-room-tile-label">Session</div>
            </div>
          </div>

          {/* Controls */}
          <div className="coach-room-controls">
            <button 
              className={`btn ${isVideoEnabled ? 'btn-primary' : 'btn-warning'}`} 
              type="button" 
              onClick={handleToggleVideo}
            >
              {isVideoEnabled ? '📹 Video ON' : '📹 Video OFF'}
            </button>
            <button 
              className={`btn ${isAudioEnabled ? 'btn-primary' : 'btn-warning'}`} 
              type="button" 
              onClick={handleToggleMic}
            >
              {isAudioEnabled ? '🎤 Mic ON' : '🔇 Mic OFF'}
            </button>
          </div>

          {/* Invite Link */}
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            background: 'rgba(0,0,0,0.2)', 
            borderRadius: '8px',
            fontSize: '0.85rem',
          }}>
            <strong>Client invite link:</strong>
            <div style={{ 
              marginTop: '0.25rem', 
              wordBreak: 'break-all', 
              opacity: 0.8,
              fontFamily: 'monospace',
            }}>
              {clientJoinUrl}
            </div>
          </div>
        </section>

        {/* Right Panel - Transcript & Controls */}
        <aside className="coach-room-right">
          <div className="coach-ai-panel-header">
            <h3>🎯 Coach Panel</h3>
            
            {/* Pause AI Button */}
            <div style={{ marginTop: '0.75rem' }}>
              <button
                className={`btn btn-block ${isAIPaused ? 'btn-success' : 'btn-warning'}`}
                type="button"
                onClick={handleTogglePauseAI}
                style={{ 
                  width: '100%', 
                  padding: '0.75rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                {isAIPaused ? '▶️ Resume AI' : '⏸️ Pause AI'}
              </button>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: 'center' }}>
                {isAIPaused 
                  ? 'AI is paused. Speak privately with client.' 
                  : 'Pause AI to coach the client privately.'}
              </div>
            </div>

            {/* Whisper Input */}
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: 11, marginBottom: 4, opacity: 0.7 }}>
                Whisper to AI (client won't see)
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Guide the AI..."
                  value={whisperText}
                  onChange={(e) => setWhisperText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleWhisper()}
                  style={{
                    flex: 1,
                    padding: '0.4rem 0.6rem',
                    borderRadius: 4,
                    border: '1px solid #444',
                    background: '#1a1a1a',
                    color: 'white',
                    fontSize: '0.85rem',
                  }}
                />
                <button className="btn btn-sm btn-primary" onClick={handleWhisper}>
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Live Transcript */}
          <div className="coach-transcript">
            <div className="coach-transcript-header">
              <div style={{ fontWeight: 600 }}>📝 Live Transcript</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                AI: {aiParticipant ? '🟢' : '⚪'} | Client: {clientParticipant ? '🟢' : '⚪'}
              </div>
            </div>
            <div
              className="coach-transcript-body"
              ref={transcriptBodyRef}
              onScroll={handleTranscriptScroll}
            >
              {transcript.map((t) => (
                <div key={t.id} className={`coach-transcript-item ${t.kind}`}>
                  <div className="coach-transcript-speaker">
                    {t.kind === 'ai' && '🤖 '}
                    {t.kind === 'client' && '👤 '}
                    {t.kind === 'coach' && '🎯 '}
                    {t.kind === 'system' && '⚙️ '}
                    {t.speaker}
                    <span style={{ marginLeft: '0.5rem', opacity: 0.5, fontSize: '0.75rem' }}>
                      {t.time}
                    </span>
                  </div>
                  <div style={{ marginTop: 2 }}>{t.text}</div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        </aside>

        {/* Hidden audio elements for playback - IMPORTANT for hearing everyone */}
        {Array.from(remoteParticipants.values()).map((participant) => (
          participant.audioTrack && (
            <audio
              key={participant.identity}
              autoPlay
              ref={(el) => {
                if (el && participant.audioTrack) {
                  el.srcObject = new MediaStream([participant.audioTrack]);
                  el.play().catch(() => {}); // Ensure playback starts
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
