/**
 * Onboarding Step 3: Current Mood Rating
 * 
 * Final step of onboarding - asks for 1-5 star mood rating and submits.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingLayout, QuestionPanel, FeatureShowcase } from '../../components/onboarding';
import { ONBOARDING_STEPS } from '../../types/onboarding';
import { useOnboardingState } from '../../hooks/useOnboardingState';

const STEP_INDEX = 2;
const CURRENT_STEP = ONBOARDING_STEPS[STEP_INDEX];

// Get the dashboard URL for redirect after submission
function getDashboardUrl(): string {
  const clientUrl = import.meta.env.VITE_CLIENT_APP_URL as string | undefined;
  if (clientUrl) {
    return `${clientUrl.replace(/\/+$/, '')}/dashboard`;
  }
  // Default fallback
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3701/dashboard`;
}

export function OnboardingMood() {
  const navigate = useNavigate();
  const { responses, user, updateResponse, clearResponses, isComplete } = useOnboardingState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!isComplete()) {
      setError('Please complete all questions before submitting.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coachingGoals: responses.coachingGoals,
          symptoms: responses.symptoms,
          currentMood: responses.currentMood,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit onboarding');
      }

      // Clear localStorage and redirect to dashboard
      clearResponses();
      
      // Redirect to the client dashboard
      const dashboardUrl = getDashboardUrl();
      window.location.href = dashboardUrl;

    } catch (err) {
      console.error('Onboarding submission error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <OnboardingLayout currentStep={STEP_INDEX} totalSteps={ONBOARDING_STEPS.length}>
      <div className="onboarding-split">
        {/* Left: Question Panel */}
        <div className="onboarding-split-left">
          <QuestionPanel
            firstName={user.firstName}
            question={CURRENT_STEP.question}
            placeholder={CURRENT_STEP.placeholder}
            inputType={CURRENT_STEP.inputType}
            value={responses.currentMood ?? 0}
            onChange={(value) => updateResponse('currentMood', value as number)}
            onSubmit={handleSubmit}
            isFirstStep={false}
            isLastStep={true}
            isSubmitting={isSubmitting}
          />
          
          {/* Error message */}
          {error && (
            <div className="onboarding-error">
              {error}
            </div>
          )}
        </div>
        
        {/* Right: Feature Showcase */}
        <div className="onboarding-split-right">
          <FeatureShowcase
            headline={CURRENT_STEP.showcase.headline}
            description={CURRENT_STEP.showcase.description}
            stepIndex={STEP_INDEX}
          />
        </div>
      </div>
    </OnboardingLayout>
  );
}
