import { Title, Text, Card, Flex, Badge } from '@tremor/react';
import { RefreshCw } from 'lucide-react';
import { useSystemHealth } from '@/hooks/useMetrics';
import { SystemMetrics, ServiceStatus, UptimeTracker } from '@/components/health';
import { formatUptime } from '@/utils/formatters';

export default function Health() {
  const { data: health, isLoading, refetch } = useSystemHealth();

  if (isLoading || !health) {
    return <HealthSkeleton />;
  }

  return (
    <div className="space-y-6">
      <Flex>
        <div>
          <Title className="text-white">System Health</Title>
          <Text className="text-gray-400">
            Real-time infrastructure monitoring
          </Text>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 hover:bg-admin-border rounded-lg transition-colors"
        >
          <RefreshCw className="text-gray-400" size={20} />
        </button>
      </Flex>

      {/* System Resources */}
      <SystemMetrics
        cpu={health.cpu}
        memory={health.memory}
        disk={health.disk}
      />

      {/* Service Status */}
      <Card className="bg-admin-card border-admin-border">
        <Title className="text-white text-lg mb-4">Service Status</Title>
        <ServiceStatus services={health.services} />
      </Card>

      {/* Uptime */}
      <Card className="bg-admin-card border-admin-border">
        <Flex className="mb-4">
          <div>
            <Title className="text-white text-lg">Uptime</Title>
            <Text className="text-gray-400">
              {formatUptime(health.uptime)}
            </Text>
          </div>
          <Badge color="emerald" size="lg">
            99.9%
          </Badge>
        </Flex>

        <UptimeTracker history={health.uptimeHistory} />
      </Card>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-admin-card rounded w-48" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-admin-card rounded-lg" />
        ))}
      </div>
    </div>
  );
}
