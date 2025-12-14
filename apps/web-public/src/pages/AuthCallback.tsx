export function AuthCallbackPage() {
  return (
    <main className="page-shell">
      <div className="login-shell">
        <div className="login-card">
          <h1 className="logo">Authenticating…</h1>
          <p className="login-subtitle">
            This app is the unified login origin. Auth callbacks are handled in the coach/client portals.
          </p>
          <div className="login-footer">
            <a className="link" href="/login">
              Back to Login
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
