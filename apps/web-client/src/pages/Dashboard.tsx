import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Slot = {
  iso: string;
  label: string;
};

type AppointmentStatus = 'scheduled' | 'cancelled';

type Appointment = {
  id: string;
  roomId: string;
  scheduledFor: string;
  status: AppointmentStatus;
};

type User = {
  id: string;
  email?: string;
  role?: string;
};

type AssignedCoach = {
  name: string;
  title: string;
  specialties: string[];
  avatar: string;
};

type WeeklyRecommendation = {
  id: string;
  title: string;
  duration: string;
  instructions: string;
  category: string;
};

type LastSession = {
  startedAt: string | null;
  durationMinutes: number | null;
  summary: string | null;
  keyTakeaways: string[];
  nextSteps: string[];
};

type ClientDashboardResponse = {
  user: User;
  assignedCoach: AssignedCoach;
  currentWeekFocus: string;
  weeklyRecommendations: WeeklyRecommendation[];
  lastSession: LastSession;
  calendarConnected: boolean;
  slots: Slot[];
  appointments: Appointment[];
  elevenlabsAgentId?: string;
};

type ApiEnvelope<T> = { success: true; data: T } | { success: false; error: string };

function applyLightTheme() {
  document.documentElement.setAttribute('data-theme', 'light');
  localStorage.setItem('theme', 'light');
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function displayNameFromEmail(email?: string) {
  if (!email) return 'Client';
  const left = email.split('@')[0] || 'Client';
  return left.replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
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

export function ClientDashboardPage() {
  const navigate = useNavigate();

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [assignedCoach, setAssignedCoach] = useState<AssignedCoach | null>(null);
  const [currentWeekFocus, setCurrentWeekFocus] = useState<string>('');
  const [weeklyRecommendations, setWeeklyRecommendations] = useState<WeeklyRecommendation[]>([]);
  const [lastSession, setLastSession] = useState<LastSession | null>(null);

  const [calendarConnected, setCalendarConnected] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    // Client app is intentionally light-mode only.
    applyLightTheme();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    setLoginUrl(null);

    const token = getAuthToken();
    if (!token) {
      setError('You are not authenticated.');
      setLoginUrl(publicLoginUrl());
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/client/dashboard', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const json = (await res.json().catch(() => null)) as ApiEnvelope<ClientDashboardResponse> | null;
      if (!res.ok || !json) {
        throw new Error(`Failed to load dashboard (HTTP ${res.status})`);
      }
      if (!json.success) {
        if (res.status === 401) {
          setLoginUrl(publicLoginUrl());
          setError('You are not authenticated.');
          return;
        }
        throw new Error(json.error || 'Failed to load dashboard');
      }

      setCalendarConnected(json.data.calendarConnected);
      setSlots(json.data.slots);
      setAppointments(json.data.appointments);
      setUser(json.data.user);
      setAssignedCoach(json.data.assignedCoach);
      setCurrentWeekFocus(json.data.currentWeekFocus);
      setWeeklyRecommendations(json.data.weeklyRecommendations);
      setLastSession(json.data.lastSession);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) (entry.target as HTMLElement).classList.add('visible');
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    const targets = Array.from(document.querySelectorAll<HTMLElement>('.card, .alert, .hero-section'));
    for (const el of targets) {
      if (!el.classList.contains('fade-in')) el.classList.add('fade-in');
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const createInstantRoom = async () => {
    setMessage(null);
    setError(null);
    const token = getAuthToken();
    if (!token) {
      setLoginUrl(publicLoginUrl());
      setError('You are not authenticated.');
      return;
    }

    try {
      const res = await fetch('/api/client/room/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as ApiEnvelope<{ roomId: string; joinPath: string }> | null;
      if (!res.ok || !json || !json.success) throw new Error('Failed to create room');
      navigate(json.data.joinPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room');
    }
  };

  const bookAppointment = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (!selectedSlot) {
      setMessage('Please select a time slot.');
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setLoginUrl(publicLoginUrl());
      setError('You are not authenticated.');
      return;
    }

    try {
      const res = await fetch('/api/client/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slot: selectedSlot }),
      });

      const json = (await res.json().catch(() => null)) as ApiEnvelope<Appointment> | null;
      if (!res.ok || !json || !json.success) {
        throw new Error((json && 'error' in json && json.error) || `Failed to book (HTTP ${res.status})`);
      }

      setSelectedSlot('');
      setMessage('Appointment booked successfully!');
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to book appointment');
    }
  };

  const cancelAppointment = async (id: string) => {
    setMessage(null);
    setError(null);

    const token = getAuthToken();
    if (!token) {
      setLoginUrl(publicLoginUrl());
      setError('You are not authenticated.');
      return;
    }

    try {
      const res = await fetch(`/api/client/appointments/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });

      const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
      if (!res.ok || !json || !json.success) {
        throw new Error((json && 'error' in json && json.error) || `Failed to cancel (HTTP ${res.status})`);
      }

      setMessage('Appointment cancelled successfully.');
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel appointment');
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    window.location.href = publicLoginUrl();
  };

  const nextAppointment = useMemo(() => {
    const upcoming = appointments
      .filter((a) => a.status !== 'cancelled')
      .map((a) => ({ ...a, ts: new Date(a.scheduledFor).getTime() }))
      .filter((a) => Number.isFinite(a.ts))
      .sort((a, b) => a.ts - b.ts);
    return upcoming[0] ?? null;
  }, [appointments]);

  const name = displayNameFromEmail(user?.email);

  return (
    <>
      <div className="dashboard-container">
        <header className="header">
          <div className="logo">MyUltra.Coach</div>
          <p className="welcome-text">Client Dashboard</p>
          <div className="user-info">{user?.email ?? '—'}</div>
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
            <h1 className="hero-title">Welcome, {name}</h1>
            <p className="hero-subtitle">
              Your nervous system practice hub — quick actions up top, deeper insights as you scroll.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn-hero" type="button" onClick={() => void createInstantRoom()} disabled={loading}>
                🎤 Start Session Now
                <span className="btn-hero-subtitle">Join a room with Ultra Coach</span>
              </button>
              {nextAppointment ? (
                <div className="client-mini-card">
                  <div className="client-mini-title">Next session</div>
                  <div className="client-mini-value">{formatDateTime(nextAppointment.scheduledFor)}</div>
                  <div className="client-mini-sub">Room: {nextAppointment.roomId.slice(0, 8)}…</div>
                </div>
              ) : (
                <div className="client-mini-card">
                  <div className="client-mini-title">Next session</div>
                  <div className="client-mini-value">Not scheduled</div>
                  <div className="client-mini-sub">Pick a slot below or start an instant room.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="client-dashboard-grid">
          <div className="card fade-in">
            <div className="card-header">
              <h3 className="card-title">👤 Your Coach</h3>
              <p className="card-subtitle">Who you’re currently assigned to</p>
            </div>
            {assignedCoach ? (
              <div className="client-assigned-coach">
                <div className="client-coach-avatar" aria-hidden>
                  {assignedCoach.avatar}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="client-coach-name">{assignedCoach.name}</div>
                  <div className="client-coach-title">{assignedCoach.title}</div>
                  <div className="client-chip-row">
                    {assignedCoach.specialties.map((s) => (
                      <span key={s} className="client-chip">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>Loading coach…</div>
            )}
          </div>

          <div className="card fade-in">
            <div className="card-header">
              <h3 className="card-title">🧾 Last Session Summary</h3>
              <p className="card-subtitle">A quick recap to keep momentum</p>
            </div>
            {lastSession?.summary ? (
              <>
                <div className="client-summary">{lastSession.summary}</div>
                {lastSession.keyTakeaways?.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="client-dense-title">Key takeaways</div>
                    <ul className="client-dense-list">
                      {lastSession.keyTakeaways.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>
                No session summary yet. Start a session to generate your first recap.
              </div>
            )}
            <div className="client-inline-meta">
              <div>
                <div className="client-mini-title">Last session</div>
                <div className="client-mini-value">{formatShortDate(lastSession?.startedAt)}</div>
              </div>
              <div>
                <div className="client-mini-title">Focus this week</div>
                <div className="client-mini-value">{currentWeekFocus || '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card fade-in">
          <div className="card-header">
            <h3 className="card-title">✅ This Week’s Recommendations</h3>
            <p className="card-subtitle">Small, repeatable actions — the compounding kind</p>
          </div>

          <div className="client-recs-grid">
            {weeklyRecommendations.map((r) => (
              <div key={r.id} className="client-rec">
                <div className="client-rec-top">
                  <div>
                    <div className="client-rec-title">{r.title}</div>
                    <div className="client-rec-sub">{r.duration} • {r.category}</div>
                  </div>
                  <span className="client-pill">Do today</span>
                </div>
                <div className="client-rec-body">{r.instructions}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card fade-in">
          <div className="card-header">
            <h3 className="card-title">🎓 Client Tools</h3>
            <p className="card-subtitle">Schedule and manage your AI voice coaching sessions</p>
          </div>

          {!calendarConnected ? (
            <div className="alert alert-warning">
              <strong>📅 Calendar not connected</strong>
              <br />
              Calendar integration will be re-added during the LiveKit build-out.
            </div>
          ) : (
            <div className="alert alert-success">
              <strong>✅ Calendar connected</strong>
              <br />
              You'll receive appointment invitations automatically.
            </div>
          )}
        </div>

        <h3 className="section-title">📅 Schedule Your AI Voice Coaching Call</h3>

        <div className="card fade-in">
          <form onSubmit={(e) => void bookAppointment(e)}>
            <div className="form-group">
              <label htmlFor="slot" className="form-label">
                Choose a time slot:
              </label>
              <select
                id="slot"
                name="slot"
                required
                className="form-select"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
              >
                <option value="">Select a time...</option>
                {slots.map((s) => (
                  <option key={s.iso} value={s.iso}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              📅 Book Appointment
            </button>
            <button type="button" className="btn btn-success" onClick={() => void createInstantRoom()} disabled={loading}>
              🧪 Create Instant Room
            </button>
          </form>
        </div>

        <div className="card fade-in">
          <div className="card-header">
            <h3 className="card-title">📅 Upcoming Appointments</h3>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading…</p>
          ) : appointments.length ? (
            <div>
              {appointments.map((a) => (
                <div key={a.id} className={`appointment-item client`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>📅 {formatDateTime(a.scheduledFor)}</strong>
                      {a.status === 'cancelled' ? (
                        <span className="status-badge status-cancelled" style={{ marginLeft: 8 }}>
                          CANCELLED
                        </span>
                      ) : null}
                      <br />
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                        Room ID: {a.roomId.substring(0, 8)}...
                      </span>
                    </div>

                    {a.status !== 'cancelled' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginLeft: '1rem' }}>
                        <button type="button" className="btn btn-danger" onClick={() => void cancelAppointment(a.id)}>
                          ❌ Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {a.status !== 'cancelled' ? (
                    <div style={{ marginTop: '1rem' }}>
                      <button type="button" className="btn btn-success" onClick={() => navigate(`/room/${a.roomId}`)}>
                        ✅ Join Room
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
              No upcoming appointments. Schedule one above or create an instant room.
            </p>
          )}
        </div>

        <div className="logout">
          <div className="card fade-in" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">🧠 Your Account (Details)</h3>
              <p className="card-subtitle">Information-dense, for clarity</p>
            </div>
            <div className="client-dense-grid">
              <div className="client-dense-block">
                <div className="client-dense-title">Login email</div>
                <div className="client-dense-value">{user?.email ?? '—'}</div>
              </div>
              <div className="client-dense-block">
                <div className="client-dense-title">Role</div>
                <div className="client-dense-value">{user?.role ?? 'client'}</div>
              </div>
              <div className="client-dense-block">
                <div className="client-dense-title">User ID</div>
                <div className="client-dense-value" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {(user?.id ?? '—').slice(0, 18)}…
                </div>
              </div>
              <div className="client-dense-block">
                <div className="client-dense-title">Assigned coach</div>
                <div className="client-dense-value">{assignedCoach?.name ?? '—'}</div>
              </div>
            </div>
          </div>

          <button type="button" className="logout-link" onClick={logout}>
            🔓 Logout
          </button>
        </div>
      </div>
    </>
  );
}
