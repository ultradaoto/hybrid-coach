export type SpeakerRole = 'client' | 'coach' | 'ai';

export interface TranscriptMessage {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  speakerRole: SpeakerRole;
  content: string;
  timestamp: Date;
  confidence?: number; // For AI transcription confidence
}

export interface TranscriptSession {
  id: string;
  clientId: string;
  clientName: string;
  coachId?: string;
  coachName?: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes: number;
  messageCount: number;
}
