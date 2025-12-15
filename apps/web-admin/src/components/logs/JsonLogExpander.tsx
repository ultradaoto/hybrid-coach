import { useState } from 'react';
import JsonView from '@uiw/react-json-view';
import { darkTheme } from '@uiw/react-json-view/dark';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface JsonLogExpanderProps {
  data: Record<string, unknown>;
}

export default function JsonLogExpander({ data }: JsonLogExpanderProps) {
  const [expanded, setExpanded] = useState(false);

  // Show preview of JSON keys
  const keys = Object.keys(data).slice(0, 3);
  const preview = keys.join(', ') + (Object.keys(data).length > 3 ? '...' : '');

  return (
    <span className="inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-admin-accent hover:underline"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {`{${preview}}`}
      </button>

      {expanded && (
        <div className="mt-2 ml-4 p-2 bg-admin-bg rounded border border-admin-border">
          <JsonView
            value={data}
            style={darkTheme}
            displayDataTypes={false}
            displayObjectSize={false}
            enableClipboard={true}
          />
        </div>
      )}
    </span>
  );
}
