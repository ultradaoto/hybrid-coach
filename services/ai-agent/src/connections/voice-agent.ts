/**
 * Voice Agent WebSocket Connection (Enhanced)
 * 
 * Connects to Deepgram Voice Agent API (wss://agent.deepgram.com/v1/agent/converse)
 * 
 * Features:
 * - STT + LLM + TTS in a single WebSocket
 * - ConversationText events for transcripts (no separate STT needed for clients)
 * - Function calling for client data, insights, exercises
 * - Coach whisper (UpdatePrompt) for silent context injection
 * - Barge-in support (stops AI when user speaks)
 * - KeepAlive during silence/mute periods
 * 
 * Reference: https://developers.deepgram.com/docs/voice-agent-api
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { DEEPGRAM_VOICE_AGENT_URL, VOICE_AGENT_INPUT_CONFIG, VOICE_AGENT_OUTPUT_CONFIG } from '../audio/opus-handler.js';
import type {
  SettingsMessage,
  FunctionDefinition,
  ConversationTextEvent,
  FunctionCallRequestEvent,
  VoiceAgentServerEvent,
  TranscriptEntry,
} from '../types/deepgram-events.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Voice Agent connection configuration
 */
export interface VoiceAgentConfig {
  apiKey: string;
  coachingPrompt: string;
  greeting?: string;
  voiceModel?: string;
  llmModel?: string;
  functions?: FunctionDefinition[];
  verbose?: boolean;
}

/**
 * Extended configuration with function definitions
 */
interface InternalConfig extends VoiceAgentConfig {
  coachingPrompt: string;
  greeting: string;
  voiceModel: string;
  llmModel: string;
  functions: FunctionDefinition[];
  verbose: boolean;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_COACHING_PROMPT = `You are a supportive AI wellness coach specializing in vagus nerve health and stress management.

Your approach:
- Listen actively and reflect back what you hear
- Ask open-ended questions to understand the client's current state
- Provide evidence-based suggestions for vagus nerve stimulation
- Be warm, encouraging, and non-judgmental
- Keep responses concise and conversational (1-3 sentences)
- If the client mentions serious mental health concerns, gently suggest professional help

Remember: You're here to support wellness, not provide medical advice.`;

const DEFAULT_GREETING = "Hi there! I'm your AI wellness coach. How are you feeling today?";

// =============================================================================
// Voice Agent Connection Class
// =============================================================================

export class VoiceAgentConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: InternalConfig;
  private isConnected: boolean = false;
  private isAgentSpeaking: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private reconnectDelay: number = 1000;
  private transcriptLog: TranscriptEntry[] = [];
  private sessionId: string = '';

  constructor(config: VoiceAgentConfig) {
    super();
    this.config = {
      greeting: DEFAULT_GREETING,
      voiceModel: 'aura-2-thalia-en',
      llmModel: 'gpt-4o-mini',
      functions: [],
      verbose: false,
      ...config,
      // Ensure coachingPrompt has a fallback
      coachingPrompt: config.coachingPrompt || DEFAULT_COACHING_PROMPT,
    };
  }

  private log(message: string, data?: unknown): void {
    if (this.config.verbose) {
      if (data) {
        console.log(`[VoiceAgent] ${message}`, data);
      } else {
        console.log(`[VoiceAgent] ${message}`);
      }
    }
  }

  /**
   * Connect to Deepgram Voice Agent API
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[VoiceAgent] 🔌 Connecting to Voice Agent API...');

        this.ws = new WebSocket(DEEPGRAM_VOICE_AGENT_URL, {
          headers: {
            'Authorization': `Token ${this.config.apiKey}`,
          },
        });

        this.ws.on('open', () => {
          console.log('[VoiceAgent] ✅ Connected to Voice Agent API');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          this.sendSettings();
          this.emit('open');
          resolve();
        });

        this.ws.on('message', (data: Buffer | string) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          const reasonStr = reason?.toString() || 'no reason';
          console.log(`[VoiceAgent] 📡 Connection closed: ${code} - ${reasonStr}`);
          
          // Log helpful debug info for common error codes
          if (code === 1005) {
            console.log('[VoiceAgent] ⚠️ Code 1005 = No Status Received - server closed without status');
            console.log('[VoiceAgent] 💡 This often means invalid Settings message format');
          } else if (code === 1008) {
            console.log('[VoiceAgent] ⚠️ Code 1008 = Policy Violation - check API key or permissions');
          } else if (code === 1011) {
            console.log('[VoiceAgent] ⚠️ Code 1011 = Server Error - issue on Deepgram side');
          }
          
          this.isConnected = false;
          this.emit('close', code, reasonStr);
          
          if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        });

        this.ws.on('error', (error) => {
          console.error('[VoiceAgent] ❌ WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        console.error('[VoiceAgent] ❌ Connection failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Send Voice Agent settings with function definitions
   * 
   * Deepgram Voice Agent API v1 Settings format
   * Reference: https://developers.deepgram.com/docs/configure-voice-agent
   * 
   * Key format notes (from Deepgram support):
   * - model goes INSIDE provider object
   * - use "prompt" not "instructions" 
   * - temperature goes inside provider for think
   */
  private sendSettings(): void {
    // Build settings object matching Deepgram Voice Agent API v1 format
    const settings: Record<string, unknown> = {
      type: 'Settings',
      audio: {
        input: {
          encoding: VOICE_AGENT_INPUT_CONFIG.encoding,
          sample_rate: VOICE_AGENT_INPUT_CONFIG.sampleRate,
        },
        output: {
          encoding: VOICE_AGENT_OUTPUT_CONFIG.encoding,
          sample_rate: VOICE_AGENT_OUTPUT_CONFIG.sampleRate,
          container: 'none',
        },
      },
      agent: {
        listen: {
          provider: {
            type: 'deepgram',
            model: 'nova-2',
          },
        },
        think: {
          provider: {
            type: 'open_ai',
            model: this.config.llmModel,
            temperature: 0.7,
          },
          prompt: this.config.coachingPrompt,
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: 'aura-asteria-en',
          },
        },
      },
    };

    const settingsJson = JSON.stringify(settings, null, 2);
    console.log('[VoiceAgent] 📤 Sending settings:', settingsJson);
    this.ws?.send(JSON.stringify(settings));
    console.log('[VoiceAgent] ⚙️ Settings sent');
  }

  /**
   * Handle incoming messages from Voice Agent
   */
  private handleMessage(data: Buffer | string): void {
    // Convert to buffer for consistent handling
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    // Log raw data for debugging small messages
    if (buffer.length < 200) {
      const dataStr = buffer.toString('utf8');
      console.log(`[VoiceAgent] 📥 Small message (${buffer.length} bytes): ${dataStr.substring(0, 150)}`);
    }
    
    // Try to parse as JSON first (control messages)
    // Deepgram sends both JSON text and binary audio over the same connection
    const dataStr = buffer.toString('utf8');
    if (dataStr.trim().startsWith('{')) {
      try {
        const message = JSON.parse(dataStr) as VoiceAgentServerEvent;
        console.log(`[VoiceAgent] 📨 Received: ${message.type}`);
        this.handleControlMessage(message);
        return;
      } catch (error) {
        // Not valid JSON, might be binary that happens to start with '{'
        console.log('[VoiceAgent] ⚠️ Looks like JSON but failed to parse');
      }
    }

    // Binary audio data
    if (buffer.length > 100) {
      this.log(`🔊 Received audio: ${buffer.length} bytes`);
    }
    this.emit('audio', buffer);
  }

  /**
   * Handle control messages from Voice Agent
   */
  private handleControlMessage(message: VoiceAgentServerEvent): void {
    switch (message.type) {
      case 'Welcome':
        console.log('[VoiceAgent] 👋 Welcome received');
        this.sessionId = (message as { session_id?: string }).session_id || '';
        this.emit('welcome', message);
        break;

      case 'SettingsApplied':
        console.log('[VoiceAgent] ⚙️ Settings applied');
        this.emit('settings-applied');
        break;

      case 'UserStartedSpeaking':
        this.log('🎤 User started speaking');
        this.emit('user-speaking');
        
        // BARGE-IN: Stop AI audio playback when user speaks
        if (this.isAgentSpeaking) {
          this.log('⚡ Barge-in detected - clearing buffer');
          this.clearBuffer();
          this.emit('barge-in');
        }
        break;

      case 'UserStoppedSpeaking':
        this.log('🔇 User stopped speaking');
        this.emit('user-done-speaking');
        break;

      case 'AgentStartedSpeaking':
        this.log('🔊 Agent started speaking');
        this.isAgentSpeaking = true;
        this.emit('agent-speaking');
        break;

      case 'AgentAudioDone':
        this.log('🔇 Agent done speaking');
        this.isAgentSpeaking = false;
        this.emit('agent-done-speaking');
        break;

      case 'ConversationText':
        this.handleConversationText(message as ConversationTextEvent);
        break;

      case 'PromptUpdated':
        this.log('✅ Prompt updated (coach whisper confirmed)');
        this.emit('prompt-updated', message);
        break;

      case 'FunctionCallRequest':
        this.handleFunctionCallRequest(message as FunctionCallRequestEvent);
        break;

      case 'Error':
        const errorEvent = message as { message?: string; code?: string };
        console.error('[VoiceAgent] ❌ Agent error:', message);
        this.emit('error', new Error(errorEvent.message || 'Voice Agent error'));
        break;

      default:
        this.log(`❓ Unknown message type: ${message.type}`, message);
    }
  }

  /**
   * Handle ConversationText event - transcripts for user and agent
   * This replaces the need for separate STT for client audio
   */
  private handleConversationText(event: ConversationTextEvent): void {
    const { role, content } = event;
    
    // Log the transcript
    const entry: TranscriptEntry = {
      sessionId: this.sessionId,
      role: role as 'user' | 'assistant',
      content,
      timestamp: new Date(),
      source: 'voice_agent',
      isFinal: true,
    };
    
    this.transcriptLog.push(entry);
    
    console.log(`[VoiceAgent] 📝 ${role}: "${content}"`);
    
    // Emit transcript event for logging/display
    this.emit('conversation-text', entry);
    
    // Also emit the old transcript event for backwards compatibility
    this.emit('transcript', content, true);
  }

  /**
   * Handle FunctionCallRequest from the agent
   */
  private handleFunctionCallRequest(event: FunctionCallRequestEvent): void {
    console.log(`[VoiceAgent] 📞 Function call request: ${event.function_name}`);
    this.log('Function input:', event.input);
    
    // Emit event for the function handler to process
    this.emit('function-call', event);
  }

  /**
   * Send function call response back to Voice Agent
   */
  sendFunctionCallResponse(functionCallId: string, output: string): void {
    if (!this.isConnected || !this.ws) {
      console.error('[VoiceAgent] ❌ Cannot send function response - not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'FunctionCallResponse',
      function_call_id: functionCallId,
      output,
    }));
    
    this.log(`📤 Sent function response for ${functionCallId}`);
  }

  /**
   * Update the agent's prompt (Coach Whisper)
   * Silent context injection - affects reasoning without being spoken
   */
  updatePrompt(prompt: string): void {
    if (!this.isConnected || !this.ws) {
      console.error('[VoiceAgent] ❌ Cannot update prompt - not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'UpdatePrompt',
      prompt,
    }));
    
    console.log('[VoiceAgent] 💬 Sent prompt update (coach whisper)');
  }

  /**
   * Inject a message as if the user said it
   * Triggers the agent to respond to this text
   */
  injectUserMessage(content: string): void {
    if (!this.isConnected || !this.ws) {
      console.error('[VoiceAgent] ❌ Cannot inject user message - not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'InjectUserMessage',
      content,
    }));
    
    console.log(`[VoiceAgent] 💉 Injected user message: "${content}"`);
  }

  /**
   * Force the agent to say something specific
   */
  injectAgentMessage(content: string): void {
    if (!this.isConnected || !this.ws) {
      console.error('[VoiceAgent] ❌ Cannot inject agent message - not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'InjectAgentMessage',
      content,
    }));
    
    console.log(`[VoiceAgent] 🔊 Injected agent message: "${content}"`);
  }

  /**
   * Send audio data to Voice Agent
   */
  sendAudio(data: Buffer | Uint8Array): boolean {
    if (!this.isConnected || !this.ws) {
      this.log('⚠️ Cannot send audio - not connected');
      return false;
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      this.log('⚠️ WebSocket not open');
      return false;
    }

    try {
      this.ws.send(data);
      return true;
    } catch (error) {
      console.error('[VoiceAgent] ❌ Failed to send audio:', error);
      return false;
    }
  }

  /**
   * Send KeepAlive message (every 8 seconds during silence)
   */
  sendKeepAlive(): void {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      this.log('💓 KeepAlive sent');
    }
  }

  /**
   * Clear the agent's response buffer (for barge-in)
   */
  clearBuffer(): void {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'Clear' }));
      this.isAgentSpeaking = false;
      this.log('🧹 Buffer cleared');
    }
  }

  /**
   * Get all transcripts from the session
   */
  getTranscriptLog(): TranscriptEntry[] {
    return [...this.transcriptLog];
  }

  /**
   * Clear transcript log
   */
  clearTranscriptLog(): void {
    this.transcriptLog = [];
  }

  /**
   * Check if agent is currently speaking
   */
  isCurrentlySpeaking(): boolean {
    return this.isAgentSpeaking;
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`[VoiceAgent] 🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await this.connect();
    } catch (error) {
      console.error('[VoiceAgent] ❌ Reconnection failed:', error);
    }
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    isAgentSpeaking: boolean;
    transcriptCount: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      isAgentSpeaking: this.isAgentSpeaking,
      transcriptCount: this.transcriptLog.length,
    };
  }

  /**
   * Get the raw WebSocket for direct access
   */
  getWebSocket(): WebSocket | null {
    return this.ws;
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client closing');
      this.ws = null;
    }
    this.isConnected = false;
    this.isAgentSpeaking = false;
    console.log('[VoiceAgent] 📴 Connection closed');
  }
}

// =============================================================================
// Exports
// =============================================================================

export default VoiceAgentConnection;
