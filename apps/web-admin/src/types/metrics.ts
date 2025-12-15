export interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  activeRooms: number;
  totalCoaches: number;
  coachesByActivity: {
    recent1h: number;
    recent1d: number;
    recent1w: number;
    recent1m: number;
  };
  clientVoiceMinutes: {
    today: number;
    week: number;
    month: number;
  };
  skoolSyncStatus: {
    lastRun: string;
    success: boolean;
    error?: string;
  };
  systemHealth: {
    api: boolean;
    database: boolean;
    livekit: boolean;
    skool: boolean;
  };
}

export interface SystemHealth {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  services: {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    latency?: number;
    lastCheck: string;
  }[];
  uptime: { days: number; hours: number; minutes: number };
  uptimeHistory: { date: string; status: 'healthy' | 'degraded' | 'down' }[];
}
