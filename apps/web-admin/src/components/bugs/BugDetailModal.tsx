import { X, ExternalLink, Monitor, Globe } from 'lucide-react';
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

interface BugDetailModalProps {
  bug: BugReport;
  onClose: () => void;
  onStatusChange: (status: BugStatus) => void;
}

export default function BugDetailModal({ bug, onClose, onStatusChange }: BugDetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-admin-card border border-admin-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-admin-border">
          <div className="flex items-center gap-3">
            <BugStatusBadge status={bug.status} />
            <span className="text-gray-400">#{bug.id.slice(0, 8)}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">Description</h3>
            <p className="text-white whitespace-pre-wrap">{bug.description}</p>
          </div>

          {/* Screenshot */}
          {bug.screenshot && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">Screenshot</h3>
              <img
                src={bug.screenshot}
                alt="Bug screenshot"
                className="rounded-lg border border-admin-border max-w-full"
              />
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            {bug.email && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-1">Reported by</h3>
                <p className="text-white">{bug.email}</p>
              </div>
            )}
            
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-1">Reported at</h3>
              <p className="text-white">
                {format(new Date(bug.createdAt), 'MMM d, yyyy HH:mm:ss')}
              </p>
            </div>

            {bug.url && (
              <div className="col-span-2">
                <h3 className="text-sm font-medium text-gray-400 mb-1 flex items-center gap-1">
                  <Globe size={14} /> URL
                </h3>
                <a
                  href={bug.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-admin-accent hover:underline flex items-center gap-1"
                >
                  {bug.url}
                  <ExternalLink size={14} />
                </a>
              </div>
            )}

            {bug.userAgent && (
              <div className="col-span-2">
                <h3 className="text-sm font-medium text-gray-400 mb-1 flex items-center gap-1">
                  <Monitor size={14} /> User Agent
                </h3>
                <p className="text-gray-300 text-sm font-mono">{bug.userAgent}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-admin-border">
          {bug.status !== 'in_progress' && (
            <button
              onClick={() => onStatusChange('in_progress')}
              className="flex-1 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors"
            >
              Mark In Progress
            </button>
          )}
          {bug.status !== 'resolved' && (
            <button
              onClick={() => onStatusChange('resolved')}
              className="flex-1 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
            >
              Mark Resolved
            </button>
          )}
          {bug.status !== 'open' && (
            <button
              onClick={() => onStatusChange('open')}
              className="flex-1 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
