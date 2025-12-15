import { Text, Flex } from '@tremor/react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface QuickStatsProps {
  stats: {
    label: string;
    value: number;
    change?: number;
    changeLabel?: string;
  }[];
}

export default function QuickStats({ stats }: QuickStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const TrendIcon = stat.change && stat.change > 0 
          ? TrendingUp 
          : stat.change && stat.change < 0 
            ? TrendingDown 
            : Minus;
        const trendColor = stat.change && stat.change > 0 
          ? 'text-green-500' 
          : stat.change && stat.change < 0 
            ? 'text-red-500' 
            : 'text-gray-500';
        
        return (
          <div key={stat.label} className="bg-admin-bg rounded-lg p-3">
            <Text className="text-gray-400 text-sm">{stat.label}</Text>
            <Flex className="mt-1 items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {stat.value.toLocaleString()}
              </span>
              {stat.change !== undefined && (
                <span className={`flex items-center gap-1 text-sm ${trendColor}`}>
                  <TrendIcon size={14} />
                  {Math.abs(stat.change)}%
                </span>
              )}
            </Flex>
            {stat.changeLabel && (
              <Text className="text-gray-500 text-xs mt-1">{stat.changeLabel}</Text>
            )}
          </div>
        );
      })}
    </div>
  );
}
