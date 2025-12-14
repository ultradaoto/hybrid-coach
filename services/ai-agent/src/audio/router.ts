/**
 * Audio Router (Optimized)
 * 
 * Routes audio frames with OPTIMIZED routing based on Deepgram capabilities:
 * 
 * OPTIMIZATION:
 * - Client audio → Voice Agent ONLY (transcripts come from ConversationText events)
 * - Coach audio → Voice Agent (when unmuted) + Transcription STT (ALWAYS)
 * 
 * This eliminates redundant STT for client audio since Voice Agent emits
 * ConversationText events with transcripts for all audio it processes.
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                        Audio Router (Optimized)                      │
 * │                                                                      │
 * │   Client Audio ─────────────────────────────────────────────────────▶│──▶ Voice Agent
 * │                                    │                                 │    (always)
 * │                                    └──▶ ConversationText events      │
 * │                                         (transcripts from VA)        │
 * │                                                                      │
 * │   Coach Audio ───┬───────[ Gate ]───────────────────────────────────▶│──▶ Voice Agent
 * │                  │         ▲                                         │    (when unmuted)
 * │                  │         │ mute/unmute                             │
 * │                  │         └──▶ ConversationText (when unmuted)      │
 * │                  │                                                   │
 * │                  └──────────────────────────────────────────────────▶│──▶ Transcription STT
 * │                                                                      │    (ALWAYS - for muted)
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import { AudioGate, type MuteCommand, processMuteCommand } from './gating.js';
import { isValidOpusFrame, createAudioFrame, type AudioFrame } from './opus-handler.js';

// =============================================================================
// Types
// =============================================================================

export interface RouterConfig {
  /** Enable verbose logging */
  verbose: boolean;
  /** Gate configuration */
  gateConfig?: {
    keepAliveIntervalMs?: number;
  };
}

export interface AudioStats {
  totalFramesReceived: number;
  totalFramesToVoiceAgent: number;
  totalFramesToTranscription: number;
  framesBlockedByGate: number;
  invalidFramesDropped: number;
  clientFrames: number;
  coachFrames: number;
  byParticipant: Map<string, {
    framesReceived: number;
    framesToVoiceAgent: number;
    framesToTranscription: number;
    isMuted: boolean;
  }>;
}

export type ParticipantRole = 'client' | 'coach' | 'ai' | 'unknown';

const DEFAULT_CONFIG: RouterConfig = {
  verbose: false,
};

// =============================================================================
// Audio Router Class
// =============================================================================

/**
 * Routes audio to Voice Agent and Transcription connections
 * with optimized routing based on participant role
 */
export class AudioRouter extends EventEmitter {
  private voiceAgentWs: WebSocket | null = null;
  private transcriptionWs: WebSocket | null = null;
  private gate: AudioGate;
  private config: RouterConfig;
  private stats: AudioStats;
  private participantRoles: Map<string, ParticipantRole> = new Map();
  
  /** When true, AI is paused - client audio goes to transcription only, not Voice Agent */
  private isAIPaused: boolean = false;

  constructor(config: Partial<RouterConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gate = new AudioGate({
      verbose: this.config.verbose,
      ...this.config.gateConfig,
    });
    
    this.stats = {
      totalFramesReceived: 0,
      totalFramesToVoiceAgent: 0,
      totalFramesToTranscription: 0,
      framesBlockedByGate: 0,
      invalidFramesDropped: 0,
      clientFrames: 0,
      coachFrames: 0,
      byParticipant: new Map(),
    };

    // Forward gate events
    this.gate.on('gate-event', (event) => {
      this.emit('gate-event', event);
    });

    console.log('[AudioRouter] 🔀 Initialized (Optimized routing)');
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[AudioRouter] ${message}`);
    }
  }

  /**
   * Set connections for routing
   */
  setConnections(voiceAgentWs: WebSocket, transcriptionWs: WebSocket): void {
    this.voiceAgentWs = voiceAgentWs;
    this.transcriptionWs = transcriptionWs;
    this.gate.setVoiceAgentConnection(voiceAgentWs);
    console.log('[AudioRouter] 🔌 Connections set');
  }

  /**
   * Register a participant with their role
   * - Clients: audio → Voice Agent only (transcripts via ConversationText)
   * - Coaches: audio → Voice Agent (gated) + Transcription STT (always)
   */
  registerParticipant(participantId: string, role: ParticipantRole, name?: string): void {
    this.participantRoles.set(participantId, role);
    this.stats.byParticipant.set(participantId, {
      framesReceived: 0,
      framesToVoiceAgent: 0,
      framesToTranscription: 0,
      isMuted: false,
    });
    console.log(`[AudioRouter] 👤 Registered: ${name || participantId} (${role})`);
  }

  /**
   * Unregister a participant
   */
  unregisterParticipant(participantId: string): void {
    this.participantRoles.delete(participantId);
    this.gate.unmuteFromVoiceAgent(participantId);
    console.log(`[AudioRouter] 👋 Unregistered: ${participantId}`);
  }

  /**
   * Route audio frame to appropriate connections
   * 
   * OPTIMIZED ROUTING:
   * - Client audio → Voice Agent ONLY (ConversationText provides transcripts)
   * - Coach audio → Voice Agent (gated) + Transcription STT (always)
   */
  routeAudio(
    data: Buffer | Uint8Array,
    participantId: string,
    participantName?: string
  ): void {
    // Update stats
    this.stats.totalFramesReceived++;
    const participantStats = this.stats.byParticipant.get(participantId);
    if (participantStats) {
      participantStats.framesReceived++;
    }

    // Validate frame (accepts both opus and linear16)
    if (!data || data.length === 0) {
      this.stats.invalidFramesDropped++;
      this.log('⚠️ Empty frame dropped');
      return;
    }

    // Create audio frame (LiveKit provides PCM linear16 at 48kHz)
    const frame = createAudioFrame(data, participantId, participantName, 'linear16');
    const role = this.participantRoles.get(participantId) || 'unknown';

    // Route based on role
    switch (role) {
      case 'client':
        this.routeClientAudio(frame);
        break;
      case 'coach':
        this.routeCoachAudio(frame);
        break;
      case 'ai':
        // AI audio never routed (it's output, not input)
        break;
      default:
        // Unknown role - treat as client (safe default)
        this.log(`⚠️ Unknown role for ${participantId}, treating as client`);
        this.routeClientAudio(frame);
    }
  }

  /**
   * Route CLIENT audio
   * 
   * Normal mode: Client audio goes to Voice Agent ONLY
   *              (Transcripts come from ConversationText events)
   * 
   * Paused mode: Client audio goes to Transcription STT ONLY
   *              (AI doesn't hear/respond, but we still get transcripts)
   */
  private routeClientAudio(frame: AudioFrame): void {
    this.stats.clientFrames++;
    const participantStats = this.stats.byParticipant.get(frame.participantId);

    // When AI is PAUSED: route to transcription STT instead of Voice Agent
    if (this.isAIPaused) {
      this.sendToTranscription(frame);
      if (participantStats) {
        participantStats.framesToTranscription++;
      }
      return;
    }

    // Normal mode: Send to Voice Agent only
    if (this.sendToVoiceAgent(frame)) {
      this.stats.totalFramesToVoiceAgent++;
      if (participantStats) {
        participantStats.framesToVoiceAgent++;
      }
    }
  }

  /**
   * Route COACH audio
   * 
   * Coach audio is ALWAYS sent to Transcription STT (for muted periods)
   * Coach audio is sent to Voice Agent only when unmuted (via gate)
   */
  private routeCoachAudio(frame: AudioFrame): void {
    this.stats.coachFrames++;
    const participantStats = this.stats.byParticipant.get(frame.participantId);

    // ALWAYS send coach audio to Transcription STT
    // This ensures we capture coach speech even when muted from AI
    this.sendToTranscription(frame);
    if (participantStats) {
      participantStats.framesToTranscription++;
    }

    // Send to Voice Agent via gate (respects mute state)
    const sentToVA = this.gate.processAudioForVoiceAgent(frame);
    if (sentToVA) {
      this.stats.totalFramesToVoiceAgent++;
      if (participantStats) {
        participantStats.framesToVoiceAgent++;
        participantStats.isMuted = false;
      }
    } else {
      this.stats.framesBlockedByGate++;
      if (participantStats) {
        participantStats.isMuted = true;
      }
    }
  }

  /**
   * Send audio frame to Voice Agent WebSocket
   */
  private sendToVoiceAgent(frame: AudioFrame): boolean {
    if (!this.voiceAgentWs || this.voiceAgentWs.readyState !== 1) {
      this.log('⚠️ Voice Agent not ready');
      return false;
    }

    try {
      this.voiceAgentWs.send(frame.data);
      return true;
    } catch (error) {
      console.error('[AudioRouter] ❌ Failed to send to Voice Agent:', error);
      return false;
    }
  }

  /**
   * Send audio frame to Transcription STT WebSocket
   * Used for COACH audio during muted periods
   */
  private sendToTranscription(frame: AudioFrame): void {
    if (!this.transcriptionWs || this.transcriptionWs.readyState !== 1) {
      this.log('⚠️ Transcription STT not ready');
      return;
    }

    try {
      this.transcriptionWs.send(frame.data);
      this.stats.totalFramesToTranscription++;
    } catch (error) {
      console.error('[AudioRouter] ❌ Failed to send to Transcription:', error);
    }
  }

  /**
   * Handle mute command from coach
   */
  handleMuteCommand(command: MuteCommand): void {
    processMuteCommand(this.gate, command);
    
    const stats = this.stats.byParticipant.get(command.participantId);
    if (stats) {
      stats.isMuted = command.muted;
    }
  }

  /**
   * Mute a participant from Voice Agent
   */
  muteParticipant(participantId: string): void {
    this.gate.muteFromVoiceAgent(participantId);
    const stats = this.stats.byParticipant.get(participantId);
    if (stats) {
      stats.isMuted = true;
    }
  }

  /**
   * Unmute a participant for Voice Agent
   */
  unmuteParticipant(participantId: string): void {
    this.gate.unmuteFromVoiceAgent(participantId);
    const stats = this.stats.byParticipant.get(participantId);
    if (stats) {
      stats.isMuted = false;
    }
  }

  // =========================================================================
  // AI PAUSE FEATURE
  // =========================================================================

  /**
   * Pause AI - client audio goes to transcription only, AI won't respond
   * Coach can talk to client during this time
   */
  pauseAI(): void {
    if (this.isAIPaused) return;
    
    this.isAIPaused = true;
    console.log('[AudioRouter] ⏸️ AI PAUSED - client audio now goes to transcription only');
    this.emit('ai-paused');
  }

  /**
   * Resume AI - client audio goes to Voice Agent, AI can respond again
   */
  resumeAI(): void {
    if (!this.isAIPaused) return;
    
    this.isAIPaused = false;
    console.log('[AudioRouter] ▶️ AI RESUMED - client audio now goes to Voice Agent');
    this.emit('ai-resumed');
  }

  /**
   * Check if AI is currently paused
   */
  isAIPausedState(): boolean {
    return this.isAIPaused;
  }

  /**
   * Get routing statistics
   */
  getStats(): AudioStats {
    return { ...this.stats };
  }

  /**
   * Get gate status
   */
  getGateStatus() {
    return this.gate.getStatus();
  }

  /**
   * Check if a participant is muted
   */
  isParticipantMuted(participantId: string): boolean {
    return this.gate.isMuted(participantId);
  }

  /**
   * Force start KeepAlive (for silence detection)
   */
  forceKeepAlive(): void {
    this.gate.forceStartKeepAlive();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.gate.cleanup();
    this.voiceAgentWs = null;
    this.transcriptionWs = null;
    this.participantRoles.clear();
    console.log('[AudioRouter] 🧹 Cleaned up');
  }
}

// =============================================================================
// Exports
// =============================================================================

export default AudioRouter;
