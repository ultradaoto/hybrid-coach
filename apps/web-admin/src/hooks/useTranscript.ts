import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { TranscriptMessage, TranscriptSession } from '@/types/transcript';

export function useTranscripts() {
  return useQuery({
    queryKey: ['transcripts'],
    queryFn: () => api.get<TranscriptSession[]>('/admin/transcripts'),
  });
}

export function useTranscript(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['transcript', sessionId],
    queryFn: () => api.get<TranscriptMessage[]>(`/admin/transcripts/${sessionId}`),
    enabled: !!sessionId,
  });
}
