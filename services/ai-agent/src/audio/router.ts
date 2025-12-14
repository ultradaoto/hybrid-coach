/**
 * Audio Router
 * 
 * Routes audio frames to appropriate connections:
 * - Voice Agent WebSocket: GATED (respects coach mute)
 * - Transcription WebSocket: ALWAYS receives all audio
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                        Audio Router                          │
 * │                                                              │
 * │   Client Audio ──┬─────────────────────────────────────────▶│──▶ Voice Agent
 * │                  │                                           │    (always)
 * │                  └─────────────────────────────────────────▶│──▶ Transcription
 * │                                                              │    (always)
 * │                                                              │
 * │   Coach Audio ───┬───────[ Gate ]───────────────────────────▶│──▶ Voice Agent
 * │                  │         ▲                                 │    (when unmuted)
 * │                  │         │ mute/unmute                     │
 * │                  └─────────────────────────────────────────▶│──▶ Transcription
 * │                                                              │    (always)
 * └─────────────────────────────────────────────────────────────┘
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
  byParticipant: Map<string, {
    framesReceived: number;
    framesToVoiceAgent: number;
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
 */
export class AudioRouter extends EventEmitter {
  private voiceAgentWs: WebSocket | null = null;
  private transcriptionWs: WebSocket | null = null;
  private gate: AudioGate;
  private config: RouterConfig;
  private stats: AudioStats;
  private participantRoles: Map<string, ParticipantRole> = new Map();

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
      byParticipant: new Map(),
    };

    // Forward gate events
    this.gate.on('gate-event', (event) => {
      this.emit('gate-event', event);
    });

    console.log('[AudioRouter] 🔀 Initialized');
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
   * Clients always pass through, Coaches are gated
   */
  registerParticipant(participantId: string, role: ParticipantRole, name?: string): void {
    this.participantRoles.set(participantId, role);
    this.stats.byParticipant.set(participantId, {
      framesReceived: 0,
      framesToVoiceAgent: 0,
      isMuted: false,
    });
    console.log(`[AudioRouter] 👤 Registered: ${name || participantId} (${role})`);
  }

  /**
   * Unregister a participant
   */
  unregisterParticipant(participantId: string): void {
    this.participantRoles.delete(participantId);
    this.gate.unmuteFromVoiceAgent(participantId); // Clean up any mute state
    console.log(`[AudioRouter] 👋 Unregistered: ${participantId}`);
  }

  /**
   * Route audio frame to appropriate connections
   * This is the main entry point for all audio
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

    // Validate frame
    if (!isValidOpusFrame(data)) {
      this.stats.invalidFramesDropped++;
      this.log('⚠️ Invalid frame dropped');
      return;
    }

    // Create audio frame
    const frame = createAudioFrame(data, participantId, participantName);

    // ALWAYS send to transcription (for coach review panel)
    this.sendToTranscription(frame);

    // Route to Voice Agent based on gating rules
    this.routeToVoiceAgent(frame);
  }

  /**
   * Send audio to Voice Agent (with gating)
   */
  private routeToVoiceAgent(frame: AudioFrame): void {
    const role = this.participantRoles.get(frame.participantId) || 'unknown';
    const participantStats = this.stats.byParticipant.get(frame.participantId);

    // AI audio should never go back to Voice Agent
    if (role === 'ai') {
      return;
    }

    // Client audio always passes through
    if (role === 'client') {
      if (this.sendToVoiceAgent(frame)) {
        this.stats.totalFramesToVoiceAgent++;
        if (participantStats) {
          participantStats.framesToVoiceAgent++;
        }
      }
      return;
    }

    // Coach audio is GATED
    if (role === 'coach') {
      const sent = this.gate.processAudioForVoiceAgent(frame);
      if (sent) {
        this.stats.totalFramesToVoiceAgent++;
        if (participantStats) {
          participantStats.framesToVoiceAgent++;
        }
      } else {
        this.stats.framesBlockedByGate++;
        if (participantStats) {
          participantStats.isMuted = true;
        }
      }
      return;
    }

    // Unknown role - pass through but warn
    this.log(`⚠️ Unknown participant role: ${frame.participantId}`);
    this.sendToVoiceAgent(frame);
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
   * Send audio frame to Transcription WebSocket
   * This ALWAYS receives all audio for coach review panel
   */
  private sendToTranscription(frame: AudioFrame): void {
    if (!this.transcriptionWs || this.transcriptionWs.readyState !== 1) {
      this.log('⚠️ Transcription not ready');
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
    
    // Update participant stats
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
