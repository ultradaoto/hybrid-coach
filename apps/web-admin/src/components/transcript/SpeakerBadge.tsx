import { User, Bot, UserCheck } from 'lucide-react';
import type { SpeakerRole } from '@/types/transcript';

interface SpeakerBadgeProps {
  role: SpeakerRole;
  name: string;
}

export default function SpeakerBadge({ role, name }: SpeakerBadgeProps) {
  const config = {
    client: {
      bg: 'bg-speaker-client',
      icon: User,
    },
    coach: {
      bg: 'bg-speaker-coach',
      icon: UserCheck,
    },
    ai: {
      bg: 'bg-speaker-ai',
      icon: Bot,
    },
  };

  const { bg, icon: Icon } = config[role];
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`
        w-10 h-10 rounded-full ${bg}
        flex items-center justify-center
        text-white font-medium text-sm
        flex-shrink-0
      `}
      title={`${role}: ${name}`}
    >
      {role === 'ai' ? <Icon size={18} /> : initials}
    </div>
  );
}
