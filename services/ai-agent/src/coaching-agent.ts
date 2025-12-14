/**
 * Coaching Agent with Dual-Connection Architecture
 * 
 * Orchestrates the dual Deepgram WebSocket connections:
 * 1. Voice Agent - For AI responses (client audio + gated coach audio)
 * 2. Transcription - For always-on logging (all audio)
 * 
 * Integrates with LiveKit for:
 * - Receiving audio from room participants
 * - Publishing AI audio responses
 * - Handling data channel messages (mute commands)
 * 
 * References:
 * - docs/HYBRID-COACH-ARCHITECTURE.md
 * - docs/DEEPGRAM-INTEGRATION.md
 */

import { EventEmitter } from 'events';
import type { Room, RemoteParticipant, LocalParticipant, AudioFrame } from '@livekit/rtc-node';
import {
  DualConnectionManager,
  createDualConnectionManager,
  type ConnectionStatus,
} from './connections/connection-manager.js';
import type { MuteCommand } from './audio/gating.js';
import type { TranscriptResult } from './connections/transcription.js';
import type { ParticipantRole } from './audio/router.js';

// =============================================================================
// Coaching Personality Configuration
// =============================================================================

const DEFAULT_COACHING_PROMPT = `You are a supportive AI wellness coach specializing in vagus nerve health and stress management.

Your approach:
- Listen actively and reflect back what you hear
- Ask open-ended questions to understand the client's current state
- Provide evidence-based suggestions for vagus nerve stimulation
- Be warm, encouraging, and non-judgmental
- Keep responses concise and conversational (1-3 sentences)
- If the client mentions serious mental health concerns, gently suggest professional help

Techniques you can suggest:
- Deep breathing exercises (4-7-8 breathing, box breathing)
- Cold water face immersion or cold showers
- Humming, singing, or gargling
- Gentle neck stretches and massage
- Meditation and mindfulness practices
- Social connection and laughter

Remember: You're here to support wellness, not provide medical advice.`;

const DEFAULT_GREETING = "Hi there! I'm your AI wellness coach. How are you feeling today?";

// =============================================================================
// Types
// =============================================================================

export interface CoachingAgentConfig {
  /** Custom coaching personality prompt */
  coachingPrompt?: string;
  /** Initial greeting message */
  greeting?: string;
  /** Deepgram voice model (e.g., 'aura-2-thalia-en') */
  voiceModel?: string;
  /** LLM model for thinking (e.g., 'gpt-4o-mini') */
  llmModel?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface SessionTranscript {
  participantId: string;
  participantName?: string;
  text: string;
  timestamp: Date;
  isMutedFromAI: boolean;
  role: ParticipantRole;
}

// =============================================================================
// Coaching Agent Class
// =============================================================================

export class CoachingAgent extends EventEmitter {
  private room: Room | null = null;
  private connectionManager: DualConnectionManager | null = null;
  private config: CoachingAgentConfig;
  private isRunning: boolean = false;
  private sessionTranscripts: SessionTranscript[] = [];
  private participantMap: Map<string, { name: string; role: ParticipantRole }> = new Map();

  constructor(config: CoachingAgentConfig = {}) {
    super();
    this.config = {
      coachingPrompt: DEFAULT_COACHING_PROMPT,
      greeting: DEFAULT_GREETING,
      voiceModel: 'aura-2-thalia-en',
      llmModel: 'gpt-4o-mini',
      verbose: false,
      ...config,
    };

    console.log('[CoachingAgent] 🤖 Created with config:', {
      voiceModel: this.config.voiceModel,
      llmModel: this.config.llmModel,
      verbose: this.config.verbose,
    });
  }

  private log(message: string, data?: unknown): void {
    if (this.config.verbose) {
      if (data) {
        console.log(`[CoachingAgent] ${message}`, data);
      } else {
        console.log(`[CoachingAgent] ${message}`);
      }
    }
  }

  /**
   * Start the coaching agent with a LiveKit room
   */
  async start(room: Room): Promise<void> {
    if (this.isRunning) {
      console.warn('[CoachingAgent] ⚠️ Already running');
      return;
    }

    console.log('[CoachingAgent] 🚀 Starting...');
    this.room = room;

    try {
      // Create and initialize dual connection manager
      this.connectionManager = createDualConnectionManager({
        coachingPrompt: this.config.coachingPrompt,
        greeting: this.config.greeting,
        voiceModel: this.config.voiceModel,
        llmModel: this.config.llmModel,
        verbose: this.config.verbose,
      });

      // Set up connection event handlers
      this.setupConnectionEvents();

      // Set up room event handlers
      this.setupRoomEvents();

      // Initialize connections
      await this.connectionManager.initialize();

      // Register existing participants
      this.registerExistingParticipants();

      this.isRunning = true;
      console.log('[CoachingAgent] ✅ Started successfully');
      this.emit('started');

    } catch (error) {
      console.error('[CoachingAgent] ❌ Failed to start:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set up event handlers for the dual connection manager
   */
  private setupConnectionEvents(): void {
    if (!this.connectionManager) return;

    // AI audio output -> publish to LiveKit room
    this.connectionManager.on('ai-audio', (data: Buffer) => {
      this.publishAIAudio(data);
    });

    // Transcription results -> store and emit
    this.connectionManager.on('transcription', (result: TranscriptResult) => {
      this.handleTranscription(result);
    });

    // Agent state events
    this.connectionManager.on('agent-speaking', () => {
      this.log('🔊 Agent speaking');
      this.emit('agent-speaking');
    });

    this.connectionManager.on('agent-done-speaking', () => {
      this.log('🔇 Agent done speaking');
      this.emit('agent-done-speaking');
    });

    this.connectionManager.on('user-speaking', () => {
      this.log('🎤 User speaking');
      this.emit('user-speaking');
    });

    this.connectionManager.on('user-done-speaking', () => {
      this.log('🔇 User done speaking');
      this.emit('user-done-speaking');
    });

    // Gate events (mute/unmute)
    this.connectionManager.on('gate-event', (event) => {
      this.log('🚪 Gate event:', event);
      this.emit('gate-event', event);
    });

    // Error handling
    this.connectionManager.on('voice-agent-error', (error: Error) => {
      console.error('[CoachingAgent] ❌ Voice Agent error:', error);
      this.emit('error', error);
    });

    this.connectionManager.on('transcription-error', (error: Error) => {
      console.error('[CoachingAgent] ❌ Transcription error:', error);
      // Transcription errors are less critical, just log
    });
  }

  /**
   * Set up LiveKit room event handlers
   */
  private setupRoomEvents(): void {
    if (!this.room) return;

    // Participant joined
    this.room.on('participantConnected', (participant: RemoteParticipant) => {
      this.handleParticipantJoined(participant);
    });

    // Participant left
    this.room.on('participantDisconnected', (participant: RemoteParticipant) => {
      this.handleParticipantLeft(participant);
    });

    // Audio track subscribed -> route to Deepgram
    this.room.on('trackSubscribed', (track, publication, participant) => {
      if (track.kind === 'audio') {
        this.handleAudioTrackSubscribed(track, participant);
      }
    });

    // Data channel messages (for mute commands)
    this.room.on('dataReceived', (payload: Uint8Array, participant?: RemoteParticipant) => {
      this.handleDataMessage(payload, participant);
    });

    // Room disconnected
    this.room.on('disconnected', () => {
      console.log('[CoachingAgent] 📡 Room disconnected');
      this.stop();
    });
  }

  /**
   * Register existing participants in the room
   */
  private registerExistingParticipants(): void {
    if (!this.room || !this.connectionManager) return;

    const participants = this.room.remoteParticipants;
    
    for (const [id, participant] of participants) {
      const role = this.determineParticipantRole(participant);
      this.connectionManager.registerParticipant(id, role, participant.name);
      this.participantMap.set(id, { name: participant.name || id, role });
      console.log(`[CoachingAgent] 👤 Registered existing: ${participant.name || id} (${role})`);
    }
  }

  /**
   * Handle new participant joining
   */
  private handleParticipantJoined(participant: RemoteParticipant): void {
    const role = this.determineParticipantRole(participant);
    
    this.connectionManager?.registerParticipant(
      participant.identity,
      role,
      participant.name
    );
    
    this.participantMap.set(participant.identity, {
      name: participant.name || participant.identity,
      role,
    });

    console.log(`[CoachingAgent] 👤 Participant joined: ${participant.name || participant.identity} (${role})`);
    this.emit('participant-joined', { id: participant.identity, name: participant.name, role });
  }

  /**
   * Handle participant leaving
   */
  private handleParticipantLeft(participant: RemoteParticipant): void {
    this.connectionManager?.unregisterParticipant(participant.identity);
    this.participantMap.delete(participant.identity);

    console.log(`[CoachingAgent] 👋 Participant left: ${participant.name || participant.identity}`);
    this.emit('participant-left', { id: participant.identity, name: participant.name });
  }

  /**
   * Determine participant role from metadata or name
   */
  private determineParticipantRole(participant: RemoteParticipant): ParticipantRole {
    // Check metadata first
    const metadata = participant.metadata;
    if (metadata) {
      try {
        const parsed = JSON.parse(metadata);
        if (parsed.role === 'coach') return 'coach';
        if (parsed.role === 'client') return 'client';
      } catch {
        // Metadata not JSON, check raw value
        if (metadata === 'coach') return 'coach';
        if (metadata === 'client') return 'client';
      }
    }

    // Check identity pattern
    const identity = participant.identity.toLowerCase();
    if (identity.includes('coach')) return 'coach';
    if (identity.includes('client')) return 'client';

    // Default to client for unknown participants
    return 'client';
  }

  /**
   * Handle audio track subscribed
   */
  private handleAudioTrackSubscribed(
    track: { kind: string; on: (event: string, callback: (frame: AudioFrame) => void) => void },
    participant: RemoteParticipant
  ): void {
    console.log(`[CoachingAgent] 🎧 Audio track subscribed: ${participant.name || participant.identity}`);

    // Listen for audio frames
    track.on('audioFrame', (frame: AudioFrame) => {
      this.routeAudioFrame(frame, participant);
    });
  }

  /**
   * Route audio frame to Deepgram connections
   */
  private routeAudioFrame(frame: AudioFrame, participant: RemoteParticipant): void {
    if (!this.connectionManager) return;

    // Convert AudioFrame to buffer
    // LiveKit AudioFrame has samples as Int16Array
    // Use byteOffset and byteLength to correctly handle TypedArray views
    const buffer = Buffer.from(
      frame.data.buffer,
      frame.data.byteOffset,
      frame.data.byteLength
    );

    // Route through connection manager
    this.connectionManager.routeAudio(
      buffer,
      participant.identity,
      participant.name
    );
  }

  /**
   * Handle data channel message (mute commands, etc.)
   */
  private handleDataMessage(payload: Uint8Array, participant?: RemoteParticipant): void {
    try {
      const message = JSON.parse(new TextDecoder().decode(payload));

      if (message.type === 'mute-from-ai') {
        const command: MuteCommand = {
          type: 'mute-from-ai',
          muted: message.muted,
          participantId: message.participantId || participant?.identity || '',
        };
        
        this.connectionManager?.handleMuteCommand(command);
        console.log(`[CoachingAgent] 🔇 Mute command: ${command.muted ? 'mute' : 'unmute'} ${command.participantId}`);
      }

      if (message.type === 'inject-prompt') {
        this.injectPrompt(message.text);
      }

    } catch {
      // Not a JSON message, ignore
    }
  }

  /**
   * Handle transcription result
   */
  private handleTranscription(result: TranscriptResult): void {
    const currentSpeaker = this.getCurrentSpeaker();
    const participantInfo = currentSpeaker 
      ? this.participantMap.get(currentSpeaker)
      : null;

    const transcript: SessionTranscript = {
      participantId: currentSpeaker || 'unknown',
      participantName: participantInfo?.name,
      text: result.transcript,
      timestamp: new Date(),
      isMutedFromAI: currentSpeaker 
        ? this.connectionManager?.isParticipantMuted(currentSpeaker) || false
        : false,
      role: participantInfo?.role || 'unknown',
    };

    this.sessionTranscripts.push(transcript);

    // Log final transcripts
    if (result.isFinal) {
      const prefix = transcript.isMutedFromAI ? '🔇' : '📝';
      console.log(`[CoachingAgent] ${prefix} [${transcript.participantName || transcript.participantId}]: "${transcript.text}"`);
    }

    this.emit('transcript', transcript);
  }

  /**
   * Get current speaker (placeholder - needs VAD integration)
   */
  private getCurrentSpeaker(): string | null {
    // TODO: Implement speaker detection using VAD
    // For now, return the first client participant
    for (const [id, info] of this.participantMap) {
      if (info.role === 'client') {
        return id;
      }
    }
    return null;
  }

  /**
   * Publish AI audio response to LiveKit room
   */
  private publishAIAudio(data: Buffer): void {
    if (!this.room) return;

    // TODO: Implement audio publishing to LiveKit
    // This requires creating an audio source and publishing frames
    this.log('📤 Publishing AI audio:', { bytes: data.length });
    this.emit('ai-audio-chunk', data);
  }

  /**
   * Inject a prompt for the AI to speak
   * Used by coaches to guide the conversation
   */
  injectPrompt(text: string): void {
    if (!this.connectionManager) {
      console.error('[CoachingAgent] ❌ Cannot inject prompt - not initialized');
      return;
    }

    this.connectionManager.injectPrompt(text);
    console.log(`[CoachingAgent] 💉 Injected prompt: "${text}"`);
  }

  /**
   * Mute a participant from AI perception
   */
  muteParticipant(participantId: string): void {
    this.connectionManager?.muteParticipant(participantId);
  }

  /**
   * Unmute a participant for AI perception
   */
  unmuteParticipant(participantId: string): void {
    this.connectionManager?.unmuteParticipant(participantId);
  }

  /**
   * Get all session transcripts
   */
  getTranscripts(): SessionTranscript[] {
    return [...this.sessionTranscripts];
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus | null {
    return this.connectionManager?.getStatus() || null;
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return this.connectionManager?.getStats();
  }

  /**
   * Check if agent is running
   */
  isAgentRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Stop the coaching agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.log('Agent not running');
      return;
    }

    console.log('[CoachingAgent] 🛑 Stopping...');

    // Cleanup connection manager
    this.connectionManager?.cleanup();
    this.connectionManager = null;

    // Clear state
    this.room = null;
    this.participantMap.clear();
    this.isRunning = false;

    console.log('[CoachingAgent] ✅ Stopped');
    this.emit('stopped');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a coaching agent with default configuration
 */
export function createCoachingAgent(config?: CoachingAgentConfig): CoachingAgent {
  return new CoachingAgent(config);
}

// =============================================================================
// Exports
// =============================================================================

export default CoachingAgent;
