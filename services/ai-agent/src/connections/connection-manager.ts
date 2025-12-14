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
import type { FunctionDefinition, FunctionCallRequestEvent, TranscriptEntry } from '../types/deepgram-events.js';
import { FunctionCallingHandler, createFunctionCallingHandler, COACHING_FUNCTIONS } from '../features/function-calling.js';
import { CoachWhisperManager } from '../features/coach-whisper.js';

// =============================================================================
// Types
// =============================================================================

export interface DualConnectionConfig {
  apiKey: string;
  coachingPrompt: string;
  greeting?: string;
  voiceModel?: string;
  llmModel?: string;
  functions?: FunctionDefinition[];
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
  private functionHandler: FunctionCallingHandler;
  private whisperManager: CoachWhisperManager;
  private _config: DualConnectionConfig;
  private isInitialized: boolean = false;

  constructor(config: DualConnectionConfig) {
    super();
    this._config = config;

    // Get function definitions (use provided or defaults)
    const functions = config.functions || COACHING_FUNCTIONS;

    // Create connections
    this.voiceAgent = new VoiceAgentConnection({
      apiKey: config.apiKey,
      coachingPrompt: config.coachingPrompt,
      greeting: config.greeting,
      voiceModel: config.voiceModel,
      llmModel: config.llmModel,
      functions: functions,
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

    // Create function calling handler with default coaching functions
    this.functionHandler = createFunctionCallingHandler(config.verbose);

    // Create coach whisper manager
    this.whisperManager = new CoachWhisperManager(
      config.coachingPrompt,
      { verbose: config.verbose }
    );

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

    // ConversationText - unified transcript logging
    this.voiceAgent.on('conversation-text', (entry: TranscriptEntry) => {
      this.emit('conversation-text', entry);
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

    // Barge-in event (user interrupted AI)
    this.voiceAgent.on('barge-in', () => {
      this.emit('barge-in');
    });

    // Function call requests from AI
    this.voiceAgent.on('function-call', async (event: FunctionCallRequestEvent) => {
      await this.functionHandler.handleFunctionCallRequest(event);
    });

    // Prompt updated (coach whisper confirmed)
    this.voiceAgent.on('prompt-updated', () => {
      this.whisperManager.handlePromptUpdated({ type: 'PromptUpdated' });
      this.emit('prompt-updated');
    });

    this.voiceAgent.on('error', (error: Error) => {
      this.emit('voice-agent-error', error);
    });

    this.voiceAgent.on('close', (code: number, reason: string) => {
      this.emit('voice-agent-close', { code, reason });
    });

    // Transcription events (for muted coach audio)
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

    // Function handler events
    this.functionHandler.on('function-executed', (result) => {
      this.emit('function-executed', result);
    });

    this.functionHandler.on('function-error', (error) => {
      this.emit('function-error', error);
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

      // Set up function handler and whisper manager with Voice Agent connection
      this.functionHandler.setConnection(vaWs);
      this.whisperManager.setConnection(vaWs);

      this.isInitialized = true;
      console.log('[DualConnection] ✅ Both connections initialized');
      console.log('[DualConnection] 🔧 Function calling enabled');
      console.log('[DualConnection] 💬 Coach whisper enabled');
      
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
  // Track if we've warned about uninitialized state
  private hasWarnedNotInitialized = false;

  routeAudio(data: Buffer | Uint8Array, participantId: string, participantName?: string): void {
    if (!this.isInitialized) {
      // Only warn once to avoid console spam - early audio is expected
      if (!this.hasWarnedNotInitialized) {
        console.log('[DualConnection] ⏳ Buffering - Deepgram not ready yet (this is normal)');
        this.hasWarnedNotInitialized = true;
      }
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
   * Inject a prompt for the AI to speak (deprecated: use injectAgentMessage)
   */
  injectPrompt(text: string): void {
    this.voiceAgent.injectAgentMessage(text);
  }

  /**
   * Force the AI to say something specific
   */
  injectAgentMessage(content: string): void {
    this.voiceAgent.injectAgentMessage(content);
  }

  /**
   * Inject a message as if the user said it (triggers AI response)
   */
  injectUserMessage(content: string): void {
    this.voiceAgent.injectUserMessage(content);
  }

  /**
   * Coach Whisper - Inject silent context into AI reasoning
   * The guidance affects AI responses but is not spoken aloud
   */
  async sendCoachWhisper(guidance: string, coachId?: string): Promise<void> {
    return this.whisperManager.sendWhisper(guidance, coachId);
  }

  /**
   * Update the AI's system prompt directly
   */
  updatePrompt(prompt: string): void {
    this.voiceAgent.updatePrompt(prompt);
  }

  /**
   * Clear Voice Agent response buffer (for barge-in)
   */
  clearVoiceAgentBuffer(): void {
    this.voiceAgent.clearBuffer();
  }

  /**
   * Check if AI is currently speaking
   */
  isAgentSpeaking(): boolean {
    return this.voiceAgent.isCurrentlySpeaking();
  }

  /**
   * Get all transcripts from Voice Agent (ConversationText)
   */
  getVoiceAgentTranscripts(): TranscriptEntry[] {
    return this.voiceAgent.getTranscriptLog();
  }

  /**
   * Get all transcripts from Transcription STT (muted coach audio)
   */
  getTranscripts(): TranscriptResult[] {
    return this.transcription.getTranscriptBuffer();
  }

  /**
   * Clear Voice Agent transcript log
   */
  clearVoiceAgentTranscripts(): void {
    this.voiceAgent.clearTranscriptLog();
  }

  /**
   * Clear Transcription STT buffer
   */
  clearTranscripts(): void {
    this.transcription.clearBuffer();
  }

  /**
   * Get coach whisper history
   */
  getWhisperHistory(): Array<{ guidance: string; timestamp: Date; coachId?: string }> {
    return this.whisperManager.getHistory();
  }

  /**
   * Get function call log
   */
  getFunctionCallLog(): Array<{
    functionName: string;
    input: Record<string, unknown>;
    output: string;
    timestamp: Date;
    success: boolean;
  }> {
    return this.functionHandler.getCallLog();
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
    this.functionHandler.cleanup();
    this.whisperManager.cleanup();
    
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
