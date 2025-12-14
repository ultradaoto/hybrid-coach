/**
 * Selective Audio for Coach Mute Implementation
 * 
 * Implements the SelectiveRoomIO class that allows coaches to mute
 * their audio from AI perception while maintaining transcription.
 * 
 * Referenced from: /Archive/Hybrid-Coach-GPU/services/webrtcManager.js
 * 
 * CRITICAL FEATURE: Dual routing
 * - Audio muted from AI perception should NOT stop transcription
 * - Always-on transcription stream for coach review
 */

import type { Room, RemoteParticipant, RemoteTrack, Track, DataPacket_Kind } from 'livekit-client';

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface MuteCommand {
  type: 'mute-from-ai';
  muted: boolean;
  participantId: string;
}

export interface TranscriptionEvent {
  participantId: string;
  participantName: string;
  transcript: string;
  timestamp: Date;
  isMutedFromAI: boolean;  // True if this was from a coach who is muted from AI
}

export type TranscriptionCallback = (event: TranscriptionEvent) => void;

// =============================================================================
// Selective Audio Manager
// =============================================================================

/**
 * Manages selective audio routing for coach mute functionality
 * 
 * Features:
 * - Maintains Set<string> of muted participant identities
 * - Filters audio from muted participants for AI processing
 * - Maintains separate transcription stream for all audio (muted or not)
 * - Listens for mute commands via LiveKit data channel
 */
export class SelectiveAudioManager {
  private mutedParticipants: Set<string> = new Set();
  private room: Room | null = null;
  private transcriptionCallbacks: TranscriptionCallback[] = [];
  private isInitialized: boolean = false;

  constructor() {
    console.log('[SelectiveAudio] Manager initialized');
  }

  /**
   * Initialize with LiveKit room
   */
  initialize(room: Room): void {
    if (this.isInitialized) {
      console.warn('[SelectiveAudio] Already initialized');
      return;
    }

    this.room = room;
    this.setupDataChannelListener();
    this.isInitialized = true;
    
    console.log('[SelectiveAudio] ✅ Initialized with room');
  }

  /**
   * Set up listener for mute commands via data channel
   * Listens for { type: 'mute-from-ai', muted: boolean } messages
   */
  private setupDataChannelListener(): void {
    if (!this.room) {
      console.error('[SelectiveAudio] Cannot setup listener - no room');
      return;
    }

    this.room.on('dataReceived', (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as MuteCommand;
        
        if (message.type === 'mute-from-ai') {
          this.handleMuteCommand(message, participant);
        }
      } catch (error) {
        // Not a JSON message or not a mute command - ignore
      }
    });

    console.log('[SelectiveAudio] 📡 Data channel listener active');
  }

  /**
   * Handle incoming mute command from coach
   */
  private handleMuteCommand(command: MuteCommand, participant?: RemoteParticipant): void {
    const participantId = command.participantId || participant?.identity;
    
    if (!participantId) {
      console.warn('[SelectiveAudio] Mute command without participant ID');
      return;
    }

    if (command.muted) {
      this.mutedParticipants.add(participantId);
      console.log(`[SelectiveAudio] 🔇 Participant muted from AI: ${participantId}`);
    } else {
      this.mutedParticipants.delete(participantId);
      console.log(`[SelectiveAudio] 🔊 Participant unmuted for AI: ${participantId}`);
    }

    // Log current state
    console.log(`[SelectiveAudio] Currently muted: [${Array.from(this.mutedParticipants).join(', ')}]`);
  }

  /**
   * Check if a participant should be processed by AI
   * Returns false for muted participants (skip AI processing)
   */
  shouldProcessForAI(participantId: string): boolean {
    return !this.mutedParticipants.has(participantId);
  }

  /**
   * Check if audio track should be processed
   * Used by SelectiveRoomIO to filter audio
   */
  shouldProcessTrack(track: Track | RemoteTrack, participant: RemoteParticipant): boolean {
    // Always skip non-audio tracks for this check
    if (track.kind !== 'audio') {
      return true; // Let video through
    }

    // Check if participant is muted from AI
    const isMuted = this.mutedParticipants.has(participant.identity);
    
    if (isMuted) {
      console.log(`[SelectiveAudio] ⏭️ Skipping audio from muted participant: ${participant.identity}`);
    }

    return !isMuted;
  }

  /**
   * Get list of currently muted participants
   */
  getMutedParticipants(): string[] {
    return Array.from(this.mutedParticipants);
  }

  /**
   * Check if a specific participant is muted
   */
  isParticipantMuted(participantId: string): boolean {
    return this.mutedParticipants.has(participantId);
  }

  /**
   * Manually mute a participant (for testing or admin override)
   */
  muteParticipant(participantId: string): void {
    this.mutedParticipants.add(participantId);
    console.log(`[SelectiveAudio] 🔇 Manually muted: ${participantId}`);
  }

  /**
   * Manually unmute a participant
   */
  unmuteParticipant(participantId: string): void {
    this.mutedParticipants.delete(participantId);
    console.log(`[SelectiveAudio] 🔊 Manually unmuted: ${participantId}`);
  }

  /**
   * Register callback for transcription events
   * CRITICAL: This receives ALL transcriptions, including from muted coaches
   * Enables always-on transcription for coach review
   */
  onTranscription(callback: TranscriptionCallback): void {
    this.transcriptionCallbacks.push(callback);
  }

  /**
   * Emit transcription event
   * Called for ALL participants regardless of mute status
   */
  emitTranscription(event: TranscriptionEvent): void {
    // Mark if this is from a muted participant
    event.isMutedFromAI = this.mutedParticipants.has(event.participantId);
    
    for (const callback of this.transcriptionCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('[SelectiveAudio] Transcription callback error:', error);
      }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.mutedParticipants.clear();
    this.transcriptionCallbacks = [];
    this.room = null;
    this.isInitialized = false;
    console.log('[SelectiveAudio] 🧹 Cleaned up');
  }
}

// =============================================================================
// Dual Audio Router
// =============================================================================

/**
 * Routes audio to both AI processing and transcription streams
 * 
 * CRITICAL for the coach mute feature:
 * - AI Stream: Filters out muted participants
 * - Transcription Stream: Receives ALL audio for coach review
 */
export class DualAudioRouter {
  private selectiveManager: SelectiveAudioManager;
  private aiAudioCallback: ((audio: Uint8Array, participant: RemoteParticipant) => void) | null = null;
  private transcriptionAudioCallback: ((audio: Uint8Array, participant: RemoteParticipant) => void) | null = null;

  constructor(selectiveManager: SelectiveAudioManager) {
    this.selectiveManager = selectiveManager;
  }

  /**
   * Set callback for AI audio processing
   * This callback receives filtered audio (excludes muted participants)
   */
  setAIAudioCallback(callback: (audio: Uint8Array, participant: RemoteParticipant) => void): void {
    this.aiAudioCallback = callback;
  }

  /**
   * Set callback for transcription
   * This callback receives ALL audio for transcription display
   */
  setTranscriptionCallback(callback: (audio: Uint8Array, participant: RemoteParticipant) => void): void {
    this.transcriptionAudioCallback = callback;
  }

  /**
   * Route incoming audio chunk
   * Splits to AI (filtered) and transcription (all) streams
   */
  routeAudio(audioChunk: Uint8Array, participant: RemoteParticipant): void {
    // Always send to transcription stream (for coach review panel)
    if (this.transcriptionAudioCallback) {
      this.transcriptionAudioCallback(audioChunk, participant);
    }

    // Only send to AI if participant is not muted
    if (this.selectiveManager.shouldProcessForAI(participant.identity)) {
      if (this.aiAudioCallback) {
        this.aiAudioCallback(audioChunk, participant);
      }
    }
  }
}

// =============================================================================
// Send Mute Command Utility
// =============================================================================

/**
 * Send mute command to the AI agent via LiveKit data channel
 * Called from coach's client when they toggle the mute button
 * 
 * @param room LiveKit room instance
 * @param muted Whether to mute (true) or unmute (false)
 * @param participantId ID of the participant to mute (usually the coach)
 */
export async function sendMuteCommand(
  room: Room,
  muted: boolean,
  participantId: string
): Promise<void> {
  const command: MuteCommand = {
    type: 'mute-from-ai',
    muted,
    participantId,
  };

  const payload = new TextEncoder().encode(JSON.stringify(command));
  
  // Send as reliable data (guaranteed delivery)
  await room.localParticipant.publishData(payload, {
    reliable: true,
    destinationIdentities: ['ai-coach-agent'], // Target the AI agent specifically
  });

  console.log(`[SelectiveAudio] 📤 Sent mute command: ${muted ? 'mute' : 'unmute'} for ${participantId}`);
}

// =============================================================================
// Singleton Export
// =============================================================================

export const selectiveAudioManager = new SelectiveAudioManager();

export default {
  SelectiveAudioManager,
  DualAudioRouter,
  sendMuteCommand,
  selectiveAudioManager,
};
