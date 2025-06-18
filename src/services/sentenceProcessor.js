/**
 * SentenceProcessor - Real-time sentence extraction and chunking for streaming AI responses
 * 
 * Processes OpenAI streaming responses in real-time, extracting complete sentences
 * and preparing them for parallel TTS processing on the GPU.
 */

class SentenceProcessor {
  constructor(options = {}) {
    this.buffer = '';
    this.sequenceNumber = 0;
    this.previousSentence = null;
    this.totalSentences = 0;
    this.isStreamComplete = false;
    
    // Configurable thresholds
    this.minLength = options.minLength || 20;  // Avoid tiny chunks
    this.maxLength = options.maxLength || 150; // Prevent oversized chunks
    this.sessionId = options.sessionId || null;
    
    // Advanced sentence boundary patterns
    this.sentenceEndPatterns = [
      /[.!?]+\s+(?=[A-Z])/g,     // Standard sentence endings followed by capital
      /[.!?]+\s*$/g,             // Sentence endings at end of text
      /[.!?]+\s+(?=["'])/g,      // Sentence endings followed by quotes
      /[.!?]+["']\s+(?=[A-Z])/g  // Sentence endings with closing quotes
    ];
    
    // Abbreviation patterns to avoid false sentence breaks
    this.abbreviations = new Set([
      'Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'etc', 'vs', 'e.g', 'i.e',
      'Sr', 'Jr', 'Ph.D', 'M.D', 'B.A', 'M.A', 'U.S', 'U.K'
    ]);
    
    // Performance tracking
    this.metrics = {
      totalChunks: 0,
      averageChunkLength: 0,
      processingTimes: [],
      startTime: Date.now()
    };
    
    console.log('[SENTENCE_PROCESSOR] 🧠 Initialized with config:', {
      minLength: this.minLength,
      maxLength: this.maxLength,
      sessionId: this.sessionId
    });
  }

  /**
   * Process a chunk of streaming text from OpenAI
   * @param {string} chunk - New text chunk from streaming response
   * @returns {Array} Array of complete sentence objects ready for TTS
   */
  processChunk(chunk) {
    const startTime = Date.now();
    
    // Add to buffer
    this.buffer += chunk;
    
    // Extract complete sentences
    const sentences = this.extractCompleteSentences();
    
    // Track performance
    const processingTime = Date.now() - startTime;
    this.metrics.processingTimes.push(processingTime);
    
    if (sentences.length > 0) {
      console.log(`[SENTENCE_PROCESSOR] 📝 Extracted ${sentences.length} sentences in ${processingTime}ms`);
      sentences.forEach(sentence => {
        console.log(`[SENTENCE_PROCESSOR] ✅ Sentence ${sentence.sequence}: "${sentence.text.substring(0, 50)}..."`);
      });
    }
    
    return sentences;
  }

  /**
   * Extract complete sentences from the current buffer
   * @returns {Array} Array of sentence chunk objects
   */
  extractCompleteSentences() {
    const sentences = [];
    let workingBuffer = this.buffer;
    let extractedLength = 0;
    
    // Try each sentence ending pattern
    for (const pattern of this.sentenceEndPatterns) {
      pattern.lastIndex = 0; // Reset regex
      let match;
      
      while ((match = pattern.exec(workingBuffer)) !== null) {
        const potentialSentence = workingBuffer.substring(0, match.index + match[0].length).trim();
        
        // Validate sentence
        if (this.isValidSentence(potentialSentence)) {
          const sentence = this.createSentenceChunk(potentialSentence);
          sentences.push(sentence);
          
          // Update working buffer
          const remainingText = workingBuffer.substring(match.index + match[0].length);
          workingBuffer = remainingText;
          extractedLength += match.index + match[0].length;
          
          // Reset pattern for next iteration
          pattern.lastIndex = 0;
          break; // Move to next pattern iteration
        }
      }
    }
    
    // Update main buffer with remaining text
    this.buffer = workingBuffer;
    
    return sentences;
  }

  /**
   * Validate if extracted text is a proper sentence
   * @param {string} sentence - Potential sentence text
   * @returns {boolean} True if valid sentence
   */
  isValidSentence(sentence) {
    // Length validation
    if (sentence.length < this.minLength) {
      console.log(`[SENTENCE_PROCESSOR] ⚠️ Sentence too short (${sentence.length} < ${this.minLength}): "${sentence}"`);
      return false;
    }
    
    if (sentence.length > this.maxLength) {
      console.log(`[SENTENCE_PROCESSOR] ⚠️ Sentence too long (${sentence.length} > ${this.maxLength}): "${sentence.substring(0, 50)}..."`);
      // Split long sentences at commas or semicolons
      return this.shouldSplitLongSentence(sentence);
    }
    
    // Check for common abbreviations that shouldn't end sentences
    if (this.endsWithAbbreviation(sentence)) {
      console.log(`[SENTENCE_PROCESSOR] ⚠️ Ends with abbreviation: "${sentence.substring(sentence.length - 10)}"`);
      return false;
    }
    
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(sentence)) {
      console.log(`[SENTENCE_PROCESSOR] ⚠️ No letters found: "${sentence}"`);
      return false;
    }
    
    return true;
  }

  /**
   * Check if sentence ends with a common abbreviation
   * @param {string} sentence - Sentence to check
   * @returns {boolean} True if ends with abbreviation
   */
  endsWithAbbreviation(sentence) {
    const words = sentence.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    if (!lastWord) return false;
    
    // Remove punctuation and check against abbreviations
    const cleanWord = lastWord.replace(/[.!?]+$/, '');
    return this.abbreviations.has(cleanWord);
  }

  /**
   * Determine if long sentence should be split
   * @param {string} sentence - Long sentence to evaluate
   * @returns {boolean} True if should split
   */
  shouldSplitLongSentence(sentence) {
    // For now, reject overly long sentences
    // Future enhancement: split at natural break points
    return false;
  }

  /**
   * Create a structured sentence chunk object for GPU processing
   * @param {string} text - Sentence text
   * @returns {Object} Sentence chunk object
   */
  createSentenceChunk(text) {
    const chunk = {
      type: 'sentence_chunk',
      sequence: this.sequenceNumber,
      text: text,
      context: {
        previous: this.previousSentence,
        hasNext: !this.isStreamComplete, // Will be updated when stream ends
        position: this.getPosition(),
        totalSentences: null // Will be set when stream completes
      },
      sessionId: this.sessionId,
      timestamp: Date.now(),
      metadata: {
        length: text.length,
        wordCount: text.split(/\s+/).length,
        processingOrder: this.sequenceNumber
      }
    };
    
    // Update state
    this.previousSentence = text;
    this.sequenceNumber++;
    this.totalSentences++;
    
    // Update metrics
    this.metrics.totalChunks++;
    this.metrics.averageChunkLength = 
      (this.metrics.averageChunkLength * (this.metrics.totalChunks - 1) + text.length) / 
      this.metrics.totalChunks;
    
    return chunk;
  }

  /**
   * Get position indicator for current sentence
   * @returns {string} Position indicator
   */
  getPosition() {
    if (this.sequenceNumber === 0) return 'first';
    if (this.isStreamComplete) return 'last';
    return 'middle';
  }

  /**
   * Process final buffer content when stream completes
   * @returns {Array} Final sentences from remaining buffer
   */
  finalize() {
    console.log('[SENTENCE_PROCESSOR] 🏁 Finalizing stream processing...');
    
    this.isStreamComplete = true;
    const finalSentences = [];
    
    // Process remaining buffer content
    if (this.buffer.trim().length >= this.minLength) {
      const finalSentence = this.createSentenceChunk(this.buffer.trim());
      finalSentence.context.position = 'last';
      finalSentence.context.hasNext = false;
      finalSentences.push(finalSentence);
      
      console.log(`[SENTENCE_PROCESSOR] ✅ Final sentence: "${finalSentence.text}"`);
    }
    
    // Update all previous sentences with total count
    this.totalSentences = this.sequenceNumber;
    
    // Log final metrics
    const totalTime = Date.now() - this.metrics.startTime;
    const avgProcessingTime = this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length;
    
    console.log('[SENTENCE_PROCESSOR] 📊 Final metrics:', {
      totalSentences: this.totalSentences,
      totalProcessingTime: totalTime,
      averageChunkLength: Math.round(this.metrics.averageChunkLength),
      averageProcessingTime: Math.round(avgProcessingTime),
      remainingBuffer: this.buffer.length
    });
    
    return finalSentences;
  }

  /**
   * Reset processor for new conversation
   */
  reset() {
    console.log('[SENTENCE_PROCESSOR] 🔄 Resetting for new conversation');
    
    this.buffer = '';
    this.sequenceNumber = 0;
    this.previousSentence = null;
    this.totalSentences = 0;
    this.isStreamComplete = false;
    
    this.metrics = {
      totalChunks: 0,
      averageChunkLength: 0,
      processingTimes: [],
      startTime: Date.now()
    };
  }

  /**
   * Get current processing statistics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentBufferLength: this.buffer.length,
      totalSentences: this.totalSentences,
      isComplete: this.isStreamComplete
    };
  }
}

export { SentenceProcessor };