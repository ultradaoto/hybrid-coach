import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../dashboard.css';

// =============================================================================
// Types
// =============================================================================

type ClientInfo = {
  id: string;
  email: string;
  displayName: string;
  isOnline: boolean;
  lastSeen: string | null;
  activeRoomId: string | null;
};

type Appointment = {
  id: string;
  scheduledFor: string;
  status: string;
  roomId: string;
  client?: {
    id: string;
    displayName?: string;
    email?: string;
  };
};

type ActiveRoom = {
  roomId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  startedAt: string;
  hasAiAgent: boolean;
};

type CoachUser = {
  id: string;
  displayName: string;
  email?: string;
  role: string;
  isAvailable?: boolean;
};

type DashboardData = {
  user: CoachUser;
  calendarConnected: boolean;
  appointments: Appointment[];
  activeRooms: ActiveRoom[];
  assignedClients: ClientInfo[];
  stats: {
    totalClients: number;
    totalSessions: number;
    upcomingAppointments: number;
    activeNow: number;
  };
};

// =============================================================================
// Helpers
// =============================================================================

function formatDateTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString();
}

function formatRelativeTime(isoString: string | null) {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  
  const now = Date.now();
  const diff = now - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

function getThemeFromStorage(): 'light' | 'dark' | null {
  const v = localStorage.getItem('theme');
  if (v === 'light' || v === 'dark') return v;
  return null;
}

function defaultThemeByTime(): 'light' | 'dark' {
  const hour = new Date().getHours();
  return hour < 6 || hour > 18 ? 'dark' : 'light';
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

function publicLoginUrl() {
  const host = import.meta.env.VITE_PUBLIC_APP_URL || '';
  if (host) return `${host.replace(/\/+$/, '')}/login`;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3700/login`;
}

function getAuthToken() {
  return localStorage.getItem('auth_token');
}

// =============================================================================
// Mock Data for Development
// =============================================================================

function generateMockData(realData: Partial<DashboardData> | null): DashboardData {
  const now = new Date();
  
  // Default user
  const user: CoachUser = realData?.user ?? {
    id: 'coach-123',
    displayName: 'Ultra Coach',
    email: 'ultradaoto@gmail.com',
    role: 'coach',
    isAvailable: true,
  };

  // Mock assigned clients
  const assignedClients: ClientInfo[] = realData?.assignedClients ?? [
    {
      id: 'client-1',
      email: 'sterling.cooley@gmail.com',
      displayName: 'Sterling Cooley',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      activeRoomId: null,
    },
  ];

  // Mock active rooms (when client is in a session)
  const activeRooms: ActiveRoom[] = realData?.activeRooms ?? [];

  // Mock appointments - merge with real ones
  const realAppointments = realData?.appointments ?? [];
  const mockAppointments: Appointment[] = realAppointments.length > 0 ? realAppointments : [
    {
      id: 'apt-1',
      scheduledFor: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      status: 'scheduled',
      roomId: 'room-upcoming-1',
      client: {
        id: 'client-1',
        displayName: 'Sterling Cooley',
        email: 'sterling.cooley@gmail.com',
      },
    },
    {
      id: 'apt-2',
      scheduledFor: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      status: 'scheduled',
      roomId: 'room-upcoming-2',
      client: {
        id: 'client-1',
        displayName: 'Sterling Cooley',
        email: 'sterling.cooley@gmail.com',
      },
    },
  ];

  return {
    user,
    calendarConnected: realData?.calendarConnected ?? false,
    appointments: mockAppointments,
    activeRooms,
    assignedClients,
    stats: {
      totalClients: assignedClients.length,
      totalSessions: 12,
      upcomingAppointments: mockAppointments.filter(a => a.status === 'scheduled').length,
      activeNow: activeRooms.length,
    },
  };
}

// =============================================================================
// Component
// =============================================================================

export function CoachDashboardPage() {
  const navigate = useNavigate();
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return getThemeFromStorage() ?? defaultThemeByTime();
  });

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoginUrl(null);

    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      setError('You are not authenticated.');
      setLoginUrl(publicLoginUrl());
      return;
    }

    try {
      const res = await fetch('/api/coach/dashboard', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          setLoginUrl(publicLoginUrl());
          setError('You are not authenticated.');
          return;
        }
        throw new Error(`Failed to load dashboard (HTTP ${res.status})`);
      }

      const json = await res.json();
      console.log('[CoachDashboard] API Response:', json);
      
      if (!json?.success) {
        throw new Error('Failed to load dashboard');
      }

      // Merge real data with mock data for development
      const mergedData = generateMockData(json.data);
      console.log('[CoachDashboard] Merged data:', mergedData);
      setData(mergedData);
    } catch (e) {
      console.error('[CoachDashboard] Error:', e);
      // Still show mock data on error for development
      setData(generateMockData(null));
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const toggleAvailability = async () => {
    setActionBusy('toggle-availability');
    const token = getAuthToken();
    if (!token) return;

    try {
      await fetch('/api/coach/toggle-availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      await fetchDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle availability');
    } finally {
      setActionBusy(null);
    }
  };

  const createInstantRoom = async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      const res = await fetch('/api/coach/room/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      
      const json = await res.json();
      if (json?.success && json?.data?.roomId) {
        navigate(`/room/${json.data.roomId}`);
      } else {
        // Fallback: generate room ID client-side
        const roomId = crypto.randomUUID();
        navigate(`/room/${roomId}`);
      }
    } catch {
      // Fallback: generate room ID client-side
      const roomId = crypto.randomUUID();
      navigate(`/room/${roomId}`);
    }
  };

  const joinRoom = (roomId: string) => {
    navigate(`/room/${roomId}`);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    // Redirect to login page (use relative path to avoid port issues)
    window.location.href = '/login';
  };

  const toggleIcon = theme === 'dark' ? '☀️' : '🌙';
  const user = data?.user;
  const stats = data?.stats;
  const activeRooms = data?.activeRooms ?? [];
  const appointments = data?.appointments ?? [];
  const assignedClients = data?.assignedClients ?? [];

  // Separate upcoming appointments (next 24 hours) from later ones
  const now = Date.now();
  const upcomingAppointments = appointments
    .filter(a => a.status === 'scheduled')
    .filter(a => new Date(a.scheduledFor).getTime() - now < 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  
  const laterAppointments = appointments
    .filter(a => a.status === 'scheduled')
    .filter(a => new Date(a.scheduledFor).getTime() - now >= 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

  return (
    <>
      <button
        className="theme-toggle"
        type="button"
        onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        aria-label="Toggle theme"
      >
        {toggleIcon}
      </button>

      <div className="dashboard-container">
        {/* Header */}
        <header className="header">
          <div className="logo">MyUltra.Coach</div>
          <p className="welcome-text">Welcome back, {user?.displayName ?? 'Coach'}</p>
          <div className="user-info">{user?.email ?? ''}</div>
        </header>

        {/* Error display */}
        {error && (
          <div className="alert alert-error">
            <strong>Note:</strong> {error}
            {loginUrl && (
              <div style={{ marginTop: '0.5rem' }}>
                <a href={loginUrl} className="btn btn-primary">Log in</a>
              </div>
            )}
          </div>
        )}

        {/* ============================================= */}
        {/* HERO SECTION - Quick Actions */}
        {/* ============================================= */}
        <div className="hero-section" style={{ display: 'block', visibility: 'visible', opacity: 1 }}>
          <div className="hero-content">
            <h1 className="hero-title">🎯 Coach Command Center</h1>
            <p className="hero-subtitle">
              {activeRooms.length > 0 
                ? `${activeRooms.length} active session${activeRooms.length > 1 ? 's' : ''} right now!`
                : 'No active sessions. Start one or wait for clients to join.'
              }
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn-hero" type="button" onClick={createInstantRoom}>
                🎤 Launch AI Room
                <span className="btn-hero-subtitle">Start an instant session</span>
              </button>
              
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                borderRadius: '12px', 
                padding: '1rem 1.5rem',
                textAlign: 'center',
                minWidth: '120px'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.activeNow ?? 0}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Active Now</div>
              </div>
              
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                borderRadius: '12px', 
                padding: '1rem 1.5rem',
                textAlign: 'center',
                minWidth: '120px'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.upcomingAppointments ?? 0}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Upcoming</div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================= */}
        {/* ACTIVE ROOMS - Most Important! */}
        {/* ============================================= */}
        <div className="card" style={{ borderLeft: '4px solid #10b981', background: activeRooms.length > 0 ? 'rgba(16, 185, 129, 0.1)' : undefined }}>
          <div className="card-header">
            <h3 className="card-title">
              🟢 Active Rooms 
              <span style={{ 
                background: activeRooms.length > 0 ? '#10b981' : '#6b7280',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                marginLeft: '0.5rem'
              }}>
                {activeRooms.length}
              </span>
            </h3>
            <p className="card-subtitle">Sessions in progress - join to observe or participate</p>
          </div>

          {activeRooms.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeRooms.map((room) => (
                <div key={room.roomId} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: 'rgba(16, 185, 129, 0.15)',
                  borderRadius: '8px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                      👤 {room.clientName}
                      {room.hasAiAgent && <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>🤖 AI Active</span>}
                    </div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                      Started {formatRelativeTime(room.startedAt)} • Room: {room.roomId.slice(0, 8)}...
                    </div>
                  </div>
                  <button 
                    className="btn btn-success" 
                    onClick={() => joinRoom(room.roomId)}
                    style={{ fontWeight: 600 }}
                  >
                    ▶️ Join Now
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              color: 'var(--text-secondary)',
              background: 'rgba(0,0,0,0.05)',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔇</div>
              <div>No active rooms right now</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                When clients start sessions, they'll appear here
              </div>
            </div>
          )}
        </div>

        {/* ============================================= */}
        {/* UPCOMING APPOINTMENTS (Next 24 hours) */}
        {/* ============================================= */}
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="card-header">
            <h3 className="card-title">
              ⏰ Coming Up Soon
              <span style={{ 
                background: upcomingAppointments.length > 0 ? '#f59e0b' : '#6b7280',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                marginLeft: '0.5rem'
              }}>
                {upcomingAppointments.length}
              </span>
            </h3>
            <p className="card-subtitle">Scheduled sessions in the next 24 hours</p>
          </div>

          {upcomingAppointments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {upcomingAppointments.map((apt) => (
                <div key={apt.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      📅 {formatDateTime(apt.scheduledFor)}
                    </div>
                    <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                      👤 {apt.client?.displayName || apt.client?.email || 'Unknown Client'}
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                      Room: {apt.roomId.slice(0, 8)}...
                    </div>
                  </div>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => joinRoom(apt.roomId)}
                  >
                    📍 Join Room
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              color: 'var(--text-secondary)',
              background: 'rgba(0,0,0,0.03)',
              borderRadius: '8px'
            }}>
              No appointments in the next 24 hours
            </div>
          )}
        </div>

        {/* ============================================= */}
        {/* ASSIGNED CLIENTS */}
        {/* ============================================= */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              👥 My Clients
              <span style={{ 
                background: '#6366f1',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                marginLeft: '0.5rem'
              }}>
                {assignedClients.length}
              </span>
            </h3>
            <p className="card-subtitle">Clients assigned to you</p>
          </div>

          {assignedClients.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {assignedClients.map((client) => (
                <div key={client.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: 'rgba(0,0,0,0.03)',
                  borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ 
                      width: '10px', 
                      height: '10px', 
                      borderRadius: '50%', 
                      background: client.isOnline ? '#10b981' : '#6b7280',
                      boxShadow: client.isOnline ? '0 0 8px #10b981' : 'none'
                    }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>{client.displayName}</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>{client.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.6, textAlign: 'right' }}>
                      {client.isOnline ? (
                        <span style={{ color: '#10b981', fontWeight: 500 }}>● Online now</span>
                      ) : (
                        <>Last seen: {formatRelativeTime(client.lastSeen)}</>
                      )}
                    </div>
                    {client.activeRoomId && (
                      <button 
                        className="btn btn-success btn-sm"
                        onClick={() => joinRoom(client.activeRoomId!)}
                      >
                        Join Session
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No clients assigned yet
            </div>
          )}
        </div>

        {/* ============================================= */}
        {/* LATER APPOINTMENTS */}
        {/* ============================================= */}
        {laterAppointments.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📆 Scheduled Later</h3>
              <p className="card-subtitle">Appointments beyond 24 hours</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {laterAppointments.map((apt) => (
                <div key={apt.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: 'rgba(0,0,0,0.02)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{formatDateTime(apt.scheduledFor)}</span>
                    <span style={{ marginLeft: '1rem', opacity: 0.7 }}>
                      {apt.client?.displayName || apt.client?.email || 'Client'}
                    </span>
                  </div>
                  <Link to={`/room/${apt.roomId}`} style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                    View Room →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================= */}
        {/* COACH TOOLS (Dense) */}
        {/* ============================================= */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🎓 Coach Settings</h3>
            <p className="card-subtitle">Manage your availability and preferences</p>
          </div>

          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '1rem',
            background: 'rgba(0,0,0,0.03)',
            borderRadius: '8px',
          }}>
            <div>
              <strong>📊 Availability Status</strong>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                {user?.isAvailable
                  ? 'You are accepting new client bookings'
                  : 'You are not accepting new bookings'}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!user?.isAvailable}
                onChange={toggleAvailability}
                disabled={actionBusy === 'toggle-availability'}
                style={{ width: '20px', height: '20px' }}
              />
              <span style={{ 
                padding: '4px 12px', 
                borderRadius: '12px',
                background: user?.isAvailable ? '#10b981' : '#6b7280',
                color: 'white',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}>
                {user?.isAvailable ? 'Available' : 'Unavailable'}
              </span>
            </label>
          </div>
        </div>

        {/* ============================================= */}
        {/* STATS (Dense Bottom Section) */}
        {/* ============================================= */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📈 Quick Stats</h3>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '1rem',
          }}>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>{stats?.totalClients ?? 0}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Total Clients</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{stats?.totalSessions ?? 0}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Sessions</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{stats?.upcomingAppointments ?? 0}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Upcoming</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{stats?.activeNow ?? 0}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Active Now</div>
            </div>
          </div>
        </div>

        {/* Logout */}
        <div style={{ textAlign: 'center', marginTop: '2rem', padding: '2rem' }}>
          <button
            type="button"
            onClick={logout}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-secondary)', 
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            🔓 Logout
          </button>
        </div>
      </div>
    </>
  );
}
