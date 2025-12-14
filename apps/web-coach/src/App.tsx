import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthCallbackPage } from './pages/AuthCallback';
import { CoachDashboardPage } from './pages/Dashboard';
import { CallRoomPage } from './pages/CallRoom';
import { CreateRoomPage } from './pages/CreateRoom';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<CoachDashboardPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/room/create" element={<CreateRoomPage />} />
      <Route path="/room/:roomId" element={<CallRoomPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
