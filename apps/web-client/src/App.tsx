import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthCallbackPage } from './pages/AuthCallback';
import { ClientDashboardPage } from './pages/Dashboard';
import { CallRoomPage } from './pages/CallRoom';
import { OnboardingWelcome, OnboardingSymptoms, OnboardingMood } from './pages/onboarding';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ClientDashboardPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/room/:roomId" element={<CallRoomPage />} />
      
      {/* Onboarding flow */}
      <Route path="/onboarding/welcome" element={<OnboardingWelcome />} />
      <Route path="/onboarding/symptoms" element={<OnboardingSymptoms />} />
      <Route path="/onboarding/mood" element={<OnboardingMood />} />
      <Route path="/onboarding" element={<Navigate to="/onboarding/welcome" replace />} />
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
