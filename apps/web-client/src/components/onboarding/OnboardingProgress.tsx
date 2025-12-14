/**
 * Onboarding Progress Indicator
 * 
 * Shows 3 dots for each step - completed, current (pulsing), pending.
 */

interface OnboardingProgressProps {
  current: number;
  total: number;
}

export function OnboardingProgress({ current, total }: OnboardingProgressProps) {
  return (
    <div className="onboarding-progress">
      {Array.from({ length: total }, (_, i) => {
        const isCompleted = i < current;
        const isCurrent = i === current;
        
        return (
          <div
            key={i}
            className={`onboarding-progress-dot ${
              isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'
            }`}
          />
        );
      })}
    </div>
  );
}
