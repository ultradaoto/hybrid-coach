import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

interface AlertBannerProps {
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  dismissible?: boolean;
}

export default function AlertBanner({ type, title, message, dismissible = true }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const colors = {
    error: {
      bg: 'bg-red-900/20',
      border: 'border-red-500',
      icon: 'text-red-500',
      title: 'text-red-400',
      message: 'text-red-300',
    },
    warning: {
      bg: 'bg-yellow-900/20',
      border: 'border-yellow-500',
      icon: 'text-yellow-500',
      title: 'text-yellow-400',
      message: 'text-yellow-300',
    },
    info: {
      bg: 'bg-blue-900/20',
      border: 'border-blue-500',
      icon: 'text-blue-500',
      title: 'text-blue-400',
      message: 'text-blue-300',
    },
  };

  const c = colors[type];

  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-4 flex items-start gap-3`}>
      <AlertTriangle className={c.icon} size={20} />
      <div className="flex-1">
        <p className={`${c.title} font-medium`}>{title}</p>
        <p className={`${c.message} text-sm`}>{message}</p>
      </div>
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className={`${c.icon} hover:opacity-70`}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
