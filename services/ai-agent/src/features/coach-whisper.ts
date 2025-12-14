/**
 * Coach Whisper Feature
 * 
 * Allows coaches to inject silent context into the AI agent's reasoning
 * without the context being spoken aloud.
 * 
 * Use cases:
 * - Guide AI focus: "The client seems anxious. Ask about their sleep patterns."
 * - Suggest techniques: "Focus on breathing exercises for the next few minutes."
 * - Add context: "The client mentioned their mother - this is a sensitive topic."
 * 
 * Implementation uses Deepgram's UpdatePrompt message which updates the
 * agent's system prompt mid-conversation without speaking.
 */

import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import type { UpdatePromptMessage, PromptUpdatedEvent } from '../types/deepgram-events.js';

// =============================================================================
// Types
// =============================================================================

export interface WhisperEvent {
  type: 'whisper-sent' | 'whisper-confirmed' | 'whisper-failed';
  guidance: string;
  timestamp: Date;
  coachId?: string;
}

export interface WhisperConfig {
  /** Enable verbose logging */
  verbose: boolean;
  /** Prepend to all whispers (e.g., "COACH GUIDANCE: ") */
  whisperPrefix: string;
  /** Timeout for prompt update confirmation (ms) */
  confirmationTimeoutMs: number;
}

const DEFAULT_CONFIG: WhisperConfig = {
  verbose: false,
  whisperPrefix: '[Coach guidance]: ',
  confirmationTimeoutMs: 5000,
};

// =============================================================================
// Coach Whisper Manager
// =============================================================================

/**
 * Manages coach whisper functionality for silent context injection
 */
export class CoachWhisperManager extends EventEmitter {
  private voiceAgentWs: WebSocket | null = null;
  private config: WhisperConfig;
  private basePrompt: string;
  private whisperHistory: Array<{
    guidance: string;
    timestamp: Date;
    coachId?: string;
  }> = [];
  private pendingConfirmation: {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  } | null = null;

  constructor(basePrompt: string, config: Partial<WhisperConfig> = {}) {
    super();
    this.basePrompt = basePrompt;
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[CoachWhisper] 👂 Manager initialized');
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[CoachWhisper] ${message}`);
    }
  }

  /**
   * Set the Voice Agent WebSocket connection
   */
  setConnection(ws: WebSocket): void {
    this.voiceAgentWs = ws;
    this.log('🔌 Connection set');
  }

  /**
   * Send a coach whisper (silent context injection)
   * 
   * @param guidance The guidance to inject into the AI's reasoning
   * @param coachId Optional ID of the coach sending the whisper
   * @returns Promise that resolves when confirmed, rejects on timeout/error
   */
  async sendWhisper(guidance: string, coachId?: string): Promise<void> {
    if (!this.voiceAgentWs || this.voiceAgentWs.readyState !== 1) {
      throw new Error('Voice Agent not connected');
    }

    // Build the updated prompt with coach guidance
    const updatedPrompt = this.buildUpdatedPrompt(guidance);

    // Create the UpdatePrompt message
    const message: UpdatePromptMessage = {
      type: 'UpdatePrompt',
      prompt: updatedPrompt,
    };

    console.log(`[CoachWhisper] 💬 Sending whisper: "${guidance.substring(0, 50)}..."`);

    // Store in history
    this.whisperHistory.push({
      guidance,
      timestamp: new Date(),
      coachId,
    });

    // Send the message
    this.voiceAgentWs.send(JSON.stringify(message));

    // Emit event
    this.emit('whisper', {
      type: 'whisper-sent',
      guidance,
      timestamp: new Date(),
      coachId,
    } as WhisperEvent);

    // Wait for confirmation
    return this.waitForConfirmation(guidance, coachId);
  }

  /**
   * Build the updated prompt with coach guidance appended
   */
  private buildUpdatedPrompt(guidance: string): string {
    const prefixedGuidance = `${this.config.whisperPrefix}${guidance}`;
    
    // Append guidance to base prompt
    return `${this.basePrompt}\n\n${prefixedGuidance}`;
  }

  /**
   * Wait for PromptUpdated confirmation from Voice Agent
   */
  private waitForConfirmation(guidance: string, coachId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingConfirmation = null;
        
        const error = new Error('Whisper confirmation timeout');
        this.emit('whisper', {
          type: 'whisper-failed',
          guidance,
          timestamp: new Date(),
          coachId,
        } as WhisperEvent);
        
        reject(error);
      }, this.config.confirmationTimeoutMs);

      this.pendingConfirmation = { resolve, reject, timeout };
    });
  }

  /**
   * Handle PromptUpdated event from Voice Agent
   * Call this when you receive a PromptUpdated message
   */
  handlePromptUpdated(_event: PromptUpdatedEvent): void {
    this.log('✅ Prompt update confirmed');

    if (this.pendingConfirmation) {
      clearTimeout(this.pendingConfirmation.timeout);
      this.pendingConfirmation.resolve();
      this.pendingConfirmation = null;

      const lastWhisper = this.whisperHistory[this.whisperHistory.length - 1];
      if (lastWhisper) {
        this.emit('whisper', {
          type: 'whisper-confirmed',
          guidance: lastWhisper.guidance,
          timestamp: new Date(),
          coachId: lastWhisper.coachId,
        } as WhisperEvent);
      }
    }
  }

  /**
   * Inject a message as if the user said it
   * This triggers the AI to respond as if the user spoke
   */
  injectUserMessage(content: string): void {
    if (!this.voiceAgentWs || this.voiceAgentWs.readyState !== 1) {
      console.error('[CoachWhisper] ❌ Cannot inject user message - not connected');
      return;
    }

    this.voiceAgentWs.send(JSON.stringify({
      type: 'InjectUserMessage',
      content,
    }));

    console.log(`[CoachWhisper] 💉 Injected user message: "${content.substring(0, 50)}..."`);
  }

  /**
   * Force the AI to say something specific
   */
  injectAgentMessage(content: string): void {
    if (!this.voiceAgentWs || this.voiceAgentWs.readyState !== 1) {
      console.error('[CoachWhisper] ❌ Cannot inject agent message - not connected');
      return;
    }

    this.voiceAgentWs.send(JSON.stringify({
      type: 'InjectAgentMessage',
      content,
    }));

    console.log(`[CoachWhisper] 🔊 Injected agent message: "${content.substring(0, 50)}..."`);
  }

  /**
   * Get whisper history
   */
  getHistory(): Array<{ guidance: string; timestamp: Date; coachId?: string }> {
    return [...this.whisperHistory];
  }

  /**
   * Clear whisper history
   */
  clearHistory(): void {
    this.whisperHistory = [];
    this.log('🧹 History cleared');
  }

  /**
   * Update the base prompt (for session context changes)
   */
  setBasePrompt(prompt: string): void {
    this.basePrompt = prompt;
    this.log('📝 Base prompt updated');
  }

  /**
   * Get current base prompt
   */
  getBasePrompt(): string {
    return this.basePrompt;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.pendingConfirmation) {
      clearTimeout(this.pendingConfirmation.timeout);
      this.pendingConfirmation = null;
    }
    this.whisperHistory = [];
    this.voiceAgentWs = null;
    console.log('[CoachWhisper] 🧹 Cleaned up');
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create a whisper manager with default coaching prompt
 */
export function createCoachWhisperManager(
  basePrompt: string,
  config?: Partial<WhisperConfig>
): CoachWhisperManager {
  return new CoachWhisperManager(basePrompt, config);
}

// =============================================================================
// Exports
// =============================================================================

export default CoachWhisperManager;
