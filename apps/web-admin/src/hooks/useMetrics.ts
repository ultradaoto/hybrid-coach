import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { AdminMetrics, SystemHealth } from '@/types/metrics';

export function useMetrics() {
  return useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => api.get<AdminMetrics>('/admin/metrics'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => api.get<SystemHealth>('/admin/health'),
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}
