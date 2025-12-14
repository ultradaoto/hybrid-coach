/**
 * Transcription WebSocket Connection
 * 
 * Connects to Deepgram Listen API (wss://api.deepgram.com/v1/listen)
 * Provides always-on transcription for coach review panel.
 * 
 * Features:
 * - ALWAYS receives all audio (regardless of coach mute state)
 * - Outputs transcripts with speaker attribution
 * - Supports interim results for real-time display
 * 
 * Reference: https://developers.deepgram.com/docs/live-streaming-audio
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { getDeepgramSttUrl, OPUS_CONFIG } from '../audio/opus-handler.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Transcript result from Deepgram
 */
export interface TranscriptResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  words: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  speaker?: number;
  channel: number;
  start: number;
  duration: number;
}

/**
 * Transcription event with participant attribution
 */
export interface TranscriptionEvent {
  participantId: string;
  participantName?: string;
  transcript: string;
  confidence: number;
  isFinal: boolean;
  timestamp: Date;
  isMutedFromAI: boolean;
}

/**
 * Transcription connection configuration
 */
export interface TranscriptionConfig {
  apiKey: string;
  model?: string;
  language?: string;
  punctuate?: boolean;
  interimResults?: boolean;
  verbose?: boolean;
}

// =============================================================================
// Transcription Connection Class
// =============================================================================

export class TranscriptionConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: TranscriptionConfig;
  private isConnected: boolean = false;
  private currentSpeaker: string | null = null;
  private transcriptBuffer: TranscriptResult[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor(config: TranscriptionConfig) {
    super();
    this.config = {
      model: 'nova-3',
      language: 'en-US',
      punctuate: true,
      interimResults: true,
      verbose: false,
      ...config,
    };
  }

  private log(message: string, data?: unknown): void {
    if (this.config.verbose) {
      if (data) {
        console.log(`[Transcription] ${message}`, data);
      } else {
        console.log(`[Transcription] ${message}`);
      }
    }
  }

  /**
   * Connect to Deepgram Listen API
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const sttUrl = getDeepgramSttUrl(OPUS_CONFIG);
        console.log('[Transcription] 🔌 Connecting to Listen API...');

        this.ws = new WebSocket(sttUrl, {
          headers: {
            'Authorization': `Token ${this.config.apiKey}`,
          },
        });

        // Connection opened
        this.ws.on('open', () => {
          console.log('[Transcription] ✅ Connected to Listen API');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('open');
          resolve();
        });

        // Message received
        this.ws.on('message', (data: Buffer | string) => {
          this.handleMessage(data);
        });

        // Connection closed
        this.ws.on('close', (code, reason) => {
          console.log(`[Transcription] 📡 Connection closed: ${code} - ${reason.toString()}`);
          this.isConnected = false;
          this.emit('close', code, reason.toString());
          
          // Attempt reconnection
          if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        });

        // Error
        this.ws.on('error', (error) => {
          console.error('[Transcription] ❌ WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        console.error('[Transcription] ❌ Connection failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages from Listen API
   */
  private handleMessage(data: Buffer | string): void {
    try {
      const message = JSON.parse(data.toString());
      this.handleTranscriptMessage(message);
    } catch (error) {
      this.log('⚠️ Failed to parse message');
    }
  }

  /**
   * Handle transcript messages from Deepgram
   */
  private handleTranscriptMessage(message: {
    type: string;
    channel?: {
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words?: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
          speaker?: number;
        }>;
      }>;
    };
    is_final?: boolean;
    start?: number;
    duration?: number;
    speech_final?: boolean;
    [key: string]: unknown;
  }): void {
    switch (message.type) {
      case 'Results':
        this.handleResults(message);
        break;

      case 'Metadata':
        this.log('📊 Metadata received:', message);
        break;

      case 'SpeechStarted':
        this.log('🎤 Speech started');
        this.emit('speech-started');
        break;

      case 'UtteranceEnd':
        this.log('🔇 Utterance end');
        this.emit('utterance-end');
        break;

      case 'Error':
        console.error('[Transcription] ❌ API error:', message);
        this.emit('error', new Error(String(message.message) || 'Transcription error'));
        break;

      default:
        this.log(`❓ Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle transcription results
   */
  private handleResults(message: {
    channel?: {
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words?: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
          speaker?: number;
        }>;
      }>;
    };
    is_final?: boolean;
    start?: number;
    duration?: number;
    speech_final?: boolean;
  }): void {
    const channel = message.channel;
    if (!channel || !channel.alternatives || channel.alternatives.length === 0) {
      return;
    }

    const alternative = channel.alternatives[0];
    const transcript = alternative.transcript || '';
    
    if (!transcript.trim()) {
      return; // Skip empty transcripts
    }

    const result: TranscriptResult = {
      transcript,
      confidence: alternative.confidence || 0,
      isFinal: message.is_final || false,
      words: alternative.words || [],
      channel: 0,
      start: message.start || 0,
      duration: message.duration || 0,
    };

    // Store in buffer
    if (result.isFinal) {
      this.transcriptBuffer.push(result);
    }

    // Log the transcript
    const prefix = result.isFinal ? '📝' : '⏳';
    if (result.isFinal || this.config.verbose) {
      console.log(`[Transcription] ${prefix} "${transcript}" (${(result.confidence * 100).toFixed(1)}%)`);
    }

    // Emit event
    this.emit('transcript', result);
  }

  /**
   * Send audio data to transcription service
   * This ALWAYS receives all audio for coach review
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
      console.error('[Transcription] ❌ Failed to send audio:', error);
      return false;
    }
  }

  /**
   * Set current speaker for attribution
   */
  setCurrentSpeaker(participantId: string): void {
    this.currentSpeaker = participantId;
  }

  /**
   * Get current speaker
   */
  getCurrentSpeaker(): string | null {
    return this.currentSpeaker;
  }

  /**
   * Send KeepAlive to maintain connection
   * Deepgram Listen API also supports KeepAlive
   */
  sendKeepAlive(): void {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      // Send empty JSON to keep connection alive
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      this.log('💓 KeepAlive sent');
    }
  }

  /**
   * Request to close the stream gracefully
   * Sends CloseStream message to Deepgram
   */
  requestClose(): void {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      this.log('📴 CloseStream requested');
    }
  }

  /**
   * Get all buffered transcripts
   */
  getTranscriptBuffer(): TranscriptResult[] {
    return [...this.transcriptBuffer];
  }

  /**
   * Clear transcript buffer
   */
  clearBuffer(): void {
    this.transcriptBuffer = [];
    this.log('🧹 Buffer cleared');
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = 1000 * this.reconnectAttempts;
    
    console.log(`[Transcription] 🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await this.connect();
    } catch (error) {
      console.error('[Transcription] ❌ Reconnection failed:', error);
    }
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    transcriptCount: number;
    currentSpeaker: string | null;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      transcriptCount: this.transcriptBuffer.length,
      currentSpeaker: this.currentSpeaker,
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
    this.requestClose();
    
    // Give Deepgram a moment to process CloseStream
    setTimeout(() => {
      if (this.ws) {
        this.ws.close(1000, 'Client closing');
        this.ws = null;
      }
      this.isConnected = false;
      console.log('[Transcription] 📴 Connection closed');
    }, 100);
  }
}

// =============================================================================
// Exports
// =============================================================================

export default TranscriptionConnection;
