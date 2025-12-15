import type { LogLevel } from '@/types/logs';

export function parseLogLevel(message: string): LogLevel {
  if (/\[ERROR\]/i.test(message) || /error:/i.test(message)) return 'error';
  if (/\[WARN\]/i.test(message) || /warning:/i.test(message)) return 'warn';
  if (/\[DEBUG\]/i.test(message)) return 'debug';
  return 'info';
}

export function parseTimestamp(line: string): Date | null {
  // Try to extract timestamp from log line
  const isoMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (isoMatch) {
    return new Date(isoMatch[1]);
  }
  
  const bracketMatch = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
  if (bracketMatch) {
    const today = new Date();
    const [hours, minutes, seconds] = bracketMatch[1].split(':').map(Number);
    today.setHours(hours, minutes, seconds, 0);
    return today;
  }
  
  return null;
}

export function parseProcess(line: string): string {
  // Try to extract process name from log line
  const match = line.match(/\[([a-zA-Z0-9-_]+)\]/);
  return match ? match[1] : 'unknown';
}

export function extractJson(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
  return null;
}

export const logLevelColors: Record<LogLevel, string> = {
  error: 'text-log-error',
  warn: 'text-log-warn',
  info: 'text-log-info',
  debug: 'text-log-debug',
};

export const logLevelBgColors: Record<LogLevel, string> = {
  error: 'bg-log-error',
  warn: 'bg-log-warn',
  info: 'bg-log-info',
  debug: 'bg-log-debug',
};
