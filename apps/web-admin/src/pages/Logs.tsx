import { useState } from 'react';
import { Title, Text, Grid, Card, Metric } from '@tremor/react';
import { Cpu, HardDrive, Clock, AlertTriangle, Play } from 'lucide-react';
import { LogViewer } from '@/components/logs';
import { useProcesses, useLogs } from '@/hooks/useLogs';
import { formatBytes } from '@/utils/formatters';

export default function Logs() {
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  const { data: processes = [], isLoading: processesLoading } = useProcesses();
  const { logs, isConnected, connectionError, clearLogs } = useLogs({ 
    enabled: streamingEnabled 
  });

  // Calculate totals (use 0 if processes not available)
  const totalMemory = processes.reduce((sum, p) => sum + (p.memory || 0), 0);
  const avgCpu = processes.length
    ? processes.reduce((sum, p) => sum + (p.cpu || 0), 0) / processes.length
    : 0;
  const onlineCount = processes.filter((p) => p.status === 'online').length;

  return (
    <div className="h-full flex flex-col gap-4">
      <div>
        <Title className="text-white">System Logs</Title>
        <Text className="text-gray-400">
          Real-time PM2 and Bun process logs
        </Text>
      </div>

      {/* Process Stats */}
      <Grid numItemsSm={3} className="gap-4">
        <Card className="bg-admin-card border-admin-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Clock className="text-green-500" size={20} />
            </div>
            <div>
              <Text className="text-gray-400">Processes</Text>
              <Metric className="text-white">
                {processesLoading ? '...' : `${onlineCount}/${processes.length || 0}`}
              </Metric>
            </div>
          </div>
        </Card>

        <Card className="bg-admin-card border-admin-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <HardDrive className="text-blue-500" size={20} />
            </div>
            <div>
              <Text className="text-gray-400">Memory</Text>
              <Metric className="text-white">
                {processesLoading ? '...' : formatBytes(totalMemory)}
              </Metric>
            </div>
          </div>
        </Card>

        <Card className="bg-admin-card border-admin-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Cpu className="text-purple-500" size={20} />
            </div>
            <div>
              <Text className="text-gray-400">Avg CPU</Text>
              <Metric className="text-white">
                {processesLoading ? '...' : `${avgCpu.toFixed(1)}%`}
              </Metric>
            </div>
          </div>
        </Card>
      </Grid>

      {/* Log Viewer or Placeholder */}
      <div className="flex-1 min-h-0">
        {!streamingEnabled ? (
          <Card className="bg-admin-card border-admin-border h-full flex flex-col items-center justify-center">
            <AlertTriangle className="text-yellow-500 mb-4" size={48} />
            <Title className="text-white mb-2">Log Streaming Not Enabled</Title>
            <Text className="text-gray-400 text-center max-w-md mb-6">
              Real-time log streaming requires a WebSocket connection to the server.
              This feature requires additional backend configuration (PM2 log streaming).
            </Text>
            <button
              onClick={() => setStreamingEnabled(true)}
              className="flex items-center gap-2 px-4 py-2 bg-admin-accent hover:bg-admin-accent/80 rounded-lg text-white transition-colors"
            >
              <Play size={16} />
              Try to Connect
            </button>
          </Card>
        ) : connectionError ? (
          <Card className="bg-admin-card border-admin-border h-full flex flex-col items-center justify-center">
            <AlertTriangle className="text-red-500 mb-4" size={48} />
            <Title className="text-white mb-2">Connection Failed</Title>
            <Text className="text-gray-400 text-center max-w-md mb-4">
              {connectionError}
            </Text>
            <button
              onClick={() => setStreamingEnabled(false)}
              className="px-4 py-2 bg-admin-border hover:bg-gray-600 rounded-lg text-white transition-colors"
            >
              Go Back
            </button>
          </Card>
        ) : (
          <LogViewer 
            processes={processes} 
            logs={logs}
            isConnected={isConnected}
            onClearLogs={clearLogs}
          />
        )}
      </div>
    </div>
  );
}
