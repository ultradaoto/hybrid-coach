/**
 * Onboarding Step 1: Coaching Goals
 * 
 * First step of onboarding - asks about coaching goals and wellness hopes.
 */

import { useNavigate } from 'react-router-dom';
import { OnboardingLayout, QuestionPanel, FeatureShowcase } from '../../components/onboarding';
import { ONBOARDING_STEPS } from '../../types/onboarding';
import { useOnboardingState } from '../../hooks/useOnboardingState';

const STEP_INDEX = 0;
const CURRENT_STEP = ONBOARDING_STEPS[STEP_INDEX];
const NEXT_STEP = ONBOARDING_STEPS[STEP_INDEX + 1];

export function OnboardingWelcome() {
  const navigate = useNavigate();
  const { responses, user, updateResponse } = useOnboardingState();

  const handleSubmit = () => {
    if (responses.coachingGoals?.trim()) {
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
            value={responses.coachingGoals ?? ''}
            onChange={(value) => updateResponse('coachingGoals', value as string)}
            onSubmit={handleSubmit}
            isFirstStep={true}
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
