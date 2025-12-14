/**
 * Opus Frame Handler
 * 
 * Handles Opus audio frames from LiveKit WebRTC tracks.
 * Deepgram accepts Opus directly - no decoding needed.
 * 
 * References:
 * - Deepgram supports Opus encoding natively
 * - WebRTC typically sends 20ms or 60ms Opus frames
 * - These are within Deepgram's recommended 20-80ms chunk size
 */

// =============================================================================
// Audio Configuration
// =============================================================================

/**
 * Audio configuration for Opus passthrough
 * WebRTC/LiveKit uses Opus at 48kHz mono by default for voice
 */
export interface AudioConfig {
  encoding: 'opus' | 'linear16';
  sampleRate: number;
  channels: number;
}

export const OPUS_CONFIG: AudioConfig = {
  encoding: 'opus',
  sampleRate: 48000,
  channels: 1,  // Mono for voice
};

export const LINEAR16_CONFIG: AudioConfig = {
  encoding: 'linear16',
  sampleRate: 24000,
  channels: 1,
};

// =============================================================================
// Deepgram WebSocket URLs
// =============================================================================

/**
 * Deepgram Voice Agent API (conversational AI)
 * Handles STT + LLM + TTS in a single WebSocket
 */
export const DEEPGRAM_VOICE_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';

/**
 * Deepgram Listen API (speech-to-text only)
 * For always-on transcription logging
 */
export function getDeepgramSttUrl(config: AudioConfig = OPUS_CONFIG): string {
  const params = new URLSearchParams({
    encoding: config.encoding,
    sample_rate: config.sampleRate.toString(),
    channels: config.channels.toString(),
    model: 'nova-3',
    punctuate: 'true',
    interim_results: 'true',
    utterance_end_ms: '1000',
    vad_events: 'true',
  });
  
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

// =============================================================================
// Opus Frame Validation
// =============================================================================

/**
 * Validate that an Opus frame is valid for sending to Deepgram
 * Never send 0-byte frames as this can cause issues
 */
export function isValidOpusFrame(frame: Buffer | Uint8Array): boolean {
  if (!frame || frame.length === 0) {
    return false;
  }
  
  // Opus frames should be at least 1 byte
  // Typical Opus frame sizes: 10-120 bytes for voice
  return frame.length >= 1;
}

/**
 * Get Opus frame duration in milliseconds
 * Opus supports frame sizes: 2.5, 5, 10, 20, 40, 60 ms
 * Most WebRTC implementations use 20ms or 60ms
 */
export function estimateOpusFrameDuration(frameSize: number): number {
  // Rough estimate based on typical bitrates
  // At 32kbps mono: 20ms frame ≈ 80 bytes
  // At 48kbps mono: 20ms frame ≈ 120 bytes
  
  if (frameSize < 50) return 10;
  if (frameSize < 100) return 20;
  if (frameSize < 200) return 40;
  return 60;
}

// =============================================================================
// Audio Frame Buffer
// =============================================================================

/**
 * Audio frame with metadata
 */
export interface AudioFrame {
  data: Buffer | Uint8Array;
  timestamp: number;
  participantId: string;
  participantName?: string;
  encoding: 'opus' | 'linear16';
  sampleRate: number;
}

/**
 * Create an audio frame from raw data
 */
export function createAudioFrame(
  data: Buffer | Uint8Array,
  participantId: string,
  participantName?: string,
  encoding: 'opus' | 'linear16' = 'opus'
): AudioFrame {
  return {
    data,
    timestamp: Date.now(),
    participantId,
    participantName,
    encoding,
    sampleRate: encoding === 'opus' ? 48000 : 24000,
  };
}

// =============================================================================
// Audio Buffer Pool (Ported from legacy)
// =============================================================================

/**
 * Reusable buffer pool to reduce GC pressure
 * Referenced from: /Archive/Hybrid-Coach-GPU/services/audioBufferPool.js
 */
export class AudioBufferPool {
  private pool: Buffer[] = [];
  private readonly bufferSize: number;
  private readonly maxPoolSize: number;

  constructor(bufferSize: number = 4096, maxPoolSize: number = 50) {
    this.bufferSize = bufferSize;
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Get a buffer from the pool or create a new one
   */
  acquire(): Buffer {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return Buffer.alloc(this.bufferSize);
  }

  /**
   * Return a buffer to the pool
   */
  release(buffer: Buffer): void {
    if (this.pool.length < this.maxPoolSize && buffer.length === this.bufferSize) {
      buffer.fill(0); // Clear the buffer
      this.pool.push(buffer);
    }
    // Otherwise let it be garbage collected
  }

  /**
   * Get pool statistics
   */
  getStats(): { poolSize: number; bufferSize: number } {
    return {
      poolSize: this.pool.length,
      bufferSize: this.bufferSize,
    };
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
  }
}

// =============================================================================
// Exports
// =============================================================================

export default {
  OPUS_CONFIG,
  LINEAR16_CONFIG,
  DEEPGRAM_VOICE_AGENT_URL,
  getDeepgramSttUrl,
  isValidOpusFrame,
  estimateOpusFrameDuration,
  createAudioFrame,
  AudioBufferPool,
};
