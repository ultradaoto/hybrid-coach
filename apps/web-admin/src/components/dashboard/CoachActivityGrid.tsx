import { Text, Flex, ProgressBar } from '@tremor/react';

interface CoachActivityGridProps {
  activity: {
    recent1h: number;
    recent1d: number;
    recent1w: number;
    recent1m: number;
  };
}

export default function CoachActivityGrid({ activity }: CoachActivityGridProps) {
  const periods = [
    { label: 'Last Hour', value: activity.recent1h, max: 10 },
    { label: 'Last 24 Hours', value: activity.recent1d, max: 20 },
    { label: 'Last Week', value: activity.recent1w, max: 50 },
    { label: 'Last Month', value: activity.recent1m, max: 100 },
  ];

  return (
    <div className="space-y-4">
      {periods.map(({ label, value, max }) => {
        const percentage = Math.min((value / max) * 100, 100);
        const color = percentage > 75 ? 'emerald' : percentage > 50 ? 'blue' : percentage > 25 ? 'yellow' : 'gray';
        
        return (
          <div key={label}>
            <Flex>
              <Text className="text-gray-400">{label}</Text>
              <Text className="text-white font-medium">{value} coaches</Text>
            </Flex>
            <ProgressBar value={percentage} color={color} className="mt-2" />
          </div>
        );
      })}
    </div>
  );
}
