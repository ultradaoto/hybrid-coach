export function PricingPage() {
  return (
    <main className="page-shell">
      <div className="login-shell">
        <div className="login-card">
          <h1 className="logo">Pricing</h1>
          <p className="login-subtitle">
            This page will be wired to the tier system (FREE / VAGUS_MEMBER / PREMIUM) defined in the architecture
            spec.
          </p>

          <div className="features-grid" style={{ marginBottom: 0 }}>
            <div className="feature-card">
              <h3 className="feature-title">FREE</h3>
              <p className="feature-description">1 session / month, 20 minute cap.</p>
            </div>
            <div className="feature-card">
              <h3 className="feature-title">VAGUS_MEMBER</h3>
              <p className="feature-description">Unlimited sessions, reports enabled.</p>
            </div>
            <div className="feature-card">
              <h3 className="feature-title">PREMIUM</h3>
              <p className="feature-description">Unlimited + human coach access.</p>
            </div>
          </div>

          <div className="login-footer">
            <a className="link" href="/login">
              Sign in
            </a>
            <span style={{ margin: '0 0.75rem', opacity: 0.5 }}>|</span>
            <a className="link" href="/home">
              Back to Home
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
