/**
 * Onboarding State Hook
 * 
 * Manages onboarding responses in localStorage for persistence across page refreshes.
 */

import { useState, useEffect, useCallback } from 'react';
import type { OnboardingResponses } from '../types/onboarding';

const STORAGE_KEY = 'onboarding_responses';
const USER_KEY = 'onboarding_user';

interface OnboardingUser {
  firstName: string;
  email: string;
}

export function useOnboardingState() {
  // Initialize from localStorage
  const [responses, setResponses] = useState<Partial<OnboardingResponses>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  const [user, setUser] = useState<OnboardingUser>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(USER_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    }
    // Default placeholder - will be set from auth context
    return { firstName: 'Friend', email: '' };
  });

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
  }, [responses]);

  // Update a specific response
  const updateResponse = useCallback(<K extends keyof OnboardingResponses>(
    key: K,
    value: OnboardingResponses[K]
  ) => {
    setResponses((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Set user info (called after auth)
  const setUserInfo = useCallback((firstName: string, email: string) => {
    const userData = { firstName, email };
    setUser(userData);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
  }, []);

  // Clear all responses (after submission)
  const clearResponses = useCallback(() => {
    setResponses({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Clear everything (full reset)
  const clearAll = useCallback(() => {
    setResponses({});
    setUser({ firstName: 'Friend', email: '' });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  // Check if all required fields are filled
  const isComplete = useCallback(() => {
    return (
      !!responses.coachingGoals?.trim() &&
      !!responses.symptoms?.trim() &&
      typeof responses.currentMood === 'number' &&
      responses.currentMood >= 1 &&
      responses.currentMood <= 5
    );
  }, [responses]);

  return {
    responses,
    user,
    updateResponse,
    setUserInfo,
    clearResponses,
    clearAll,
    isComplete,
  };
}
