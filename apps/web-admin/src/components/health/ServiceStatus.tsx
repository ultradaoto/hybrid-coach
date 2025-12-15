import { Flex, Text, Badge } from '@tremor/react';
import { Server, Database, Radio, Cloud } from 'lucide-react';

interface Service {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
  lastCheck: string;
}

interface ServiceStatusProps {
  services: Service[];
}

export default function ServiceStatus({ services }: ServiceStatusProps) {
  const icons: Record<string, React.ReactNode> = {
    'API Server': <Server size={18} />,
    'Database': <Database size={18} />,
    'LiveKit': <Radio size={18} />,
    'Skool Sync': <Cloud size={18} />,
  };

  const statusConfig = {
    healthy: { color: 'emerald' as const, label: 'Healthy' },
    degraded: { color: 'yellow' as const, label: 'Degraded' },
    down: { color: 'red' as const, label: 'Down' },
  };

  return (
    <div className="space-y-3">
      {services.map((service) => {
        const { color, label } = statusConfig[service.status];

        return (
          <Flex key={service.name} className="p-3 bg-admin-bg rounded-lg">
            <Flex className="gap-3">
              <div className="text-gray-400">
                {icons[service.name] || <Server size={18} />}
              </div>
              <div>
                <Text className="text-white font-medium">{service.name}</Text>
                <Text className="text-gray-500 text-sm">
                  Last check: {service.lastCheck}
                </Text>
              </div>
            </Flex>

            <Flex className="gap-3">
              {service.latency && (
                <Text className="text-gray-400">{service.latency}ms</Text>
              )}
              <Badge color={color}>{label}</Badge>
            </Flex>
          </Flex>
        );
      })}
    </div>
  );
}
