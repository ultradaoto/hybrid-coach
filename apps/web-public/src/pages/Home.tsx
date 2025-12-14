export function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <h1 className="logo">MyUltra.Coach</h1>
          <p className="tagline">Professional Ultrasound Coaching &amp; Training</p>
          <p className="hero-text">
            Transform your ultrasound skills with our hybrid learning platform. Get instant AI-powered guidance
            combined with personalized coaching from certified ultrasound professionals.
          </p>
          <div>
            <a href="/login" className="btn btn-primary">
              Sign in
            </a>
            <a href="/pricing" className="btn btn-secondary">
              View pricing
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Why Choose MyUltra.Coach?</h2>
          <p className="section-subtitle">
            Our platform combines cutting-edge AI technology with human expertise to deliver the most effective
            ultrasound training experience available.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <span className="feature-icon">🤖</span>
            <h3 className="feature-title">AI-Powered Learning</h3>
            <p className="feature-description">
              Advanced artificial intelligence provides instant feedback, real-time guidance, and personalized
              learning paths tailored to your skill level.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">👨‍🏫</span>
            <h3 className="feature-title">Expert Human Coaching</h3>
            <p className="feature-description">
              Connect with board-certified ultrasound professionals for in-depth case discussions, technique
              refinement, and career guidance.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">📊</span>
            <h3 className="feature-title">Progress Tracking</h3>
            <p className="feature-description">
              Comprehensive analytics and detailed progress reports help you monitor improvement and identify
              areas for focused development.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🎓</span>
            <h3 className="feature-title">Professional Community</h3>
            <p className="feature-description">
              Join a network of healthcare professionals, share experiences, and learn from peers in the Vagus Skool
              and Ultra Skool communities.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">⚡</span>
            <h3 className="feature-title">24/7 Availability</h3>
            <p className="feature-description">
              Access your AI coach anytime, anywhere. Get instant answers to technical questions and guidance
              whenever you need it most.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🔒</span>
            <h3 className="feature-title">Secure &amp; Private</h3>
            <p className="feature-description">
              Enterprise-grade security ensures your data and training sessions remain confidential and protected at
              all times.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
