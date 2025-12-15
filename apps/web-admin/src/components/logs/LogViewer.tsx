import { useState } from 'react';
import { Card } from '@tremor/react';
import type { LogLevel, PM2Process, LogEntry } from '@/types/logs';
import LogFilters from './LogFilters';
import ProcessSelector from './ProcessSelector';
import { logLevelColors } from '@/utils/logParser';

interface LogViewerProps {
  processes: PM2Process[];
  logs: LogEntry[];
  isConnected: boolean;
  onClearLogs: () => void;
}

export default function LogViewer({ 
  processes, 
  logs, 
  isConnected,
  onClearLogs 
}: LogViewerProps) {
  const [selectedProcess, setSelectedProcess] = useState<string>('all');
  const [logLevels, setLogLevels] = useState<Set<LogLevel>>(
    new Set(['error', 'warn', 'info', 'debug'])
  );
  const [searchFilter, setSearchFilter] = useState('');
  const [isFollowing, setIsFollowing] = useState(true);

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (!logLevels.has(log.level)) return false;
    if (selectedProcess !== 'all' && log.process !== selectedProcess) return false;
    if (searchFilter && !log.message.toLowerCase().includes(searchFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Process Selector */}
        <ProcessSelector
          processes={processes}
          selected={selectedProcess}
          onSelect={setSelectedProcess}
        />

        {/* Log Level Filters */}
        <LogFilters levels={logLevels} onChange={setLogLevels} />

        {/* Search */}
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter logs..."
          className="px-3 py-2 bg-admin-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-admin-accent"
        />

        {/* Follow Toggle */}
        <label className="flex items-center gap-2 text-gray-400">
          <input
            type="checkbox"
            checked={isFollowing}
            onChange={(e) => setIsFollowing(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>

        {/* Connection Status */}
        <span className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>

        {/* Clear Button */}
        <button
          onClick={onClearLogs}
          className="px-3 py-2 text-sm bg-admin-border hover:bg-admin-accent rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Log Display */}
      <Card className="flex-1 bg-admin-card border-admin-border overflow-hidden">
        <div 
          className="h-full overflow-auto font-mono text-xs leading-relaxed p-4"
          style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
        >
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              No logs to display
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`py-1 border-b border-admin-border/30 ${logLevelColors[log.level]}`}
              >
                <span className="text-gray-500">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>{' '}
                <span className="text-gray-400">[{log.process}]</span>{' '}
                <span className={`font-medium ${logLevelColors[log.level]}`}>
                  [{log.level.toUpperCase()}]
                </span>{' '}
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Stats Footer */}
      <div className="flex justify-between text-sm text-gray-400">
        <span>Showing {filteredLogs.length} of {logs.length} logs</span>
        <span>Process: {selectedProcess}</span>
      </div>
    </div>
  );
}
