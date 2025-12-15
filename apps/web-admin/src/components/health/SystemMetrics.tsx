import { Card, ProgressCircle, Flex, Text } from '@tremor/react';
import { formatGB } from '@/utils/formatters';

interface SystemMetricsProps {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
}

export default function SystemMetrics({ cpu, memory, disk }: SystemMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <ResourceGauge
        label="CPU Usage"
        value={cpu.usage}
        subtitle={`${cpu.cores} cores`}
      />
      <ResourceGauge
        label="Memory"
        value={memory.percentage}
        subtitle={`${formatGB(memory.used)} / ${formatGB(memory.total)}`}
      />
      <ResourceGauge
        label="Disk"
        value={disk.percentage}
        subtitle={`${formatGB(disk.used)} / ${formatGB(disk.total)}`}
      />
    </div>
  );
}

function ResourceGauge({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number;
  subtitle: string;
}) {
  const color = value > 90 ? 'red' : value > 70 ? 'yellow' : 'emerald';

  return (
    <Card className="bg-admin-card border-admin-border">
      <Flex alignItems="center" justifyContent="center" className="gap-4">
        <ProgressCircle value={value} size="lg" color={color}>
          <span className="text-white font-bold">{Math.round(value)}%</span>
        </ProgressCircle>
        <div>
          <Text className="text-gray-400">{label}</Text>
          <Text className="text-white font-medium">{subtitle}</Text>
        </div>
      </Flex>
    </Card>
  );
}
