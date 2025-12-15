import { Card, Metric, Text, BadgeDelta, Flex } from '@tremor/react';
import type { DeltaType } from '@tremor/react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  delta?: number;
  deltaType?: DeltaType;
  icon?: React.ReactNode;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  delta,
  deltaType = 'unchanged',
  icon,
}: MetricCardProps) {
  return (
    <Card className="bg-admin-card border-admin-border">
      <Flex alignItems="start">
        <div>
          <Text className="text-gray-400">{title}</Text>
          <Metric className="text-white mt-1">{value}</Metric>
          {subtitle && (
            <Text className="text-gray-500 text-sm mt-1">{subtitle}</Text>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {icon}
          {delta !== undefined && (
            <BadgeDelta deltaType={deltaType}>
              {delta > 0 ? '+' : ''}{delta}%
            </BadgeDelta>
          )}
        </div>
      </Flex>
    </Card>
  );
}
