/**
 * Function Calling Handler
 * 
 * Implements function calling for the Voice Agent.
 * The agent can call defined functions mid-conversation to:
 * - Fetch client history
 * - Log session insights
 * - Get exercise recommendations
 * 
 * Flow:
 * 1. Define functions in Voice Agent Settings
 * 2. Agent decides to call a function based on conversation
 * 3. We receive FunctionCallRequest event
 * 4. Execute the function and send FunctionCallResponse
 * 5. Agent uses the response in its next utterance
 */

import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import type {
  FunctionDefinition,
  FunctionCallRequestEvent,
  FunctionCallResponseMessage,
} from '../types/deepgram-events.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Function execution result
 */
export interface FunctionResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Function handler signature
 */
export type FunctionHandler = (
  input: Record<string, unknown>
) => Promise<FunctionResult> | FunctionResult;

/**
 * Registered function with its handler
 */
export interface RegisteredFunction {
  definition: FunctionDefinition;
  handler: FunctionHandler;
}

// =============================================================================
// Pre-defined Function Definitions
// =============================================================================

/**
 * Get client history function definition
 */
export const GET_CLIENT_HISTORY: FunctionDefinition = {
  name: 'get_client_history',
  description: 'Fetch previous session notes, preferences, and coaching history for a client',
  parameters: {
    type: 'object',
    properties: {
      client_id: {
        type: 'string',
        description: 'The client identifier',
      },
    },
    required: ['client_id'],
  },
};

/**
 * Log session insight function definition
 */
export const LOG_SESSION_INSIGHT: FunctionDefinition = {
  name: 'log_session_insight',
  description: 'Log an important insight, breakthrough, or action item from the session',
  parameters: {
    type: 'object',
    properties: {
      insight: {
        type: 'string',
        description: 'The insight or observation to log',
      },
      category: {
        type: 'string',
        enum: ['breakthrough', 'concern', 'goal', 'action_item'],
        description: 'Category of the insight',
      },
    },
    required: ['insight', 'category'],
  },
};

/**
 * Get vagus nerve exercises function definition
 */
export const GET_VAGUS_EXERCISES: FunctionDefinition = {
  name: 'get_vagus_exercises',
  description: 'Get recommended vagus nerve exercises based on current symptoms',
  parameters: {
    type: 'object',
    properties: {
      symptoms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Current symptoms like anxiety, insomnia, stress, tension',
      },
    },
    required: ['symptoms'],
  },
};

/**
 * All coaching function definitions
 */
export const COACHING_FUNCTIONS: FunctionDefinition[] = [
  GET_CLIENT_HISTORY,
  LOG_SESSION_INSIGHT,
  GET_VAGUS_EXERCISES,
];

// =============================================================================
// Function Calling Handler
// =============================================================================

/**
 * Manages function calling for the Voice Agent
 */
export class FunctionCallingHandler extends EventEmitter {
  private voiceAgentWs: WebSocket | null = null;
  private registeredFunctions: Map<string, RegisteredFunction> = new Map();
  private callLog: Array<{
    functionName: string;
    input: Record<string, unknown>;
    output: string;
    timestamp: Date;
    success: boolean;
  }> = [];
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    super();
    this.verbose = verbose;
    console.log('[FunctionCalling] 🔧 Handler initialized');
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`[FunctionCalling] ${message}`);
    }
  }

  /**
   * Set the Voice Agent WebSocket connection
   */
  setConnection(ws: WebSocket): void {
    this.voiceAgentWs = ws;
    this.log('🔌 Connection set');
  }

  /**
   * Register a function with its handler
   */
  registerFunction(definition: FunctionDefinition, handler: FunctionHandler): void {
    this.registeredFunctions.set(definition.name, {
      definition,
      handler,
    });
    console.log(`[FunctionCalling] ✅ Registered function: ${definition.name}`);
  }

  /**
   * Register multiple functions
   */
  registerFunctions(functions: Array<{ definition: FunctionDefinition; handler: FunctionHandler }>): void {
    for (const fn of functions) {
      this.registerFunction(fn.definition, fn.handler);
    }
  }

  /**
   * Get all registered function definitions
   * Use this when building Voice Agent Settings
   */
  getFunctionDefinitions(): FunctionDefinition[] {
    return Array.from(this.registeredFunctions.values()).map(f => f.definition);
  }

  /**
   * Handle a function call request from the Voice Agent
   */
  async handleFunctionCallRequest(event: FunctionCallRequestEvent): Promise<void> {
    const { function_name, function_call_id, input } = event;

    console.log(`[FunctionCalling] 📞 Function call: ${function_name}`);
    this.log(`Input: ${JSON.stringify(input)}`);

    const registered = this.registeredFunctions.get(function_name);
    
    if (!registered) {
      console.error(`[FunctionCalling] ❌ Unknown function: ${function_name}`);
      this.sendResponse(function_call_id, {
        error: `Unknown function: ${function_name}`,
      });
      return;
    }

    try {
      // Execute the handler
      const result = await registered.handler(input);

      // Log the call
      this.callLog.push({
        functionName: function_name,
        input,
        output: result.output,
        timestamp: new Date(),
        success: result.success,
      });

      // Send response back to Voice Agent
      this.sendResponse(function_call_id, result.success ? result.output : { error: result.error });

      // Emit event
      this.emit('function-executed', {
        functionName: function_name,
        input,
        result,
        timestamp: new Date(),
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[FunctionCalling] ❌ Execution error:`, error);
      
      this.sendResponse(function_call_id, { error: errorMessage });
      
      this.emit('function-error', {
        functionName: function_name,
        input,
        error: errorMessage,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Send function call response to Voice Agent
   */
  private sendResponse(functionCallId: string, output: unknown): void {
    if (!this.voiceAgentWs || this.voiceAgentWs.readyState !== 1) {
      console.error('[FunctionCalling] ❌ Cannot send response - not connected');
      return;
    }

    const message: FunctionCallResponseMessage = {
      type: 'FunctionCallResponse',
      function_call_id: functionCallId,
      output: typeof output === 'string' ? output : JSON.stringify(output),
    };

    this.voiceAgentWs.send(JSON.stringify(message));
    this.log(`📤 Sent response for ${functionCallId}`);
  }

  /**
   * Get call log
   */
  getCallLog() {
    return [...this.callLog];
  }

  /**
   * Clear call log
   */
  clearCallLog(): void {
    this.callLog = [];
    this.log('🧹 Call log cleared');
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.registeredFunctions.clear();
    this.callLog = [];
    this.voiceAgentWs = null;
    console.log('[FunctionCalling] 🧹 Cleaned up');
  }
}

// =============================================================================
// Default Function Handlers
// =============================================================================

/**
 * Create default coaching function handlers
 * These are examples - replace with actual database/API calls
 */
export function createDefaultHandlers(): Array<{
  definition: FunctionDefinition;
  handler: FunctionHandler;
}> {
  return [
    {
      definition: GET_CLIENT_HISTORY,
      handler: async (input) => {
        const clientId = input.client_id as string;
        
        // TODO: Replace with actual database query
        console.log(`[FunctionCalling] 📚 Fetching history for client: ${clientId}`);
        
        // Mock response
        return {
          success: true,
          output: JSON.stringify({
            previousSessions: 3,
            lastSession: '2024-12-10',
            notes: 'Client has been working on stress management. Responds well to breathing exercises.',
            preferences: ['guided breathing', 'evening sessions'],
            goals: ['reduce anxiety', 'improve sleep'],
          }),
        };
      },
    },
    {
      definition: LOG_SESSION_INSIGHT,
      handler: async (input) => {
        const insight = input.insight as string;
        const category = input.category as string;
        
        // TODO: Replace with actual database insert
        console.log(`[FunctionCalling] 📝 Logging insight [${category}]: ${insight}`);
        
        return {
          success: true,
          output: `Insight logged: [${category}] ${insight}`,
        };
      },
    },
    {
      definition: GET_VAGUS_EXERCISES,
      handler: async (input) => {
        const symptoms = input.symptoms as string[];
        
        console.log(`[FunctionCalling] 🏃 Getting exercises for: ${symptoms.join(', ')}`);
        
        // Exercise recommendations based on symptoms
        const exercises: Record<string, string[]> = {
          anxiety: [
            '4-7-8 breathing: Inhale 4 seconds, hold 7, exhale 8',
            'Cold water face immersion for 30 seconds',
            'Humming or singing for 2-3 minutes',
          ],
          stress: [
            'Box breathing: 4 seconds each - inhale, hold, exhale, hold',
            'Gentle neck stretches and massage',
            'Progressive muscle relaxation',
          ],
          insomnia: [
            'Slow diaphragmatic breathing before bed',
            'Gargling with water for 60 seconds',
            'Relaxation body scan meditation',
          ],
          tension: [
            'Neck and shoulder rolls',
            'Massaging the carotid sinus area gently',
            'Chanting "Om" or humming',
          ],
        };

        const recommendations: string[] = [];
        for (const symptom of symptoms) {
          const lowerSymptom = symptom.toLowerCase();
          for (const [key, exs] of Object.entries(exercises)) {
            if (lowerSymptom.includes(key)) {
              recommendations.push(...exs);
            }
          }
        }

        // Remove duplicates and limit
        const uniqueExercises = [...new Set(recommendations)].slice(0, 5);

        if (uniqueExercises.length === 0) {
          return {
            success: true,
            output: JSON.stringify({
              exercises: [
                'Deep breathing: 5 slow breaths, focusing on long exhales',
                'Cold water on face or wrists',
                'Humming or singing your favorite song',
              ],
              note: 'General vagus nerve exercises for wellness',
            }),
          };
        }

        return {
          success: true,
          output: JSON.stringify({
            exercises: uniqueExercises,
            targetSymptoms: symptoms,
          }),
        };
      },
    },
  ];
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a function calling handler with default coaching functions
 */
export function createFunctionCallingHandler(verbose: boolean = false): FunctionCallingHandler {
  const handler = new FunctionCallingHandler(verbose);
  handler.registerFunctions(createDefaultHandlers());
  return handler;
}

// =============================================================================
// Exports
// =============================================================================

export default FunctionCallingHandler;
