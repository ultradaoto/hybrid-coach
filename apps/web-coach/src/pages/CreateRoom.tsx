import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function publicLoginUrl() {
  const host = import.meta.env.VITE_PUBLIC_APP_URL || '';
  if (host) return `${host.replace(/\/+$/, '')}/login`;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3700/login`;
}

function getAuthToken() {
  return localStorage.getItem('auth_token');
}

type CreateRoomResponse =
  | { success: true; data: { roomId: string; joinUrls: { coach: string; client: string } } }
  | { success: false; error: string };

export function CreateRoomPage() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const token = getAuthToken();
      if (!token) {
        window.location.href = publicLoginUrl();
        return;
      }

      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as CreateRoomResponse | null;
      if (!res.ok || !json || !json.success) {
        navigate('/dashboard', { replace: true });
        return;
      }
      navigate(`/room/${json.data.roomId}`, { replace: true });
    })();
  }, [navigate]);

  return null;
}
