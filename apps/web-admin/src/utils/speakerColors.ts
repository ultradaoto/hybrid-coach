import type { SpeakerRole } from '@/types/transcript';

export const speakerColors: Record<SpeakerRole, { bg: string; text: string; border: string }> = {
  client: {
    bg: 'bg-speaker-client',
    text: 'text-speaker-client',
    border: 'border-speaker-client',
  },
  coach: {
    bg: 'bg-speaker-coach',
    text: 'text-speaker-coach',
    border: 'border-speaker-coach',
  },
  ai: {
    bg: 'bg-speaker-ai',
    text: 'text-speaker-ai',
    border: 'border-speaker-ai',
  },
};

export function getSpeakerColor(role: SpeakerRole) {
  return speakerColors[role] || speakerColors.client;
}

export function getSpeakerLabel(role: SpeakerRole): string {
  const labels: Record<SpeakerRole, string> = {
    client: 'Client',
    coach: 'Coach',
    ai: 'AI Agent',
  };
  return labels[role] || role;
}
