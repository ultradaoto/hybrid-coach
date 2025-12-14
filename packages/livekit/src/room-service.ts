export interface CreateRoomOptions {
  sessionId: string;
  maxParticipants?: number;
  emptyTimeout?: number;
}

export async function createRoom(_options: CreateRoomOptions) {
  throw new Error('LiveKit not wired yet (packages/livekit scaffold)');
}

export async function deleteRoom(_sessionId: string) {
  throw new Error('LiveKit not wired yet (packages/livekit scaffold)');
}

export async function generateToken(
  _sessionId: string,
  _participantId: string,
  _participantName: string,
  _isCoach: boolean
): Promise<string> {
  throw new Error('LiveKit not wired yet (packages/livekit scaffold)');
}

export async function setCoachMuteForAI(_sessionId: string, _coachTrackSid: string, _muted: boolean) {
  throw new Error('LiveKit not wired yet (packages/livekit scaffold)');
}

export async function getRoomParticipants(_sessionId: string) {
  throw new Error('LiveKit not wired yet (packages/livekit scaffold)');
}
