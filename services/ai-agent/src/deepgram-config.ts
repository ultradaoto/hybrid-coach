/**
 * Deepgram STT/TTS Configuration
 * 
 * Configuration objects for Deepgram's Nova-3 STT and Aura-2 TTS models.
 * Implements cost-control patterns from DEEPGRAM-INTEGRATION.md
 * 
 * Audio Format: linear16 @ 24000Hz (matches LiveKit's default for voice)
 */

import * as deepgram from '@livekit/agents-plugin-deepgram';

// =============================================================================
// STT (Speech-to-Text) Configuration
// =============================================================================

/**
 * Default STT configuration for Nova-3 model
 * Optimized for low-latency voice coaching
 */
export interface SttConfig {
  model: string;
  language: string;
  punctuate: boolean;
  interimResults: boolean;
  smartFormat: boolean;
  encoding: string;
  sampleRate: number;
}

export const DEFAULT_STT_CONFIG: SttConfig = {
  model: 'nova-3',
  language: 'en-US',
  punctuate: true,
  interimResults: true,  // Responsive transcription display
  smartFormat: true,
  encoding: 'linear16',
  sampleRate: 24000,     // Matches LiveKit's default for voice
};

/**
 * Create Deepgram STT instance with default configuration
 */
export function createSttInstance(configOverrides: Partial<SttConfig> = {}): deepgram.STT {
  const config = { ...DEFAULT_STT_CONFIG, ...configOverrides };
  
  console.log(`[Deepgram STT] Creating STT instance with model: ${config.model}`);
  
  return new deepgram.STT({
    model: config.model,
    language: config.language,
    punctuate: config.punctuate,
    interimResults: config.interimResults,
    smartFormat: config.smartFormat,
  });
}

// =============================================================================
// TTS (Text-to-Speech) Configuration
// =============================================================================

/**
 * Default TTS configuration for Aura-2 model
 * Using Thalia voice - natural female voice for coaching
 */
export interface TtsConfig {
  model: string;
  sampleRate: number;
  encoding: string;
}

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  model: 'aura-2-thalia-en',  // Natural female voice for coaching
  sampleRate: 24000,
  encoding: 'linear16',
};

/**
 * Available Deepgram Aura-2 voice models
 * Use these for different coaching personalities
 */
export const AVAILABLE_VOICES = {
  // Female voices
  thalia: 'aura-2-thalia-en',     // Warm, professional (default)
  athena: 'aura-2-athena-en',     // Confident, authoritative
  luna: 'aura-2-luna-en',         // Calm, soothing
  stella: 'aura-2-stella-en',     // Energetic, motivational
  
  // Male voices  
  orion: 'aura-2-orion-en',       // Deep, reassuring
  arcas: 'aura-2-arcas-en',       // Friendly, approachable
  perseus: 'aura-2-perseus-en',   // Clear, instructional
} as const;

export type VoiceId = keyof typeof AVAILABLE_VOICES;

/**
 * Create Deepgram TTS instance with default configuration
 */
export function createTtsInstance(configOverrides: Partial<TtsConfig> = {}): deepgram.TTS {
  const config = { ...DEFAULT_TTS_CONFIG, ...configOverrides };
  
  console.log(`[Deepgram TTS] Creating TTS instance with model: ${config.model}`);
  
  return new deepgram.TTS({
    model: config.model,
    sampleRate: config.sampleRate,
  });
}

// =============================================================================
// KeepAlive Pattern Implementation
// =============================================================================

/**
 * KeepAlive manager for cost-effective connection maintenance
 * 
 * From DEEPGRAM-INTEGRATION.md:
 * - When user is NOT speaking, stop streaming audio chunks
 * - Send keepAlive every 3 seconds to maintain WebSocket
 * - Resume connection.send(chunk) when speech detected
 * - Prevents billing for silence while maintaining connection
 */
export class KeepAliveManager {
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private readonly intervalMs: number;

  constructor(intervalMs: number = 3000) {
    this.intervalMs = intervalMs;
  }

  /**
   * Start sending keepAlive signals
   * Call when user stops speaking
   */
  start(keepAliveCallback: () => void): void {
    if (this.isActive) {
      return; // Already running
    }

    this.isActive = true;
    console.log('[KeepAlive] Starting keepAlive signals');

    this.keepAliveTimer = setInterval(() => {
      if (this.isActive) {
        keepAliveCallback();
        console.log('[KeepAlive] 💓 KeepAlive sent');
      }
    }, this.intervalMs);
  }

  /**
   * Stop sending keepAlive signals
   * Call when user starts speaking again
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    
    console.log('[KeepAlive] Stopped keepAlive signals');
  }

  /**
   * Check if keepAlive is currently active
   */
  isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Cleanup on agent shutdown
   */
  cleanup(): void {
    this.stop();
  }
}

// =============================================================================
// Audio Format Utilities
// =============================================================================

/**
 * Convert Float32Array to Int16Array for Deepgram
 * Ported from: /Archive/Hybrid-Coach-GPU/services/streamingSTT.js
 */
export function convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp values to prevent overflow
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return int16Array;
}

/**
 * Convert Int16Array to Float32Array for playback
 */
export function convertInt16ToFloat32(int16Array: Int16Array): Float32Array {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 0x8000;
  }
  return float32Array;
}

/**
 * Calculate audio duration from buffer size
 * @param bufferSizeBytes Size in bytes
 * @param sampleRate Sample rate in Hz
 * @param bytesPerSample Bytes per sample (2 for Int16)
 * @param channels Number of audio channels
 */
export function calculateAudioDuration(
  bufferSizeBytes: number,
  sampleRate: number = 24000,
  bytesPerSample: number = 2,
  channels: number = 1
): number {
  return bufferSizeBytes / (sampleRate * bytesPerSample * channels);
}

export default {
  // STT
  DEFAULT_STT_CONFIG,
  createSttInstance,
  
  // TTS
  DEFAULT_TTS_CONFIG,
  AVAILABLE_VOICES,
  createTtsInstance,
  
  // KeepAlive
  KeepAliveManager,
  
  // Audio utilities
  convertFloat32ToInt16,
  convertInt16ToFloat32,
  calculateAudioDuration,
};
