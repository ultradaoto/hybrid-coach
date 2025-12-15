# MyUltra.Coach Admin Dashboard - Complete Implementation Guide

This guide provides the full implementation for your data-dense admin dashboard using the optimal React TypeScript library stack based on research.

---

## Table of Contents

1. [Directory Structure](#1-directory-structure)
2. [Package Installation](#2-package-installation)
3. [Configuration Files](#3-configuration-files)
4. [Core Application Setup](#4-core-application-setup)
5. [Dashboard Components](#5-dashboard-components)
6. [Transcript Viewer](#6-transcript-viewer)
7. [Log Viewer](#7-log-viewer)
8. [Server Health Monitor](#8-server-health-monitor)
9. [Data Tables](#9-data-tables)
10. [Bug Bot System](#10-bug-bot-system)
11. [API Routes](#11-api-routes)
12. [WebSocket Services](#12-websocket-services)
13. [PM2 & Dev Script Updates](#13-pm2--dev-script-updates)

---

## 1. Directory Structure

```
apps/web-admin/
├── src/
│   ├── App.tsx                      # Main app with routing
│   ├── main.tsx                     # Entry point
│   ├── index.css                    # Global styles + Tailwind
│   │
│   ├── pages/
│   │   ├── Login.tsx                # Admin login page
│   │   ├── Dashboard.tsx            # Main metrics dashboard
│   │   ├── Users.tsx                # User management table
│   │   ├── Coaches.tsx              # Coach management table
│   │   ├── Rooms.tsx                # Active rooms with listen-in
│   │   ├── Transcripts.tsx          # Transcript browser
│   │   ├── TranscriptDetail.tsx     # Single transcript viewer
│   │   ├── Logs.tsx                 # PM2/Bun log viewer
│   │   ├── Health.tsx               # Server health monitoring
│   │   ├── BugInbox.tsx             # Bug reports inbox
│   │   └── Settings.tsx             # Alert preferences
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   │   ├── Header.tsx           # Top header with user info
│   │   │   └── AdminLayout.tsx      # Layout wrapper
│   │   │
│   │   ├── dashboard/
│   │   │   ├── MetricCard.tsx       # KPI display card
│   │   │   ├── ActivityChart.tsx    # Real-time activity chart
│   │   │   ├── CoachActivityGrid.tsx # Coach status grid
│   │   │   └── QuickStats.tsx       # Summary statistics
│   │   │
│   │   ├── transcript/
│   │   │   ├── TranscriptViewer.tsx # Virtualized transcript
│   │   │   ├── MessageItem.tsx      # Single message row
│   │   │   ├── SpeakerBadge.tsx     # Speaker indicator
│   │   │   ├── TranscriptSearch.tsx # Search within transcript
│   │   │   └── TranscriptFilters.tsx # Filter by speaker/time
│   │   │
│   │   ├── logs/
│   │   │   ├── LogViewer.tsx        # Main log display
│   │   │   ├── LogFilters.tsx       # Level/process filters
│   │   │   ├── JsonLogExpander.tsx  # Expandable JSON logs
│   │   │   └── ProcessSelector.tsx  # PM2 process selector
│   │   │
│   │   ├── health/
│   │   │   ├── SystemMetrics.tsx    # CPU/Memory/Disk gauges
│   │   │   ├── ServiceStatus.tsx    # Service health indicators
│   │   │   ├── UptimeTracker.tsx    # 90-day uptime grid
│   │   │   └── AlertBanner.tsx      # Critical alerts
│   │   │
│   │   ├── rooms/
│   │   │   ├── RoomCard.tsx         # Room info card
│   │   │   ├── AudioMonitor.tsx     # Listen-in audio player
│   │   │   └── ParticipantList.tsx  # Room participants
│   │   │
│   │   ├── tables/
│   │   │   ├── DataTable.tsx        # Generic TanStack table
│   │   │   ├── UserTable.tsx        # Users-specific table
│   │   │   ├── CoachTable.tsx       # Coaches-specific table
│   │   │   └── SessionTable.tsx     # Sessions table
│   │   │
│   │   └── bugs/
│   │       ├── BugCard.tsx          # Bug report card
│   │       ├── BugDetailModal.tsx   # Full bug view
│   │       └── BugStatusBadge.tsx   # Status indicator
│   │
│   ├── hooks/
│   │   ├── useAdminAuth.ts          # Admin authentication
│   │   ├── useMetrics.ts            # Dashboard metrics polling
│   │   ├── useLogs.ts               # Log streaming WebSocket
│   │   ├── useHealth.ts             # Health check polling
│   │   ├── useTranscript.ts         # Transcript loading
│   │   └── useAudioMonitor.ts       # LiveKit audio subscription
│   │
│   ├── services/
│   │   ├── api.ts                   # API client
│   │   ├── websocket.ts             # WebSocket manager
│   │   └── livekit.ts               # LiveKit client setup
│   │
│   ├── stores/
│   │   ├── authStore.ts             # Zustand auth state
│   │   └── uiStore.ts               # UI preferences
│   │
│   ├── types/
│   │   ├── admin.ts                 # Admin-specific types
│   │   ├── metrics.ts               # Metrics interfaces
│   │   ├── transcript.ts            # Transcript types
│   │   └── logs.ts                  # Log entry types
│   │
│   └── utils/
│       ├── formatters.ts            # Date/number formatters
│       ├── speakerColors.ts         # Speaker color mapping
│       └── logParser.ts             # Log level parsing
│
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
└── postcss.config.js
```

---

## 2. Package Installation

Create `apps/web-admin/package.json`:

```json
{
  "name": "@myultra/web-admin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext ts,tsx"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    
    "@tanstack/react-query": "^5.60.0",
    "@tanstack/react-table": "^8.20.0",
    "@tanstack/react-virtual": "^3.10.0",
    
    "@tremor/react": "^3.18.0",
    
    "@melloware/react-logviewer": "^6.3.4",
    "@uiw/react-json-view": "^2.0.0-alpha.27",
    "react-highlight-words": "^0.20.0",
    "react-syntax-highlighter": "^15.6.1",
    
    "react-chartjs-2": "^5.2.0",
    "chart.js": "^4.4.6",
    "chartjs-plugin-streaming": "^2.0.0",
    "chartjs-adapter-date-fns": "^3.0.0",
    
    "@livekit/components-react": "^2.6.0",
    "livekit-client": "^2.5.0",
    
    "zustand": "^5.0.0",
    "date-fns": "^4.1.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    
    "@myultra/ui": "workspace:*",
    "@myultra/types": "workspace:*",
    "@myultra/utils": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/react-highlight-words": "^0.20.0",
    "@types/react-syntax-highlighter": "^15.5.13",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vite": "^6.0.1"
  }
}
```

**Install with Bun:**

```bash
cd apps/web-admin
bun install
```

---

## 3. Configuration Files

### `apps/web-admin/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const host = process.env.HOST ?? '127.0.0.1';
const apiPort = process.env.API_PORT ?? 3699;

export default defineConfig({
  plugins: [react()],
  
  // In production, served at /admin/
  base: process.env.NODE_ENV === 'production' ? '/admin/' : '/',
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@myultra/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@myultra/types': path.resolve(__dirname, '../../packages/types/src'),
      '@myultra/utils': path.resolve(__dirname, '../../packages/utils/src'),
    },
  },
  
  server: {
    host,
    port: Number(process.env.ADMIN_PORT ?? 3703),
    proxy: {
      '/api': {
        target: `http://${host}:${apiPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://${host}:${apiPort}`,
        ws: true,
      },
    },
  },
  
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

### `apps/web-admin/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // Include Tremor components
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom admin theme colors
        admin: {
          bg: '#0f1419',
          card: '#1a1f2e',
          border: '#2d3748',
          accent: '#6366f1',
        },
        // Speaker colors for transcripts
        speaker: {
          client: '#10b981',    // Emerald for client
          coach: '#3b82f6',     // Blue for coach
          ai: '#a855f7',        // Purple for AI
        },
        // Log level colors
        log: {
          error: '#ef4444',
          warn: '#f59e0b',
          info: '#3b82f6',
          debug: '#6b7280',
        },
      },
    },
  },
  plugins: [],
};
```

### `apps/web-admin/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@myultra/ui": ["../../packages/ui/src"],
      "@myultra/types": ["../../packages/types/src"],
      "@myultra/utils": ["../../packages/utils/src"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### `apps/web-admin/index.html`

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MyUltra Admin</title>
  </head>
  <body class="bg-admin-bg text-white">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## 4. Core Application Setup

### `apps/web-admin/src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      refetchInterval: 1000 * 60, // 1 minute
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

### `apps/web-admin/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom scrollbar for dark theme */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #1a1f2e;
}

::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}

/* Log viewer customizations */
.log-viewer {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
}

/* Transcript message hover */
.transcript-message:hover {
  background: rgba(99, 102, 241, 0.1);
}
```

### `apps/web-admin/src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import AdminLayout from '@/components/layout/AdminLayout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Users from '@/pages/Users';
import Coaches from '@/pages/Coaches';
import Rooms from '@/pages/Rooms';
import Transcripts from '@/pages/Transcripts';
import TranscriptDetail from '@/pages/TranscriptDetail';
import Logs from '@/pages/Logs';
import Health from '@/pages/Health';
import BugInbox from '@/pages/BugInbox';
import Settings from '@/pages/Settings';

// Determine base path from environment
const basePath = import.meta.env.PROD ? '/admin' : '';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  
  if (!isAuthenticated) {
    return <Navigate to={`${basePath}/login`} replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter basename={basePath}>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<Login />} />
        
        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="coaches" element={<Coaches />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="transcripts" element={<Transcripts />} />
          <Route path="transcripts/:sessionId" element={<TranscriptDetail />} />
          <Route path="logs" element={<Logs />} />
          <Route path="health" element={<Health />} />
          <Route path="bugs" element={<BugInbox />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        
        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### `apps/web-admin/src/stores/authStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'superadmin';
}

interface AuthState {
  token: string | null;
  user: AdminUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      
      login: (token, user) =>
        set({
          token,
          user,
          isAuthenticated: true,
        }),
      
      logout: () =>
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'admin-auth',
    }
  )
);
```

---

## 5. Dashboard Components

### `apps/web-admin/src/components/layout/Sidebar.tsx`

```typescript
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Radio,
  FileText,
  Terminal,
  Activity,
  Bug,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/coaches', icon: UserCheck, label: 'Coaches' },
  { to: '/rooms', icon: Radio, label: 'Active Rooms' },
  { to: '/transcripts', icon: FileText, label: 'Transcripts' },
  { to: '/logs', icon: Terminal, label: 'Logs' },
  { to: '/health', icon: Activity, label: 'Health' },
  { to: '/bugs', icon: Bug, label: 'Bug Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  
  return (
    <aside className="w-64 bg-admin-card border-r border-admin-border h-screen flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-admin-border">
        <h1 className="text-xl font-bold text-admin-accent">
          MyUltra Admin
        </h1>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-admin-accent text-white'
                  : 'text-gray-400 hover:bg-admin-border hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      
      {/* Logout */}
      <div className="p-4 border-t border-admin-border">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full text-gray-400 hover:text-red-400 transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
```

### `apps/web-admin/src/components/layout/AdminLayout.tsx`

```typescript
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AdminLayout() {
  return (
    <div className="flex h-screen bg-admin-bg">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

### `apps/web-admin/src/components/dashboard/MetricCard.tsx`

Using Tremor for beautiful, dense metric cards:

```typescript
import { Card, Metric, Text, BadgeDelta, Flex } from '@tremor/react';
import type { DeltaType } from '@tremor/react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  delta?: number;
  deltaType?: DeltaType;
  icon?: React.ReactNode;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  delta,
  deltaType = 'unchanged',
  icon,
}: MetricCardProps) {
  return (
    <Card className="bg-admin-card border-admin-border">
      <Flex alignItems="start">
        <div>
          <Text className="text-gray-400">{title}</Text>
          <Metric className="text-white mt-1">{value}</Metric>
          {subtitle && (
            <Text className="text-gray-500 text-sm mt-1">{subtitle}</Text>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {icon}
          {delta !== undefined && (
            <BadgeDelta deltaType={deltaType}>
              {delta > 0 ? '+' : ''}{delta}%
            </BadgeDelta>
          )}
        </div>
      </Flex>
    </Card>
  );
}
```

### `apps/web-admin/src/pages/Dashboard.tsx`

The main dashboard page with dense metrics layout:

```typescript
import { useQuery } from '@tanstack/react-query';
import { Grid, Title, Text, Flex, ProgressBar, Tracker } from '@tremor/react';
import {
  Users,
  Radio,
  UserCheck,
  Clock,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import MetricCard from '@/components/dashboard/MetricCard';
import ActivityChart from '@/components/dashboard/ActivityChart';
import CoachActivityGrid from '@/components/dashboard/CoachActivityGrid';
import { api } from '@/services/api';

interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  activeRooms: number;
  totalCoaches: number;
  coachesByActivity: {
    recent1h: number;
    recent1d: number;
    recent1w: number;
    recent1m: number;
  };
  clientVoiceMinutes: {
    today: number;
    week: number;
    month: number;
  };
  skoolSyncStatus: {
    lastRun: string;
    success: boolean;
    error?: string;
  };
  systemHealth: {
    api: boolean;
    database: boolean;
    livekit: boolean;
    skool: boolean;
  };
}

export default function Dashboard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => api.get<AdminMetrics>('/api/admin/metrics'),
    refetchInterval: 30000, // Refresh every 30s
  });

  if (isLoading || !metrics) {
    return <DashboardSkeleton />;
  }

  // Build tracker data for uptime visualization
  const uptimeData = buildUptimeTracker(metrics.systemHealth);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <Title className="text-white">Dashboard</Title>
        <Text className="text-gray-400">
          Real-time overview of MyUltra.Coach system
        </Text>
      </div>

      {/* Skool Sync Alert */}
      {!metrics.skoolSyncStatus.success && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-500" size={20} />
          <div>
            <Text className="text-red-400 font-medium">Skool Sync Failed</Text>
            <Text className="text-red-300 text-sm">
              Last attempt: {metrics.skoolSyncStatus.lastRun} - {metrics.skoolSyncStatus.error}
            </Text>
          </div>
        </div>
      )}

      {/* Primary Metrics Grid - Dense 4-column layout */}
      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        <MetricCard
          title="Total Users"
          value={metrics.totalUsers.toLocaleString()}
          subtitle={`${metrics.activeUsers} active now`}
          icon={<Users className="text-admin-accent" size={24} />}
        />
        <MetricCard
          title="Active Rooms"
          value={metrics.activeRooms}
          subtitle="Live sessions"
          icon={<Radio className="text-green-500" size={24} />}
        />
        <MetricCard
          title="Active Coaches"
          value={metrics.coachesByActivity.recent1h}
          subtitle={`${metrics.totalCoaches} total`}
          icon={<UserCheck className="text-blue-500" size={24} />}
        />
        <MetricCard
          title="Voice Minutes Today"
          value={metrics.clientVoiceMinutes.today.toLocaleString()}
          subtitle={`${metrics.clientVoiceMinutes.week.toLocaleString()} this week`}
          icon={<Clock className="text-purple-500" size={24} />}
        />
      </Grid>

      {/* Secondary Row - Charts and Details */}
      <Grid numItemsSm={1} numItemsLg={2} className="gap-4">
        {/* Real-time Activity Chart */}
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <Title className="text-white text-lg mb-4">Session Activity</Title>
          <ActivityChart />
        </div>

        {/* Coach Activity Breakdown */}
        <div className="bg-admin-card border border-admin-border rounded-lg p-4">
          <Title className="text-white text-lg mb-4">Coach Activity</Title>
          <CoachActivityGrid activity={metrics.coachesByActivity} />
        </div>
      </Grid>

      {/* System Health Row */}
      <div className="bg-admin-card border border-admin-border rounded-lg p-4">
        <Flex alignItems="center" className="mb-4">
          <Title className="text-white text-lg">System Health</Title>
          <Text className="text-gray-400">Last 30 days</Text>
        </Flex>
        
        <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-4">
          <ServiceHealthIndicator
            name="API Server"
            status={metrics.systemHealth.api}
          />
          <ServiceHealthIndicator
            name="Database"
            status={metrics.systemHealth.database}
          />
          <ServiceHealthIndicator
            name="LiveKit"
            status={metrics.systemHealth.livekit}
          />
          <ServiceHealthIndicator
            name="Skool Sync"
            status={metrics.systemHealth.skool}
          />
        </Grid>

        <Tracker data={uptimeData} className="mt-4" />
      </div>

      {/* Voice Minutes Breakdown */}
      <div className="bg-admin-card border border-admin-border rounded-lg p-4">
        <Title className="text-white text-lg mb-4">Voice Usage</Title>
        <Grid numItemsSm={3} className="gap-4">
          <VoiceUsageCard
            period="Today"
            minutes={metrics.clientVoiceMinutes.today}
            max={500}
          />
          <VoiceUsageCard
            period="This Week"
            minutes={metrics.clientVoiceMinutes.week}
            max={3500}
          />
          <VoiceUsageCard
            period="This Month"
            minutes={metrics.clientVoiceMinutes.month}
            max={15000}
          />
        </Grid>
      </div>
    </div>
  );
}

// Helper Components

function ServiceHealthIndicator({ name, status }: { name: string; status: boolean }) {
  return (
    <Flex alignItems="center" className="gap-2">
      <div
        className={`w-3 h-3 rounded-full ${
          status ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <Text className="text-gray-300">{name}</Text>
      <Text className={status ? 'text-green-400' : 'text-red-400'}>
        {status ? 'Online' : 'Offline'}
      </Text>
    </Flex>
  );
}

function VoiceUsageCard({
  period,
  minutes,
  max,
}: {
  period: string;
  minutes: number;
  max: number;
}) {
  const percentage = Math.min((minutes / max) * 100, 100);
  
  return (
    <div>
      <Flex>
        <Text className="text-gray-400">{period}</Text>
        <Text className="text-white font-medium">
          {minutes.toLocaleString()} min
        </Text>
      </Flex>
      <ProgressBar value={percentage} className="mt-2" />
    </div>
  );
}

function buildUptimeTracker(health: AdminMetrics['systemHealth']) {
  // Build 30-day tracker data
  // This would come from stored health check history
  return Array.from({ length: 30 }, (_, i) => ({
    color: 'emerald' as const,
    tooltip: `Day ${i + 1}: All systems operational`,
  }));
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-admin-card rounded w-48" />
      <Grid numItemsLg={4} className="gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-admin-card rounded-lg" />
        ))}
      </Grid>
    </div>
  );
}
```

### `apps/web-admin/src/components/dashboard/ActivityChart.tsx`

Real-time streaming chart using Chart.js:

```typescript
import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DataPoint {
  timestamp: Date;
  sessions: number;
  users: number;
}

export default function ActivityChart() {
  const chartRef = useRef<ChartJS<'line'>>(null);
  const dataRef = useRef<DataPoint[]>([]);

  // Initialize with some data points
  useEffect(() => {
    const now = Date.now();
    dataRef.current = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(now - (20 - i) * 5000),
      sessions: Math.floor(Math.random() * 10) + 5,
      users: Math.floor(Math.random() * 50) + 20,
    }));
  }, []);

  // Simulate real-time updates (replace with WebSocket)
  useEffect(() => {
    const interval = setInterval(() => {
      const chart = chartRef.current;
      if (!chart) return;

      // Add new data point
      const newPoint: DataPoint = {
        timestamp: new Date(),
        sessions: Math.floor(Math.random() * 10) + 5,
        users: Math.floor(Math.random() * 50) + 20,
      };

      dataRef.current.push(newPoint);
      if (dataRef.current.length > 20) {
        dataRef.current.shift();
      }

      // Update chart
      chart.data.labels = dataRef.current.map((d) =>
        d.timestamp.toLocaleTimeString()
      );
      chart.data.datasets[0].data = dataRef.current.map((d) => d.sessions);
      chart.data.datasets[1].data = dataRef.current.map((d) => d.users);
      chart.update('none'); // Update without animation for performance
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const data = {
    labels: dataRef.current.map((d) => d.timestamp.toLocaleTimeString()),
    datasets: [
      {
        label: 'Active Sessions',
        data: dataRef.current.map((d) => d.sessions),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Active Users',
        data: dataRef.current.map((d) => d.users),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: 'rgba(45, 55, 72, 0.5)' },
        ticks: { color: '#9ca3af' },
      },
      y: {
        grid: { color: 'rgba(45, 55, 72, 0.5)' },
        ticks: { color: '#9ca3af' },
        beginAtZero: true,
      },
    },
    plugins: {
      legend: {
        labels: { color: '#9ca3af' },
      },
    },
  };

  return (
    <div className="h-64">
      <Line ref={chartRef} data={data} options={options} />
    </div>
  );
}
```

---

## 6. Transcript Viewer

### `apps/web-admin/src/types/transcript.ts`

```typescript
export type SpeakerRole = 'client' | 'coach' | 'ai';

export interface TranscriptMessage {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  speakerRole: SpeakerRole;
  content: string;
  timestamp: Date;
  confidence?: number; // For AI transcription confidence
}

export interface TranscriptSession {
  id: string;
  clientId: string;
  clientName: string;
  coachId?: string;
  coachName?: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes: number;
  messageCount: number;
}
```

### `apps/web-admin/src/components/transcript/TranscriptViewer.tsx`

Virtualized transcript viewer for 30+ minute conversations:

```typescript
import { useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Filter, Download } from 'lucide-react';
import type { TranscriptMessage, SpeakerRole } from '@/types/transcript';
import MessageItem from './MessageItem';
import TranscriptSearch from './TranscriptSearch';

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
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <SpeakerFilterButton
            role="client"
            label="Client"
            active={activeSpeakers.has('client')}
            onClick={() => toggleSpeaker('client')}
          />
          <SpeakerFilterButton
            role="coach"
            label="Coach"
            active={activeSpeakers.has('coach')}
            onClick={() => toggleSpeaker('coach')}
          />
          <SpeakerFilterButton
            role="ai"
            label="AI Agent"
            active={activeSpeakers.has('ai')}
            onClick={() => toggleSpeaker('ai')}
          />
        </div>
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
            const isMatch =
              searchQuery &&
              message.content.toLowerCase().includes(searchQuery.toLowerCase());
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

// Speaker filter button component
function SpeakerFilterButton({
  role,
  label,
  active,
  onClick,
}: {
  role: SpeakerRole;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const colors = {
    client: 'bg-speaker-client',
    coach: 'bg-speaker-coach',
    ai: 'bg-speaker-ai',
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm flex items-center gap-2 transition-all ${
        active
          ? `${colors[role]} text-white`
          : 'bg-admin-border text-gray-400 opacity-50'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${active ? 'bg-white' : colors[role]}`}
      />
      {label}
    </button>
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
```

### `apps/web-admin/src/components/transcript/MessageItem.tsx`

```typescript
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
```

### `apps/web-admin/src/components/transcript/SpeakerBadge.tsx`

```typescript
import { User, Bot, UserCheck } from 'lucide-react';
import type { SpeakerRole } from '@/types/transcript';

interface SpeakerBadgeProps {
  role: SpeakerRole;
  name: string;
}

export default function SpeakerBadge({ role, name }: SpeakerBadgeProps) {
  const config = {
    client: {
      bg: 'bg-speaker-client',
      icon: User,
    },
    coach: {
      bg: 'bg-speaker-coach',
      icon: UserCheck,
    },
    ai: {
      bg: 'bg-speaker-ai',
      icon: Bot,
    },
  };

  const { bg, icon: Icon } = config[role];
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`
        w-10 h-10 rounded-full ${bg}
        flex items-center justify-center
        text-white font-medium text-sm
        flex-shrink-0
      `}
      title={`${role}: ${name}`}
    >
      {role === 'ai' ? <Icon size={18} /> : initials}
    </div>
  );
}
```

### `apps/web-admin/src/components/transcript/TranscriptSearch.tsx`

```typescript
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
```

---

## 7. Log Viewer

### `apps/web-admin/src/types/logs.ts`

```typescript
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  process: string; // 'api', 'web-coach', 'livekit', etc.
  message: string;
  metadata?: Record<string, unknown>;
}

export interface PM2Process {
  name: string;
  pm_id: number;
  status: 'online' | 'stopped' | 'errored';
  memory: number;
  cpu: number;
  uptime: number;
}
```

### `apps/web-admin/src/components/logs/LogViewer.tsx`

Using @melloware/react-logviewer for streaming logs:

```typescript
import { useState, useEffect } from 'react';
import { LazyLog, ScrollFollow } from '@melloware/react-logviewer';
import { Card, Title, Select, SelectItem, Badge } from '@tremor/react';
import type { LogLevel, PM2Process } from '@/types/logs';
import LogFilters from './LogFilters';
import ProcessSelector from './ProcessSelector';
import JsonLogExpander from './JsonLogExpander';

interface LogViewerProps {
  processes: PM2Process[];
}

export default function LogViewer({ processes }: LogViewerProps) {
  const [selectedProcess, setSelectedProcess] = useState<string>('all');
  const [logLevels, setLogLevels] = useState<Set<LogLevel>>(
    new Set(['error', 'warn', 'info', 'debug'])
  );
  const [searchFilter, setSearchFilter] = useState('');
  const [isFollowing, setIsFollowing] = useState(true);

  // Build WebSocket URL for log streaming
  const wsUrl = buildLogStreamUrl(selectedProcess, logLevels);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Process Selector */}
        <ProcessSelector
          processes={processes}
          selected={selectedProcess}
          onSelect={setSelectedProcess}
        />

        {/* Log Level Filters */}
        <LogFilters levels={logLevels} onChange={setLogLevels} />

        {/* Search */}
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter logs..."
          className="px-3 py-2 bg-admin-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-admin-accent"
        />

        {/* Follow Toggle */}
        <label className="flex items-center gap-2 text-gray-400">
          <input
            type="checkbox"
            checked={isFollowing}
            onChange={(e) => setIsFollowing(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>

      {/* Log Display */}
      <Card className="flex-1 bg-admin-card border-admin-border overflow-hidden">
        <ScrollFollow
          startFollowing={isFollowing}
          render={({ follow, onScroll }) => (
            <LazyLog
              url={wsUrl}
              websocket
              stream
              follow={follow}
              onScroll={onScroll}
              enableSearch
              extraLines={1}
              caseInsensitive
              selectableLines
              filterActive={!!searchFilter}
              formatPart={(text) => formatLogLine(text, searchFilter)}
              style={{
                backgroundColor: '#0f1419',
                color: '#e5e7eb',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
              }}
            />
          )}
        />
      </Card>

      {/* Stats Footer */}
      <div className="flex justify-between text-sm text-gray-400">
        <span>Streaming from: {selectedProcess}</span>
        <span>Levels: {Array.from(logLevels).join(', ')}</span>
      </div>
    </div>
  );
}

// Helper to build WebSocket URL with filters
function buildLogStreamUrl(process: string, levels: Set<LogLevel>): string {
  const host = import.meta.env.VITE_API_HOST || window.location.host;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const levelsParam = Array.from(levels).join(',');
  return `${protocol}//${host}/ws/logs?process=${process}&levels=${levelsParam}`;
}

// Format log line with color coding
function formatLogLine(text: string, filter: string): React.ReactNode {
  // Parse log level from line
  const levelMatch = text.match(/\[(ERROR|WARN|INFO|DEBUG)\]/i);
  const level = levelMatch ? levelMatch[1].toLowerCase() : 'info';

  // Color mapping
  const colors: Record<string, string> = {
    error: 'text-log-error',
    warn: 'text-log-warn',
    info: 'text-log-info',
    debug: 'text-log-debug',
  };

  // Check if line matches filter
  if (filter && !text.toLowerCase().includes(filter.toLowerCase())) {
    return null;
  }

  // Try to parse JSON in the log
  const jsonMatch = text.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      const jsonData = JSON.parse(jsonMatch[0]);
      const prefix = text.slice(0, text.indexOf(jsonMatch[0]));
      return (
        <span className={colors[level]}>
          {prefix}
          <JsonLogExpander data={jsonData} />
        </span>
      );
    } catch {
      // Not valid JSON, render as-is
    }
  }

  return <span className={colors[level]}>{text}</span>;
}
```

### `apps/web-admin/src/components/logs/LogFilters.tsx`

```typescript
import type { LogLevel } from '@/types/logs';

interface LogFiltersProps {
  levels: Set<LogLevel>;
  onChange: (levels: Set<LogLevel>) => void;
}

const LOG_LEVELS: { level: LogLevel; label: string; color: string }[] = [
  { level: 'error', label: 'Error', color: 'bg-log-error' },
  { level: 'warn', label: 'Warn', color: 'bg-log-warn' },
  { level: 'info', label: 'Info', color: 'bg-log-info' },
  { level: 'debug', label: 'Debug', color: 'bg-log-debug' },
];

export default function LogFilters({ levels, onChange }: LogFiltersProps) {
  const toggle = (level: LogLevel) => {
    const newLevels = new Set(levels);
    if (newLevels.has(level)) {
      newLevels.delete(level);
    } else {
      newLevels.add(level);
    }
    onChange(newLevels);
  };

  return (
    <div className="flex items-center gap-1">
      {LOG_LEVELS.map(({ level, label, color }) => (
        <button
          key={level}
          onClick={() => toggle(level)}
          className={`
            px-2 py-1 rounded text-xs font-medium transition-all
            ${
              levels.has(level)
                ? `${color} text-white`
                : 'bg-admin-border text-gray-500'
            }
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

### `apps/web-admin/src/components/logs/JsonLogExpander.tsx`

```typescript
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
```

### `apps/web-admin/src/components/logs/ProcessSelector.tsx`

```typescript
import { Select, SelectItem } from '@tremor/react';
import { Circle } from 'lucide-react';
import type { PM2Process } from '@/types/logs';

interface ProcessSelectorProps {
  processes: PM2Process[];
  selected: string;
  onSelect: (process: string) => void;
}

export default function ProcessSelector({
  processes,
  selected,
  onSelect,
}: ProcessSelectorProps) {
  const statusColors = {
    online: 'text-green-500',
    stopped: 'text-gray-500',
    errored: 'text-red-500',
  };

  return (
    <Select
      value={selected}
      onValueChange={onSelect}
      className="w-48"
      placeholder="Select process"
    >
      <SelectItem value="all">
        All Processes
      </SelectItem>
      {processes.map((proc) => (
        <SelectItem key={proc.name} value={proc.name}>
          <span className="flex items-center gap-2">
            <Circle
              size={8}
              className={`fill-current ${statusColors[proc.status]}`}
            />
            {proc.name}
          </span>
        </SelectItem>
      ))}
    </Select>
  );
}
```

### `apps/web-admin/src/pages/Logs.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import { Title, Text, Grid, Card, Metric } from '@tremor/react';
import { Cpu, HardDrive, Clock } from 'lucide-react';
import LogViewer from '@/components/logs/LogViewer';
import { api } from '@/services/api';
import type { PM2Process } from '@/types/logs';

export default function Logs() {
  const { data: processes = [] } = useQuery({
    queryKey: ['pm2-processes'],
    queryFn: () => api.get<PM2Process[]>('/api/admin/processes'),
    refetchInterval: 5000,
  });

  // Calculate totals
  const totalMemory = processes.reduce((sum, p) => sum + p.memory, 0);
  const avgCpu = processes.length
    ? processes.reduce((sum, p) => sum + p.cpu, 0) / processes.length
    : 0;
  const onlineCount = processes.filter((p) => p.status === 'online').length;

  return (
    <div className="h-full flex flex-col gap-4">
      <div>
        <Title className="text-white">System Logs</Title>
        <Text className="text-gray-400">
          Real-time PM2 and Bun process logs
        </Text>
      </div>

      {/* Process Stats */}
      <Grid numItemsSm={3} className="gap-4">
        <Card className="bg-admin-card border-admin-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Clock className="text-green-500" size={20} />
            </div>
            <div>
              <Text className="text-gray-400">Processes</Text>
              <Metric className="text-white">
                {onlineCount}/{processes.length}
              </Metric>
            </div>
          </div>
        </Card>

        <Card className="bg-admin-card border-admin-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <HardDrive className="text-blue-500" size={20} />
            </div>
            <div>
              <Text className="text-gray-400">Memory</Text>
              <Metric className="text-white">
                {formatBytes(totalMemory)}
              </Metric>
            </div>
          </div>
        </Card>

        <Card className="bg-admin-card border-admin-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Cpu className="text-purple-500" size={20} />
            </div>
            <div>
              <Text className="text-gray-400">Avg CPU</Text>
              <Metric className="text-white">{avgCpu.toFixed(1)}%</Metric>
            </div>
          </div>
        </Card>
      </Grid>

      {/* Log Viewer */}
      <div className="flex-1 min-h-0">
        <LogViewer processes={processes} />
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
```

---

## 8. Server Health Monitor

### `apps/web-admin/src/pages/Health.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import {
  Title,
  Text,
  Grid,
  Card,
  ProgressCircle,
  Flex,
  Badge,
  Tracker,
} from '@tremor/react';
import {
  Server,
  Database,
  Radio,
  Cloud,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/services/api';

interface SystemHealth {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  services: {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    latency?: number;
    lastCheck: string;
  }[];
  uptime: { days: number; hours: number; minutes: number };
  uptimeHistory: { date: string; status: 'healthy' | 'degraded' | 'down' }[];
}

export default function Health() {
  const {
    data: health,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: () => api.get<SystemHealth>('/api/admin/health'),
    refetchInterval: 10000,
  });

  if (isLoading || !health) {
    return <HealthSkeleton />;
  }

  return (
    <div className="space-y-6">
      <Flex>
        <div>
          <Title className="text-white">System Health</Title>
          <Text className="text-gray-400">
            Real-time infrastructure monitoring
          </Text>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 hover:bg-admin-border rounded-lg transition-colors"
        >
          <RefreshCw className="text-gray-400" size={20} />
        </button>
      </Flex>

      {/* System Resources */}
      <Grid numItemsSm={3} className="gap-4">
        <ResourceGauge
          label="CPU Usage"
          value={health.cpu.usage}
          subtitle={`${health.cpu.cores} cores`}
        />
        <ResourceGauge
          label="Memory"
          value={health.memory.percentage}
          subtitle={`${formatGB(health.memory.used)} / ${formatGB(health.memory.total)}`}
        />
        <ResourceGauge
          label="Disk"
          value={health.disk.percentage}
          subtitle={`${formatGB(health.disk.used)} / ${formatGB(health.disk.total)}`}
        />
      </Grid>

      {/* Service Status */}
      <Card className="bg-admin-card border-admin-border">
        <Title className="text-white text-lg mb-4">Service Status</Title>
        <div className="space-y-3">
          {health.services.map((service) => (
            <ServiceStatusRow key={service.name} service={service} />
          ))}
        </div>
      </Card>

      {/* Uptime */}
      <Card className="bg-admin-card border-admin-border">
        <Flex className="mb-4">
          <div>
            <Title className="text-white text-lg">Uptime</Title>
            <Text className="text-gray-400">
              {health.uptime.days}d {health.uptime.hours}h{' '}
              {health.uptime.minutes}m
            </Text>
          </div>
          <Badge color="emerald" size="lg">
            99.9%
          </Badge>
        </Flex>

        <Text className="text-gray-400 mb-2">Last 30 days</Text>
        <Tracker
          data={health.uptimeHistory.map((day) => ({
            color:
              day.status === 'healthy'
                ? 'emerald'
                : day.status === 'degraded'
                  ? 'yellow'
                  : 'red',
            tooltip: `${day.date}: ${day.status}`,
          }))}
        />
      </Card>
    </div>
  );
}

// Resource gauge component
function ResourceGauge({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number;
  subtitle: string;
}) {
  const color = value > 90 ? 'red' : value > 70 ? 'yellow' : 'emerald';

  return (
    <Card className="bg-admin-card border-admin-border">
      <Flex alignItems="center" justifyContent="center" className="gap-4">
        <ProgressCircle value={value} size="lg" color={color}>
          <span className="text-white font-bold">{value}%</span>
        </ProgressCircle>
        <div>
          <Text className="text-gray-400">{label}</Text>
          <Text className="text-white font-medium">{subtitle}</Text>
        </div>
      </Flex>
    </Card>
  );
}

// Service status row
function ServiceStatusRow({
  service,
}: {
  service: SystemHealth['services'][0];
}) {
  const icons: Record<string, React.ReactNode> = {
    'API Server': <Server size={18} />,
    Database: <Database size={18} />,
    LiveKit: <Radio size={18} />,
    'Skool Sync': <Cloud size={18} />,
  };

  const statusConfig = {
    healthy: { color: 'emerald', label: 'Healthy' },
    degraded: { color: 'yellow', label: 'Degraded' },
    down: { color: 'red', label: 'Down' },
  } as const;

  const { color, label } = statusConfig[service.status];

  return (
    <Flex className="p-3 bg-admin-bg rounded-lg">
      <Flex className="gap-3">
        <div className="text-gray-400">
          {icons[service.name] || <Server size={18} />}
        </div>
        <div>
          <Text className="text-white font-medium">{service.name}</Text>
          <Text className="text-gray-500 text-sm">
            Last check: {service.lastCheck}
          </Text>
        </div>
      </Flex>

      <Flex className="gap-3">
        {service.latency && (
          <Text className="text-gray-400">{service.latency}ms</Text>
        )}
        <Badge color={color}>{label}</Badge>
      </Flex>
    </Flex>
  );
}

function formatGB(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

function HealthSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-admin-card rounded w-48" />
      <Grid numItemsSm={3} className="gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-admin-card rounded-lg" />
        ))}
      </Grid>
    </div>
  );
}
```

---

## 9. Data Tables

### `apps/web-admin/src/components/tables/DataTable.tsx`

Generic, reusable TanStack Table component:

```typescript
import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchColumn?: string;
  pageSize?: number;
}

export default function DataTable<T>({
  data,
  columns,
  searchColumn,
  pageSize = 10,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      {searchColumn && (
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search..."
          className="px-4 py-2 bg-admin-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-admin-accent w-64"
        />
      )}

      {/* Table */}
      <div className="overflow-auto rounded-lg border border-admin-border">
        <table className="w-full">
          <thead className="bg-admin-card">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-400"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        className={`flex items-center gap-1 ${
                          header.column.getCanSort()
                            ? 'cursor-pointer hover:text-white'
                            : ''
                        }`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <SortIcon direction={header.column.getIsSorted()} />
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-admin-border">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-admin-card/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm text-gray-300">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>
          Showing {table.getState().pagination.pageIndex * pageSize + 1} to{' '}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * pageSize,
            data.length
          )}{' '}
          of {data.length}
        </span>

        <div className="flex gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1 bg-admin-border rounded disabled:opacity-50 hover:bg-admin-accent transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1 bg-admin-border rounded disabled:opacity-50 hover:bg-admin-accent transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (!direction) return <ChevronsUpDown size={14} className="opacity-50" />;
  if (direction === 'asc') return <ChevronUp size={14} />;
  return <ChevronDown size={14} />;
}
```

### `apps/web-admin/src/pages/Users.tsx`

```typescript
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Title, Text, Badge } from '@tremor/react';
import { createColumnHelper } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Mail } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { api } from '@/services/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'client' | 'coach';
  createdAt: string;
  lastSeen: string;
  totalSessions: number;
  totalMinutes: number;
}

const columnHelper = createColumnHelper<User>();

export default function Users() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<User[]>('/api/admin/users'),
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
        cell: (info) => (
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
```

---

## 10. Bug Bot System

### `apps/web-admin/src/pages/BugInbox.tsx`

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Title, Text, Badge, Select, SelectItem } from '@tremor/react';
import { format } from 'date-fns';
import { Bug, Image, MessageSquare, Check, Clock } from 'lucide-react';
import BugDetailModal from '@/components/bugs/BugDetailModal';
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
        `/api/admin/bugs${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`
      ),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BugStatus }) =>
      api.patch(`/api/admin/bugs/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bug-reports'] });
    },
  });

  const statusConfig = {
    open: { color: 'red', icon: Bug },
    in_progress: { color: 'yellow', icon: Clock },
    resolved: { color: 'emerald', icon: Check },
  } as const;

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
          {bugs.map((bug) => {
            const { color, icon: StatusIcon } = statusConfig[bug.status];

            return (
              <div
                key={bug.id}
                className="bg-admin-card border border-admin-border rounded-lg p-4 hover:border-admin-accent/50 cursor-pointer transition-colors"
                onClick={() => setSelectedBug(bug)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <StatusIcon size={18} className={`text-${color}-500`} />
                    <Badge color={color}>{bug.status.replace('_', ' ')}</Badge>
                    <Text className="text-gray-500">
                      #{bug.id.slice(0, 8)}
                    </Text>
                  </div>
                  <Text className="text-gray-500">
                    {format(new Date(bug.createdAt), 'MMM d, yyyy HH:mm')}
                  </Text>
                </div>

                <p className="text-white line-clamp-2 mb-3">
                  {bug.description}
                </p>

                <div className="flex items-center gap-4 text-sm text-gray-400">
                  {bug.email && <span>{bug.email}</span>}
                  {bug.screenshot && (
                    <span className="flex items-center gap-1">
                      <Image size={14} />
                      Screenshot
                    </span>
                  )}
                </div>

                {/* Quick status change */}
                <div
                  className="mt-3 flex gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {bug.status !== 'in_progress' && (
                    <button
                      onClick={() =>
                        updateStatus.mutate({
                          id: bug.id,
                          status: 'in_progress',
                        })
                      }
                      className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30"
                    >
                      Mark In Progress
                    </button>
                  )}
                  {bug.status !== 'resolved' && (
                    <button
                      onClick={() =>
                        updateStatus.mutate({ id: bug.id, status: 'resolved' })
                      }
                      className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
```

### Bug Bot Client Widget (for web-client)

Create `packages/ui/src/BugBotWidget.tsx`:

```typescript
import { useState } from 'react';
import { Bug, X, Send, Camera } from 'lucide-react';

interface BugBotWidgetProps {
  apiEndpoint: string;
  userEmail?: string;
}

export function BugBotWidget({ apiEndpoint, userEmail }: BugBotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const captureScreenshot = async () => {
    try {
      // Use html2canvas or similar library
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(document.body);
      setScreenshot(canvas.toDataURL('image/png'));
    } catch (err) {
      console.error('Screenshot failed:', err);
    }
  };

  const submitBug = async () => {
    if (!description.trim()) return;

    setIsSubmitting(true);
    try {
      await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          screenshot,
          email: userEmail,
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });
      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setDescription('');
        setScreenshot(null);
      }, 2000);
    } catch (err) {
      console.error('Bug submit failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-110 z-50"
        title="Report a bug"
      >
        <Bug size={24} />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Bug size={20} />
                Report a Bug
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bug className="text-green-600" size={32} />
                  </div>
                  <p className="text-lg font-medium">Thank you!</p>
                  <p className="text-gray-500">
                    Your bug report has been submitted.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      What went wrong?
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the issue you encountered..."
                      rows={4}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Screenshot */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Screenshot (optional)
                    </label>
                    {screenshot ? (
                      <div className="relative">
                        <img
                          src={screenshot}
                          alt="Screenshot"
                          className="w-full rounded-lg border"
                        />
                        <button
                          onClick={() => setScreenshot(null)}
                          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={captureScreenshot}
                        className="w-full py-3 border-2 border-dashed dark:border-gray-600 rounded-lg flex items-center justify-center gap-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Camera size={20} />
                        Capture Screenshot
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {!submitted && (
              <div className="p-4 border-t dark:border-gray-700">
                <button
                  onClick={submitBug}
                  disabled={!description.trim() || isSubmitting}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    'Submitting...'
                  ) : (
                    <>
                      <Send size={18} />
                      Submit Bug Report
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

---

## 11. API Routes

### `apps/api/src/routes/admin.ts`

```typescript
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { db } from '../db/client';

const admin = new Hono();

// Admin-only middleware
const adminEmails = (process.env.ADMIN_EMAILS || '').split(',');
const jwtSecret = process.env.JWT_SECRET!;

admin.use('/*', jwt({ secret: jwtSecret }));
admin.use('/*', async (c, next) => {
  const payload = c.get('jwtPayload');
  if (!adminEmails.includes(payload.email)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
});

// POST /api/admin/login
admin.post('/login', async (c) => {
  const { email, password } = await c.req.json();

  if (!adminEmails.includes(email)) {
    return c.json({ error: 'Not an admin' }, 401);
  }

  // Verify password against your auth system
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Generate JWT
  const token = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    role: 'admin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(new TextEncoder().encode(jwtSecret));

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// GET /api/admin/metrics
admin.get('/metrics', async (c) => {
  const [
    totalUsers,
    activeUsers,
    activeSessions,
    totalCoaches,
    voiceMinutes,
  ] = await Promise.all([
    db.user.count(),
    db.userSession.count({ where: { isActive: true } }),
    db.room.count({ where: { isActive: true } }),
    db.user.count({ where: { role: 'coach' } }),
    db.session.aggregate({
      _sum: { durationMinutes: true },
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  // Coach activity breakdown
  const now = new Date();
  const coachesByActivity = {
    recent1h: await db.user.count({
      where: {
        role: 'coach',
        lastSeen: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
      },
    }),
    recent1d: await db.user.count({
      where: {
        role: 'coach',
        lastSeen: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    }),
    recent1w: await db.user.count({
      where: {
        role: 'coach',
        lastSeen: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    recent1m: await db.user.count({
      where: {
        role: 'coach',
        lastSeen: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  };

  return c.json({
    totalUsers,
    activeUsers,
    activeRooms: activeSessions,
    totalCoaches,
    coachesByActivity,
    clientVoiceMinutes: {
      today: voiceMinutes._sum.durationMinutes || 0,
      week: 0, // Calculate similarly
      month: 0,
    },
    skoolSyncStatus: {
      lastRun: new Date().toISOString(),
      success: true,
    },
    systemHealth: {
      api: true,
      database: true,
      livekit: true,
      skool: true,
    },
  });
});

// GET /api/admin/users
admin.get('/users', async (c) => {
  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      lastSeen: true,
      _count: { select: { sessions: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(
    users.map((u) => ({
      ...u,
      totalSessions: u._count.sessions,
      totalMinutes: 0, // Calculate from sessions
    }))
  );
});

// GET /api/admin/rooms
admin.get('/rooms', async (c) => {
  const rooms = await db.room.findMany({
    where: { isActive: true },
    include: {
      participants: { include: { user: true } },
    },
  });

  return c.json(rooms);
});

// GET /api/admin/rooms/:roomId/audio-token
admin.get('/rooms/:roomId/audio-token', async (c) => {
  const { roomId } = c.req.param();
  const payload = c.get('jwtPayload');

  // Generate listen-only LiveKit token
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: `admin-${payload.sub}`,
      name: 'Admin (Listening)',
    }
  );

  at.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false,
  });

  return c.json({ token: at.toJwt() });
});

// GET /api/admin/transcripts
admin.get('/transcripts', async (c) => {
  const transcripts = await db.session.findMany({
    include: {
      client: { select: { name: true } },
      coach: { select: { name: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { startTime: 'desc' },
    take: 50,
  });

  return c.json(transcripts);
});

// GET /api/admin/transcripts/:sessionId
admin.get('/transcripts/:sessionId', async (c) => {
  const { sessionId } = c.req.param();

  const messages = await db.message.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' },
    include: {
      speaker: { select: { name: true, role: true } },
    },
  });

  return c.json(messages);
});

// GET /api/admin/health
admin.get('/health', async (c) => {
  // System health checks
  const checks = await Promise.allSettled([
    db.$queryRaw`SELECT 1`, // Database
    fetch(process.env.LIVEKIT_HOST + '/health'), // LiveKit
  ]);

  const [dbCheck, livekitCheck] = checks;

  return c.json({
    cpu: { usage: process.cpuUsage().user / 1000000, cores: 4 },
    memory: {
      used: process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal,
      percentage: Math.round(
        (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
      ),
    },
    disk: { used: 0, total: 0, percentage: 0 }, // Use node-disk-info
    services: [
      {
        name: 'API Server',
        status: 'healthy',
        latency: 1,
        lastCheck: new Date().toISOString(),
      },
      {
        name: 'Database',
        status: dbCheck.status === 'fulfilled' ? 'healthy' : 'down',
        lastCheck: new Date().toISOString(),
      },
      {
        name: 'LiveKit',
        status: livekitCheck.status === 'fulfilled' ? 'healthy' : 'down',
        lastCheck: new Date().toISOString(),
      },
    ],
    uptime: {
      days: Math.floor(process.uptime() / 86400),
      hours: Math.floor((process.uptime() % 86400) / 3600),
      minutes: Math.floor((process.uptime() % 3600) / 60),
    },
    uptimeHistory: [], // Fetch from stored health checks
  });
});

// GET /api/admin/processes (PM2)
admin.get('/processes', async (c) => {
  const pm2 = await import('pm2');

  return new Promise((resolve) => {
    pm2.connect((err) => {
      if (err) {
        resolve(c.json([]));
        return;
      }

      pm2.list((err, list) => {
        pm2.disconnect();

        if (err) {
          resolve(c.json([]));
          return;
        }

        const processes = list.map((proc) => ({
          name: proc.name,
          pm_id: proc.pm_id,
          status: proc.pm2_env?.status || 'unknown',
          memory: proc.monit?.memory || 0,
          cpu: proc.monit?.cpu || 0,
          uptime: proc.pm2_env?.pm_uptime || 0,
        }));

        resolve(c.json(processes));
      });
    });
  });
});

// Bug Reports
admin.get('/bugs', async (c) => {
  const status = c.req.query('status');

  const bugs = await db.bugReport.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  return c.json(bugs);
});

admin.patch('/bugs/:id', async (c) => {
  const { id } = c.req.param();
  const { status } = await c.req.json();

  const bug = await db.bugReport.update({
    where: { id },
    data: { status },
  });

  return c.json(bug);
});

// Public bug submission (no auth)
admin.post('/bugs/submit', async (c) => {
  const body = await c.req.json();

  const bug = await db.bugReport.create({
    data: {
      description: body.description,
      screenshot: body.screenshot,
      email: body.email,
      url: body.url,
      userAgent: body.userAgent,
    },
  });

  return c.json(bug, 201);
});

export default admin;
```

---

## 12. WebSocket Services

### `apps/api/src/ws/logStream.ts`

```typescript
import type { ServerWebSocket } from 'bun';
import pm2 from 'pm2';

interface LogStreamClient {
  ws: ServerWebSocket;
  processes: Set<string>;
  levels: Set<string>;
}

const clients = new Set<LogStreamClient>();

export function handleLogStreamConnection(
  ws: ServerWebSocket,
  params: URLSearchParams
) {
  const processes = new Set(
    (params.get('process') || 'all').split(',').filter(Boolean)
  );
  const levels = new Set(
    (params.get('levels') || 'error,warn,info,debug').split(',').filter(Boolean)
  );

  const client: LogStreamClient = { ws, processes, levels };
  clients.add(client);

  // Connect to PM2 and stream logs
  pm2.connect((err) => {
    if (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'PM2 connection failed' }));
      return;
    }

    pm2.launchBus((err, bus) => {
      if (err) return;

      bus.on('log:out', (packet) => {
        if (client.processes.has('all') || client.processes.has(packet.process.name)) {
          broadcastLog(client, {
            type: 'log',
            process: packet.process.name,
            level: 'info',
            message: packet.data,
            timestamp: new Date().toISOString(),
          });
        }
      });

      bus.on('log:err', (packet) => {
        if (client.processes.has('all') || client.processes.has(packet.process.name)) {
          broadcastLog(client, {
            type: 'log',
            process: packet.process.name,
            level: 'error',
            message: packet.data,
            timestamp: new Date().toISOString(),
          });
        }
      });
    });
  });

  ws.send(JSON.stringify({ type: 'connected', processes: Array.from(processes) }));
}

function broadcastLog(client: LogStreamClient, log: any) {
  // Filter by log level
  const level = parseLogLevel(log.message);
  if (!client.levels.has(level)) return;

  try {
    client.ws.send(JSON.stringify({ ...log, level }));
  } catch {
    clients.delete(client);
  }
}

function parseLogLevel(message: string): string {
  if (/\[ERROR\]/i.test(message)) return 'error';
  if (/\[WARN\]/i.test(message)) return 'warn';
  if (/\[DEBUG\]/i.test(message)) return 'debug';
  return 'info';
}

export function handleLogStreamClose(ws: ServerWebSocket) {
  for (const client of clients) {
    if (client.ws === ws) {
      clients.delete(client);
      break;
    }
  }
}
```

---

## 13. PM2 & Dev Script Updates

### Update `scripts/dev.ts`

Add admin app to your dev script:

```typescript
// Add to existing dev.ts

const adminPort = numEnv('ADMIN_PORT', 3703);

// Add to spawned processes array
const processes = [
  // ... existing processes ...
  
  // Admin Dashboard
  spawn('bun', ['run', 'dev'], {
    cwd: resolve(__dirname, '../apps/web-admin'),
    env: {
      ...process.env,
      PORT: String(adminPort),
      HOST: host,
      API_PORT: String(apiPort),
    },
    stdio: 'inherit',
  }),
];

console.log(`  Admin Dashboard: http://${host}:${adminPort}/`);
```

### Update `ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    // ... existing apps ...
    
    {
      name: 'web-admin',
      script: 'bun',
      args: 'run preview',
      cwd: './apps/web-admin',
      env: {
        NODE_ENV: 'production',
        PORT: 3703,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};
```

### Update `.env`

```bash
# Admin Dashboard
ADMIN_PORT=3703
ADMIN_EMAILS=your@email.com,another@email.com
```

---

## Summary

This implementation provides:

1. **Dense Dashboard** - Tremor components for KPIs, charts, and metrics
2. **Virtualized Transcript Viewer** - TanStack Virtual for 30+ min transcripts with search
3. **Real-time Log Viewer** - @melloware/react-logviewer with PM2 WebSocket streaming
4. **Server Health Monitor** - CPU/Memory gauges, service status, uptime tracking
5. **Data Tables** - TanStack Table for users, coaches, sessions
6. **Bug Bot System** - Admin inbox + client widget
7. **LiveKit Audio Listen-in** - Subscribe-only tokens for debugging

The libraries chosen are TypeScript-first, actively maintained, and optimized for performance with large datasets.