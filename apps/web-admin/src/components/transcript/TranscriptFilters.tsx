import { Filter } from 'lucide-react';
import type { SpeakerRole } from '@/types/transcript';

interface TranscriptFiltersProps {
  activeSpeakers: Set<SpeakerRole>;
  onToggleSpeaker: (role: SpeakerRole) => void;
}

export default function TranscriptFilters({
  activeSpeakers,
  onToggleSpeaker,
}: TranscriptFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      <Filter size={16} className="text-gray-400" />
      <SpeakerFilterButton
        role="client"
        label="Client"
        active={activeSpeakers.has('client')}
        onClick={() => onToggleSpeaker('client')}
      />
      <SpeakerFilterButton
        role="coach"
        label="Coach"
        active={activeSpeakers.has('coach')}
        onClick={() => onToggleSpeaker('coach')}
      />
      <SpeakerFilterButton
        role="ai"
        label="AI Agent"
        active={activeSpeakers.has('ai')}
        onClick={() => onToggleSpeaker('ai')}
      />
    </div>
  );
}

function SpeakerFilterButton({
  role,
  label,
  active,
  onClick,
}: {
  role: SpeakerRole;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const colors = {
    client: 'bg-speaker-client',
    coach: 'bg-speaker-coach',
    ai: 'bg-speaker-ai',
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm flex items-center gap-2 transition-all ${
        active
          ? `${colors[role]} text-white`
          : 'bg-admin-border text-gray-400 opacity-50'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${active ? 'bg-white' : colors[role]}`}
      />
      {label}
    </button>
  );
}
