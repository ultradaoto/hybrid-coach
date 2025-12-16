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
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private keepAliveIntervalMs: number = 4000;

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
          this.startKeepAlive();
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
          this.stopKeepAlive();
          this.emit('close', code, reasonStr);
          
          if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        });

        this.ws.on('error', (error) => {
          console.error('[VoiceAgent] ❌ WebSocket error:', error);
          this.stopKeepAlive();
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
   * CONFIRMED SETTINGS FROM DEEPGRAM SUPPORT:
   * - STT Model: nova-3-medical (optimized for health/wellness conversations)
   * - TTS Model: aura-2-thalia-en (NOT aura-asteria-en)
   * - Sample Rate: 24000 (recommended, NOT 16000)
   * - Keyterms: Boosts recognition of wellness-specific vocabulary
   * - Language: 'en' required (nova-3-medical only supports English locales)
   * - endpointing/utterance_end_ms: NOT valid in Voice Agent (only for Listen API)
   * - Voice Agent handles turn detection internally
   */
  private sendSettings(): void {
    // Get STT model from environment (default to nova-3-medical)
    const sttModel = process.env.DEEPGRAM_STT_MODEL || 'nova-3-medical';
    
    // Build settings object matching Deepgram Voice Agent API v1 format
    // Using CONFIRMED values from Deepgram support + nova-3-medical for health vocabulary
    const settings: Record<string, unknown> = {
      type: 'Settings',
      audio: {
        input: {
          encoding: 'linear16',
          sample_rate: 24000,  // ✅ Recommended by Deepgram (was 16000)
        },
        output: {
          encoding: 'linear16',
          sample_rate: 24000,  // ✅ Recommended by Deepgram (was 16000)
          container: 'none',
        },
      },
      agent: {
        language: 'en',  // ✅ REQUIRED - nova-3-medical only supports English locales
        listen: {
          provider: {
            type: 'deepgram',
            model: sttModel,  // ✅ nova-3-medical for health/wellness conversations
            // Keyterms boost recognition of specific wellness/medical vocabulary
            // CRITICAL: "vagus" and "vagus nerve" are emphasized to prevent "Vegas" misrecognition
            keyterms: [
              // === CRITICAL: Vagus Nerve (NOT Vegas!) ===
              'vagus',
              'vagus nerve',
              'vagal',
              'vagal tone',
              'vagus nerve stimulation',
              'polyvagal',
              'polyvagal theory',
              
              // === Wellness & Stress Management ===
              'cortisol',
              'mindfulness',
              'meditation',
              'breathwork',
              'breath work',
              'breathing exercises',
              'parasympathetic',
              'sympathetic',
              'nervous system',
              'autonomic nervous system',
              'HRV',
              'heart rate variability',
              'biofeedback',
              'neurofeedback',
              
              // === Mental Health & Trauma ===
              'anxiety',
              'depression',
              'PTSD',
              'trauma',
              'traumatic',
              'dysregulation',
              'regulation',
              'emotional regulation',
              'somatic',
              'somatic experiencing',
              'body scan',
              'grounding',
              'grounding techniques',
              
              // === Sleep & Circadian Rhythm ===
              'circadian',
              'circadian rhythm',
              'melatonin',
              'insomnia',
              'sleep hygiene',
              'sleep quality',
              'REM sleep',
              'deep sleep',
              
              // === Nutrition & Gut Health ===
              'inflammation',
              'anti-inflammatory',
              'gut health',
              'microbiome',
              'gut-brain axis',
              'adaptogens',
              'supplements',
              'probiotics',
              'prebiotics',
              
              // === Physical Health & Pain ===
              'chronic pain',
              'chronic fatigue',
              'autoimmune',
              'thyroid',
              'adrenal',
              'adrenal fatigue',
              'burnout',
              'fibromyalgia',
              'neuropathy',
              
              // === Holistic Wellness ===
              'holistic',
              'integrative',
              'functional medicine',
              'naturopathic',
              'acupuncture',
              'chiropractic',
              'osteopathy',
              
              // === Exercise & Movement ===
              'yoga',
              'tai chi',
              'qigong',
              'pilates',
              'fascia',
              'myofascial',
              'stretching',
              'mobility',
              
              // === Cognitive & Brain Health ===
              'neuroplasticity',
              'cognitive',
              'executive function',
              'brain fog',
              'ADHD',
              'attention deficit',
              'dopamine',
              'serotonin',
              'norepinephrine',
              
              // === Specific Wellness Practices ===
              'cold exposure',
              'ice bath',
              'Wim Hof',
              'cold plunge',
              'sauna',
              'infrared sauna',
              'heat therapy',
              'forest bathing',
              'earthing',
              'grounding',
              
              // === Ultra Coach Specific ===
              'Ultra Coach',
              'MyUltra',
              'wellness coaching',
              'life coaching',
              'health coaching',
            ],
          },
          // NOTE: endpointing and utterance_end_ms are NOT supported in Voice Agent API
          // Voice Agent handles turn detection internally
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
            model: 'aura-2-thalia-en',  // ✅ Confirmed by Deepgram (was aura-asteria-en)
          },
        },
        greeting: this.config.greeting,  // ✅ Optional spoken welcome message
      },
    };

    const settingsJson = JSON.stringify(settings, null, 2);
    console.log(`[VoiceAgent] 📤 Sending settings with ${sttModel}:`, settingsJson);
    this.ws?.send(JSON.stringify(settings));
    console.log(`[VoiceAgent] ⚙️ Settings sent: ${sttModel} + aura-2-thalia-en + 24kHz + ${(settings.agent as any).listen.provider.keyterms.length} keyterms`);
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
    // Removed verbose logging to reduce console spam
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

      case 'History':
        // History messages are informational - the conversation history.
        // We already capture this via ConversationText, so we can ignore History.
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

  // Backpressure tracking
  private readonly MAX_BUFFER_SIZE = 64 * 1024;  // 64KB buffer limit
  private droppedFrameCount = 0;
  private lastDropWarning = 0;

  /**
   * Send audio data to Voice Agent with backpressure handling
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

    // Check backpressure - drop frames instead of queuing infinitely
    if (this.ws.bufferedAmount > this.MAX_BUFFER_SIZE) {
      this.droppedFrameCount++;
      
      // Log warning every 5 seconds
      const now = Date.now();
      if (now - this.lastDropWarning > 5000) {
        console.warn(`[VoiceAgent] ⚠️ Dropping frames due to backpressure. Dropped ${this.droppedFrameCount} frames. BufferedAmount: ${this.ws.bufferedAmount} bytes`);
        this.lastDropWarning = now;
        this.droppedFrameCount = 0;
      }
      
      return false;  // Drop frame instead of queuing
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

  private startKeepAlive(): void {
    if (this.keepAliveTimer) return;
    this.keepAliveTimer = setInterval(() => {
      this.sendKeepAlive();
    }, this.keepAliveIntervalMs);
  }

  private stopKeepAlive(): void {
    if (!this.keepAliveTimer) return;
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  /**
   * Clear the agent's response buffer (for barge-in)
   * Note: Deepgram Voice Agent handles barge-in automatically when user speaks.
   * We just need to track state locally - no special message needed.
   */
  clearBuffer(): void {
    // Deepgram doesn't have a "Clear" message type.
    // Barge-in is handled automatically when user audio interrupts.
    // We just reset our local state.
    this.isAgentSpeaking = false;
    this.log('🧹 Buffer cleared (local state only)');
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
    this.stopKeepAlive();
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
