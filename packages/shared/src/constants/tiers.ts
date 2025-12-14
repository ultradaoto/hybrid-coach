export enum MembershipTier {
  FREE = 'FREE',
  VAGUS_MEMBER = 'VAGUS_MEMBER',
  PREMIUM = 'PREMIUM',
}

export interface TierLimits {
  sessionsPerMonth: number | null;
  maxSessionMinutes: number | null;
  humanCoachAccess: boolean;
  aiReportsEnabled: boolean;
  prioritySupport: boolean;
}

export const TIER_LIMITS: Record<MembershipTier, TierLimits> = {
  [MembershipTier.FREE]: {
    sessionsPerMonth: 1,
    maxSessionMinutes: 20,
    humanCoachAccess: false,
    aiReportsEnabled: false,
    prioritySupport: false,
  },
  [MembershipTier.VAGUS_MEMBER]: {
    sessionsPerMonth: null,
    maxSessionMinutes: null,
    humanCoachAccess: false,
    aiReportsEnabled: true,
    prioritySupport: false,
  },
  [MembershipTier.PREMIUM]: {
    sessionsPerMonth: null,
    maxSessionMinutes: null,
    humanCoachAccess: true,
    aiReportsEnabled: true,
    prioritySupport: true,
  },
};
