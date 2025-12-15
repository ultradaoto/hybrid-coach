import type { LogLevel } from '@/types/logs';

interface LogFiltersProps {
  levels: Set<LogLevel>;
  onChange: (levels: Set<LogLevel>) => void;
}

const LOG_LEVELS: { level: LogLevel; label: string; color: string }[] = [
  { level: 'error', label: 'Error', color: 'bg-log-error' },
  { level: 'warn', label: 'Warn', color: 'bg-log-warn' },
  { level: 'info', label: 'Info', color: 'bg-log-info' },
  { level: 'debug', label: 'Debug', color: 'bg-log-debug' },
];

export default function LogFilters({ levels, onChange }: LogFiltersProps) {
  const toggle = (level: LogLevel) => {
    const newLevels = new Set(levels);
    if (newLevels.has(level)) {
      newLevels.delete(level);
    } else {
      newLevels.add(level);
    }
    onChange(newLevels);
  };

  return (
    <div className="flex items-center gap-1">
      {LOG_LEVELS.map(({ level, label, color }) => (
        <button
          key={level}
          onClick={() => toggle(level)}
          className={`
            px-2 py-1 rounded text-xs font-medium transition-all
            ${
              levels.has(level)
                ? `${color} text-white`
                : 'bg-admin-border text-gray-500'
            }
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
