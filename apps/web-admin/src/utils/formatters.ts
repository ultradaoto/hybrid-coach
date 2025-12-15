import { format, formatDistanceToNow } from 'date-fns';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatGB(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatUptime(uptime: { days: number; hours: number; minutes: number }): string {
  const parts = [];
  if (uptime.days > 0) parts.push(`${uptime.days}d`);
  if (uptime.hours > 0) parts.push(`${uptime.hours}h`);
  if (uptime.minutes > 0) parts.push(`${uptime.minutes}m`);
  return parts.join(' ') || '0m';
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy HH:mm');
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'HH:mm:ss');
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}
