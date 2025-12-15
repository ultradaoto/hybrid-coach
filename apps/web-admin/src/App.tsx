import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, useHasHydrated } from '@/stores/authStore';
import { AdminLayout } from '@/components/layout';
import {
  Login,
  Dashboard,
  Users,
  Coaches,
  Rooms,
  Transcripts,
  TranscriptDetail,
  Logs,
  Health,
  BugInbox,
  Settings,
} from '@/pages';

// Determine base path from environment
const basePath = import.meta.env.PROD ? '/admin' : '';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useHasHydrated();
  
  // Wait for store to hydrate from localStorage before making auth decisions
  if (!hasHydrated) {
    return null; // Or a loading spinner - but null prevents flash
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
