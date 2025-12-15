/**
 * LiveKit AI Agent
 * 
 * Joins a LiveKit room as a participant and bridges audio to/from Deepgram.
 * Replaces the WebSocket bridge approach with native LiveKit integration.
 * 
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │                          LiveKit Room                                    │
 * │  ┌──────────┐  ┌──────────┐  ┌──────────┐                              │
 * │  │  Client  │  │  Coach   │  │ AI Agent │                              │
 * │  │  (audio) │  │  (audio) │  │ (this)   │                              │
 * │  └────┬─────┘  └────┬─────┘  └────┬─────┘                              │
 * │       │             │             │                                     │
 * │       └─────────────┴─────────────┼──────────────────────────────────── │
 * │                                   │                                     │
 * │                            subscribes to all                            │
 * │                            publishes AI audio                           │
 * └───────────────────────────────────┼──────────────────────────────────────┘
 *                                     │
 *                                     ▼
 *                    ┌────────────────────────────────────┐
 *                    │     DualConnectionManager           │
 *                    │                                    │
 *                    │  ┌────────────┐  ┌─────────────┐  │
 *                    │  │ VoiceAgent │  │ Transcription│  │
 *                    │  │ (Deepgram) │  │ (Deepgram)   │  │
 *                    │  └────────────┘  └─────────────┘  │
 *                    └────────────────────────────────────┘
 */

import { EventEmitter } from 'events';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  TrackKind,
  AudioStream,
  LocalAudioTrack,
  AudioSource,
  AudioFrame,
  ConnectionState,
} from '@livekit/rtc-node';
import { AccessToken, VideoGrant } from 'livekit-server-sdk';
import { DualConnectionManager, createDualConnectionManager } from './connections/connection-manager.js';
import type { TranscriptEntry } from './types/deepgram-events.js';

// =============================================================================
// Types
// =============================================================================

export interface LiveKitAgentConfig {
  roomName: string;
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  coachingPrompt: string;
  greeting?: string;
  voiceModel?: string;
  llmModel?: string;
  verbose?: boolean;
}

export interface AgentStatus {
  room: {
    connected: boolean;
    name: string | null;
    participantCount: number;
  };
  deepgram: {
    connected: boolean;
    voiceAgentReady: boolean;
    transcriptionReady: boolean;
  };
  audio: {
    isPublishing: boolean;
    isSpeaking: boolean;
  };
  participants: {
    identity: string;
    isMuted: boolean;
  }[];
}

// =============================================================================
// LiveKit AI Agent
// =============================================================================

export class LiveKitAgent extends EventEmitter {
  private config: LiveKitAgentConfig;
  private room: Room | null = null;
  private connectionManager: DualConnectionManager | null = null;
  private audioSource: AudioSource | null = null;
  private audioTrack: LocalAudioTrack | null = null;
  private isPublishing: boolean = false;
  private mutedParticipants: Set<string> = new Set();
  private participantRoles: Map<string, 'client' | 'coach'> = new Map();
  private identity: string;
  private audioStreamsByTrackSid: Map<string, AudioStream> = new Map();
  private shutdownTimer: NodeJS.Timeout | null = null;
  private readonly GRACE_PERIOD_MS = 60 * 1000; // 60 seconds
  
  // Phase 2: Performance monitoring
  private audioProcessingStats = {
    totalFramesProcessed: 0,
    lastReportTime: Date.now(),
    maxQueueSize: 0,
  };
  
  /** When true, AI is paused - won't respond to client but transcription continues */
  private isAIPaused: boolean = false;
  
  // Non-blocking audio processing queue (Phase 2: Increased capacity)
  private audioQueue: Array<{
    buffer: Buffer;
    participantId: string;
    participantName: string;
    priority: number;
  }> = [];
  private isProcessingAudio = false;
  private readonly MAX_QUEUE_SIZE = 500; // Phase 2: Increased from 100 to 500

  constructor(config: LiveKitAgentConfig) {
    super();
    this.config = config;
    // Must start with `ai-` so the web coach/client UIs detect the AI participant.
    // Also matches selective-audio destinationIdentities.
    this.identity = 'ai-coach-agent';
  }

  /**
   * Generate access token for this agent
   */
  private async generateToken(): Promise<string> {
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: this.identity,
      name: 'AI Coach',
      ttl: '4h',
    });

    const grant: VideoGrant = {
      room: this.config.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    };

    token.addGrant(grant);
    return await token.toJwt();
  }

  /**
   * Connect to room and initialize Deepgram
   */
  async connect(): Promise<void> {
    console.log(`[LiveKitAgent] 🚀 Connecting to room: ${this.config.roomName}`);

    try {
      // Generate token
      const token = await this.generateToken();

      // Create room instance
      this.room = new Room();

      // Set up room event handlers
      this.setupRoomEvents();

      // Connect to LiveKit
      await this.room.connect(this.config.livekitUrl, token);
      console.log(`[LiveKitAgent] ✅ Connected to room as ${this.identity}`);

      // Initialize Deepgram dual connection
      await this.initializeDeepgram();

      // Set up audio publication
      await this.setupAudioPublication();

      this.emit('connected');

    } catch (error) {
      console.error('[LiveKitAgent] ❌ Connection failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set up LiveKit room event handlers
   */
  private setupRoomEvents(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`[LiveKitAgent] 👤 Participant connected: ${participant.identity}`);
      
      // Determine role from identity prefix
      const role = participant.identity.startsWith('coach-') ? 'coach' : 'client';
      this.participantRoles.set(participant.identity, role);
      
      // Register with connection manager
      this.connectionManager?.registerParticipant(participant.identity, role, participant.name);
      
      this.emit('participant-joined', { identity: participant.identity, role });
      
      // Check room status (may cancel grace period if humans joined)
      this.checkRoomStatus();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log(`[LiveKitAgent] 👋 Participant disconnected: ${participant.identity}`);
      
      this.participantRoles.delete(participant.identity);
      this.mutedParticipants.delete(participant.identity);
      this.connectionManager?.unregisterParticipant(participant.identity);
      
      this.emit('participant-left', { identity: participant.identity });
      
      // Check if room is now empty and should start grace period
      this.checkRoomStatus();
    });

    this.room.on(RoomEvent.TrackSubscribed, (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      console.log(`[LiveKitAgent] 🎤 Track subscribed: ${track.kind} from ${participant.identity} (muted: ${publication.muted})`);
      
      if (track.kind === TrackKind.KIND_AUDIO) {
        // Ensure participant is registered
        if (!this.participantRoles.has(participant.identity)) {
          const role = participant.identity.startsWith('coach-') ? 'coach' : 'client';
          this.participantRoles.set(participant.identity, role);
          this.connectionManager?.registerParticipant(participant.identity, role, participant.name);
        }
        
        const isCoach = participant.identity.startsWith('coach-');
        
        // For coach, check if track is muted at subscription time
        if (isCoach && publication.muted) {
          console.log(`[LiveKitAgent] 🔇 Coach mic is muted at subscription, will wait for unmute`);
          // Don't set up audio processing yet - wait for unmute event
          return;
        }
        
        // Handle audio track (async)
        this.handleAudioTrack(track, participant).catch((err) => {
          console.error(`[LiveKitAgent] ❌ Error handling audio track:`, err);
        });
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      console.log(`[LiveKitAgent] 🔇 Track unsubscribed: ${track.kind} from ${participant.identity}`);

      const stream = this.audioStreamsByTrackSid.get(track.sid);
      if (stream) {
        try {
          stream.close();
        } catch {
          // ignore
        }
        this.audioStreamsByTrackSid.delete(track.sid);
      }
    });

    // Handle coach muting/unmuting their mic
    this.room.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (publication.kind === TrackKind.KIND_AUDIO) {
        console.log(`[LiveKitAgent] 🔇 Track muted: ${participant.identity}`);
        
        const isCoach = participant.identity.startsWith('coach-');
        if (isCoach) {
          console.log(`[LiveKitAgent] 🎙️ Coach muted their mic - audio stream will naturally stop`);
          // Audio stream will stop producing frames, no need to tear down
        }
      }
    });

    this.room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (publication.kind === TrackKind.KIND_AUDIO) {
        console.log(`[LiveKitAgent] 🎤 Track unmuted: ${participant.identity}`);
        
        const isCoach = participant.identity.startsWith('coach-');
        if (isCoach) {
          console.log(`[LiveKitAgent] 🎙️ Coach unmuted their mic`);
          
          // Check if we need to set up audio stream (if it wasn't set up during subscription)
          if (publication.track && !this.audioStreamsByTrackSid.has(publication.track.sid)) {
            console.log(`[LiveKitAgent] 🔊 Setting up audio stream for unmuted coach`);
            this.handleAudioTrack(publication.track as RemoteTrack, participant as RemoteParticipant).catch((err) => {
              console.error(`[LiveKitAgent] ❌ Error handling unmuted audio track:`, err);
            });
          }
        }
      }
    });

    this.room.on(RoomEvent.DataReceived, (
      payload: Uint8Array,
      participant?: RemoteParticipant
    ) => {
      this.handleDataMessage(payload, participant);
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log('[LiveKitAgent] 📴 Disconnected from room');
      this.emit('disconnected');
    });
  }

  /**
   * Initialize Deepgram dual connection
   */
  private async initializeDeepgram(): Promise<void> {
    console.log('[LiveKitAgent] 🔊 Initializing Deepgram connections...');

    this.connectionManager = createDualConnectionManager({
      coachingPrompt: this.config.coachingPrompt,
      greeting: this.config.greeting,
      voiceModel: this.config.voiceModel,
      llmModel: this.config.llmModel,
      verbose: this.config.verbose,
    });

    // Handle AI audio output
    this.connectionManager.on('ai-audio', (data: Buffer) => {
      this.publishAudioData(data);
    });

    // Handle conversation transcripts
    this.connectionManager.on('conversation-text', (entry: TranscriptEntry) => {
      this.broadcastTranscript(entry);
    });

    // Handle agent speaking state
    this.connectionManager.on('agent-speaking', () => {
      this.emit('speaking', true);
    });

    this.connectionManager.on('agent-done-speaking', () => {
      this.emit('speaking', false);
    });

    // Initialize connections
    await this.connectionManager.initialize();
    console.log('[LiveKitAgent] ✅ Deepgram connections initialized');
  }

  /**
   * Set up audio publication to room
   */
  private async setupAudioPublication(): Promise<void> {
    if (!this.room) return;

    console.log('[LiveKitAgent] 🎙️ Setting up audio publication...');

    // Create audio source at 24kHz (mono) to match Deepgram Voice Agent output
    // Third parameter is queueSizeMs - 10000ms = 10 seconds of buffer to prevent overflow
    this.audioSource = new AudioSource(24000, 1, 10000);  // ✅ Changed from 16000 to 24000

    // Create local audio track
    this.audioTrack = LocalAudioTrack.createAudioTrack('ai-voice', this.audioSource);

    // Publish track to room
    // @ts-expect-error - publishTrack API varies between versions
    await this.room.localParticipant?.publishTrack(this.audioTrack, {});
    this.isPublishing = true;

    console.log('[LiveKitAgent] ✅ Audio track published at 24kHz');
  }

  /**
   * Handle incoming audio from a participant
   */
  private async handleAudioTrack(track: RemoteTrack, participant: RemoteParticipant): Promise<void> {
    const role = this.participantRoles.get(participant.identity) || 'unknown';
    console.log(`[LiveKitAgent] 🎧 Setting up audio stream for ${participant.identity} (${role})`);

    // Request 24kHz mono PCM (linear16) to match Deepgram Voice Agent configuration
    // Deepgram recommends 24kHz sample rate for optimal Voice Agent performance
    if (this.audioStreamsByTrackSid.has(track.sid)) {
      console.log(`[LiveKitAgent] ⚠️ Audio stream already exists for track ${track.sid}, skipping`);
      return;
    }

    const audioStream = new AudioStream(track, 24000, 1);  // ✅ Changed from 16000 to 24000
    this.audioStreamsByTrackSid.set(track.sid, audioStream);
    
    console.log(`[LiveKitAgent] ✅ Audio stream created for ${participant.identity} at 24kHz (track: ${track.sid})`);

    // Use non-blocking audio handler instead of blocking for-await
    this.setupAudioStreamHandler(audioStream, participant);
  }

  /**
   * Setup non-blocking audio stream handler (Phase 2: Further optimized)
   * Replaces blocking for-await loop that starves the Node.js event loop
   */
  private setupAudioStreamHandler(audioStream: AsyncIterable<any>, participant: RemoteParticipant): void {
    const participantId = participant.identity;
    const participantName = participant.name || participantId;
    const isCoach = participantId.startsWith('coach-');
    const role = this.participantRoles.get(participantId) || 'unknown';
    
    // Priority: client=1 (highest), coach unmuted=2, coach muted=3
    const getPriority = () => {
      if (!isCoach) return 1;
      return this.mutedParticipants.has(participantId) ? 3 : 2;
    };
    
    let frameCount = 0;
    let firstFrameReceived = false;
    
    console.log(`[LiveKitAgent] 🎬 Starting audio stream handler for ${participantId} (${role})`);
    
    // Non-blocking async IIFE
    (async () => {
      try {
        let batchCount = 0;
        for await (const frame of audioStream) {
          frameCount++;
          batchCount++;
          
          // Log first frame to confirm audio is flowing
          if (!firstFrameReceived) {
            firstFrameReceived = true;
            console.log(`[LiveKitAgent] ✅ FIRST FRAME received from ${participantId} (${role}) - audio is flowing!`);
          }
          
          // Log every 100th frame to avoid spam
          if (frameCount % 100 === 0) {
            console.log(`[LiveKitAgent] 📊 Processed ${frameCount} frames from ${participantId} (${role})`);
          }
          
          // frame.data is Int16Array (linear16). Convert to bytes.
          const buffer = Buffer.from(frame.data.buffer);
          
          // Enqueue instead of processing directly
          this.enqueueAudio({
            buffer,
            participantId,
            participantName,
            priority: getPriority(),
          });
          
          // Phase 2: Only yield every 20 frames instead of every frame
          // This dramatically reduces overhead while still preventing event loop starvation
          if (batchCount >= 20) {
            await new Promise(resolve => setImmediate(resolve));
            batchCount = 0;
          }
        }
      } catch (err) {
        console.error(`[LiveKitAgent] ❌ Audio stream error for ${participantId} (${role}):`, err);
      } finally {
        if (!firstFrameReceived) {
          console.warn(`[LiveKitAgent] ⚠️ Audio stream ended for ${participantId} (${role}) WITHOUT receiving any frames!`);
        } else {
          console.log(`[LiveKitAgent] 🔇 Audio stream ended for ${participantId} (${role}) - processed ${frameCount} frames total`);
        }
        
        // Cleanup
        const stream = this.audioStreamsByTrackSid.get(participant.sid);
        if (stream) {
          this.audioStreamsByTrackSid.delete(participant.sid);
          try {
            stream.close();
          } catch {
            // ignore
          }
        }
      }
    })();
    
    // Start processor if not running
    if (!this.isProcessingAudio) {
      console.log(`[LiveKitAgent] 🔄 Starting audio processor`);
      this.startAudioProcessor();
    }
  }

  /**
   * Enqueue audio frame for processing
   */
  private enqueueAudio(item: typeof this.audioQueue[0]): void {
    if (this.audioQueue.length >= this.MAX_QUEUE_SIZE) {
      // Drop lowest priority (highest number) frame
      this.audioQueue.sort((a, b) => a.priority - b.priority);
      this.audioQueue.pop();
    }
    this.audioQueue.push(item);
  }

  /**
   * Start non-blocking audio processor (Phase 2: Optimized for lower latency)
   */
  private startAudioProcessor(): void {
    this.isProcessingAudio = true;
    
    const processNext = () => {
      // Phase 2: Track queue size for monitoring
      if (this.audioQueue.length > this.audioProcessingStats.maxQueueSize) {
        this.audioProcessingStats.maxQueueSize = this.audioQueue.length;
      }
      
      // Phase 2: Log performance metrics every 10 seconds
      const now = Date.now();
      if (now - this.audioProcessingStats.lastReportTime > 10000) {
        const framesPerSecond = this.audioProcessingStats.totalFramesProcessed / 10;
        console.log(`[LiveKitAgent] 📊 Audio Processing Stats:`);
        console.log(`   - Frames/sec: ${framesPerSecond.toFixed(0)}`);
        console.log(`   - Current queue: ${this.audioQueue.length}`);
        console.log(`   - Max queue: ${this.audioProcessingStats.maxQueueSize}`);
        
        // Reset stats for next interval
        this.audioProcessingStats.totalFramesProcessed = 0;
        this.audioProcessingStats.lastReportTime = now;
        this.audioProcessingStats.maxQueueSize = 0;
      }
      
      if (this.audioQueue.length === 0) {
        // Phase 2: Use shorter interval when queue is empty to reduce latency
        setTimeout(processNext, 5); // Check every 5ms instead of immediate
        return;
      }
      
      // Sort by priority (lower number = higher priority)
      this.audioQueue.sort((a, b) => a.priority - b.priority);
      
      // Phase 2: Process up to 50 frames per tick (increased from 10)
      // This significantly reduces the time it takes to drain the queue
      const batch = this.audioQueue.splice(0, 50);
      for (const item of batch) {
        this.connectionManager?.routeAudio(item.buffer, item.participantId, item.participantName);
        this.audioProcessingStats.totalFramesProcessed++;
      }
      
      // Phase 2: If queue still has many frames, process immediately
      // Otherwise yield to event loop
      if (this.audioQueue.length > 100) {
        setImmediate(processNext);
      } else {
        setTimeout(processNext, 1); // 1ms delay for smoother processing
      }
    };
    
    processNext();
  }

  /**
   * Process audio using reader API
   */
  private async processAudioStreamReader(audioStream: any, participant: RemoteParticipant): Promise<void> {
    let frameCount = 0;
    const reader = audioStream.getReader();
    
    try {
      while (true) {
        const { done, value: frame } = await reader.read();
        if (done) break;
        
        frameCount++;
        
        // Log every 100th frame
        if (frameCount % 100 === 0) {
          console.log(`[LiveKitAgent] 📊 Processed ${frameCount} frames from ${participant.identity}`);
        }
        
        // frame.data is Int16Array (linear16). Convert to bytes.
        const buffer = Buffer.from(frame.data.buffer);
        
        // Route to Deepgram
        this.connectionManager?.routeAudio(buffer, participant.identity, participant.name);
      }
    } catch (err) {
      console.error(`[LiveKitAgent] ❌ Audio stream reader error for ${participant.identity}:`, err);
    } finally {
      reader.releaseLock();
    }
    console.log(`[LiveKitAgent] 🔇 Audio stream ended for ${participant.identity} (${frameCount} frames total)`);
  }

  /**
   * Publish audio data to the room
   * Note: captureFrame is async, but we fire-and-forget with error handling
   */
  private publishAudioData(data: Buffer): void {
    if (!this.audioSource || !this.isPublishing) return;
    
    // Block AI audio output when paused
    if (this.isAIPaused) {
      return;
    }

    // Capture the audioSource reference to avoid race conditions
    const audioSource = this.audioSource;

    // Ensure we have an even number of bytes for Int16Array
    const byteLength = data.byteLength - (data.byteLength % 2);
    if (byteLength === 0) return;

    // Copy data to a new ArrayBuffer to ensure proper alignment
    // This avoids "start offset of Int16Array should be a multiple of 2" errors
    const alignedBuffer = new ArrayBuffer(byteLength);
    const view = new Uint8Array(alignedBuffer);
    view.set(new Uint8Array(data.buffer, data.byteOffset, byteLength));

    // Now create Int16Array from the aligned buffer
    const samples = new Int16Array(alignedBuffer);

    // Create audio frame and capture it (async with error handling)
    // Sample rate must match AudioSource (24000 Hz)
    const frame = new AudioFrame(samples, 24000, 1, samples.length);  // ✅ Changed from 16000 to 24000
    audioSource.captureFrame(frame).catch((error: Error) => {
      // Only log if we're still supposed to be publishing
      if (this.isPublishing) {
        console.warn('[LiveKitAgent] ⚠️ Frame capture failed (normal during disconnect):', error.message);
      }
    });
  }

  /**
   * Handle data messages from participants
   */
  private handleDataMessage(payload: Uint8Array, _participant?: RemoteParticipant): void {
    try {
      const message = JSON.parse(new TextDecoder().decode(payload));
      
      if (message.type === 'coach_mute') {
        this.handleCoachMute(message.muted, message.coachIdentity);
      } else if (message.type === 'coach_whisper') {
        this.handleCoachWhisper(message.text);
      } else if (message.type === 'pause_ai') {
        this.handlePauseAI(message.paused);
      }
    } catch (e) {
      console.error('[LiveKitAgent] Failed to parse data message:', e);
    }
  }

  /**
   * Handle coach mute command
   */
  private handleCoachMute(muted: boolean, coachIdentity: string): void {
    console.log(`[LiveKitAgent] 🔇 Coach mute: ${muted} for ${coachIdentity}`);
    
    if (muted) {
      this.mutedParticipants.add(coachIdentity);
      this.connectionManager?.muteParticipant(coachIdentity);
    } else {
      this.mutedParticipants.delete(coachIdentity);
      this.connectionManager?.unmuteParticipant(coachIdentity);
    }
    
    this.emit('mute-changed', { identity: coachIdentity, muted });
  }

  /**
   * Handle coach whisper (silent context injection)
   */
  private async handleCoachWhisper(text: string): Promise<void> {
    console.log(`[LiveKitAgent] 💬 Coach whisper: ${text}`);
    
    await this.connectionManager?.sendCoachWhisper(text);
    
    this.emit('whisper-received', { text });
  }

  /**
   * Handle AI pause command from coach
   * When paused:
   * - AI won't respond to client audio (audio routed to transcription only)
   * - AI audio output is blocked
   * - Coach can talk to client directly
   * - Transcription continues working
   */
  private handlePauseAI(paused: boolean): void {
    if (this.isAIPaused === paused) return;
    
    this.isAIPaused = paused;
    
    if (paused) {
      console.log('[LiveKitAgent] ⏸️ AI PAUSED by coach - will not respond');
      this.connectionManager?.pauseAI();
      
      // Broadcast pause state to all participants
      this.broadcastPauseState(true);
    } else {
      console.log('[LiveKitAgent] ▶️ AI RESUMED by coach - ready to respond');
      this.connectionManager?.resumeAI();
      
      // Broadcast resume state to all participants
      this.broadcastPauseState(false);
    }
    
    this.emit('ai-pause-changed', { paused });
  }

  /**
   * Broadcast AI pause state to all participants
   */
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

  /**
   * Broadcast transcript to all participants
   */
  private broadcastTranscript(entry: TranscriptEntry): void {
    if (!this.room?.localParticipant) return;

    const message = {
      type: 'transcript',
      role: entry.role,
      content: entry.content,
      timestamp: new Date().toISOString(),
    };

    const data = new TextEncoder().encode(JSON.stringify(message));
    this.room.localParticipant.publishData(data, { reliable: true });
  }

  /**
   * Count human participants in the room (excludes AI)
   */
  private getHumanCount(): number {
    if (!this.room) return 0;
    
    let count = 0;
    this.room.remoteParticipants.forEach((participant) => {
      if (!participant.identity.startsWith('ai-')) {
        count++;
      }
    });
    return count;
  }

  /**
   * Check room status and manage grace period
   */
  private checkRoomStatus(): void {
    if (!this.room) return;
    
    const humanCount = this.getHumanCount();
    console.log(`[LiveKitAgent] 👥 Human participants in room: ${humanCount}`);
    
    if (humanCount === 0) {
      // All humans left - start grace period if not already started
      if (!this.shutdownTimer) {
        console.log(`[LiveKitAgent] ⏳ All humans left. Starting ${this.GRACE_PERIOD_MS / 1000}s grace period...`);
        this.shutdownTimer = setTimeout(() => {
          this.handleGracePeriodExpired();
        }, this.GRACE_PERIOD_MS);
      }
    } else {
      // Humans still present - cancel grace period if active
      if (this.shutdownTimer) {
        console.log('[LiveKitAgent] ✅ Human rejoined. Cancelling shutdown.');
        clearTimeout(this.shutdownTimer);
        this.shutdownTimer = null;
      }
    }
  }

  /**
   * Handle grace period expiration (no humans returned)
   */
  private async handleGracePeriodExpired(): Promise<void> {
    console.log('[LiveKitAgent] 🛑 Grace period expired. No humans returned to room.');
    console.log('[LiveKitAgent] 🧹 Cleaning up and shutting down...');
    
    this.shutdownTimer = null;
    
    // Disconnect gracefully
    await this.disconnect();
    
    // Exit process
    console.log('[LiveKitAgent] 👋 Goodbye!');
    process.exit(0);
  }

  /**
   * Get current agent status
   */
  getStatus(): AgentStatus {
    const deepgramStatus = this.connectionManager?.getStatus();

    return {
      room: {
        connected: this.room?.connectionState === ConnectionState.CONN_CONNECTED,
        name: this.config.roomName,
        participantCount: this.room?.remoteParticipants?.size ?? 0,
      },
      deepgram: {
        connected: deepgramStatus?.overall === 'connected',
        voiceAgentReady: deepgramStatus?.voiceAgent.connected ?? false,
        transcriptionReady: deepgramStatus?.transcription.connected ?? false,
      },
      audio: {
        isPublishing: this.isPublishing,
        isSpeaking: this.connectionManager?.isAgentSpeaking() ?? false,
      },
      participants: Array.from(this.participantRoles.entries()).map(([identity]) => ({
        identity,
        isMuted: this.mutedParticipants.has(identity),
      })),
    };
  }

  /**
   * Disconnect from room and cleanup
   */
  async disconnect(): Promise<void> {
    console.log('[LiveKitAgent] 🔌 Disconnecting...');

    // Clear any pending shutdown timer
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    this.isPublishing = false;

    // Unpublish track if room is connected
    if (this.audioTrack && this.room?.localParticipant) {
      try {
        await this.room.localParticipant.unpublishTrack(this.audioTrack.sid);
      } catch (e) {
        // Track may already be unpublished
      }
      this.audioTrack = null;
    }

    this.audioSource = null;
    this.connectionManager?.cleanup();
    this.connectionManager = null;

    await this.room?.disconnect();
    this.room = null;

    this.mutedParticipants.clear();
    this.participantRoles.clear();

    console.log('[LiveKitAgent] ✅ Disconnected');
    this.emit('disconnected');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createLiveKitAgent(roomName: string, options?: Partial<LiveKitAgentConfig>): LiveKitAgent {
  const config: LiveKitAgentConfig = {
    roomName,
    livekitUrl: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    coachingPrompt: options?.coachingPrompt || getDefaultCoachingPrompt(),
    greeting: options?.greeting || "Hello! I'm your Ultra Coach. How are you feeling today?",
    voiceModel: options?.voiceModel || 'aura-asteria-en',
    llmModel: options?.llmModel || 'gpt-4o-mini',
    verbose: options?.verbose ?? false,
  };

  // Validate required config
  if (!config.livekitUrl) {
    throw new Error('LIVEKIT_URL environment variable is required');
  }
  if (!config.apiKey) {
    throw new Error('LIVEKIT_API_KEY environment variable is required');
  }
  if (!config.apiSecret) {
    throw new Error('LIVEKIT_API_SECRET environment variable is required');
  }

  return new LiveKitAgent(config);
}

/**
 * Default coaching prompt
 */
function getDefaultCoachingPrompt(): string {
  return `You are an Ultra Coach - a supportive AI wellness coach specializing in vagus nerve stimulation, 
breathing techniques, and stress management. You work alongside human coaches to help clients achieve their wellness goals.

Your communication style:
- Warm, empathetic, and encouraging
- Use simple, clear language
- Ask open-ended questions to understand the client's needs
- Offer practical, actionable guidance
- Acknowledge emotions and validate experiences

Key areas of focus:
- Vagus nerve stimulation techniques
- Breathing exercises (box breathing, 4-7-8, etc.)
- Stress management strategies
- Mindfulness and presence
- Physical relaxation techniques

Remember:
- You're part of a team with a human coach
- Keep responses concise for voice conversation
- Be supportive but not prescriptive about medical issues
- Encourage clients to consult healthcare providers for medical concerns`;
}

export default LiveKitAgent;
