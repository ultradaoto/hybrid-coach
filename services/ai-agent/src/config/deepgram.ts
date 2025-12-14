/**
 * Deepgram SDK Client Setup
 * 
 * Provides validated Deepgram client configuration with environment checks.
 * Referenced from: /Archive/Hybrid-Coach-GPU/services/streamingSTT.js
 */

import 'dotenv/config';

// Environment validation
interface DeepgramEnvConfig {
  apiKey: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  openaiApiKey: string;
}

/**
 * Validates required environment variables for the AI Agent
 * Throws descriptive errors for missing configuration
 */
export function validateEnvironment(): DeepgramEnvConfig {
  const requiredVars = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  const missing: string[] = [];
  
  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[AI Agent] Missing required environment variables:\n` +
      missing.map(v => `  - ${v}`).join('\n') +
      `\n\nPlease check your .env file.`
    );
  }

  console.log('[AI Agent] ✅ Environment validation passed');
  
  return {
    apiKey: requiredVars.DEEPGRAM_API_KEY!,
    livekitUrl: requiredVars.LIVEKIT_URL!,
    livekitApiKey: requiredVars.LIVEKIT_API_KEY!,
    livekitApiSecret: requiredVars.LIVEKIT_API_SECRET!,
    openaiApiKey: requiredVars.OPENAI_API_KEY!,
  };
}

/**
 * Deepgram API key getter with validation
 */
export function getDeepgramApiKey(): string {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  
  if (!apiKey) {
    throw new Error('[AI Agent] DEEPGRAM_API_KEY is not set in environment');
  }
  
  return apiKey;
}

/**
 * LiveKit configuration getter
 */
export function getLiveKitConfig() {
  return {
    url: process.env.LIVEKIT_URL || 'ws://localhost:7880',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  };
}

/**
 * Performance metrics tracking
 * Ported from: /Archive/Hybrid-Coach-GPU/services/streamingSTT.js
 */
export interface AgentMetrics {
  totalTranscriptions: number;
  totalTTSRequests: number;
  avgSttLatency: number;
  avgTtsLatency: number;
  errors: number;
  lastActivity: Date | null;
}

export class MetricsTracker {
  private metrics: AgentMetrics = {
    totalTranscriptions: 0,
    totalTTSRequests: 0,
    avgSttLatency: 0,
    avgTtsLatency: 0,
    errors: 0,
    lastActivity: null,
  };

  recordSttLatency(latencyMs: number): void {
    this.metrics.totalTranscriptions++;
    this.metrics.avgSttLatency = this.calculateRunningAverage(
      this.metrics.avgSttLatency,
      latencyMs,
      this.metrics.totalTranscriptions
    );
    this.metrics.lastActivity = new Date();
  }

  recordTtsLatency(latencyMs: number): void {
    this.metrics.totalTTSRequests++;
    this.metrics.avgTtsLatency = this.calculateRunningAverage(
      this.metrics.avgTtsLatency,
      latencyMs,
      this.metrics.totalTTSRequests
    );
    this.metrics.lastActivity = new Date();
  }

  recordError(): void {
    this.metrics.errors++;
  }

  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  private calculateRunningAverage(currentAvg: number, newValue: number, count: number): number {
    return (currentAvg * (count - 1) + newValue) / count;
  }
}

// Global metrics instance
export const agentMetrics = new MetricsTracker();

export default {
  validateEnvironment,
  getDeepgramApiKey,
  getLiveKitConfig,
  agentMetrics,
};
