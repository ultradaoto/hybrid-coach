import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Title, Text, Badge } from '@tremor/react';
import { createColumnHelper } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Mail } from 'lucide-react';
import { DataTable } from '@/components/tables';
import { api } from '@/services/api';
import type { User } from '@/types/admin';

const columnHelper = createColumnHelper<User>();

export default function Users() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<User[]>('/admin/users'),
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
      columnHelper.accessor('role', {
        header: 'Role',
        cell: (info) => (
          <Badge color={info.getValue() === 'coach' ? 'blue' : 'emerald'}>
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor('totalSessions', {
        header: 'Sessions',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('totalMinutes', {
        header: 'Minutes',
        cell: (info) => info.getValue().toLocaleString(),
      }),
      columnHelper.accessor('lastSeen', {
        header: 'Last Seen',
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
              title="Send email"
            >
              <Mail size={16} />
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
        <Title className="text-white">Users</Title>
        <Text className="text-gray-400">
          {users.length} total users registered
        </Text>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-96 bg-admin-card rounded-lg" />
      ) : (
        <DataTable data={users} columns={columns} searchColumn="name" />
      )}
    </div>
  );
}
