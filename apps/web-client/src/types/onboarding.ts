/**
 * Onboarding Types and Configuration
 * 
 * Defines the structure for the 3-step client onboarding flow.
 */

export interface OnboardingResponses {
  coachingGoals: string;
  symptoms: string;
  currentMood: number; // 1-5
}

export interface OnboardingShowcase {
  headline: string;
  description: string;
}

export interface OnboardingStep {
  id: 'goals' | 'symptoms' | 'mood';
  path: string;
  question: string;
  placeholder?: string;
  inputType: 'textarea' | 'stars';
  showcase: OnboardingShowcase;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'goals',
    path: '/onboarding/welcome',
    question: 'What would you hope to get out of having an on-demand coach in regards to reaching your goals for health and wellness?',
    placeholder: 'e.g., I hope to get relief from my chronic fatigue...',
    inputType: 'textarea',
    showcase: {
      headline: 'Meet Your Ultra Coach',
      description: 'An AI-powered coaching companion available 24/7, trained in health optimization and wellness strategies.',
    },
  },
  {
    id: 'symptoms',
    path: '/onboarding/symptoms',
    question: "Describe with as much detail as you're comfortable, what if any are some of the symptoms you might be encountering on a consistent basis in your health?",
    placeholder: 'e.g., fatigue, difficulty sleeping, brain fog, mood changes...',
    inputType: 'textarea',
    showcase: {
      headline: 'We Listen, We Learn',
      description: 'Every session builds on the last. Your Ultra Coach remembers your journey and adapts to your needs.',
    },
  },
  {
    id: 'mood',
    path: '/onboarding/mood',
    question: 'On a rating of 1 star to 5 stars — how would you describe your mood right now?',
    inputType: 'stars',
    showcase: {
      headline: 'Track Your Progress',
      description: 'Watch your wellness journey unfold with insights from every conversation.',
    },
  },
];

export const MOOD_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Not great',
  3: 'Okay',
  4: 'Good',
  5: 'Fantastic!',
};

// Helper to get step index from path
export function getStepIndexFromPath(path: string): number {
  return ONBOARDING_STEPS.findIndex((step) => step.path === path);
}

// Helper to get step by ID
export function getStepById(id: OnboardingStep['id']): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((step) => step.id === id);
}
