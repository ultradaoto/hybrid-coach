import Highlighter from 'react-highlight-words';
import { format } from 'date-fns';
import type { TranscriptMessage } from '@/types/transcript';
import SpeakerBadge from './SpeakerBadge';

interface MessageItemProps {
  message: TranscriptMessage;
  searchQuery?: string;
  isHighlighted?: boolean;
  isActiveMatch?: boolean;
}

export default function MessageItem({
  message,
  searchQuery,
  isHighlighted,
  isActiveMatch,
}: MessageItemProps) {
  const timestamp = format(new Date(message.timestamp), 'HH:mm:ss');

  return (
    <div
      className={`
        transcript-message p-4 border-b border-admin-border/50
        ${isActiveMatch ? 'bg-admin-accent/20 ring-1 ring-admin-accent' : ''}
        ${isHighlighted && !isActiveMatch ? 'bg-yellow-500/10' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Speaker Avatar/Badge */}
        <SpeakerBadge
          role={message.speakerRole}
          name={message.speakerName}
        />

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name + Timestamp */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-white">
              {message.speakerName}
            </span>
            <span className="text-xs text-gray-500">{timestamp}</span>
            {message.confidence && message.confidence < 0.8 && (
              <span className="text-xs text-yellow-500">
                ({Math.round(message.confidence * 100)}% confidence)
              </span>
            )}
          </div>

          {/* Message Text with Search Highlighting */}
          <p className="text-gray-300 whitespace-pre-wrap break-words">
            {searchQuery ? (
              <Highlighter
                searchWords={[searchQuery]}
                autoEscape
                textToHighlight={message.content}
                highlightClassName="bg-yellow-500 text-black px-0.5 rounded"
              />
            ) : (
              message.content
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
