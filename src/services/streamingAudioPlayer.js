/**
 * StreamingAudioPlayer - Progressive audio playback for streaming AI responses
 * 
 * Manages real-time audio chunk playback with seamless transitions between sentences.
 * Optimized for sub-second latency and smooth conversation flow.
 */

class StreamingAudioPlayer {
  constructor(options = {}) {
    // Audio queue management
    this.audioQueue = new Map(); // sequence -> audio data
    this.playbackPosition = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.isComplete = false;
    
    // Web Audio API setup
    this.audioContext = null;
    this.gainNode = null;
    this.currentSource = null;
    
    // Configuration
    this.config = {
      transitionGap: options.transitionGap || 25,     // 25ms between sentences
      fadeInDuration: options.fadeInDuration || 0.01, // 10ms fade-in
      maxQueueSize: options.maxQueueSize || 10,       // Prevent memory issues
      playbackTimeout: options.playbackTimeout || 5000 // 5s timeout per chunk
    };
    
    // Performance tracking
    this.metrics = {
      firstChunkReceived: null,
      firstAudioPlayed: null,
      chunksReceived: 0,
      chunksPlayed: 0,
      totalAudioDuration: 0,
      averageChunkSize: 0,
      playbackErrors: 0,
      queueWaitTimes: []
    };
    
    // Event callbacks
    this.onFirstAudioCallback = null;
    this.onPlaybackCompleteCallback = null;
    this.onErrorCallback = null;
    
    this.initializeAudioContext();
    
    console.log('[STREAMING_PLAYER] 🎵 Initialized with config:', this.config);
  }

  /**
   * Initialize Web Audio API context and nodes
   */
  async initializeAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create gain node for smooth volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(1.0, this.audioContext.currentTime);
      this.gainNode.connect(this.audioContext.destination);
      
      // Handle audio context state
      if (this.audioContext.state === 'suspended') {
        console.log('[STREAMING_PLAYER] ⏸️ Audio context suspended, will resume on first interaction');
      }
      
      console.log('[STREAMING_PLAYER] ✅ Web Audio API initialized');
    } catch (error) {
      console.error('[STREAMING_PLAYER] ❌ Failed to initialize audio context:', error);
      this.handleError('audio_init_failed', error);
    }
  }

  /**
   * Add audio chunk to playback queue
   * @param {Object} chunkData - Audio chunk from GPU
   */
  onChunkReceived(chunkData) {
    const receiveTime = Date.now();
    
    // Track first chunk metrics
    if (!this.metrics.firstChunkReceived) {
      this.metrics.firstChunkReceived = receiveTime;
      console.log(`[STREAMING_PLAYER] 🎯 First audio chunk received (${chunkData.audioData?.length || 0} chars)`);
    }
    
    // Validate chunk data
    if (!this.validateChunk(chunkData)) {
      console.error('[STREAMING_PLAYER] ❌ Invalid chunk data:', chunkData);
      return;
    }
    
    // Add to queue with metadata
    const enrichedChunk = {
      ...chunkData,
      receivedAt: receiveTime,
      queuedAt: receiveTime,
      status: 'queued'
    };
    
    this.audioQueue.set(chunkData.sequence, enrichedChunk);
    this.metrics.chunksReceived++;
    
    // Update average chunk size
    const audioSize = chunkData.audioData?.length || 0;
    this.metrics.averageChunkSize = 
      (this.metrics.averageChunkSize * (this.metrics.chunksReceived - 1) + audioSize) / 
      this.metrics.chunksReceived;
    
    console.log(`[STREAMING_PLAYER] 📦 Queued chunk ${chunkData.sequence}, queue size: ${this.audioQueue.size}`);
    
    // Start immediate playback if this is the first chunk and we're not already playing
    if (chunkData.sequence === 0 && !this.isPlaying && !this.isPaused) {
      this.startPlayback();
    }
    
    // Check if we can continue playback if we were waiting
    if (!this.isPlaying && this.audioQueue.has(this.playbackPosition)) {
      this.startPlayback();
    }
  }

  /**
   * Validate incoming audio chunk
   * @param {Object} chunk - Chunk to validate
   * @returns {boolean} True if valid
   */
  validateChunk(chunk) {
    if (!chunk) return false;
    if (typeof chunk.sequence !== 'number') return false;
    if (!chunk.audioData || chunk.audioData.length < 100) return false;
    if (!chunk.mimeType) return false;
    
    return true;
  }

  /**
   * Start progressive audio playback
   */
  async startPlayback() {
    if (this.isPlaying || this.isPaused) {
      console.log('[STREAMING_PLAYER] ⚠️ Playback already active, ignoring start request');
      return;
    }
    
    // Resume audio context if needed
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('[STREAMING_PLAYER] ▶️ Audio context resumed');
      } catch (error) {
        console.error('[STREAMING_PLAYER] ❌ Failed to resume audio context:', error);
        this.handleError('context_resume_failed', error);
        return;
      }
    }
    
    this.isPlaying = true;
    console.log('[STREAMING_PLAYER] 🎵 Starting progressive playback...');
    
    // Continue playing chunks in sequence
    while (this.isPlaying && !this.isPaused) {
      if (this.audioQueue.has(this.playbackPosition)) {
        const chunk = this.audioQueue.get(this.playbackPosition);
        
        try {
          await this.playChunk(chunk);
          
          // Clean up played chunk
          this.audioQueue.delete(this.playbackPosition);
          this.playbackPosition++;
          this.metrics.chunksPlayed++;
          
          console.log(`[STREAMING_PLAYER] ✅ Played chunk ${this.playbackPosition - 1}, next: ${this.playbackPosition}`);
          
        } catch (error) {
          console.error(`[STREAMING_PLAYER] ❌ Failed to play chunk ${this.playbackPosition}:`, error);
          this.metrics.playbackErrors++;
          
          // Skip failed chunk and continue
          this.audioQueue.delete(this.playbackPosition);
          this.playbackPosition++;
          
          this.handleError('chunk_playback_failed', error, this.playbackPosition - 1);
        }
      } else {
        // No more chunks available, wait or complete
        if (this.isComplete) {
          console.log('[STREAMING_PLAYER] 🎊 All chunks played, playback complete');
          this.stopPlayback();
          break;
        } else {
          // Wait for more chunks with timeout
          console.log(`[STREAMING_PLAYER] ⏳ Waiting for chunk ${this.playbackPosition}...`);
          const waitStart = Date.now();
          
          const chunkArrived = await this.waitForChunk(this.playbackPosition, this.config.playbackTimeout);
          
          if (!chunkArrived) {
            console.warn(`[STREAMING_PLAYER] ⚠️ Timeout waiting for chunk ${this.playbackPosition}, completing playback`);
            this.stopPlayback();
            break;
          }
          
          const waitTime = Date.now() - waitStart;
          this.metrics.queueWaitTimes.push(waitTime);
          console.log(`[STREAMING_PLAYER] ✅ Chunk ${this.playbackPosition} arrived after ${waitTime}ms`);
        }
      }
    }
  }

  /**
   * Play individual audio chunk
   * @param {Object} chunk - Audio chunk to play
   * @returns {Promise} Resolves when chunk finishes playing
   */
  async playChunk(chunk) {
    chunk.status = 'playing';
    chunk.playStartTime = Date.now();
    
    // Track first audio playback
    if (!this.metrics.firstAudioPlayed) {
      this.metrics.firstAudioPlayed = chunk.playStartTime;
      const totalLatency = this.metrics.firstAudioPlayed - (window.speechStartTime || this.metrics.firstChunkReceived);
      
      console.log(`[STREAMING_PLAYER] 🎉 FIRST AUDIO PLAYING! Total latency: ${totalLatency}ms`);
      
      // Trigger callback
      if (this.onFirstAudioCallback) {
        this.onFirstAudioCallback(totalLatency);
      }
    }
    
    // Convert base64 to audio buffer
    const audioBlob = this.base64ToBlob(chunk.audioData, chunk.mimeType);
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    // Track audio duration
    this.metrics.totalAudioDuration += audioBuffer.duration;
    
    return new Promise((resolve, reject) => {
      try {
        // Create buffer source
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        this.currentSource = source;
        
        // Apply smooth fade-in for seamless transitions
        const currentTime = this.audioContext.currentTime;
        this.gainNode.gain.setValueAtTime(0.9, currentTime);
        this.gainNode.gain.linearRampToValueAtTime(1.0, currentTime + this.config.fadeInDuration);
        
        // Connect to output
        source.connect(this.gainNode);
        
        // Handle playback completion
        source.onended = () => {
          chunk.status = 'completed';
          chunk.playEndTime = Date.now();
          this.currentSource = null;
          
          const playDuration = chunk.playEndTime - chunk.playStartTime;
          console.log(`[STREAMING_PLAYER] 🎵 Chunk ${chunk.sequence} completed (${playDuration}ms)`);
          
          // Small gap between sentences for natural flow
          setTimeout(resolve, this.config.transitionGap);
        };
        
        // Handle playback errors
        source.onerror = (error) => {
          chunk.status = 'failed';
          this.currentSource = null;
          reject(error);
        };
        
        // Start playback
        source.start();
        
        console.log(`[STREAMING_PLAYER] ▶️ Playing chunk ${chunk.sequence} (${audioBuffer.duration.toFixed(2)}s)`);
        
      } catch (error) {
        chunk.status = 'failed';
        reject(error);
      }
    });
  }

  /**
   * Wait for specific chunk to arrive
   * @param {number} sequence - Chunk sequence number
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<boolean>} True if chunk arrived
   */
  waitForChunk(sequence, timeout) {
    return new Promise((resolve) => {
      const checkInterval = 100; // Check every 100ms
      let elapsed = 0;
      
      const check = () => {
        if (this.audioQueue.has(sequence)) {
          resolve(true);
        } else if (elapsed >= timeout) {
          resolve(false);
        } else {
          elapsed += checkInterval;
          setTimeout(check, checkInterval);
        }
      };
      
      check();
    });
  }

  /**
   * Stop playback and clean up
   */
  stopPlayback() {
    this.isPlaying = false;
    
    // Stop current audio source
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource = null;
      } catch (error) {
        // Source might already be stopped
        console.log('[STREAMING_PLAYER] ℹ️ Source already stopped');
      }
    }
    
    // Log final metrics
    this.logFinalMetrics();
    
    // Trigger completion callback
    if (this.onPlaybackCompleteCallback) {
      this.onPlaybackCompleteCallback(this.getMetrics());
    }
    
    console.log('[STREAMING_PLAYER] ⏹️ Playback stopped');
  }

  /**
   * Pause playback
   */
  pause() {
    this.isPaused = true;
    
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }
    
    console.log('[STREAMING_PLAYER] ⏸️ Playback paused');
  }

  /**
   * Resume playback
   */
  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      console.log('[STREAMING_PLAYER] ▶️ Playback resumed');
      
      // Continue from current position
      if (!this.isPlaying) {
        this.startPlayback();
      }
    }
  }

  /**
   * Mark streaming as complete (no more chunks expected)
   */
  markComplete() {
    this.isComplete = true;
    console.log('[STREAMING_PLAYER] 🏁 Streaming marked complete');
    
    // If we're waiting and no more chunks are coming, stop
    if (!this.isPlaying && this.audioQueue.size === 0) {
      this.stopPlayback();
    }
  }

  /**
   * Convert base64 to blob
   * @param {string} base64 - Base64 audio data
   * @param {string} mimeType - Audio MIME type
   * @returns {Blob} Audio blob
   */
  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  /**
   * Handle errors
   * @param {string} type - Error type
   * @param {Error} error - Error object
   * @param {*} context - Additional context
   */
  handleError(type, error, context = null) {
    console.error(`[STREAMING_PLAYER] ❌ Error (${type}):`, error, context);
    
    if (this.onErrorCallback) {
      this.onErrorCallback(type, error, context);
    }
  }

  /**
   * Log final performance metrics
   */
  logFinalMetrics() {
    const totalTime = this.metrics.firstAudioPlayed ? 
      Date.now() - this.metrics.firstAudioPlayed : 0;
    
    const averageWaitTime = this.metrics.queueWaitTimes.length > 0 ?
      this.metrics.queueWaitTimes.reduce((a, b) => a + b, 0) / this.metrics.queueWaitTimes.length : 0;
    
    console.log('[STREAMING_PLAYER] 📊 Final Performance Metrics:', {
      chunksReceived: this.metrics.chunksReceived,
      chunksPlayed: this.metrics.chunksPlayed,
      playbackErrors: this.metrics.playbackErrors,
      totalAudioDuration: `${this.metrics.totalAudioDuration.toFixed(2)}s`,
      averageChunkSize: `${Math.round(this.metrics.averageChunkSize)} chars`,
      averageWaitTime: `${Math.round(averageWaitTime)}ms`,
      totalPlaybackTime: `${totalTime}ms`,
      successRate: `${((this.metrics.chunksPlayed / this.metrics.chunksReceived) * 100).toFixed(1)}%`
    });
  }

  /**
   * Get current performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.audioQueue.size,
      currentPosition: this.playbackPosition,
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      isComplete: this.isComplete
    };
  }

  /**
   * Reset player for new conversation
   */
  reset() {
    console.log('[STREAMING_PLAYER] 🔄 Resetting for new conversation');
    
    // Stop current playback
    this.stopPlayback();
    
    // Clear queue and state
    this.audioQueue.clear();
    this.playbackPosition = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.isComplete = false;
    this.currentSource = null;
    
    // Reset metrics
    this.metrics = {
      firstChunkReceived: null,
      firstAudioPlayed: null,
      chunksReceived: 0,
      chunksPlayed: 0,
      totalAudioDuration: 0,
      averageChunkSize: 0,
      playbackErrors: 0,
      queueWaitTimes: []
    };
  }

  /**
   * Set event callbacks
   * @param {Function} onFirstAudio - Called when first audio starts
   * @param {Function} onComplete - Called when playback completes
   * @param {Function} onError - Called on errors
   */
  setCallbacks(onFirstAudio, onComplete, onError) {
    this.onFirstAudioCallback = onFirstAudio;
    this.onPlaybackCompleteCallback = onComplete;
    this.onErrorCallback = onError;
  }
}

export { StreamingAudioPlayer };