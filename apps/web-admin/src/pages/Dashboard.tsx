import { Title, Text, Grid, Flex, ProgressBar, Tracker } from '@tremor/react';
import {
  Users,
  Radio,
  UserCheck,
  Clock,
} from 'lucide-react';
import { useMetrics } from '@/hooks/useMetrics';
import { MetricCard, ActivityChart, CoachActivityGrid } from '@/components/dashboard';
import { AlertBanner } from '@/components/health';

export default function Dashboard() {
  const { data: metrics, isLoading } = useMetrics();

  if (isLoading || !metrics) {
    return <DashboardSkeleton />;
  }

  // Build tracker data for uptime visualization
  const uptimeData = Array.from({ length: 30 }, (_, i) => ({
    color: 'emerald' as const,
    tooltip: `Day ${i + 1}: All systems operational`,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <Title className="text-white">Dashboard</Title>
        <Text className="text-gray-400">
          Real-time overview of MyUltra.Coach system
        </Text>
      </div>

      {/* Skool Sync Alert */}
      {!metrics.skoolSyncStatus.success && (
        <AlertBanner
          type="error"
          title="Skool Sync Failed"
          message={`Last attempt: ${metrics.skoolSyncStatus.lastRun} - ${metrics.skoolSyncStatus.error || 'Unknown error'}`}
        />
      )}

      {/* Primary Metrics Grid - Dense 4-column layout */}
      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        <MetricCard
          title="Total Users"
          value={metrics.totalUsers.toLocaleString()}
          subtitle={`${metrics.activeUsers} active now`}
          icon={<Users className="text-admin-accent" size={24} />}
        />
        <MetricCard
          title="Active Rooms"
          value={metrics.activeRooms}
          subtitle="Live sessions"
          icon={<Radio className="text-green-500" size={24} />}
        />
        <MetricCard
          title="Active Coaches"
          value={metrics.coachesByActivity.recent1h}
          subtitle={`${metrics.totalCoaches} total`}
          icon={<UserCheck className="text-blue-500" size={24} />}
        />
        <MetricCard
          title="Voice Minutes Today"
          value={metrics.clientVoiceMinutes.today.toLocaleString()}
          subtitle={`${metrics.clientVoiceMinutes.week.toLocaleString()} this week`}
          icon={<Clock className="text-purple-500" size={24} />}
        />
      </Grid>

      {/* Secondary Row - Charts and Details */}
      <Grid numItemsSm={1} numItemsLg={2} className="gap-4">
        {/* Real-time Activity Chart */}
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <Title className="text-white text-lg mb-4">Session Activity</Title>
          <ActivityChart />
        </div>

        {/* Coach Activity Breakdown */}
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <Title className="text-white text-lg mb-4">Coach Activity</Title>
          <CoachActivityGrid activity={metrics.coachesByActivity} />
        </div>
      </Grid>

      {/* System Health Row */}
      <div className="bg-admin-card border border-admin-border rounded-lg p-4">
        <Flex alignItems="center" className="mb-4">
          <Title className="text-white text-lg">System Health</Title>
          <Text className="text-gray-400">Last 30 days</Text>
        </Flex>
        
        <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-4">
          <ServiceHealthIndicator
            name="API Server"
            status={metrics.systemHealth.api}
          />
          <ServiceHealthIndicator
            name="Database"
            status={metrics.systemHealth.database}
          />
          <ServiceHealthIndicator
            name="LiveKit"
            status={metrics.systemHealth.livekit}
          />
          <ServiceHealthIndicator
            name="Skool Sync"
            status={metrics.systemHealth.skool}
          />
        </Grid>

        <Tracker data={uptimeData} className="mt-4" />
      </div>

      {/* Voice Minutes Breakdown */}
      <div className="bg-admin-card border border-admin-border rounded-lg p-4">
        <Title className="text-white text-lg mb-4">Voice Usage</Title>
        <Grid numItemsSm={3} className="gap-4">
          <VoiceUsageCard
            period="Today"
            minutes={metrics.clientVoiceMinutes.today}
            max={500}
          />
          <VoiceUsageCard
            period="This Week"
            minutes={metrics.clientVoiceMinutes.week}
            max={3500}
          />
          <VoiceUsageCard
            period="This Month"
            minutes={metrics.clientVoiceMinutes.month}
            max={15000}
          />
        </Grid>
      </div>
    </div>
  );
}

// Helper Components

function ServiceHealthIndicator({ name, status }: { name: string; status: boolean }) {
  return (
    <Flex alignItems="center" className="gap-2">
      <div
        className={`w-3 h-3 rounded-full ${
          status ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <Text className="text-gray-300">{name}</Text>
      <Text className={status ? 'text-green-400' : 'text-red-400'}>
        {status ? 'Online' : 'Offline'}
      </Text>
    </Flex>
  );
}

function VoiceUsageCard({
  period,
  minutes,
  max,
}: {
  period: string;
  minutes: number;
  max: number;
}) {
  const percentage = Math.min((minutes / max) * 100, 100);
  
  return (
    <div>
      <Flex>
        <Text className="text-gray-400">{period}</Text>
        <Text className="text-white font-medium">
          {minutes.toLocaleString()} min
        </Text>
      </Flex>
      <ProgressBar value={percentage} className="mt-2" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-admin-card rounded w-48" />
      <Grid numItemsLg={4} className="gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-admin-card rounded-lg" />
        ))}
      </Grid>
    </div>
  );
}
