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
  TrackPublishOptions,
} from '@livekit/rtc-node';
import { AccessToken, VideoGrant } from 'livekit-server-sdk';
import { DualConnectionManager, createDualConnectionManager } from './connections/connection-manager.js';
import type { TranscriptEntry } from './types/deepgram-events.js';
import {
  createAgentSession,
  storeMessage,
  completeSession,
  parseParticipantIdentity,
  cleanupAbandonedSessions,
} from './db/index.js';

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
  private audioFramesSent: number = 0;
  private mutedParticipants: Set<string> = new Set();
  private participantRoles: Map<string, 'client' | 'coach'> = new Map();
  private identity: string;
  private audioStreamsByTrackSid: Map<string, AudioStream> = new Map();
  private shutdownTimer: NodeJS.Timeout | null = null;
  private readonly GRACE_PERIOD_MS = 60 * 1000; // 60 seconds
  
  // Jitter buffer for smooth AI audio playback
  // Deepgram sends TTS frames in bursts; we buffer and drain at constant rate
  private audioOutputBuffer: Int16Array[] = [];
  private playbackInterval: ReturnType<typeof setInterval> | null = null;
  private isPlaybackActive = false;
  
  // Buffer configuration - increased to 400ms for ultra-smooth playback
  private readonly FRAME_DURATION_MS = 20;          // Each frame is 20ms
  private readonly BUFFER_TARGET_MS = 400;          // Buffer 400ms before starting
  private readonly FRAMES_TO_BUFFER = Math.ceil(400 / 20); // 20 frames for maximum smoothness
  private readonly OUTPUT_SAMPLE_RATE = 24000;
  private readonly SAMPLES_PER_FRAME = (24000 * 20) / 1000; // 480 samples per 20ms frame
  private readonly MIN_BUFFER_FRAMES = 5;           // Keep at least 5 frames to prevent pops
  
  // DC offset filter to eliminate pops/clicks (high-pass filter at ~10Hz)
  private dcOffsetFilter = {
    prevInput: 0,
    prevOutput: 0,
    alpha: 0.995  // ~10Hz cutoff at 24kHz sample rate
  };
  
  // Audio diagnostics for identifying pop/click sources
  private frameCount = 0;
  private lastFrameTime = 0;
  private maxSampleSeen = 0;
  private playbackStartTime = 0;
  private framesPlayed = 0;
  
  // Optional audio capture for debugging (set to true to capture raw audio)
  private readonly DEBUG_CAPTURE_AUDIO = false;
  private capturedFrames: Int16Array[] = [];
  
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

  // Phase 3: Database session tracking
  private dbSessionId: string | null = null;
  private messageBuffer: Array<{
    content: string;
    sender: 'client' | 'coach' | 'ai';
    userId?: string;
    timestamp: Date;
  }> = [];
  private isStoringMessages: boolean = true;

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

      // ================================================
      // DATABASE: Create session for this room
      // ================================================
      try {
        // Clean up any abandoned sessions for this room first
        await cleanupAbandonedSessions(this.config.roomName);
        
        // Find the first non-AI participant to use as session owner
        let primaryUserId: string | undefined;
        for (const [identity, participant] of this.room.remoteParticipants) {
          const parsed = parseParticipantIdentity(identity);
          if (parsed.role !== 'ai' && parsed.userId) {
            primaryUserId = parsed.userId;
            break;
          }
        }
        
        // Create database session
        this.dbSessionId = await createAgentSession({
          roomId: this.config.roomName,
          userId: primaryUserId,
          // appointmentId will be auto-detected from room linkage
        });
        
        if (this.dbSessionId) {
          console.log(`[Agent] Database session initialized: ${this.dbSessionId}`);
        } else {
          console.warn('[Agent] Running without database session (messages will not be stored)');
        }
      } catch (error) {
        console.error('[Agent] Database session creation failed:', error);
        // Continue anyway - agent should work even if DB fails
      }
      // ================================================

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

    // Handle AI audio output - now using jitter buffer for smooth playback
    this.connectionManager.on('ai-audio', (data: Buffer) => {
      this.handleAIAudioOutput(data);
    });

    // Handle conversation transcripts
    this.connectionManager.on('conversation-text', async (entry: TranscriptEntry) => {
      await this.broadcastTranscript(entry);
    });

    // Handle agent speaking state
    this.connectionManager.on('agent-speaking', () => {
      // Prepare audio state for new response (reset DC filter, diagnostics)
      this.prepareForNewResponse();
      this.emit('speaking', true);
    });

    this.connectionManager.on('agent-done-speaking', () => {
      this.emit('speaking', false);
      // Let buffer drain naturally, then reset after a short delay
      setTimeout(() => {
        if (this.audioOutputBuffer.length === 0) {
          this.resetAudioBuffer();
        }
      }, 200);
    });

    // Handle barge-in (user interrupts AI) - immediately stop AI audio
    this.connectionManager.on('barge-in', () => {
      console.log('[LiveKitAgent] 🛑 Barge-in detected - stopping AI audio immediately');
      this.resetAudioBuffer();
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
    console.log('[LiveKitAgent] 🎙️ Audio track created:', this.audioTrack.sid);

    // Publish track to room
    const publication = await this.room.localParticipant?.publishTrack(this.audioTrack, new TrackPublishOptions());
    this.isPublishing = true;

    console.log('[LiveKitAgent] ✅ Audio track published at 24kHz');
    console.log('[LiveKitAgent] 📢 Track publication:', {
      sid: publication?.sid,
      track: publication?.track?.sid,
      kind: publication?.kind,
    });
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
   * Handle incoming audio from Deepgram Voice Agent.
   * Buffers audio and drains at a constant rate for smooth playback.
   * This eliminates jitter caused by bursty TTS delivery.
   */
  private handleAIAudioOutput(audioData: Buffer): void {
    if (!this.audioSource) {
      console.warn('[LiveKitAgent] No audio source available');
      return;
    }
    
    // Block AI audio output when paused
    if (this.isAIPaused) {
      return;
    }
    
    // Ensure we have an even number of bytes for Int16Array
    const byteLength = audioData.byteLength - (audioData.byteLength % 2);
    if (byteLength === 0) return;

    // Copy data to a new ArrayBuffer to ensure proper alignment
    const alignedBuffer = new ArrayBuffer(byteLength);
    const view = new Uint8Array(alignedBuffer);
    view.set(new Uint8Array(audioData.buffer, audioData.byteOffset, byteLength));

    // Convert Buffer to Int16Array
    const samples = new Int16Array(alignedBuffer);
    
    // Optional: Capture raw audio for debugging (before any processing)
    if (this.DEBUG_CAPTURE_AUDIO) {
      this.capturedFrames.push(new Int16Array(samples));
      
      // Save after ~10 seconds of audio
      if (this.capturedFrames.length >= 500) {
        this.saveDebugAudio();
      }
    }
    
    // Add to jitter buffer
    this.audioOutputBuffer.push(samples);
    
    // Start playback if buffer is full enough and not already playing
    if (!this.isPlaybackActive && this.audioOutputBuffer.length >= this.FRAMES_TO_BUFFER) {
      this.startBufferedPlayback();
    }
  }

  // Track consecutive empty frames for graceful end detection
  private emptyFrameCount = 0;
  private readonly MAX_EMPTY_FRAMES = 15; // 300ms of silence before stopping

  /**
   * Start draining the buffer at a constant 20ms interval.
   * Uses a self-correcting timer for more precise timing than setInterval.
   * This ensures smooth playback regardless of when frames arrive.
   */
  private startBufferedPlayback(): void {
    if (this.isPlaybackActive) return;
    
    this.isPlaybackActive = true;
    this.emptyFrameCount = 0;
    this.playbackStartTime = Date.now();
    this.framesPlayed = 0;
    this.frameCount = 0;  // Reset diagnostics
    this.maxSampleSeen = 0;
    
    console.log(`[LiveKitAgent] 🔊 Starting buffered playback (${this.audioOutputBuffer.length} frames buffered, ~${this.audioOutputBuffer.length * this.FRAME_DURATION_MS}ms)`);
    
    // Self-correcting timer for precise 20ms intervals
    const playNextFrame = () => {
      if (!this.isPlaybackActive) return;
      
      if (this.audioOutputBuffer.length > 0) {
        const samples = this.audioOutputBuffer.shift()!;
        
        // Apply audio processing: diagnostics + DC offset removal
        this.logAudioDiagnostics(samples);
        const cleanedSamples = this.removeDCOffset(samples);
        
        // Publish to LiveKit
        this.publishAudioFrame(cleanedSamples);
        this.framesPlayed++;
        this.emptyFrameCount = 0;
        
        // Calculate next frame time based on wall clock (self-correcting)
        const expectedTime = this.playbackStartTime + (this.framesPlayed * this.FRAME_DURATION_MS);
        const now = Date.now();
        const delay = Math.max(1, expectedTime - now);
        
        setTimeout(playNextFrame, delay);
      } else {
        // Buffer is empty - wait for more data
        this.emptyFrameCount++;
        
        if (this.emptyFrameCount >= this.MAX_EMPTY_FRAMES) {
          // Sustained silence - stop playback
          console.log('[LiveKitAgent] 🔇 Sustained silence detected, stopping playback');
          this.stopBufferedPlayback();
        } else {
          // Wait a bit for more frames
          setTimeout(playNextFrame, this.FRAME_DURATION_MS);
        }
      }
    };
    
    playNextFrame();
  }

  /**
   * Stop the playback interval (on silence or end of response).
   */
  private stopBufferedPlayback(): void {
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
    this.isPlaybackActive = false;
  }

  /**
   * Publish a single audio frame to LiveKit.
   */
  private publishAudioFrame(samples: Int16Array): void {
    if (!this.audioSource || !this.isPublishing) return;
    
    try {
      const frame = new AudioFrame(
        samples,
        this.OUTPUT_SAMPLE_RATE,  // 24000
        1,                         // mono
        samples.length             // number of samples
      );
      
      // Track successful captures for debugging
      this.audioFramesSent = (this.audioFramesSent || 0) + 1;
      if (this.audioFramesSent % 100 === 1) {
        console.log(`[LiveKitAgent] 🔊 Publishing AI audio: frame ${this.audioFramesSent} (${samples.length} samples, buffer: ${this.audioOutputBuffer.length})`);
      }
      
      this.audioSource.captureFrame(frame).catch((error: Error) => {
        // Only log if we're still supposed to be publishing
        if (this.isPublishing) {
          console.warn('[LiveKitAgent] ⚠️ Frame capture failed:', error.message);
        }
      });
    } catch (err) {
      console.error('[LiveKitAgent] Error publishing audio frame:', err);
    }
  }

  /**
   * Reset the audio buffer (call when AI finishes speaking or on barge-in).
   */
  private resetAudioBuffer(): void {
    this.stopBufferedPlayback();
    const droppedFrames = this.audioOutputBuffer.length;
    this.audioOutputBuffer = [];
    if (droppedFrames > 0) {
      console.log(`[LiveKitAgent] 🔄 Audio buffer reset (dropped ${droppedFrames} frames)`);
    }
  }

  /**
   * Remove DC offset using a simple high-pass filter.
   * DC offset causes pops when audio starts/stops.
   * This is a first-order high-pass IIR filter with ~10Hz cutoff.
   */
  private removeDCOffset(samples: Int16Array): Int16Array {
    const result = new Int16Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      const input = samples[i];
      // High-pass filter: y[n] = alpha * (y[n-1] + x[n] - x[n-1])
      const output = this.dcOffsetFilter.alpha * (
        this.dcOffsetFilter.prevOutput + input - this.dcOffsetFilter.prevInput
      );
      
      // Clamp to Int16 range
      result[i] = Math.round(Math.max(-32768, Math.min(32767, output)));
      
      this.dcOffsetFilter.prevInput = input;
      this.dcOffsetFilter.prevOutput = output;
    }
    
    return result;
  }

  /**
   * Reset DC offset filter state (call between AI responses).
   */
  private resetDCOffsetFilter(): void {
    this.dcOffsetFilter.prevInput = 0;
    this.dcOffsetFilter.prevOutput = 0;
  }

  /**
   * Log audio diagnostics to find source of pops/clicks.
   * Checks for timing issues, clipping, and DC offset.
   */
  private logAudioDiagnostics(samples: Int16Array): void {
    this.frameCount++;
    const now = Date.now();
    const timeSinceLastFrame = this.lastFrameTime ? now - this.lastFrameTime : 0;
    this.lastFrameTime = now;
    
    // Check for timing issues (should be ~20ms between frames)
    if (timeSinceLastFrame > 30 && this.frameCount > 1) {
      console.warn(`[AudioDiag] ⚠️ Frame gap: ${timeSinceLastFrame}ms (expected ~20ms) at frame ${this.frameCount}`);
    }
    
    // Check for hot/clipping samples and DC offset
    let maxInFrame = 0;
    let dcSum = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > maxInFrame) maxInFrame = abs;
      dcSum += samples[i];
    }
    
    const dcOffset = dcSum / samples.length;
    
    if (maxInFrame > this.maxSampleSeen) {
      this.maxSampleSeen = maxInFrame;
    }
    
    // Log if clipping or significant DC offset
    if (maxInFrame > 32000) {
      console.warn(`[AudioDiag] ⚠️ Near clipping: peak ${maxInFrame}/32767 at frame ${this.frameCount}`);
    }
    
    if (Math.abs(dcOffset) > 500) {
      console.warn(`[AudioDiag] ⚠️ DC offset detected: ${dcOffset.toFixed(0)} at frame ${this.frameCount}`);
    }
    
    // Log buffer state every 50 frames (~1 second)
    if (this.frameCount % 50 === 0) {
      console.log(`[AudioDiag] Frame ${this.frameCount}: buffer=${this.audioOutputBuffer.length}, maxPeak=${this.maxSampleSeen}, lastGap=${timeSinceLastFrame}ms`);
    }
  }

  /**
   * Save captured audio frames for debugging (Audacity analysis).
   * Only called when DEBUG_CAPTURE_AUDIO is true.
   */
  private saveDebugAudio(): void {
    if (!this.DEBUG_CAPTURE_AUDIO || this.capturedFrames.length === 0) return;
    
    try {
      const fs = require('fs');
      const totalSamples = this.capturedFrames.reduce((sum, f) => sum + f.length, 0);
      const combined = new Int16Array(totalSamples);
      
      let offset = 0;
      for (const frame of this.capturedFrames) {
        combined.set(frame, offset);
        offset += frame.length;
      }
      
      // Save as raw PCM (can open in Audacity: Import Raw, 16-bit signed, 24000Hz, mono)
      const filePath = '/tmp/debug_audio.raw';
      fs.writeFileSync(filePath, Buffer.from(combined.buffer));
      
      console.log(`[AudioDiag] 📁 Saved ${totalSamples} samples (${(totalSamples / 24000).toFixed(1)}s) to ${filePath}`);
      console.log('[AudioDiag] 💡 Open in Audacity: File > Import > Raw Data');
      console.log('[AudioDiag]    Settings: 16-bit signed PCM, Little-endian, 1 channel (Mono), 24000 Hz');
      
      this.capturedFrames = [];
    } catch (err) {
      console.error('[AudioDiag] Failed to save debug audio:', err);
    }
  }

  /**
   * Prepare for a new AI response (reset state for clean audio).
   */
  private prepareForNewResponse(): void {
    this.resetDCOffsetFilter();
    this.frameCount = 0;
    this.maxSampleSeen = 0;
    this.lastFrameTime = 0;
    this.framesPlayed = 0;
    
    // Save debug audio if capture was enabled
    if (this.DEBUG_CAPTURE_AUDIO && this.capturedFrames.length > 0) {
      this.saveDebugAudio();
    }
    
    console.log('[LiveKitAgent] 🎬 Prepared for new AI response (reset audio state)');
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
  private async broadcastTranscript(entry: TranscriptEntry): Promise<void> {
    if (!this.room?.localParticipant) return;

    const message = {
      type: 'transcript',
      role: entry.role,
      content: entry.content,
      timestamp: new Date().toISOString(),
    };

    const data = new TextEncoder().encode(JSON.stringify(message));
    this.room.localParticipant.publishData(data, { reliable: true });

    // ================================================
    // DATABASE: Store transcript message
    // ================================================
    if (this.dbSessionId && this.isStoringMessages && entry.content?.trim() && entry.isFinal) {
      try {
        // Map role to our database schema
        const sender: 'client' | 'coach' | 'ai' = 
          entry.role === 'assistant' ? 'ai' :
          entry.role === 'coach' ? 'coach' : 'client';
        
        await storeMessage({
          sessionId: this.dbSessionId,
          content: entry.content.trim(),
          sender,
          userId: undefined, // Could extract from entry.sessionId if needed
        });
      } catch (error) {
        console.error('[Agent] Failed to store message:', error);
        // Buffer for potential retry
        this.messageBuffer.push({
          content: entry.content,
          sender: entry.role === 'assistant' ? 'ai' : 
                  entry.role === 'coach' ? 'coach' : 'client',
          userId: undefined,
          timestamp: new Date(),
        });
      }
    }
    // ================================================
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

    // ================================================
    // DATABASE: Complete session
    // ================================================
    if (this.dbSessionId) {
      try {
        // Flush any buffered messages first
        for (const msg of this.messageBuffer) {
          await storeMessage({
            sessionId: this.dbSessionId,
            content: msg.content,
            sender: msg.sender,
            userId: msg.userId,
          });
        }
        this.messageBuffer = [];
        
        // Complete the session with transcript
        await completeSession(this.dbSessionId, {
          generateTranscript: true,
          // aiSummary: await this.generateSessionSummary(), // Optional: add summary generation
        });
        
        console.log(`[Agent] Database session completed: ${this.dbSessionId}`);
      } catch (error) {
        console.error('[Agent] Failed to complete database session:', error);
      } finally {
        this.dbSessionId = null;
      }
    }
    // ================================================

    // Clear any pending shutdown timer
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    // Stop audio playback and reset buffer
    this.resetAudioBuffer();

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
