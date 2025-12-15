import { Text } from '@tremor/react';
import { Image } from 'lucide-react';
import { format } from 'date-fns';
import BugStatusBadge from './BugStatusBadge';

type BugStatus = 'open' | 'in_progress' | 'resolved';

interface BugReport {
  id: string;
  userId?: string;
  email?: string;
  description: string;
  screenshot?: string;
  status: BugStatus;
  createdAt: string;
  userAgent?: string;
  url?: string;
}

interface BugCardProps {
  bug: BugReport;
  onClick?: () => void;
  onStatusChange?: (status: BugStatus) => void;
}

export default function BugCard({ bug, onClick, onStatusChange }: BugCardProps) {
  return (
    <div
      className="bg-admin-card border border-admin-border rounded-lg p-4 hover:border-admin-accent/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <BugStatusBadge status={bug.status} />
          <Text className="text-gray-500">
            #{bug.id.slice(0, 8)}
          </Text>
        </div>
        <Text className="text-gray-500">
          {format(new Date(bug.createdAt), 'MMM d, yyyy HH:mm')}
        </Text>
      </div>

      <p className="text-white line-clamp-2 mb-3">
        {bug.description}
      </p>

      <div className="flex items-center gap-4 text-sm text-gray-400">
        {bug.email && <span>{bug.email}</span>}
        {bug.screenshot && (
          <span className="flex items-center gap-1">
            <Image size={14} />
            Screenshot
          </span>
        )}
      </div>

      {/* Quick status change */}
      {onStatusChange && (
        <div
          className="mt-3 flex gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {bug.status !== 'in_progress' && (
            <button
              onClick={() => onStatusChange('in_progress')}
              className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30"
            >
              Mark In Progress
            </button>
          )}
          {bug.status !== 'resolved' && (
            <button
              onClick={() => onStatusChange('resolved')}
              className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
            >
              Resolve
            </button>
          )}
        </div>
      )}
    </div>
  );
}
