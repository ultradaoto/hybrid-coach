


# Admin Dashboard - Library Quick Reference

## Core UI & Dashboard
```bash
bun add @tremor/react          # Dashboard components, KPIs, charts (Vercel-backed)
bun add @tanstack/react-query  # Data fetching & caching
bun add zustand                # State management
bun add lucide-react           # Icons
bun add clsx                   # Conditional classes
```

## Data Tables
```bash
bun add @tanstack/react-table  # Headless table with sorting/filtering/pagination
```

## Transcript Viewer (Virtualization)
```bash
bun add @tanstack/react-virtual   # Virtualized lists for 10,000+ items
bun add react-highlight-words     # Search highlighting within text
```

## Log Viewer
```bash
bun add @melloware/react-logviewer  # Real-time log streaming with WebSocket
bun add @uiw/react-json-view        # Expandable JSON viewer for structured logs
bun add react-syntax-highlighter    # Syntax highlighting for code/JSON
```

## Charts (Real-time)
```bash
bun add react-chartjs-2         # Chart.js wrapper for React
bun add chart.js                # Underlying chart library
bun add chartjs-adapter-date-fns  # Date formatting for time series
```

## LiveKit Audio
```bash
bun add livekit-client                # LiveKit client SDK
bun add @livekit/components-react     # React components for LiveKit
```

## Utilities
```bash
bun add date-fns   # Date formatting
```

## Dev Dependencies
```bash
bun add -D tailwindcss postcss autoprefixer
bun add -D @types/react @types/react-dom
bun add -D @types/react-highlight-words
bun add -D @types/react-syntax-highlighter
```

---

## One-liner Install (all at once)

```bash
cd apps/web-admin

# Production dependencies
bun add react react-dom react-router-dom @tanstack/react-query @tanstack/react-table @tanstack/react-virtual @tremor/react @melloware/react-logviewer @uiw/react-json-view react-highlight-words react-syntax-highlighter react-chartjs-2 chart.js chartjs-adapter-date-fns livekit-client @livekit/components-react zustand date-fns clsx lucide-react

# Dev dependencies
bun add -D @vitejs/plugin-react tailwindcss postcss autoprefixer typescript @types/react @types/react-dom @types/react-highlight-words @types/react-syntax-highlighter
```

---

## Library Purpose Summary

| Library | Purpose | Use Case |
|---------|---------|----------|
| `@tremor/react` | Dashboard UI | Metric cards, progress bars, gauges, basic charts |
| `@tanstack/react-table` | Data tables | Users, coaches, sessions tables with sort/filter |
| `@tanstack/react-virtual` | Virtualization | Long transcript lists (30+ min conversations) |
| `@melloware/react-logviewer` | Log streaming | PM2/Bun process logs in real-time |
| `@uiw/react-json-view` | JSON viewer | Expanding structured log data |
| `react-highlight-words` | Text highlighting | Search within transcripts |
| `react-chartjs-2` | Real-time charts | Activity charts with live updates |
| `livekit-client` | Audio monitoring | Listen-in to active rooms |
| `zustand` | State management | Auth state, UI preferences |
| `@tanstack/react-query` | Data fetching | API calls with caching and polling |

---

## Key Component → Library Mapping

```
Dashboard Page
├── MetricCard         → @tremor/react (Card, Metric, BadgeDelta)
├── ActivityChart      → react-chartjs-2 (Line chart)
├── CoachActivityGrid  → @tremor/react (Grid, ProgressBar)
└── SystemHealth       → @tremor/react (Tracker, ProgressCircle)

Transcript Viewer
├── VirtualizedList    → @tanstack/react-virtual
├── SearchHighlight    → react-highlight-words
└── SpeakerBadge       → Custom component

Log Viewer
├── LogStream          → @melloware/react-logviewer
├── JsonExpander       → @uiw/react-json-view
└── ProcessSelector    → @tremor/react (Select)

Data Tables
├── UserTable          → @tanstack/react-table
├── CoachTable         → @tanstack/react-table
└── SessionTable       → @tanstack/react-table

Health Monitor
├── CPUGauge           → @tremor/react (ProgressCircle)
├── MemoryGauge        → @tremor/react (ProgressCircle)
├── UptimeTracker      → @tremor/react (Tracker)
└── ServiceStatus      → @tremor/react (Badge)

Room Audio
└── AudioMonitor       → @livekit/components-react
```

---

## Bundle Size Estimate

| Library | Gzipped Size |
|---------|--------------|
| @tremor/react | ~44 KB |
| @tanstack/react-table | ~15 KB |
| @tanstack/react-virtual | ~15 KB |
| react-chartjs-2 + chart.js | ~60 KB |
| @melloware/react-logviewer | ~20 KB |
| zustand | ~3 KB |
| lucide-react (tree-shaken) | ~5 KB |
| **Total (estimated)** | **~160 KB** |

This is a reasonable bundle for an admin dashboard that won't be used by end clients.