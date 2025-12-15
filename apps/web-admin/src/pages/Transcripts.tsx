import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Title, Text, Badge } from '@tremor/react';
import { createColumnHelper } from '@tanstack/react-table';
import { format } from 'date-fns';
import { FileText, Clock, MessageSquare } from 'lucide-react';
import { DataTable } from '@/components/tables';
import { api } from '@/services/api';
import type { TranscriptSession } from '@/types/transcript';

const columnHelper = createColumnHelper<TranscriptSession>();

export default function Transcripts() {
  const navigate = useNavigate();
  
  const { data: transcripts = [], isLoading } = useQuery({
    queryKey: ['transcripts'],
    queryFn: () => api.get<TranscriptSession[]>('/admin/transcripts'),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('id', {
        header: 'Session ID',
        cell: (info) => (
          <span className="font-mono text-sm text-gray-400">
            {info.getValue().slice(0, 8)}
          </span>
        ),
      }),
      columnHelper.accessor('clientName', {
        header: 'Client',
        cell: (info) => (
          <span className="font-medium text-white">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('coachName', {
        header: 'Coach',
        cell: (info) => info.getValue() || <span className="text-gray-500">AI Only</span>,
      }),
      columnHelper.accessor('startTime', {
        header: 'Date',
        cell: (info) => format(new Date(info.getValue()), 'MMM d, yyyy HH:mm'),
      }),
      columnHelper.accessor('durationMinutes', {
        header: 'Duration',
        cell: (info) => (
          <span className="flex items-center gap-1">
            <Clock size={14} className="text-gray-400" />
            {info.getValue()}m
          </span>
        ),
      }),
      columnHelper.accessor('messageCount', {
        header: 'Messages',
        cell: (info) => (
          <span className="flex items-center gap-1">
            <MessageSquare size={14} className="text-gray-400" />
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => (
          <button
            onClick={() => navigate(`/transcripts/${info.row.original.id}`)}
            className="flex items-center gap-1 px-2 py-1 bg-admin-accent hover:bg-admin-accent/80 rounded text-white text-sm"
          >
            <FileText size={14} />
            View
          </button>
        ),
      }),
    ],
    [navigate]
  );

  return (
    <div className="space-y-6">
      <div>
        <Title className="text-white">Transcripts</Title>
        <Text className="text-gray-400">
          {transcripts.length} session transcripts
        </Text>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-96 bg-admin-card rounded-lg" />
      ) : (
        <DataTable data={transcripts} columns={columns} searchColumn="clientName" />
      )}
    </div>
  );
}
