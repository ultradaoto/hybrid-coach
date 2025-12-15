import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Title, Text, Select, SelectItem } from '@tremor/react';
import { Bug } from 'lucide-react';
import { BugCard, BugDetailModal } from '@/components/bugs';
import { api } from '@/services/api';

type BugStatus = 'open' | 'in_progress' | 'resolved';

interface BugReport {
  id: string;
  userId?: string;
  email?: string;
  description: string;
  screenshot?: string;
  status: BugStatus;
  createdAt: string;
  userAgent?: string;
  url?: string;
}

export default function BugInbox() {
  const [statusFilter, setStatusFilter] = useState<BugStatus | 'all'>('all');
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null);
  const queryClient = useQueryClient();

  const { data: bugs = [], isLoading } = useQuery({
    queryKey: ['bug-reports', statusFilter],
    queryFn: () =>
      api.get<BugReport[]>(
        `/admin/bugs${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`
      ),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BugStatus }) =>
      api.patch(`/admin/bugs/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bug-reports'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Title className="text-white">Bug Reports</Title>
          <Text className="text-gray-400">
            {bugs.filter((b) => b.status === 'open').length} open issues
          </Text>
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as BugStatus | 'all')}
          className="w-40"
        >
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-admin-card rounded-lg animate-pulse" />
          ))}
        </div>
      ) : bugs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Bug size={48} className="mx-auto mb-4 opacity-50" />
          <Text>No bug reports found</Text>
        </div>
      ) : (
        <div className="space-y-4">
          {bugs.map((bug) => (
            <BugCard
              key={bug.id}
              bug={bug}
              onClick={() => setSelectedBug(bug)}
              onStatusChange={(status) => updateStatus.mutate({ id: bug.id, status })}
            />
          ))}
        </div>
      )}

      {/* Bug Detail Modal */}
      {selectedBug && (
        <BugDetailModal
          bug={selectedBug}
          onClose={() => setSelectedBug(null)}
          onStatusChange={(status) => {
            updateStatus.mutate({ id: selectedBug.id, status });
            setSelectedBug(null);
          }}
        />
      )}
    </div>
  );
}
