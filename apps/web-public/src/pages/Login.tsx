import { useState, type FormEvent } from 'react';

type LoginResponse =
  | {
      success: true;
      data: {
        grant: string;
        redirectUrl: string;
        role: string;
      };
    }
  | { success: false; error: string };

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOpenedUrl(null);
    setPopupBlocked(false);
    setLoading(true);

    // Open a blank tab synchronously to avoid popup blockers.
    const popup = window.open('', '_blank');
    if (!popup) setPopupBlocked(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = (await res.json().catch(() => null)) as LoginResponse | null;
      if (!res.ok || !json) {
        try {
          popup?.close();
        } catch {}
        setError('Login failed. Please try again.');
        return;
      }
      if (!json.success) {
        try {
          popup?.close();
        } catch {}
        setError(json.error || 'Login failed.');
        return;
      }

      setOpenedUrl(json.data.redirectUrl);
      if (popup) {
        try {
          popup.location.href = json.data.redirectUrl;
        } catch {
          setPopupBlocked(true);
        }
      } else {
        setPopupBlocked(true);
      }
    } catch (err) {
      try {
        popup?.close();
      } catch {}
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="login-shell">
        <div className="login-card" style={{ maxWidth: 520 }}>
          <h1 className="logo">MyUltra.Coach</h1>
          <p className="login-subtitle">
            Sign in with your Vagus Skool email. We'll automatically direct you to the correct portal.
          </p>

          {error ? (
            <div className="alert alert-error" style={{ margin: '0 0 1rem' }}>
              <strong>Login Error</strong>
              <div style={{ marginTop: '0.5rem' }}>{error}</div>
            </div>
          ) : null}

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {openedUrl ? (
            <div className="alert alert-success" style={{ marginTop: '1rem' }}>
              <strong>Opened in a new tab.</strong>
              <div style={{ marginTop: '0.5rem' }}>
                <a className="link" href={openedUrl} target="_blank" rel="noreferrer">
                  Click here if it didn’t open
                </a>
              </div>
            </div>
          ) : null}

          {popupBlocked && !openedUrl ? (
            <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
              <strong>Popup blocked.</strong>
              <div style={{ marginTop: '0.5rem' }}>Allow popups for this site, then try again.</div>
            </div>
          ) : null}

          <div className="login-footer">
            <a className="link" href="/home">
              Back to Home
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
