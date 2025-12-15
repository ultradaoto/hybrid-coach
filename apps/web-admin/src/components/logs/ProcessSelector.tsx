import { Select, SelectItem } from '@tremor/react';
import { Circle } from 'lucide-react';
import type { PM2Process } from '@/types/logs';

interface ProcessSelectorProps {
  processes: PM2Process[];
  selected: string;
  onSelect: (process: string) => void;
}

export default function ProcessSelector({
  processes,
  selected,
  onSelect,
}: ProcessSelectorProps) {
  const statusColors = {
    online: 'text-green-500',
    stopped: 'text-gray-500',
    errored: 'text-red-500',
  };

  return (
    <Select
      value={selected}
      onValueChange={onSelect}
      className="w-48"
      placeholder="Select process"
    >
      <SelectItem value="all">
        All Processes
      </SelectItem>
      {processes.map((proc) => (
        <SelectItem key={proc.name} value={proc.name}>
          <span className="flex items-center gap-2">
            <Circle
              size={8}
              className={`fill-current ${statusColors[proc.status]}`}
            />
            {proc.name}
          </span>
        </SelectItem>
      ))}
    </Select>
  );
}
