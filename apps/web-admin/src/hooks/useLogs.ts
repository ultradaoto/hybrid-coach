import { useEffect, useState, useCallback, useRef } from 'react';
import { wsManager } from '@/services/websocket';
import type { LogLevel, LogEntry, PM2Process } from '@/types/logs';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

interface UseLogsOptions {
  processes?: string[];
  levels?: LogLevel[];
  maxEntries?: number;
  enabled?: boolean;
}

export function useLogs(options: UseLogsOptions = {}) {
  const { 
    processes = ['all'], 
    levels = ['error', 'warn', 'info', 'debug'],
    maxEntries = 1000,
    enabled = false, // Disabled by default since WebSocket endpoint may not exist
  } = options;
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const endpointRef = useRef<string | null>(null);
  
  const addLog = useCallback((log: LogEntry) => {
    setLogs((prev) => {
      const newLogs = [...prev, log];
      // Keep only the last maxEntries logs
      if (newLogs.length > maxEntries) {
        return newLogs.slice(-maxEntries);
      }
      return newLogs;
    });
  }, [maxEntries]);
  
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);
  
  useEffect(() => {
    // Only connect if explicitly enabled
    if (!enabled) {
      return;
    }
    
    const endpoint = `/ws/logs?process=${processes.join(',')}&levels=${levels.join(',')}`;
    endpointRef.current = endpoint;
    
    wsManager.connect(endpoint, {
      onOpen: () => {
        setIsConnected(true);
        setConnectionError(null);
      },
      onClose: () => setIsConnected(false),
      onError: () => {
        setConnectionError('Log streaming not available. WebSocket endpoint not configured.');
        setIsConnected(false);
      },
      onMessage: (data) => {
        if (data && typeof data === 'object' && 'type' in data) {
          const msg = data as { type: string; [key: string]: unknown };
          if (msg.type === 'log') {
            addLog({
              id: crypto.randomUUID(),
              timestamp: new Date(msg.timestamp as string),
              level: msg.level as LogLevel,
              process: msg.process as string,
              message: msg.message as string,
              metadata: msg.metadata as Record<string, unknown> | undefined,
            });
          }
        }
      },
      autoReconnect: false, // Don't auto-reconnect if endpoint doesn't exist
    });
    
    return () => {
      if (endpointRef.current) {
        wsManager.disconnect(endpointRef.current);
      }
    };
  }, [enabled, processes.join(','), levels.join(','), addLog]);
  
  return {
    logs,
    isConnected,
    connectionError,
    clearLogs,
  };
}

export function useProcesses() {
  return useQuery({
    queryKey: ['pm2-processes'],
    queryFn: () => api.get<PM2Process[]>('/admin/processes'),
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}
