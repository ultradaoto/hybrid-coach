import { Badge } from '@tremor/react';
import { Bug, Clock, Check } from 'lucide-react';

type BugStatus = 'open' | 'in_progress' | 'resolved';

interface BugStatusBadgeProps {
  status: BugStatus;
}

export default function BugStatusBadge({ status }: BugStatusBadgeProps) {
  const config = {
    open: { color: 'red' as const, icon: Bug, label: 'Open' },
    in_progress: { color: 'yellow' as const, icon: Clock, label: 'In Progress' },
    resolved: { color: 'emerald' as const, icon: Check, label: 'Resolved' },
  };

  const { color, icon: Icon, label } = config[status];

  return (
    <Badge color={color} icon={Icon}>
      {label}
    </Badge>
  );
}
