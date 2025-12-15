import { Radio, Users, Clock } from 'lucide-react';
import { formatRelativeTime } from '@/utils/formatters';
import type { Room } from '@/types/admin';

interface RoomCardProps {
  room: Room;
  onListenIn?: () => void;
  isListening?: boolean;
}

export default function RoomCard({ room, onListenIn, isListening }: RoomCardProps) {
  return (
    <div className="bg-admin-card border border-admin-border rounded-lg p-4">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <Radio className="text-green-500" size={18} />
          <h3 className="font-medium text-white">{room.name}</h3>
        </div>
        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
          Live
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
        <span className="flex items-center gap-1">
          <Users size={14} />
          {room.participants.length} participants
        </span>
        <span className="flex items-center gap-1">
          <Clock size={14} />
          {formatRelativeTime(room.createdAt)}
        </span>
      </div>

      {/* Participants */}
      <div className="flex flex-wrap gap-2 mb-4">
        {room.participants.map((p) => (
          <span
            key={p.id}
            className={`px-2 py-1 rounded-full text-xs ${
              p.role === 'coach'
                ? 'bg-speaker-coach/20 text-speaker-coach'
                : p.role === 'ai'
                  ? 'bg-speaker-ai/20 text-speaker-ai'
                  : 'bg-speaker-client/20 text-speaker-client'
            }`}
          >
            {p.userName}
          </span>
        ))}
      </div>

      {/* Listen In Button */}
      {onListenIn && (
        <button
          onClick={onListenIn}
          className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
            isListening
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-admin-accent hover:bg-admin-accent/80 text-white'
          }`}
        >
          <Radio size={16} />
          {isListening ? 'Stop Listening' : 'Listen In'}
        </button>
      )}
    </div>
  );
}
