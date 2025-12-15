import { useParams, useNavigate } from 'react-router-dom';
import { Title, Text } from '@tremor/react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useTranscript } from '@/hooks/useTranscript';
import { TranscriptViewer } from '@/components/transcript';

export default function TranscriptDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const { data: messages = [], isLoading } = useTranscript(sessionId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/transcripts')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Transcripts
        </button>
        
        <div className="flex justify-between items-start">
          <div>
            <Title className="text-white">Session Transcript</Title>
            <Text className="text-gray-400 font-mono">
              {sessionId}
            </Text>
          </div>
          
          <div className="flex gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <MessageSquare size={14} />
              {messages.length} messages
            </span>
          </div>
        </div>
      </div>

      {/* Transcript Viewer */}
      <div className="flex-1 min-h-0">
        <TranscriptViewer messages={messages} isLoading={isLoading} />
      </div>
    </div>
  );
}
