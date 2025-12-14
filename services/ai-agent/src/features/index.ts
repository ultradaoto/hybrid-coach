/**
 * Features Module
 * 
 * Exports all feature modules for the AI Agent:
 * - Coach Whisper: Silent context injection for coach guidance
 * - Function Calling: Mid-conversation API calls for client data, insights, exercises
 */

export {
  CoachWhisperManager,
  createCoachWhisperManager,
  type WhisperEvent,
  type WhisperConfig,
} from './coach-whisper.js';

export {
  FunctionCallingHandler,
  createFunctionCallingHandler,
  createDefaultHandlers,
  COACHING_FUNCTIONS,
  GET_CLIENT_HISTORY,
  LOG_SESSION_INSIGHT,
  GET_VAGUS_EXERCISES,
  type FunctionResult,
  type FunctionHandler,
  type RegisteredFunction,
} from './function-calling.js';
