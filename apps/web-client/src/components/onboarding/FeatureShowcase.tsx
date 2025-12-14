/**
 * Feature Showcase Component
 * 
 * Right side panel showing feature previews with placeholder visuals.
 */

interface FeatureShowcaseProps {
  headline: string;
  description: string;
  stepIndex: number;
}

export function FeatureShowcase({
  headline,
  description,
  stepIndex,
}: FeatureShowcaseProps) {
  // Different gradient colors per step
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)', // Indigo to purple
    'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)', // Cyan to indigo
    'linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%)', // Emerald to blue
  ];
  
  const gradient = gradients[stepIndex] || gradients[0];

  return (
    <div className="feature-showcase">
      {/* Placeholder visual with glow */}
      <div className="feature-showcase-visual">
        <div className="feature-showcase-glow" />
        <div 
          className="feature-showcase-orb"
          style={{ background: gradient }}
        >
          {/* Inner orb content - placeholder icon */}
          <div className="feature-showcase-orb-inner">
            {stepIndex === 0 && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            )}
            {stepIndex === 1 && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            )}
            {stepIndex === 2 && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            )}
          </div>
        </div>
      </div>
      
      {/* Text content */}
      <div className="feature-showcase-text">
        <h2 className="feature-showcase-headline">{headline}</h2>
        <p className="feature-showcase-description">{description}</p>
      </div>
    </div>
  );
}
