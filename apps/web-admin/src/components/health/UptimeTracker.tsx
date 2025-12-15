import { Tracker, Text } from '@tremor/react';

interface UptimeDay {
  date: string;
  status: 'healthy' | 'degraded' | 'down';
}

interface UptimeTrackerProps {
  history: UptimeDay[];
  uptimePercentage?: number;
}

export default function UptimeTracker({ history, uptimePercentage = 99.9 }: UptimeTrackerProps) {
  const trackerData = history.map((day) => ({
    color:
      day.status === 'healthy'
        ? 'emerald' as const
        : day.status === 'degraded'
          ? 'yellow' as const
          : 'red' as const,
    tooltip: `${day.date}: ${day.status}`,
  }));

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <Text className="text-gray-400">Last 30 days</Text>
        <Text className="text-white font-medium">{uptimePercentage}% uptime</Text>
      </div>
      <Tracker data={trackerData} className="mt-2" />
    </div>
  );
}
