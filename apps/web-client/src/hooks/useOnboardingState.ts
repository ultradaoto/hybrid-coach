/**
 * Onboarding State Hook
 * 
 * Manages onboarding responses in localStorage for persistence across page refreshes.
 * Also extracts user info from the auth token.
 */

import { useState, useEffect, useCallback } from 'react';
import type { OnboardingResponses } from '../types/onboarding';

const STORAGE_KEY = 'onboarding_responses';

interface OnboardingUser {
  firstName: string;
  email: string;
}

// Extract user info from JWT token
function getUserFromToken(): OnboardingUser {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    return { firstName: 'Friend', email: '' };
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { firstName: 'Friend', email: '' };
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const email = payload.email || '';
    
    // Extract first name from email or display name if available
    let firstName = 'Friend';
    if (payload.displayName) {
      firstName = payload.displayName.split(' ')[0];
    } else if (payload.name) {
      firstName = payload.name.split(' ')[0];
    } else if (email) {
      // Extract from email: john.doe@example.com -> John
      const localPart = email.split('@')[0];
      const namePart = localPart.split(/[._-]/)[0];
      firstName = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
    }
    
    return { firstName, email };
  } catch {
    return { firstName: 'Friend', email: '' };
  }
}

export function useOnboardingState() {
  // Initialize responses from localStorage
  const [responses, setResponses] = useState<Partial<OnboardingResponses>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  // Get user from token
  const [user] = useState<OnboardingUser>(() => getUserFromToken());

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

  // Clear all responses (after submission)
  const clearResponses = useCallback(() => {
    setResponses({});
    localStorage.removeItem(STORAGE_KEY);
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

  // Get auth token for API calls
  const getAuthToken = useCallback(() => {
    return localStorage.getItem('auth_token');
  }, []);

  return {
    responses,
    user,
    updateResponse,
    clearResponses,
    isComplete,
    getAuthToken,
  };
}
