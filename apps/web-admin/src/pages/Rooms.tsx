import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Title, Text, Grid } from '@tremor/react';
import { Radio } from 'lucide-react';
import { RoomCard } from '@/components/rooms';
import { useAudioMonitor } from '@/hooks/useAudioMonitor';
import { api } from '@/services/api';
import type { Room } from '@/types/admin';

export default function Rooms() {
  const [listeningRoomId, setListeningRoomId] = useState<string | null>(null);
  
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['admin-rooms'],
    queryFn: () => api.get<Room[]>('/admin/rooms'),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { 
    isListening, 
    isConnecting, 
    audioTracks, 
    startListening, 
    stopListening 
  } = useAudioMonitor(listeningRoomId);

  const handleListenToggle = (roomId: string) => {
    if (listeningRoomId === roomId && isListening) {
      stopListening();
      setListeningRoomId(null);
    } else {
      setListeningRoomId(roomId);
      startListening();
    }
  };

  const activeRooms = rooms.filter((r) => r.isActive);

  return (
    <div className="space-y-6">
      <div>
        <Title className="text-white">Active Rooms</Title>
        <Text className="text-gray-400">
          {activeRooms.length} rooms currently active
        </Text>
      </div>

      {/* Listening Status */}
      {listeningRoomId && (
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Radio className={isListening ? 'text-red-500 animate-pulse' : 'text-gray-400'} size={20} />
              <div>
                <Text className="text-white font-medium">
                  {isConnecting ? 'Connecting...' : isListening ? 'Listening to room' : 'Disconnected'}
                </Text>
                <Text className="text-gray-400 text-sm">
                  {audioTracks.length} audio streams
                </Text>
              </div>
            </div>
            {isListening && (
              <button
                onClick={stopListening}
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm"
              >
                Stop
              </button>
            )}
          </div>
          
          {/* Audio Level Indicators */}
          {audioTracks.length > 0 && (
            <div className="mt-4 space-y-2">
              {audioTracks.map((track) => (
                <div key={track.participantId} className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm w-24 truncate">
                    {track.participantId}
                  </span>
                  <div className="flex-1 h-2 bg-admin-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-admin-accent transition-all duration-100"
                      style={{ width: `${track.audioLevel * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <Grid numItemsSm={2} numItemsLg={3} className="gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-admin-card rounded-lg animate-pulse" />
          ))}
        </Grid>
      ) : activeRooms.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Radio size={48} className="mx-auto mb-4 opacity-50" />
          <Text>No active rooms at the moment</Text>
        </div>
      ) : (
        <Grid numItemsSm={2} numItemsLg={3} className="gap-4">
          {activeRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isListening={listeningRoomId === room.id && isListening}
              onListenIn={() => handleListenToggle(room.id)}
            />
          ))}
        </Grid>
      )}
    </div>
  );
}
