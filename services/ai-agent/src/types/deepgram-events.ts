/**
 * Deepgram Voice Agent Event Types
 * 
 * Comprehensive type definitions for all Deepgram Voice Agent API events.
 * 
 * References:
 * - Deepgram Voice Agent API: https://developers.deepgram.com/docs/voice-agent-api
 * - Voice Agent Events: https://developers.deepgram.com/docs/voice-agent-events
 */

// =============================================================================
// Server → Client Events
// =============================================================================

/**
 * Welcome message sent after connection opens
 */
export interface WelcomeEvent {
  type: 'Welcome';
  session_id: string;
}

/**
 * Confirmation that settings were applied
 */
export interface SettingsAppliedEvent {
  type: 'SettingsApplied';
}

/**
 * User started speaking (VAD detected speech)
 * Use this to implement barge-in (stop AI audio playback)
 */
export interface UserStartedSpeakingEvent {
  type: 'UserStartedSpeaking';
}

/**
 * User stopped speaking (VAD detected end of speech)
 */
export interface UserStoppedSpeakingEvent {
  type: 'UserStoppedSpeaking';
}

/**
 * Agent started speaking (TTS audio is being sent)
 */
export interface AgentStartedSpeakingEvent {
  type: 'AgentStartedSpeaking';
}

/**
 * Agent finished speaking (all TTS audio has been sent)
 */
export interface AgentAudioDoneEvent {
  type: 'AgentAudioDone';
}

/**
 * Conversation text - transcripts for both user and agent
 * This is the primary way to get transcripts without separate STT connection
 */
export interface ConversationTextEvent {
  type: 'ConversationText';
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Confirmation that prompt was updated via UpdatePrompt
 */
export interface PromptUpdatedEvent {
  type: 'PromptUpdated';
}

/**
 * Function call request from the agent
 * The agent wants to call a function you defined in Settings
 */
export interface FunctionCallRequestEvent {
  type: 'FunctionCallRequest';
  function_name: string;
  function_call_id: string;
  input: Record<string, unknown>;
}

/**
 * Error event from the Voice Agent
 */
export interface VoiceAgentErrorEvent {
  type: 'Error';
  code: string;
  message: string;
}

/**
 * Metadata about the session
 */
export interface MetadataEvent {
  type: 'Metadata';
  request_id: string;
  model_info: {
    name: string;
    version: string;
  };
}

/**
 * History event - conversation history record
 * Similar to ConversationText but used for historical entries
 */
export interface HistoryEvent {
  type: 'History';
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Union type of all server events
 */
export type VoiceAgentServerEvent =
  | WelcomeEvent
  | SettingsAppliedEvent
  | UserStartedSpeakingEvent
  | UserStoppedSpeakingEvent
  | AgentStartedSpeakingEvent
  | AgentAudioDoneEvent
  | ConversationTextEvent
  | PromptUpdatedEvent
  | FunctionCallRequestEvent
  | VoiceAgentErrorEvent
  | MetadataEvent
  | HistoryEvent;

// =============================================================================
// Client → Server Messages
// =============================================================================

/**
 * Settings message - sent immediately after connection
 */
export interface SettingsMessage {
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
      functions?: FunctionDefinition[];
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
 * Function definition for agent function calling
 */
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, FunctionParameter>;
    required?: string[];
  };
}

/**
 * Function parameter definition
 */
export interface FunctionParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: { type: string };
}

/**
 * Update the agent's prompt mid-conversation
 * SILENT CONTEXT INJECTION - The new prompt affects reasoning but isn't spoken
 */
export interface UpdatePromptMessage {
  type: 'UpdatePrompt';
  prompt: string;
}

/**
 * Inject a message as if the user said it
 * Triggers agent response as if this was spoken by the user
 */
export interface InjectUserMessageMessage {
  type: 'InjectUserMessage';
  content: string;
}

/**
 * Inject a message for the agent to speak
 * Forces the agent to say this specific text
 */
export interface InjectAgentMessageMessage {
  type: 'InjectAgentMessage';
  content: string;
}

/**
 * Response to a function call request
 */
export interface FunctionCallResponseMessage {
  type: 'FunctionCallResponse';
  function_call_id: string;
  output: string;
}

/**
 * KeepAlive message to maintain connection during silence
 */
export interface KeepAliveMessage {
  type: 'KeepAlive';
}

/**
 * Clear the agent's response buffer (for barge-in)
 */
export interface ClearMessage {
  type: 'Clear';
}

/**
 * Close the stream gracefully
 */
export interface CloseStreamMessage {
  type: 'CloseStream';
}

/**
 * Union type of all client messages
 */
export type VoiceAgentClientMessage =
  | SettingsMessage
  | UpdatePromptMessage
  | InjectUserMessageMessage
  | InjectAgentMessageMessage
  | FunctionCallResponseMessage
  | KeepAliveMessage
  | ClearMessage
  | CloseStreamMessage;

// =============================================================================
// Transcription STT Events (for muted coach audio)
// =============================================================================

/**
 * Deepgram Listen API transcript result
 */
export interface TranscriptResultEvent {
  type: 'Results';
  channel: {
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
  is_final: boolean;
  start: number;
  duration: number;
  speech_final?: boolean;
}

/**
 * Speech started event from Listen API
 */
export interface SpeechStartedEvent {
  type: 'SpeechStarted';
}

/**
 * Utterance end event from Listen API
 */
export interface UtteranceEndEvent {
  type: 'UtteranceEnd';
}

// =============================================================================
// Session and Transcript Types
// =============================================================================

/**
 * Transcript entry for logging
 */
export interface TranscriptEntry {
  sessionId: string;
  role: 'user' | 'assistant' | 'coach';
  content: string;
  timestamp: Date;
  source: 'voice_agent' | 'stt_muted_coach';
  isFinal: boolean;
}

/**
 * Session insight logged by function calling
 */
export interface SessionInsight {
  sessionId: string;
  insight: string;
  category: 'breakthrough' | 'concern' | 'goal' | 'action_item';
  timestamp: Date;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  // Type exports are implicit via TypeScript
};
