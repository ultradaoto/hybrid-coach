import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../dashboard.css';

type CoachUser = {
  id: string;
  displayName: string;
  email?: string | null;
  role: 'coach' | 'client' | string;
  isAvailable?: boolean;
  coachName?: string | null;
  coachLevel?: number | null;
};

type Meeting = {
  summary: string;
  start: string;
};

type AppointmentUser = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  coachName?: string | null;
  coachLevel?: number | null;
};

type Appointment = {
  id: string;
  scheduledFor: string;
  status: string;
  roomId: string;
  client?: AppointmentUser | null;
  coach?: AppointmentUser | null;
};

type DashboardResponse = {
  user: CoachUser;
  calendarConnected: boolean;
  meetings: Meeting[];
  appointments: Appointment[];
  message?: string | null;
};

type ApiError = {
  error: string;
  loginUrl?: string;
};

function formatDateTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString();
}

function getThemeFromStorage(): 'light' | 'dark' | null {
  const v = localStorage.getItem('theme');
  if (v === 'light' || v === 'dark') return v;
  return null;
}

function defaultThemeByTime(): 'light' | 'dark' {
  const hour = new Date().getHours();
  const isNightTime = hour < 6 || hour > 18;
  return isNightTime ? 'dark' : 'light';
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

export function CoachDashboardPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return getThemeFromStorage() ?? defaultThemeByTime();
  });

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const message = useMemo(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('calendar') === 'connected') return 'Calendar connected successfully!';
    if (url.searchParams.get('availability') === 'updated') return 'Availability status updated!';
    if (url.searchParams.get('reassigned') === 'success') return 'Appointment returned to coach pool.';
    return data?.message ?? null;
  }, [data?.message]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  async function fetchDashboard() {
    setLoading(true);
    setError(null);
    setLoginUrl(null);

    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      setError('You are not authenticated.');
      setLoginUrl(publicLoginUrl());
      setData(null);
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
        let details: ApiError | null = null;
        try {
          details = (await res.json()) as ApiError;
        } catch {
          // ignore
        }

        if (res.status === 401) {
          setLoginUrl(details?.loginUrl ?? publicLoginUrl());
          setError('You are not authenticated.');
          setData(null);
          return;
        }

        setError(details?.error ?? `Failed to load dashboard (HTTP ${res.status})`);
        setData(null);
        return;
      }

      const json = (await res.json()) as { success: boolean; data: DashboardResponse };
      if (!json?.success) {
        setError('Failed to load dashboard');
        setData(null);
        return;
      }
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchDashboard();

    const observerOptions: IntersectionObserverInit = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
    };

    const fadeInObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, observerOptions);

    document.querySelectorAll('.card, .alert, .hero-section').forEach((el) => {
      if (!el.classList.contains('fade-in')) el.classList.add('fade-in');
      fadeInObserver.observe(el);
    });

    return () => {
      fadeInObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!data?.user || data.user.role !== 'coach') return;

    const t = window.setInterval(() => {
      void fetchDashboard();
    }, 10_000);

    return () => {
      window.clearInterval(t);
    };
  }, [data?.user?.role]);

  async function toggleAvailability() {
    setActionBusy('toggle-availability');
    setError(null);

    const token = getAuthToken();
    if (!token) {
      setLoginUrl(publicLoginUrl());
      setError('You are not authenticated.');
      setActionBusy(null);
      return;
    }

    try {
      const res = await fetch('/api/coach/toggle-availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const maybe = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(maybe?.error ?? `Failed to toggle availability (HTTP ${res.status})`);
      }

      await fetchDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle availability');
    } finally {
      setActionBusy(null);
    }
  }

  async function reassignAppointment(appointmentId: string) {
    if (!window.confirm('Send this call back to the coach pool?')) return;

    setActionBusy(`reassign:${appointmentId}`);
    setError(null);

    const token = getAuthToken();
    if (!token) {
      setLoginUrl(publicLoginUrl());
      setError('You are not authenticated.');
      setActionBusy(null);
      return;
    }

    try {
      const res = await fetch('/api/coach/reassign-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ appointmentId }),
      });

      if (!res.ok) {
        const maybe = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(maybe?.error ?? `Failed to reassign appointment (HTTP ${res.status})`);
      }

      await fetchDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reassign appointment');
    } finally {
      setActionBusy(null);
    }
  }

  const toggleIcon = theme === 'dark' ? '☀️' : '🌙';
  const user = data?.user;

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
        <header className="header">
          <div className="logo">MyUltra.Coach</div>
          <p className="welcome-text">Welcome back, {user?.displayName ?? '—'}</p>
          <div className="user-info">{user?.email ?? 'N/A'}</div>
        </header>

        {message ? <div className="alert alert-success">{message}</div> : null}

        {error ? (
          <div className="alert alert-error">
            <strong>Error</strong>
            <div style={{ marginTop: '0.5rem' }}>{error}</div>
            {loginUrl ? (
              <div style={{ marginTop: '1rem' }}>
                <a href={loginUrl} className="btn btn-primary">
                  Log in
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="hero-section" style={{ display: 'block', visibility: 'visible', opacity: 1 }}>
          <div className="hero-content">
            <h1 className="hero-title">🎯 Coach Dashboard</h1>
            <p className="hero-subtitle">Manage your availability, upcoming meetings, and scheduled coaching calls.</p>
            <Link to="/room/create" className="btn-hero">
              🎤 Launch Test / AI Room
              <span className="btn-hero-subtitle">Create an instant room</span>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="card fade-in visible">
            <div className="card-header">
              <h3 className="card-title">Loading…</h3>
              <p className="card-subtitle">Fetching your coach dashboard data</p>
            </div>
          </div>
        ) : null}

        {user?.role === 'coach' ? (
          <>
            <div className="card fade-in">
              <div className="card-header">
                <h3 className="card-title">🎓 Coach Tools</h3>
                <p className="card-subtitle">Manage your coaching availability and settings</p>
              </div>

              <div className="availability-section">
                <div>
                  <strong className="availability-title">📊 Availability Status</strong>
                  <br />
                  <small className="availability-subtitle">
                    {user.isAvailable
                      ? 'You are currently accepting new client bookings'
                      : 'You are not accepting new client bookings'}
                  </small>
                </div>

                <label className="availability-toggle">
                  <input
                    type="checkbox"
                    checked={!!user.isAvailable}
                    onChange={() => void toggleAvailability()}
                    disabled={actionBusy === 'toggle-availability'}
                  />
                  <span className={'availability-status ' + (user.isAvailable ? 'available' : 'unavailable')}>
                    {user.isAvailable ? 'Available' : 'Unavailable'}
                  </span>
                </label>
              </div>
            </div>

            {!data?.calendarConnected ? (
              <div className="alert alert-warning">
                <strong>📅 Calendar not connected</strong>
                <br />
                Calendar integration will be re-added during the LiveKit/room-manager build-out.
              </div>
            ) : (
              <div className="alert alert-success">
                <strong>✅ Calendar connected</strong>
                <br />
                Your Google Calendar is successfully connected and synced.
              </div>
            )}

            <div className="card fade-in">
              <div className="card-header">
                <h4 className="card-title">📅 Upcoming Meetings</h4>
              </div>
              {data?.meetings?.length ? (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {data.meetings.map((m, idx) => (
                    <li key={`${m.start}-${idx}`} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                      <strong>{m.start}</strong> – {m.summary}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No upcoming meetings.</p>
              )}
            </div>

            <div className="card fade-in">
              <div className="card-header">
                <h3 className="card-title">
                  📅 Upcoming Appointments
                  <span
                    style={{
                      fontSize: '0.8em',
                      color: 'var(--text-secondary)',
                      fontWeight: 'normal',
                      marginLeft: '0.5rem',
                    }}
                  >
                    (Auto-refreshing every 10 seconds)
                  </span>
                </h3>
              </div>

              {data?.appointments?.length ? (
                <div style={{ listStyle: 'none', padding: 0 }}>
                  {data.appointments.map((a) => {
                    const cancelled = a.status === 'cancelled';
                    return (
                      <div key={a.id} className="appointment-item coach">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: 'var(--text-primary)' }}>📅 {formatDateTime(a.scheduledFor)}</strong>
                            {cancelled ? <span className="status-badge status-cancelled">CANCELLED</span> : null}
                            {a.client ? (
                              <>
                                <br />👤 Client: {a.client.displayName || a.client.email || '—'}
                              </>
                            ) : null}
                            <br />
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                              Room ID: {a.roomId?.slice(0, 8)}...
                            </span>
                          </div>

                          {!cancelled ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginLeft: '1rem' }}>
                              <button
                                type="button"
                                className="btn btn-warning"
                                onClick={() => void reassignAppointment(a.id)}
                                disabled={actionBusy === `reassign:${a.id}`}
                              >
                                🔄 Return to Pool
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {!cancelled ? (
                          <div style={{ marginTop: '1rem' }}>
                            <Link to={`/room/${a.roomId}`} className="btn btn-success">
                              ✅ Join Room
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                  No upcoming appointments.
                </p>
              )}
            </div>
          </>
        ) : null}

        <div style={{ textAlign: 'center', marginTop: '3rem', padding: '2rem' }}>
          <a
            href={publicLoginUrl()}
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}
            onClick={() => localStorage.removeItem('auth_token')}
          >
            🔓 Logout
          </a>
        </div>
      </div>
    </>
  );
}
