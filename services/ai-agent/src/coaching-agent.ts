/**
 * Coaching Agent with Deepgram Integration
 * 
 * Main voice AI agent for coaching sessions.
 * Uses LiveKit Agents framework with Deepgram STT/TTS.
 * 
 * Referenced from:
 * - /Archive/Hybrid-Coach-GPU/services/streamingSTT.js (audio processing patterns)
 * - /Archive/Hybrid-Coach-GPU/services/webrtcManager.js (connection management)
 * - docs/HYBRID-COACH-ARCHITECTURE.md (agent specification)
 */

import { type JobContext, voice, llm } from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import type { RemoteParticipant, Track, Room } from '@livekit/rtc-node';

import { createSttInstance, createTtsInstance, KeepAliveManager } from './deepgram-config.js';
import { SelectiveAudioManager, DualAudioRouter, type TranscriptionEvent } from './selective-audio.js';
import { agentMetrics } from './config/deepgram.js';

// =============================================================================
// Coaching Personality Configuration
// =============================================================================

const COACHING_INSTRUCTIONS = `You are a supportive AI wellness coach specializing in vagus nerve health and stress management.

Your approach:
- Listen actively and reflect back what you hear
- Ask open-ended questions to understand the client's current state
- Provide evidence-based suggestions for vagus nerve stimulation
- Be warm, encouraging, and non-judgmental
- Keep responses concise and conversational (1-3 sentences)
- If the client mentions serious mental health concerns, gently suggest professional help

Techniques you can suggest:
- Deep breathing exercises (4-7-8 breathing, box breathing)
- Cold water face immersion or cold showers
- Humming, singing, or gargling
- Gentle neck stretches and massage
- Meditation and mindfulness practices
- Social connection and laughter

Remember: You're here to support wellness, not provide medical advice.

Start each session by warmly greeting the client and asking how they're feeling today.`;

const GREETING_MESSAGE = "Hi there! I'm your AI wellness coach. How are you feeling today?";

// =============================================================================
// Coaching Agent Class
// =============================================================================

export interface CoachingAgentOptions {
  /** Custom instructions to override default coaching personality */
  instructions?: string;
  /** Custom greeting message */
  greeting?: string;
  /** Voice model to use (see AVAILABLE_VOICES) */
  voiceModel?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

export class CoachingAgent {
  private ctx: JobContext;
  private session: voice.VoicePipelineAgent | null = null;
  private selectiveAudioManager: SelectiveAudioManager;
  private dualAudioRouter: DualAudioRouter;
  private keepAliveManager: KeepAliveManager;
  private options: CoachingAgentOptions;
  private isRunning: boolean = false;
  private transcripts: TranscriptionEvent[] = [];

  constructor(ctx: JobContext, options: CoachingAgentOptions = {}) {
    this.ctx = ctx;
    this.options = options;
    this.selectiveAudioManager = new SelectiveAudioManager();
    this.dualAudioRouter = new DualAudioRouter(this.selectiveAudioManager);
    this.keepAliveManager = new KeepAliveManager(3000); // 3 second interval

    this.log('🤖 Coaching agent created');
  }

  private log(message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    if (data && this.options.verbose) {
      console.log(`[${timestamp}] [CoachingAgent] ${message}`, data);
    } else {
      console.log(`[${timestamp}] [CoachingAgent] ${message}`);
    }
  }

  private error(message: string, err?: unknown): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [CoachingAgent] ❌ ${message}`, err);
    agentMetrics.recordError();
  }

  /**
   * Start the coaching agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.log('⚠️ Agent already running');
      return;
    }

    try {
      this.log('🚀 Starting coaching agent...');

      // Initialize selective audio with the room
      this.selectiveAudioManager.initialize(this.ctx.room as unknown as import('livekit-client').Room);

      // Set up transcription callback for coach review panel
      this.selectiveAudioManager.onTranscription((event) => {
        this.transcripts.push(event);
        this.log(`📝 Transcript: [${event.participantName}] "${event.transcript}"${event.isMutedFromAI ? ' (muted from AI)' : ''}`);
      });

      // Configure STT with Deepgram Nova-3
      const stt = createSttInstance({
        model: 'nova-3',
        language: 'en-US',
        punctuate: true,
        interimResults: true,
      });

      // Configure TTS with Deepgram Aura-2
      const tts = createTtsInstance({
        model: this.options.voiceModel || 'aura-2-thalia-en',
        sampleRate: 24000,
      });

      // Configure LLM (OpenAI GPT-4o-mini for fast, cost-effective responses)
      const chatCtx = new llm.ChatContext();
      chatCtx.append({
        role: 'system',
        content: this.options.instructions || COACHING_INSTRUCTIONS,
      });

      // Create voice pipeline agent
      this.session = new voice.VoicePipelineAgent(
        voice.defaultVadOptions,
        stt,
        llm.LLM.withOpenAI({ model: 'gpt-4o-mini' }),
        tts,
        chatCtx,
      );

      // Set up event handlers
      this.setupEventHandlers();

      // Start the voice pipeline
      this.session.start(this.ctx.room);

      this.isRunning = true;
      this.log('✅ Coaching agent started successfully');

      // Say greeting
      await this.sayGreeting();

    } catch (err) {
      this.error('Failed to start coaching agent', err);
      throw err;
    }
  }

  /**
   * Set up event handlers for the voice pipeline
   */
  private setupEventHandlers(): void {
    if (!this.session) return;

    // Handle user speech started
    this.session.on('user_speech_started', () => {
      this.log('🎤 User started speaking');
      // Stop keepAlive when user speaks
      this.keepAliveManager.stop();
    });

    // Handle user speech stopped
    this.session.on('user_speech_stopped', () => {
      this.log('🔇 User stopped speaking');
      // Could restart keepAlive here if implementing silence detection
    });

    // Handle transcription
    this.session.on('user_speech_committed', (transcript: string) => {
      const startTime = Date.now();
      this.log(`📝 User said: "${transcript}"`);
      
      // Record STT latency
      const latency = Date.now() - startTime;
      agentMetrics.recordSttLatency(latency);
    });

    // Handle agent response
    this.session.on('agent_speech_started', () => {
      this.log('🔊 Agent speaking...');
    });

    this.session.on('agent_speech_stopped', () => {
      this.log('🔇 Agent finished speaking');
    });

    // Handle errors
    this.session.on('error', (err: Error) => {
      this.error('Voice pipeline error', err);
    });
  }

  /**
   * Say the initial greeting
   */
  private async sayGreeting(): Promise<void> {
    if (!this.session) return;

    const greeting = this.options.greeting || GREETING_MESSAGE;
    this.log(`👋 Saying greeting: "${greeting}"`);
    
    try {
      await this.session.say(greeting);
    } catch (err) {
      this.error('Failed to say greeting', err);
    }
  }

  /**
   * Inject a prompt for the AI to respond to
   * Used by coaches to guide the conversation
   */
  async injectPrompt(prompt: string): Promise<void> {
    if (!this.session) {
      this.error('Cannot inject prompt - session not active');
      return;
    }

    this.log(`💉 Injecting prompt: "${prompt}"`);
    
    try {
      // Add the prompt as a system message and trigger response
      await this.session.say(prompt);
    } catch (err) {
      this.error('Failed to inject prompt', err);
    }
  }

  /**
   * Get all transcripts from the session
   * Includes transcripts from muted coaches
   */
  getTranscripts(): TranscriptionEvent[] {
    return [...this.transcripts];
  }

  /**
   * Get current session metrics
   */
  getMetrics() {
    return {
      ...agentMetrics.getMetrics(),
      transcriptCount: this.transcripts.length,
      mutedParticipants: this.selectiveAudioManager.getMutedParticipants(),
      isRunning: this.isRunning,
    };
  }

  /**
   * Stop the coaching agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.log('Agent not running');
      return;
    }

    this.log('🛑 Stopping coaching agent...');

    try {
      // Stop keepAlive
      this.keepAliveManager.cleanup();

      // Cleanup selective audio
      this.selectiveAudioManager.cleanup();

      // Close the voice session
      if (this.session) {
        await this.session.close();
        this.session = null;
      }

      this.isRunning = false;
      this.log('✅ Coaching agent stopped');

    } catch (err) {
      this.error('Error stopping agent', err);
    }
  }
}

// =============================================================================
// Simple Agent Factory
// =============================================================================

/**
 * Create a minimal coaching agent for testing
 * Joins room, transcribes audio, responds with greeting
 */
export async function createMinimalAgent(ctx: JobContext): Promise<CoachingAgent> {
  const agent = new CoachingAgent(ctx, {
    verbose: true,
    greeting: "Hello! I'm here to help. How are you feeling today?",
  });
  
  await agent.start();
  return agent;
}

export default CoachingAgent;
