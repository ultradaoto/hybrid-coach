import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

interface TranscriptSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  activeMatch: number;
  onNavigate: (index: number) => void;
}

export default function TranscriptSearch({
  query,
  onQueryChange,
  matchCount,
  activeMatch,
  onNavigate,
}: TranscriptSearchProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search transcript..."
          className="w-full pl-9 pr-4 py-2 bg-admin-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-admin-accent"
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Match Navigation */}
      {query && matchCount > 0 && (
        <div className="flex items-center gap-1 text-sm text-gray-400">
          <span>
            {activeMatch + 1} / {matchCount}
          </span>
          <button
            onClick={() =>
              onNavigate((activeMatch - 1 + matchCount) % matchCount)
            }
            className="p-1 hover:bg-admin-border rounded"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => onNavigate((activeMatch + 1) % matchCount)}
            className="p-1 hover:bg-admin-border rounded"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      )}

      {query && matchCount === 0 && (
        <span className="text-sm text-red-400">No matches</span>
      )}
    </div>
  );
}
