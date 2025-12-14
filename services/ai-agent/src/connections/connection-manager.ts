/**
 * Dual Connection Manager
 * 
 * Manages lifecycle of both Deepgram connections:
 * 1. Voice Agent WebSocket - For AI responses (gated audio)
 * 2. Transcription WebSocket - For always-on logging (all audio)
 * 
 * Architecture:
 * ┌────────────────────────────────────────────────────────────────┐
 * │                   DualConnectionManager                         │
 * │                                                                 │
 * │   ┌─────────────────────┐     ┌─────────────────────┐         │
 * │   │   VoiceAgentConn    │     │  TranscriptionConn  │         │
 * │   │                     │     │                     │         │
 * │   │ • Receives gated    │     │ • Receives ALL      │         │
 * │   │   audio             │     │   audio             │         │
 * │   │ • Outputs AI voice  │     │ • Outputs transcripts│        │
 * │   │ • KeepAlive support │     │ • Speaker attribution│        │
 * │   └─────────────────────┘     └─────────────────────┘         │
 * │              │                         │                       │
 * │              ▼                         ▼                       │
 * │   ┌─────────────────────────────────────────────────────────┐ │
 * │   │                    AudioRouter                          │ │
 * │   │                                                         │ │
 * │   │  Routes audio to appropriate connections based on       │ │
 * │   │  participant role and mute state                        │ │
 * │   └─────────────────────────────────────────────────────────┘ │
 * └────────────────────────────────────────────────────────────────┘
 */

import { EventEmitter } from 'events';
import { VoiceAgentConnection } from './voice-agent.js';
import { TranscriptionConnection, type TranscriptResult } from './transcription.js';
import { AudioRouter, type ParticipantRole } from '../audio/router.js';
import type { MuteCommand } from '../audio/gating.js';

// =============================================================================
// Types
// =============================================================================

export interface DualConnectionConfig {
  apiKey: string;
  coachingPrompt: string;
  greeting?: string;
  voiceModel?: string;
  llmModel?: string;
  verbose?: boolean;
}

export interface ConnectionStatus {
  voiceAgent: {
    connected: boolean;
    reconnectAttempts: number;
  };
  transcription: {
    connected: boolean;
    reconnectAttempts: number;
    transcriptCount: number;
  };
  router: {
    mutedCount: number;
    mutedParticipants: string[];
    isKeepAliveActive: boolean;
  };
  overall: 'connected' | 'partial' | 'disconnected';
}

// =============================================================================
// Dual Connection Manager Class
// =============================================================================

export class DualConnectionManager extends EventEmitter {
  private voiceAgent: VoiceAgentConnection;
  private transcription: TranscriptionConnection;
  private router: AudioRouter;
  private config: DualConnectionConfig;
  private isInitialized: boolean = false;

  constructor(config: DualConnectionConfig) {
    super();
    this.config = config;

    // Create connections
    this.voiceAgent = new VoiceAgentConnection({
      apiKey: config.apiKey,
      coachingPrompt: config.coachingPrompt,
      greeting: config.greeting,
      voiceModel: config.voiceModel,
      llmModel: config.llmModel,
      verbose: config.verbose,
    });

    this.transcription = new TranscriptionConnection({
      apiKey: config.apiKey,
      verbose: config.verbose,
    });

    // Create router
    this.router = new AudioRouter({
      verbose: config.verbose,
    });

    // Set up event forwarding
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for both connections
   */
  private setupEventHandlers(): void {
    // Voice Agent events
    this.voiceAgent.on('audio', (data: Buffer) => {
      this.emit('ai-audio', data);
    });

    this.voiceAgent.on('transcript', (text: string, isFinal: boolean) => {
      this.emit('voice-agent-transcript', { text, isFinal });
    });

    this.voiceAgent.on('agent-speaking', () => {
      this.emit('agent-speaking');
    });

    this.voiceAgent.on('agent-done-speaking', () => {
      this.emit('agent-done-speaking');
    });

    this.voiceAgent.on('user-speaking', () => {
      this.emit('user-speaking');
    });

    this.voiceAgent.on('user-done-speaking', () => {
      this.emit('user-done-speaking');
    });

    this.voiceAgent.on('error', (error: Error) => {
      this.emit('voice-agent-error', error);
    });

    this.voiceAgent.on('close', (code: number, reason: string) => {
      this.emit('voice-agent-close', { code, reason });
    });

    // Transcription events
    this.transcription.on('transcript', (result: TranscriptResult) => {
      this.emit('transcription', result);
    });

    this.transcription.on('speech-started', () => {
      this.emit('speech-started');
    });

    this.transcription.on('utterance-end', () => {
      this.emit('utterance-end');
    });

    this.transcription.on('error', (error: Error) => {
      this.emit('transcription-error', error);
    });

    this.transcription.on('close', (code: number, reason: string) => {
      this.emit('transcription-close', { code, reason });
    });

    // Router events
    this.router.on('gate-event', (event) => {
      this.emit('gate-event', event);
    });
  }

  /**
   * Initialize both connections
   */
  async initialize(): Promise<void> {
    console.log('[DualConnection] 🚀 Initializing dual connections...');

    try {
      // Connect both in parallel
      await Promise.all([
        this.voiceAgent.connect(),
        this.transcription.connect(),
      ]);

      // Set up router with WebSocket connections
      const vaWs = this.voiceAgent.getWebSocket();
      const trWs = this.transcription.getWebSocket();

      if (!vaWs || !trWs) {
        throw new Error('Failed to get WebSocket connections');
      }

      this.router.setConnections(vaWs, trWs);

      this.isInitialized = true;
      console.log('[DualConnection] ✅ Both connections initialized');
      
      this.emit('initialized');

    } catch (error) {
      console.error('[DualConnection] ❌ Initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Register a participant with the router
   */
  registerParticipant(participantId: string, role: ParticipantRole, name?: string): void {
    this.router.registerParticipant(participantId, role, name);
  }

  /**
   * Unregister a participant
   */
  unregisterParticipant(participantId: string): void {
    this.router.unregisterParticipant(participantId);
  }

  /**
   * Route audio through the system
   * This is the main entry point for all audio from LiveKit
   */
  routeAudio(data: Buffer | Uint8Array, participantId: string, participantName?: string): void {
    if (!this.isInitialized) {
      console.warn('[DualConnection] ⚠️ Not initialized, dropping audio');
      return;
    }

    this.router.routeAudio(data, participantId, participantName);
  }

  /**
   * Handle mute command from coach
   */
  handleMuteCommand(command: MuteCommand): void {
    this.router.handleMuteCommand(command);
  }

  /**
   * Mute a participant from Voice Agent
   */
  muteParticipant(participantId: string): void {
    this.router.muteParticipant(participantId);
  }

  /**
   * Unmute a participant for Voice Agent
   */
  unmuteParticipant(participantId: string): void {
    this.router.unmuteParticipant(participantId);
  }

  /**
   * Check if a participant is muted
   */
  isParticipantMuted(participantId: string): boolean {
    return this.router.isParticipantMuted(participantId);
  }

  /**
   * Inject a prompt for the AI to speak
   */
  injectPrompt(text: string): void {
    this.voiceAgent.injectPrompt(text);
  }

  /**
   * Clear Voice Agent response buffer
   */
  clearVoiceAgentBuffer(): void {
    this.voiceAgent.clearBuffer();
  }

  /**
   * Get all transcripts from the session
   */
  getTranscripts(): TranscriptResult[] {
    return this.transcription.getTranscriptBuffer();
  }

  /**
   * Clear transcript buffer
   */
  clearTranscripts(): void {
    this.transcription.clearBuffer();
  }

  /**
   * Force KeepAlive (for extended silence)
   */
  forceKeepAlive(): void {
    this.router.forceKeepAlive();
  }

  /**
   * Get comprehensive status of all connections
   */
  getStatus(): ConnectionStatus {
    const vaStatus = this.voiceAgent.getStatus();
    const trStatus = this.transcription.getStatus();
    const gateStatus = this.router.getGateStatus();

    let overall: 'connected' | 'partial' | 'disconnected';
    if (vaStatus.connected && trStatus.connected) {
      overall = 'connected';
    } else if (vaStatus.connected || trStatus.connected) {
      overall = 'partial';
    } else {
      overall = 'disconnected';
    }

    return {
      voiceAgent: vaStatus,
      transcription: trStatus,
      router: {
        mutedCount: gateStatus.mutedCount,
        mutedParticipants: gateStatus.mutedParticipants,
        isKeepAliveActive: gateStatus.isKeepAliveActive,
      },
      overall,
    };
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return this.router.getStats();
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    console.log('[DualConnection] 🧹 Cleaning up...');

    this.router.cleanup();
    this.voiceAgent.close();
    this.transcription.close();
    
    this.isInitialized = false;
    console.log('[DualConnection] ✅ Cleanup complete');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a DualConnectionManager with validated config
 */
export function createDualConnectionManager(config: {
  coachingPrompt?: string;
  greeting?: string;
  voiceModel?: string;
  llmModel?: string;
  verbose?: boolean;
}): DualConnectionManager {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  
  if (!apiKey) {
    throw new Error('[DualConnection] DEEPGRAM_API_KEY not set in environment');
  }

  return new DualConnectionManager({
    apiKey,
    coachingPrompt: config.coachingPrompt || '',
    greeting: config.greeting,
    voiceModel: config.voiceModel,
    llmModel: config.llmModel,
    verbose: config.verbose,
  });
}

// =============================================================================
// Exports
// =============================================================================

export default DualConnectionManager;
