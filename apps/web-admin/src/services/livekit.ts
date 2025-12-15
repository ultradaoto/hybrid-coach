import { Room, RoomEvent } from 'livekit-client';
import { api } from './api';

interface LiveKitToken {
  token: string;
  url: string;
}

export async function getAdminAudioToken(roomId: string): Promise<LiveKitToken> {
  return api.get<LiveKitToken>(`/admin/rooms/${roomId}/audio-token`);
}

export function createAdminRoom(): Room {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: { width: 1280, height: 720, frameRate: 30 },
    },
  });
}

export async function connectToRoomAsListener(
  roomId: string,
  onAudioTrack?: (track: MediaStreamTrack, participantId: string) => void
): Promise<Room> {
  const { token, url } = await getAdminAudioToken(roomId);
  const room = createAdminRoom();
  
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    if (track.kind === 'audio' && onAudioTrack) {
      const mediaTrack = track.mediaStreamTrack;
      if (mediaTrack) {
        onAudioTrack(mediaTrack, participant.identity);
      }
    }
  });
  
  room.on(RoomEvent.Disconnected, () => {
    console.log('Disconnected from room:', roomId);
  });
  
  room.on(RoomEvent.Reconnecting, () => {
    console.log('Reconnecting to room:', roomId);
  });
  
  room.on(RoomEvent.Reconnected, () => {
    console.log('Reconnected to room:', roomId);
  });
  
  await room.connect(url, token);
  console.log('Connected to room as listener:', roomId);
  
  return room;
}

export function disconnectFromRoom(room: Room): void {
  room.disconnect();
}
