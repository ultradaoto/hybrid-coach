import { useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download } from 'lucide-react';
import type { TranscriptMessage, SpeakerRole } from '@/types/transcript';
import MessageItem from './MessageItem';
import TranscriptSearch from './TranscriptSearch';
import TranscriptFilters from './TranscriptFilters';

interface TranscriptViewerProps {
  messages: TranscriptMessage[];
  isLoading?: boolean;
}

export default function TranscriptViewer({
  messages,
  isLoading,
}: TranscriptViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSpeakers, setActiveSpeakers] = useState<Set<SpeakerRole>>(
    new Set(['client', 'coach', 'ai'])
  );
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // Filter messages by active speakers
  const filteredMessages = messages.filter((msg) =>
    activeSpeakers.has(msg.speakerRole)
  );

  // Find search matches
  const searchMatches = searchQuery
    ? filteredMessages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg }) =>
          msg.content.toLowerCase().includes(searchQuery.toLowerCase())
        )
    : [];

  // Virtual list for performance with variable heights
  const virtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated row height
    overscan: 5,
  });

  // Scroll to match
  const scrollToMatch = useCallback(
    (index: number) => {
      if (searchMatches[index]) {
        virtualizer.scrollToIndex(searchMatches[index].idx, {
          align: 'center',
        });
        setActiveMatchIndex(index);
      }
    },
    [searchMatches, virtualizer]
  );

  // Toggle speaker filter
  const toggleSpeaker = (role: SpeakerRole) => {
    const newSet = new Set(activeSpeakers);
    if (newSet.has(role)) {
      newSet.delete(role);
    } else {
      newSet.add(role);
    }
    setActiveSpeakers(newSet);
  };

  if (isLoading) {
    return <TranscriptSkeleton />;
  }

  return (
    <div className="flex flex-col h-full bg-admin-card rounded-lg border border-admin-border">
      {/* Header with Search and Filters */}
      <div className="p-4 border-b border-admin-border space-y-3">
        {/* Search */}
        <TranscriptSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          matchCount={searchMatches.length}
          activeMatch={activeMatchIndex}
          onNavigate={scrollToMatch}
        />

        {/* Speaker Filters */}
        <TranscriptFilters
          activeSpeakers={activeSpeakers}
          onToggleSpeaker={toggleSpeaker}
        />
      </div>

      {/* Virtualized Message List */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const message = filteredMessages[virtualRow.index];
            const isMatch = Boolean(
              searchQuery &&
              message.content.toLowerCase().includes(searchQuery.toLowerCase())
            );
            const isActiveMatch =
              searchMatches[activeMatchIndex]?.msg.id === message.id;

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MessageItem
                  message={message}
                  searchQuery={searchQuery}
                  isHighlighted={isMatch}
                  isActiveMatch={isActiveMatch}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with stats */}
      <div className="p-3 border-t border-admin-border flex justify-between text-sm text-gray-400">
        <span>{filteredMessages.length} messages</span>
        <button className="flex items-center gap-1 hover:text-white transition-colors">
          <Download size={14} />
          Export
        </button>
      </div>
    </div>
  );
}

function TranscriptSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="w-10 h-10 bg-admin-border rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-admin-border rounded w-24" />
            <div className="h-12 bg-admin-border rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
