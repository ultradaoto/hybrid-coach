/**
 * Audio Gating with KeepAlive
 * 
 * Implements the coach mute logic:
 * - When coach is muted, their audio is blocked from Voice Agent
 * - KeepAlive signals are sent every 8 seconds to maintain connection
 * - Transcription connection always receives all audio
 * 
 * References:
 * - Deepgram KeepAlive: https://developers.deepgram.com/docs/audio-keep-alive
 * - docs/DEEPGRAM-INTEGRATION.md
 */

import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import { isValidOpusFrame, type AudioFrame } from './opus-handler.js';

// =============================================================================
// Types
// =============================================================================

export interface GateConfig {
  /** KeepAlive interval in milliseconds (default: 8000ms per Deepgram docs) */
  keepAliveIntervalMs: number;
  /** Log verbose gate activity */
  verbose: boolean;
}

export interface GateEvent {
  participantId: string;
  timestamp: Date;
  action: 'muted' | 'unmuted' | 'keepalive_started' | 'keepalive_stopped';
}

export type GateEventHandler = (event: GateEvent) => void;

const DEFAULT_CONFIG: GateConfig = {
  keepAliveIntervalMs: 8000, // 8 seconds per Deepgram docs
  verbose: false,
};

// =============================================================================
// Audio Gate Class
// =============================================================================

/**
 * AudioGate controls which audio reaches the Voice Agent
 * 
 * Flow:
 * 1. All audio always goes to Transcription connection (via router)
 * 2. Client audio always goes to Voice Agent
 * 3. Coach audio is GATED - only passes when not muted
 * 4. When coach muted and no other audio, send KeepAlive to Voice Agent
 */
export class AudioGate extends EventEmitter {
  private voiceAgentWs: WebSocket | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private mutedParticipants: Set<string> = new Set();
  private config: GateConfig;
  private lastAudioSent: number = 0;
  private isKeepAliveActive: boolean = false;

  constructor(config: Partial<GateConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log('🚪 AudioGate initialized');
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[AudioGate] ${message}`);
    }
  }

  /**
   * Set the Voice Agent WebSocket connection
   * Required before gating can function
   */
  setVoiceAgentConnection(ws: WebSocket): void {
    this.voiceAgentWs = ws;
    this.log('🔌 Voice Agent connection set');
  }

  /**
   * Mute a participant from Voice Agent perception
   * Their audio will still go to Transcription
   */
  muteFromVoiceAgent(participantId: string): void {
    if (this.mutedParticipants.has(participantId)) {
      this.log(`⚠️ Participant already muted: ${participantId}`);
      return;
    }

    this.mutedParticipants.add(participantId);
    console.log(`[AudioGate] 🔇 Muted from Voice Agent: ${participantId}`);
    
    this.emit('gate-event', {
      participantId,
      timestamp: new Date(),
      action: 'muted',
    } as GateEvent);

    // Check if we need to start KeepAlive
    this.checkKeepAliveState();
  }

  /**
   * Unmute a participant for Voice Agent
   */
  unmuteFromVoiceAgent(participantId: string): void {
    if (!this.mutedParticipants.has(participantId)) {
      this.log(`⚠️ Participant not muted: ${participantId}`);
      return;
    }

    this.mutedParticipants.delete(participantId);
    console.log(`[AudioGate] 🔊 Unmuted for Voice Agent: ${participantId}`);
    
    this.emit('gate-event', {
      participantId,
      timestamp: new Date(),
      action: 'unmuted',
    } as GateEvent);

    // Check if we can stop KeepAlive
    this.checkKeepAliveState();
  }

  /**
   * Check if a participant is muted from Voice Agent
   */
  isMuted(participantId: string): boolean {
    return this.mutedParticipants.has(participantId);
  }

  /**
   * Get list of all muted participants
   */
  getMutedParticipants(): string[] {
    return Array.from(this.mutedParticipants);
  }

  /**
   * Process audio frame through the gate
   * Returns true if audio was sent to Voice Agent
   */
  processAudioForVoiceAgent(frame: AudioFrame): boolean {
    // Validate frame
    if (!isValidOpusFrame(frame.data)) {
      this.log('⚠️ Invalid audio frame, skipping');
      return false;
    }

    // Check if participant is muted
    if (this.mutedParticipants.has(frame.participantId)) {
      this.log(`🚫 Blocked audio from muted: ${frame.participantId}`);
      return false;
    }

    // Send to Voice Agent
    if (this.voiceAgentWs && this.voiceAgentWs.readyState === 1) { // OPEN
      this.voiceAgentWs.send(frame.data);
      this.lastAudioSent = Date.now();
      
      // Stop KeepAlive since we're sending real audio
      if (this.isKeepAliveActive) {
        this.stopKeepAlive();
      }
      
      return true;
    }

    this.log('⚠️ Voice Agent WebSocket not ready');
    return false;
  }

  /**
   * Check if KeepAlive should be active based on current state
   */
  private checkKeepAliveState(): void {
    // If all participants are muted or no audio is being sent,
    // we need KeepAlive to prevent Voice Agent disconnection
    const shouldBeActive = this.shouldStartKeepAlive();

    if (shouldBeActive && !this.isKeepAliveActive) {
      this.startKeepAlive();
    } else if (!shouldBeActive && this.isKeepAliveActive) {
      this.stopKeepAlive();
    }
  }

  /**
   * Determine if KeepAlive should be started
   */
  private shouldStartKeepAlive(): boolean {
    // Start KeepAlive if:
    // 1. We have muted participants AND
    // 2. No audio has been sent recently (within 2x KeepAlive interval)
    const silenceThreshold = this.config.keepAliveIntervalMs * 2;
    const timeSinceLastAudio = Date.now() - this.lastAudioSent;
    
    return this.mutedParticipants.size > 0 && timeSinceLastAudio > silenceThreshold;
  }

  /**
   * Start sending KeepAlive signals to Voice Agent
   * Prevents connection timeout during extended mute periods
   */
  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      return; // Already running
    }

    console.log(`[AudioGate] 💓 Starting KeepAlive (every ${this.config.keepAliveIntervalMs}ms)`);
    this.isKeepAliveActive = true;

    this.keepAliveInterval = setInterval(() => {
      if (this.voiceAgentWs && this.voiceAgentWs.readyState === 1) {
        // Send KeepAlive message per Deepgram Voice Agent API
        this.voiceAgentWs.send(JSON.stringify({ type: 'KeepAlive' }));
        this.log('💓 KeepAlive sent');
      }
    }, this.config.keepAliveIntervalMs);

    this.emit('gate-event', {
      participantId: 'system',
      timestamp: new Date(),
      action: 'keepalive_started',
    } as GateEvent);
  }

  /**
   * Stop sending KeepAlive signals
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    if (this.isKeepAliveActive) {
      console.log('[AudioGate] 💓 Stopped KeepAlive');
      this.isKeepAliveActive = false;

      this.emit('gate-event', {
        participantId: 'system',
        timestamp: new Date(),
        action: 'keepalive_stopped',
      } as GateEvent);
    }
  }

  /**
   * Force start KeepAlive (for silence detection)
   * Called when VAD detects no speech for extended period
   */
  forceStartKeepAlive(): void {
    if (!this.isKeepAliveActive) {
      this.startKeepAlive();
    }
  }

  /**
   * Get current gate status
   */
  getStatus(): {
    mutedCount: number;
    mutedParticipants: string[];
    isKeepAliveActive: boolean;
    lastAudioSentMs: number;
  } {
    return {
      mutedCount: this.mutedParticipants.size,
      mutedParticipants: Array.from(this.mutedParticipants),
      isKeepAliveActive: this.isKeepAliveActive,
      lastAudioSentMs: Date.now() - this.lastAudioSent,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopKeepAlive();
    this.mutedParticipants.clear();
    this.voiceAgentWs = null;
    console.log('[AudioGate] 🧹 Cleaned up');
  }
}

// =============================================================================
// Mute Command Handler
// =============================================================================

/**
 * Mute command received via LiveKit data channel
 */
export interface MuteCommand {
  type: 'mute-from-ai';
  muted: boolean;
  participantId: string;
}

/**
 * Process mute command from coach
 */
export function processMuteCommand(gate: AudioGate, command: MuteCommand): void {
  if (command.type !== 'mute-from-ai') {
    return;
  }

  if (command.muted) {
    gate.muteFromVoiceAgent(command.participantId);
  } else {
    gate.unmuteFromVoiceAgent(command.participantId);
  }
}

// =============================================================================
// Exports
// =============================================================================

export default AudioGate;
