/**
 * Onboarding Layout
 * 
 * Full-page dark themed layout with gradient background and progress indicator.
 */

import { ReactNode } from 'react';
import { OnboardingProgress } from './OnboardingProgress';

interface OnboardingLayoutProps {
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
}

export function OnboardingLayout({
  children,
  currentStep,
  totalSteps,
}: OnboardingLayoutProps) {
  return (
    <div className="onboarding-layout">
      {/* Gradient overlay */}
      <div className="onboarding-layout-gradient" />
      
      {/* Content container */}
      <div className="onboarding-layout-content">
        {/* Progress indicator */}
        <div className="onboarding-layout-header">
          <OnboardingProgress current={currentStep} total={totalSteps} />
        </div>
        
        {/* Main content area */}
        <div className="onboarding-layout-main">
          <div className="onboarding-layout-container">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
