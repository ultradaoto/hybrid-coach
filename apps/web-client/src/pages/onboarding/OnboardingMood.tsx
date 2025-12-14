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

export function OnboardingMood() {
  const navigate = useNavigate();
  const { responses, user, updateResponse, clearResponses, isComplete, getAuthToken } = useOnboardingState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!isComplete()) {
      setError('Please complete all questions before submitting.');
      return;
    }

    const authToken = getAuthToken();
    console.log('[Onboarding] Auth token present:', !!authToken);
    console.log('[Onboarding] Token preview:', authToken ? authToken.substring(0, 20) + '...' : 'NONE');
    
    if (!authToken) {
      setError('Session expired. Please log in again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log('[Onboarding] Submitting to /api/onboarding/complete');
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
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
      
      // Navigate to dashboard
      navigate('/dashboard', { replace: true });

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
