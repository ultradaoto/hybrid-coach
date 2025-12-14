/**
 * Onboarding Step 2: Health Symptoms
 * 
 * Second step of onboarding - asks about health symptoms they experience.
 */

import { useNavigate } from 'react-router-dom';
import { OnboardingLayout, QuestionPanel, FeatureShowcase } from '../../components/onboarding';
import { ONBOARDING_STEPS } from '../../types/onboarding';
import { useOnboardingState } from '../../hooks/useOnboardingState';

const STEP_INDEX = 1;
const CURRENT_STEP = ONBOARDING_STEPS[STEP_INDEX];
const NEXT_STEP = ONBOARDING_STEPS[STEP_INDEX + 1];

export function OnboardingSymptoms() {
  const navigate = useNavigate();
  const { responses, user, updateResponse } = useOnboardingState();

  const handleSubmit = () => {
    if (responses.symptoms?.trim()) {
      navigate(NEXT_STEP.path);
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
            value={responses.symptoms ?? ''}
            onChange={(value) => updateResponse('symptoms', value as string)}
            onSubmit={handleSubmit}
            isFirstStep={false}
            isLastStep={false}
          />
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
