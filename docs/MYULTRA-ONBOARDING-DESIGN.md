# MyUltra.Coach Onboarding System Design

## Overview

This document outlines the architecture for a Typeform-style onboarding flow that captures new client intake information when they first log into MyUltra.Coach after subscribing through Vagus Skool.

---

## Authentication & User Detection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Login Flow                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User visits myultra.coach/login                                        │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                    │
│  │ Enter Email     │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────────────────────────────┐                            │
│  │ Check: Is email in vagus_members table? │                            │
│  └────────┬──────────────────┬─────────────┘                            │
│           │                  │                                           │
│      Yes  │                  │  No                                       │
│           ▼                  ▼                                           │
│  ┌─────────────────┐   ┌─────────────────────────┐                      │
│  │ Check: Active   │   │ "Please subscribe at    │                      │
│  │ subscription?   │   │  skool.com/vagus first" │                      │
│  └────────┬────────┘   └─────────────────────────┘                      │
│           │                                                              │
│      Yes  │                                                              │
│           ▼                                                              │
│  ┌─────────────────────────────────────────┐                            │
│  │ Check: onboarding_completed = true?     │                            │
│  └────────┬──────────────────┬─────────────┘                            │
│           │                  │                                           │
│      Yes  │                  │  No (null or false)                       │
│           ▼                  ▼                                           │
│  ┌─────────────────┐   ┌─────────────────────────┐                      │
│  │ → Dashboard     │   │ → Onboarding Flow       │                      │
│  └─────────────────┘   └─────────────────────────┘                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

```sql
-- Members synced nightly from Vagus Skool CSV export
CREATE TABLE vagus_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    subscription_status VARCHAR(50) DEFAULT 'active', -- active, cancelled, paused
    skool_member_id VARCHAR(100), -- ID from Skool if available
    joined_skool_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client profiles - created after onboarding
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vagus_member_id UUID REFERENCES vagus_members(id) ON DELETE CASCADE,
    
    -- Onboarding data
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_completed_at TIMESTAMPTZ,
    
    -- Onboarding responses (intake form)
    intake_coaching_goals TEXT,          -- Q1: What do you hope to get from coaching?
    intake_symptoms TEXT,                 -- Q2: Describe symptoms you experience
    intake_initial_mood INTEGER CHECK (intake_initial_mood BETWEEN 1 AND 5), -- Q3: 1-5 stars
    
    -- Computed/derived fields
    total_sessions INTEGER DEFAULT 0,
    last_session_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coaching sessions - one row per call
CREATE TABLE coaching_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Session metadata
    session_number INTEGER NOT NULL,      -- Sequential for this client
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- AI agent info
    agent_type VARCHAR(50) DEFAULT 'ultra_coach', -- For future agent variants
    agent_version VARCHAR(20),
    
    -- Human coach involvement (premium tier)
    human_coach_id UUID,                  -- If human coach participated
    human_coach_joined_at TIMESTAMPTZ,
    human_coach_notes TEXT,
    
    -- Session state
    status VARCHAR(50) DEFAULT 'active',  -- active, completed, abandoned
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transcript chunks - streaming transcript storage
CREATE TABLE session_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES coaching_sessions(id) ON DELETE CASCADE,
    
    speaker VARCHAR(50) NOT NULL,         -- 'client', 'ai_coach', 'human_coach'
    content TEXT NOT NULL,
    timestamp_offset_ms INTEGER,          -- Milliseconds from session start
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI-generated session insights & notes
CREATE TABLE session_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES coaching_sessions(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Structured insights
    summary TEXT,                         -- Brief session summary
    key_topics JSONB,                     -- Array of discussed topics
    client_mood_start INTEGER,            -- AI-assessed mood 1-5
    client_mood_end INTEGER,
    breakthrough_moments TEXT[],          -- Notable positive moments
    concerns_flagged TEXT[],              -- Things to monitor
    
    -- Action items & follow-ups
    client_commitments TEXT[],            -- What client said they'd do
    suggested_focus_areas TEXT[],         -- For next session
    
    -- Raw AI analysis
    raw_analysis JSONB,                   -- Full LLM analysis output
    
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    model_version VARCHAR(50)
);

-- Long-term client observations (aggregated across sessions)
CREATE TABLE client_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    
    observation_type VARCHAR(100) NOT NULL, -- 'pattern', 'progress', 'concern', 'milestone'
    title VARCHAR(255),
    description TEXT NOT NULL,
    
    -- Linking to evidence
    related_session_ids UUID[],           -- Sessions that informed this
    confidence_score DECIMAL(3,2),        -- 0.00 to 1.00
    
    -- For human coaches
    human_verified BOOLEAN DEFAULT FALSE,
    human_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client goals & progress tracking
CREATE TABLE client_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    
    goal_text TEXT NOT NULL,
    category VARCHAR(100),                -- 'health', 'wellness', 'energy', 'sleep', etc.
    status VARCHAR(50) DEFAULT 'active',  -- active, achieved, paused, abandoned
    
    -- Progress tracking
    progress_notes JSONB,                 -- Array of {date, note, progress_pct}
    target_date DATE,
    achieved_at TIMESTAMPTZ,
    
    -- Source
    source VARCHAR(50),                   -- 'onboarding', 'session', 'client_input'
    source_session_id UUID,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_vagus_members_email ON vagus_members(email);
CREATE INDEX idx_clients_vagus_member ON clients(vagus_member_id);
CREATE INDEX idx_sessions_client ON coaching_sessions(client_id);
CREATE INDEX idx_sessions_started ON coaching_sessions(started_at DESC);
CREATE INDEX idx_insights_client ON session_insights(client_id);
CREATE INDEX idx_observations_client ON client_observations(client_id);
CREATE INDEX idx_goals_client_status ON client_goals(client_id, status);
```

### Why This Schema Works for Long-Term Clients

1. **Separation of concerns**: Session data, insights, and long-term observations are separate tables
2. **Queryable history**: Easy to pull "all sessions for client X" or "all insights mentioning topic Y"
3. **Aggregation support**: `client_observations` stores patterns identified across multiple sessions
4. **Human coach integration**: Every table has hooks for human coach input
5. **Audit trail**: Timestamps everywhere for compliance and debugging

---

## Onboarding Flow Architecture

### Route Structure

```
/onboarding
├── /onboarding/welcome     → Question 1: Coaching goals
├── /onboarding/symptoms    → Question 2: Health symptoms  
├── /onboarding/mood        → Question 3: Current mood (stars)
└── /onboarding/complete    → Redirect to dashboard
```

### Component Hierarchy

```
<OnboardingLayout>
├── <OnboardingProgress />        // Top progress indicator (dots or bar)
├── <OnboardingContent>
│   ├── <QuestionPanel />         // Left side - question + input
│   │   ├── <WelcomeHeader />     // "Welcome, {firstName}!"
│   │   ├── <QuestionText />
│   │   ├── <InputArea />         // TextArea or StarRating
│   │   └── <NavigationButton />  // "Next Question" / "Submit Onboarding"
│   │
│   └── <FeatureShowcase />       // Right side - visual/marketing
│       ├── <ShowcaseImage />
│       └── <ShowcaseText />
└── </OnboardingContent>
```

---

## React Implementation

### Types (types/onboarding.ts)

```typescript
// types/onboarding.ts

export interface OnboardingResponses {
  coachingGoals: string;
  symptoms: string;
  currentMood: number; // 1-5
}

export interface OnboardingStep {
  id: 'goals' | 'symptoms' | 'mood';
  path: string;
  question: string;
  placeholder?: string;
  inputType: 'textarea' | 'stars';
  showcase: {
    imageSrc: string;
    imageAlt: string;
    headline: string;
    description: string;
  };
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'goals',
    path: '/onboarding/welcome',
    question: 'What would you hope to get out of having an on-demand coach in regards to reaching your goals for health and wellness?',
    placeholder: 'e.g., I hope to get relief from my chronic fatigue...',
    inputType: 'textarea',
    showcase: {
      imageSrc: '/images/onboarding/coach-orb.png',
      imageAlt: 'Ultra Coach AI visualization',
      headline: 'Meet Your Ultra Coach',
      description: 'An AI-powered coaching companion available 24/7, trained in health optimization and wellness strategies.',
    },
  },
  {
    id: 'symptoms',
    path: '/onboarding/symptoms',
    question: 'Describe with as much detail as you\'re comfortable, what if any are some of the symptoms you might be encountering on a consistent basis in your health?',
    placeholder: 'e.g., fatigue, difficulty sleeping, brain fog, mood changes...',
    inputType: 'textarea',
    showcase: {
      imageSrc: '/images/onboarding/listening.png',
      imageAlt: 'Personalized coaching session',
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
      imageSrc: '/images/onboarding/progress.png',
      imageAlt: 'Progress tracking visualization',
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
```

### Onboarding Layout (components/onboarding/OnboardingLayout.tsx)

```tsx
// components/onboarding/OnboardingLayout.tsx

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
  totalSteps 
}: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent" />
      
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Progress indicator */}
        <div className="pt-8 px-8">
          <OnboardingProgress current={currentStep} total={totalSteps} />
        </div>
        
        {/* Main content */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-6xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Progress Indicator (components/onboarding/OnboardingProgress.tsx)

```tsx
// components/onboarding/OnboardingProgress.tsx

interface OnboardingProgressProps {
  current: number;
  total: number;
}

export function OnboardingProgress({ current, total }: OnboardingProgressProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`
            h-2 rounded-full transition-all duration-500 ease-out
            ${i < current 
              ? 'w-8 bg-indigo-500' 
              : i === current 
                ? 'w-8 bg-indigo-400 animate-pulse' 
                : 'w-2 bg-slate-700'
            }
          `}
        />
      ))}
    </div>
  );
}
```

### Question Panel (components/onboarding/QuestionPanel.tsx)

```tsx
// components/onboarding/QuestionPanel.tsx

import { useState, KeyboardEvent } from 'react';
import { StarRating } from './StarRating';

interface QuestionPanelProps {
  firstName: string;
  question: string;
  placeholder?: string;
  inputType: 'textarea' | 'stars';
  value: string | number;
  onChange: (value: string | number) => void;
  onSubmit: () => void;
  isLastStep: boolean;
  isFirstStep: boolean;
}

export function QuestionPanel({
  firstName,
  question,
  placeholder,
  inputType,
  value,
  onChange,
  onSubmit,
  isLastStep,
  isFirstStep,
}: QuestionPanelProps) {
  const [isFocused, setIsFocused] = useState(false);
  
  const isValid = inputType === 'stars' 
    ? typeof value === 'number' && value >= 1 
    : typeof value === 'string' && value.trim().length > 0;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && isValid) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full justify-center">
      {/* Welcome header - only on first step */}
      {isFirstStep && (
        <div className="mb-8">
          <h1 className="text-4xl font-light text-white mb-2">
            Welcome, <span className="text-indigo-400">{firstName}</span>, to MyUltra.Coach
          </h1>
          <p className="text-slate-400 text-lg">
            We have a few short onboarding questions to help you get the most out of your next coaching session.
            <br />
            <span className="text-indigo-400">You could be speaking with the Ultra Coach within minutes!</span>
          </p>
        </div>
      )}

      {/* Question */}
      <div className="mb-6">
        <p className="text-xl text-white leading-relaxed">
          {question}
        </p>
      </div>

      {/* Input area */}
      <div className="mb-6">
        {inputType === 'textarea' ? (
          <div className={`
            relative rounded-xl transition-all duration-300
            ${isFocused ? 'ring-2 ring-indigo-500/50' : ''}
          `}>
            <textarea
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              rows={4}
              className="
                w-full px-5 py-4 
                bg-slate-800/50 border border-slate-700 
                rounded-xl text-white placeholder-slate-500
                focus:outline-none focus:border-indigo-500/50
                resize-none transition-colors
              "
            />
            <div className="absolute bottom-3 right-3 text-xs text-slate-500">
              Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">Enter</kbd> to continue
            </div>
          </div>
        ) : (
          <StarRating 
            value={value as number} 
            onChange={(v) => onChange(v)} 
          />
        )}
      </div>

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={!isValid}
        className={`
          px-8 py-3 rounded-xl font-medium text-lg
          transition-all duration-300 transform
          ${isValid 
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white hover:scale-[1.02] active:scale-[0.98]' 
            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }
        `}
      >
        {isLastStep ? 'Submit Onboarding' : 'Next Question'}
      </button>
    </div>
  );
}
```

### Star Rating Component (components/onboarding/StarRating.tsx)

```tsx
// components/onboarding/StarRating.tsx

import { useState } from 'react';
import { MOOD_LABELS } from '@/types/onboarding';

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
}

export function StarRating({ value, onChange }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  
  const displayValue = hovered ?? value;
  const moodLabel = displayValue > 0 ? MOOD_LABELS[displayValue] : '';

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className="p-1 transition-transform hover:scale-110 active:scale-95"
          >
            <svg
              className={`
                w-12 h-12 transition-all duration-200
                ${star <= displayValue 
                  ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' 
                  : 'text-slate-600'
                }
              `}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>
      
      {/* Mood label */}
      <div className={`
        h-8 text-lg font-medium transition-all duration-300
        ${displayValue > 0 ? 'opacity-100' : 'opacity-0'}
        ${displayValue <= 2 ? 'text-red-400' : displayValue === 3 ? 'text-amber-400' : 'text-emerald-400'}
      `}>
        {moodLabel}
      </div>
    </div>
  );
}
```

### Feature Showcase (components/onboarding/FeatureShowcase.tsx)

```tsx
// components/onboarding/FeatureShowcase.tsx

interface FeatureShowcaseProps {
  imageSrc: string;
  imageAlt: string;
  headline: string;
  description: string;
}

export function FeatureShowcase({
  imageSrc,
  imageAlt,
  headline,
  description,
}: FeatureShowcaseProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Image container with glow effect */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full" />
        <img
          src={imageSrc}
          alt={imageAlt}
          className="relative z-10 w-64 h-64 object-contain"
        />
      </div>
      
      {/* Text content */}
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-semibold text-white mb-3">
          {headline}
        </h2>
        <p className="text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
```

### Main Onboarding Page (app/onboarding/[step]/page.tsx)

```tsx
// app/onboarding/[step]/page.tsx

'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { QuestionPanel } from '@/components/onboarding/QuestionPanel';
import { FeatureShowcase } from '@/components/onboarding/FeatureShowcase';
import { ONBOARDING_STEPS, OnboardingResponses } from '@/types/onboarding';

// Map URL params to step index
const STEP_MAP: Record<string, number> = {
  welcome: 0,
  symptoms: 1,
  mood: 2,
};

export default function OnboardingPage() {
  const router = useRouter();
  const params = useParams();
  const stepSlug = params.step as string;
  const currentStepIndex = STEP_MAP[stepSlug] ?? 0;
  const currentStep = ONBOARDING_STEPS[currentStepIndex];
  
  // Get user data from session/context (you'd implement this)
  const firstName = 'Sterling'; // TODO: Pull from auth context
  
  // Form state - persisted in localStorage during onboarding
  const [responses, setResponses] = useState<Partial<OnboardingResponses>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('onboarding_responses');
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('onboarding_responses', JSON.stringify(responses));
  }, [responses]);

  // Get current value based on step
  const getCurrentValue = () => {
    switch (currentStep.id) {
      case 'goals': return responses.coachingGoals ?? '';
      case 'symptoms': return responses.symptoms ?? '';
      case 'mood': return responses.currentMood ?? 0;
    }
  };

  // Update value based on step
  const handleChange = (value: string | number) => {
    switch (currentStep.id) {
      case 'goals':
        setResponses(r => ({ ...r, coachingGoals: value as string }));
        break;
      case 'symptoms':
        setResponses(r => ({ ...r, symptoms: value as string }));
        break;
      case 'mood':
        setResponses(r => ({ ...r, currentMood: value as number }));
        break;
    }
  };

  // Handle navigation
  const handleSubmit = async () => {
    const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1;
    
    if (isLastStep) {
      // Submit all responses to API
      try {
        await fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(responses),
        });
        
        // Clear localStorage and redirect
        localStorage.removeItem('onboarding_responses');
        router.push('/dashboard');
      } catch (error) {
        console.error('Failed to submit onboarding:', error);
      }
    } else {
      // Navigate to next step
      const nextStep = ONBOARDING_STEPS[currentStepIndex + 1];
      router.push(nextStep.path);
    }
  };

  return (
    <OnboardingLayout 
      currentStep={currentStepIndex} 
      totalSteps={ONBOARDING_STEPS.length}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
        {/* Left: Question Panel */}
        <div className="order-2 lg:order-1">
          <QuestionPanel
            firstName={firstName}
            question={currentStep.question}
            placeholder={currentStep.placeholder}
            inputType={currentStep.inputType}
            value={getCurrentValue()}
            onChange={handleChange}
            onSubmit={handleSubmit}
            isFirstStep={currentStepIndex === 0}
            isLastStep={currentStepIndex === ONBOARDING_STEPS.length - 1}
          />
        </div>
        
        {/* Right: Feature Showcase */}
        <div className="order-1 lg:order-2 hidden lg:flex">
          <FeatureShowcase
            imageSrc={currentStep.showcase.imageSrc}
            imageAlt={currentStep.showcase.imageAlt}
            headline={currentStep.showcase.headline}
            description={currentStep.showcase.description}
          />
        </div>
      </div>
    </OnboardingLayout>
  );
}
```

### API Route (app/api/onboarding/complete/route.ts)

```typescript
// app/api/onboarding/complete/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'; // Your database client
import { getSession } from '@/lib/auth'; // Your auth helper

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { coachingGoals, symptoms, currentMood } = body;

    // Validate required fields
    if (!coachingGoals?.trim() || !symptoms?.trim() || !currentMood) {
      return NextResponse.json(
        { error: 'All onboarding questions are required' },
        { status: 400 }
      );
    }

    // Get the vagus member record
    const vagusMember = await db.vagusMember.findUnique({
      where: { email: session.user.email },
    });

    if (!vagusMember) {
      return NextResponse.json(
        { error: 'Vagus Skool membership not found' },
        { status: 404 }
      );
    }

    // Create or update client record with onboarding data
    const client = await db.client.upsert({
      where: { vagusMemberId: vagusMember.id },
      create: {
        vagusMemberId: vagusMember.id,
        intakeCoachingGoals: coachingGoals.trim(),
        intakeSymptoms: symptoms.trim(),
        intakeInitialMood: currentMood,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
      update: {
        intakeCoachingGoals: coachingGoals.trim(),
        intakeSymptoms: symptoms.trim(),
        intakeInitialMood: currentMood,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
    });

    // Create initial goal from their coaching goals response
    await db.clientGoal.create({
      data: {
        clientId: client.id,
        goalText: coachingGoals.trim(),
        category: 'health',
        status: 'active',
        source: 'onboarding',
      },
    });

    return NextResponse.json({ 
      success: true, 
      clientId: client.id 
    });

  } catch (error) {
    console.error('Onboarding submission error:', error);
    return NextResponse.json(
      { error: 'Failed to complete onboarding' },
      { status: 500 }
    );
  }
}
```

---

## Nightly Sync Script (scripts/sync-vagus-members.ts)

```typescript
// scripts/sync-vagus-members.ts

import { parse } from 'csv-parse/sync';
import { db } from '@/lib/db';

interface SkoolMember {
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  joined_at: string;
  member_id?: string;
}

export async function syncVagusMembers(csvContent: string) {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  }) as SkoolMember[];

  const syncedAt = new Date();
  const results = {
    added: 0,
    updated: 0,
    deactivated: 0,
  };

  // Get all current emails from CSV
  const csvEmails = new Set(records.map(r => r.email.toLowerCase()));

  // Process each record from CSV
  for (const record of records) {
    const email = record.email.toLowerCase();
    
    const existing = await db.vagusMember.findUnique({
      where: { email },
    });

    if (existing) {
      // Update existing member
      await db.vagusMember.update({
        where: { email },
        data: {
          firstName: record.first_name,
          lastName: record.last_name,
          subscriptionStatus: record.status === 'active' ? 'active' : 'cancelled',
          syncedAt,
          updatedAt: new Date(),
        },
      });
      results.updated++;
    } else {
      // Create new member
      await db.vagusMember.create({
        data: {
          email,
          firstName: record.first_name,
          lastName: record.last_name,
          subscriptionStatus: 'active',
          skoolMemberId: record.member_id,
          joinedSkoolAt: record.joined_at ? new Date(record.joined_at) : null,
          syncedAt,
        },
      });
      results.added++;
    }
  }

  // Mark members not in CSV as cancelled (they left Skool)
  const membersToDeactivate = await db.vagusMember.findMany({
    where: {
      email: { notIn: Array.from(csvEmails) },
      subscriptionStatus: 'active',
    },
  });

  for (const member of membersToDeactivate) {
    await db.vagusMember.update({
      where: { id: member.id },
      data: {
        subscriptionStatus: 'cancelled',
        syncedAt,
        updatedAt: new Date(),
      },
    });
    results.deactivated++;
  }

  console.log(`Sync complete: ${results.added} added, ${results.updated} updated, ${results.deactivated} deactivated`);
  return results;
}
```

---

## Long-Term Client Data Strategy

### The Challenge

A client using the service for 3+ months could accumulate:
- 12-50+ coaching sessions
- Thousands of transcript lines
- Dozens of AI-generated insights
- Multiple evolving goals

### Solutions

#### 1. Summarization Layers

```typescript
// Generate weekly/monthly client summaries
interface ClientSummary {
  clientId: string;
  periodStart: Date;
  periodEnd: Date;
  periodType: 'weekly' | 'monthly';
  
  // Aggregated metrics
  sessionCount: number;
  totalDurationMinutes: number;
  averageMoodStart: number;
  averageMoodEnd: number;
  moodTrend: 'improving' | 'stable' | 'declining';
  
  // Key themes (AI-extracted)
  topTopics: string[];
  progressHighlights: string[];
  concernsToMonitor: string[];
  
  // Goals progress
  goalsProgress: {
    goalId: string;
    goalText: string;
    progressPct: number;
    notes: string;
  }[];
}
```

#### 2. Smart Context Windows

When starting a new session, build a condensed context:

```typescript
async function buildSessionContext(clientId: string): Promise<string> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: {
      // Most recent summary
      summaries: { orderBy: { periodEnd: 'desc' }, take: 1 },
      // Last 3 sessions' insights only
      sessions: {
        orderBy: { startedAt: 'desc' },
        take: 3,
        include: { insights: true },
      },
      // Active goals
      goals: { where: { status: 'active' } },
      // Recent observations
      observations: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  return formatContextForAI(client);
}
```

#### 3. Archival Strategy

```sql
-- Archive old transcript chunks (keep insights, remove verbatim text)
CREATE TABLE archived_transcripts (
  original_id UUID,
  session_id UUID,
  archived_at TIMESTAMPTZ,
  summary TEXT,  -- AI-generated summary of the transcript
  key_quotes JSONB  -- Only significant quotes preserved
);

-- Move transcripts older than 6 months
INSERT INTO archived_transcripts (original_id, session_id, archived_at, summary)
SELECT id, session_id, NOW(), generate_summary(content)
FROM session_transcripts
WHERE created_at < NOW() - INTERVAL '6 months';
```

---

## File Structure

```
apps/web-public/
├── app/
│   ├── onboarding/
│   │   ├── [step]/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   └── onboarding/
│   │       └── complete/
│   │           └── route.ts
│   └── dashboard/
│       └── page.tsx
├── components/
│   └── onboarding/
│       ├── OnboardingLayout.tsx
│       ├── OnboardingProgress.tsx
│       ├── QuestionPanel.tsx
│       ├── StarRating.tsx
│       └── FeatureShowcase.tsx
├── types/
│   └── onboarding.ts
├── lib/
│   ├── db.ts
│   └── auth.ts
└── scripts/
    └── sync-vagus-members.ts
```

---

## Animation Suggestions

For that sleek Typeform feel, consider these Framer Motion animations:

```tsx
// Smooth page transitions between questions
import { motion, AnimatePresence } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

// Wrap your question content
<AnimatePresence mode="wait">
  <motion.div
    key={currentStep.id}
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.3, ease: 'easeInOut' }}
  >
    {/* Question content */}
  </motion.div>
</AnimatePresence>
```

---

## Next Steps

1. **Set up database** - Run the schema migrations
2. **Implement auth flow** - Magic link or Skool SSO integration
3. **Build the components** - Start with the types and work up
4. **Create placeholder images** - For the feature showcase panels
5. **Test the sync script** - Ensure CSV parsing handles edge cases
6. **Add monitoring** - Track onboarding completion rates

---

*Document created for MyUltra.Coach onboarding system*