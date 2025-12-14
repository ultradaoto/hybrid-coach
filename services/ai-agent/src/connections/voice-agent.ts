/**
 * Voice Agent WebSocket Connection
 * 
 * Connects to Deepgram Voice Agent API (wss://agent.deepgram.com/v1/agent/converse)
 * Handles STT + LLM + TTS in a single WebSocket for conversational AI.
 * 
 * Features:
 * - Receives audio from Audio Router (client always, coach when unmuted)
 * - Outputs AI voice responses to LiveKit
 * - Supports KeepAlive during silence/mute periods
 * 
 * Reference: https://developers.deepgram.com/docs/voice-agent-api
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { DEEPGRAM_VOICE_AGENT_URL, OPUS_CONFIG, LINEAR16_CONFIG } from '../audio/opus-handler.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Voice Agent Settings message
 * Sent immediately after connection opens
 */
export interface VoiceAgentSettings {
  type: 'Settings';
  audio: {
    input: {
      encoding: string;
      sample_rate: number;
    };
    output: {
      encoding: string;
      sample_rate: number;
      container: string;
    };
  };
  agent: {
    language: string;
    listen: {
      provider: {
        type: string;
        model: string;
      };
    };
    think: {
      provider: {
        type: string;
        model: string;
        temperature?: number;
      };
      prompt: string;
    };
    speak: {
      provider: {
        type: string;
        model: string;
      };
    };
    greeting?: string;
  };
}

/**
 * Voice Agent connection configuration
 */
export interface VoiceAgentConfig {
  apiKey: string;
  coachingPrompt: string;
  greeting?: string;
  voiceModel?: string;
  llmModel?: string;
  verbose?: boolean;
}

/**
 * Voice Agent events
 */
export interface VoiceAgentEvents {
  'open': () => void;
  'close': (code: number, reason: string) => void;
  'error': (error: Error) => void;
  'audio': (data: Buffer) => void;
  'transcript': (text: string, isFinal: boolean) => void;
  'agent-speaking': () => void;
  'agent-done-speaking': () => void;
  'user-speaking': () => void;
  'user-done-speaking': () => void;
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
  private config: VoiceAgentConfig;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private reconnectDelay: number = 1000;

  constructor(config: VoiceAgentConfig) {
    super();
    this.config = {
      coachingPrompt: DEFAULT_COACHING_PROMPT,
      greeting: DEFAULT_GREETING,
      voiceModel: 'aura-2-thalia-en',
      llmModel: 'gpt-4o-mini',
      verbose: false,
      ...config,
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

        // Connection opened
        this.ws.on('open', () => {
          console.log('[VoiceAgent] ✅ Connected to Voice Agent API');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Send settings immediately
          this.sendSettings();
          
          this.emit('open');
          resolve();
        });

        // Message received
        this.ws.on('message', (data: Buffer | string) => {
          this.handleMessage(data);
        });

        // Connection closed
        this.ws.on('close', (code, reason) => {
          console.log(`[VoiceAgent] 📡 Connection closed: ${code} - ${reason.toString()}`);
          this.isConnected = false;
          this.emit('close', code, reason.toString());
          
          // Attempt reconnection if not intentional close
          if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        });

        // Error
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
   * Send Voice Agent settings after connection
   */
  private sendSettings(): void {
    const settings: VoiceAgentSettings = {
      type: 'Settings',
      audio: {
        input: {
          encoding: OPUS_CONFIG.encoding,
          sample_rate: OPUS_CONFIG.sampleRate,
        },
        output: {
          encoding: LINEAR16_CONFIG.encoding,
          sample_rate: LINEAR16_CONFIG.sampleRate,
          container: 'none', // Raw audio for LiveKit
        },
      },
      agent: {
        language: 'en',
        listen: {
          provider: {
            type: 'deepgram',
            model: 'nova-3',
          },
        },
        think: {
          provider: {
            type: 'open_ai',
            model: this.config.llmModel || 'gpt-4o-mini',
            temperature: 0.7,
          },
          prompt: this.config.coachingPrompt,
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: this.config.voiceModel || 'aura-2-thalia-en',
          },
        },
        greeting: this.config.greeting,
      },
    };

    this.log('📤 Sending settings:', settings);
    this.ws?.send(JSON.stringify(settings));
    console.log('[VoiceAgent] ⚙️ Settings sent');
  }

  /**
   * Handle incoming messages from Voice Agent
   */
  private handleMessage(data: Buffer | string): void {
    // Binary data = audio response from TTS
    if (Buffer.isBuffer(data)) {
      this.emit('audio', data);
      return;
    }

    // Text data = JSON control message
    try {
      const message = JSON.parse(data.toString());
      this.handleControlMessage(message);
    } catch (error) {
      this.log('⚠️ Failed to parse message:', data.toString());
    }
  }

  /**
   * Handle control messages from Voice Agent
   */
  private handleControlMessage(message: { type: string; [key: string]: unknown }): void {
    switch (message.type) {
      case 'Welcome':
        console.log('[VoiceAgent] 👋 Welcome received');
        break;

      case 'SettingsApplied':
        console.log('[VoiceAgent] ⚙️ Settings applied');
        break;

      case 'UserStartedSpeaking':
        this.log('🎤 User started speaking');
        this.emit('user-speaking');
        break;

      case 'UserStoppedSpeaking':
        this.log('🔇 User stopped speaking');
        this.emit('user-done-speaking');
        break;

      case 'AgentStartedSpeaking':
        this.log('🔊 Agent started speaking');
        this.emit('agent-speaking');
        break;

      case 'AgentAudioDone':
        this.log('🔇 Agent done speaking');
        this.emit('agent-done-speaking');
        break;

      case 'ConversationText':
        // Transcript of what user said
        const text = message.content as string || '';
        const role = message.role as string || 'user';
        this.log(`📝 ${role}: "${text}"`);
        this.emit('transcript', text, true);
        break;

      case 'Error':
        console.error('[VoiceAgent] ❌ Agent error:', message);
        this.emit('error', new Error(message.message as string || 'Voice Agent error'));
        break;

      default:
        this.log(`❓ Unknown message type: ${message.type}`, message);
    }
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
   * Send KeepAlive message
   * Call every 8 seconds during silence to maintain connection
   */
  sendKeepAlive(): void {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      this.log('💓 KeepAlive sent');
    }
  }

  /**
   * Inject text for the agent to speak
   * Used by coaches to guide the conversation
   */
  injectPrompt(text: string): void {
    if (!this.isConnected || !this.ws) {
      console.error('[VoiceAgent] ❌ Cannot inject prompt - not connected');
      return;
    }

    // Send as Inject message per Voice Agent API
    this.ws.send(JSON.stringify({
      type: 'InjectAgentMessage',
      message: text,
    }));
    
    console.log(`[VoiceAgent] 💉 Injected prompt: "${text}"`);
  }

  /**
   * Clear the agent's response buffer
   * Use when user interrupts or conversation needs reset
   */
  clearBuffer(): void {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'Clear' }));
      this.log('🧹 Buffer cleared');
    }
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
  getStatus(): { connected: boolean; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
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
    console.log('[VoiceAgent] 📴 Connection closed');
  }
}

// =============================================================================
// Exports
// =============================================================================

export default VoiceAgentConnection;
