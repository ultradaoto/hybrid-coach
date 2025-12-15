export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  process: string; // 'api', 'web-coach', 'livekit', etc.
  message: string;
  metadata?: Record<string, unknown>;
}

export interface PM2Process {
  name: string;
  pm_id: number;
  status: 'online' | 'stopped' | 'errored';
  memory: number;
  cpu: number;
  uptime: number;
}
