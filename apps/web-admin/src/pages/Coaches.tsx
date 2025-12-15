import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Title, Text, Badge } from '@tremor/react';
import { createColumnHelper } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Calendar, Users } from 'lucide-react';
import { DataTable } from '@/components/tables';
import { api } from '@/services/api';
import type { Coach } from '@/types/admin';

const columnHelper = createColumnHelper<Coach>();

export default function Coaches() {
  const { data: coaches = [], isLoading } = useQuery({
    queryKey: ['admin-coaches'],
    queryFn: () => api.get<Coach[]>('/admin/coaches'),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <span className="font-medium text-white">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('clientCount', {
        header: 'Clients',
        cell: (info) => (
          <span className="flex items-center gap-1">
            <Users size={14} className="text-gray-400" />
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('totalSessions', {
        header: 'Sessions',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('weeklyHours', {
        header: 'Weekly Hours',
        cell: (info) => `${info.getValue()}h`,
      }),
      columnHelper.accessor('lastSeen', {
        header: 'Last Active',
        cell: (info) => format(new Date(info.getValue()), 'MMM d, yyyy HH:mm'),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: () => (
          <div className="flex gap-2">
            <button
              className="p-1 hover:bg-admin-border rounded"
              title="View profile"
            >
              <Eye size={16} />
            </button>
            <button
              className="p-1 hover:bg-admin-border rounded"
              title="View calendar"
            >
              <Calendar size={16} />
            </button>
          </div>
        ),
      }),
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <Title className="text-white">Coaches</Title>
        <Text className="text-gray-400">
          {coaches.length} registered coaches
        </Text>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-96 bg-admin-card rounded-lg" />
      ) : (
        <DataTable data={coaches} columns={columns} searchColumn="name" />
      )}
    </div>
  );
}
