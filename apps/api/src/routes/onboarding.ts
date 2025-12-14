/**
 * Onboarding Routes
 * 
 * Handles client onboarding completion and data storage using Prisma.
 */

import { PrismaClient } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { jsonResponse } from '../middleware/cors';

// Initialize Prisma client with explicit datasource URL
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Get DATABASE_URL from environment
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  const maskedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
  console.log('[Onboarding] DATABASE_URL:', maskedUrl);
}

// Create Prisma client with explicit datasource override
const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: dbUrl ? {
    db: {
      url: dbUrl,
    },
  } : undefined,
});
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function onboardingRoutes(req: Request, user: AuthUser): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // POST /api/onboarding/complete - Submit onboarding responses
  if (path === '/api/onboarding/complete' && method === 'POST') {
    let body: {
      coachingGoals?: string;
      symptoms?: string;
      currentMood?: number;
    };

    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate required fields
    const { coachingGoals, symptoms, currentMood } = body;

    if (!coachingGoals?.trim()) {
      return jsonResponse(
        { success: false, error: 'Coaching goals are required' },
        { status: 400 }
      );
    }

    if (!symptoms?.trim()) {
      return jsonResponse(
        { success: false, error: 'Symptoms description is required' },
        { status: 400 }
      );
    }

    if (typeof currentMood !== 'number' || currentMood < 1 || currentMood > 5) {
      return jsonResponse(
        { success: false, error: 'Mood rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    try {
      // Upsert profile with onboarding data
      const profile = await prisma.profile.upsert({
        where: { userId: user.id },
        update: {
          onboardingCompleted: true,
          onboardingCompletedAt: new Date(),
          intakeCoachingGoals: coachingGoals.trim(),
          intakeSymptoms: symptoms.trim(),
          intakeInitialMood: currentMood,
        },
        create: {
          userId: user.id,
          onboardingCompleted: true,
          onboardingCompletedAt: new Date(),
          intakeCoachingGoals: coachingGoals.trim(),
          intakeSymptoms: symptoms.trim(),
          intakeInitialMood: currentMood,
        },
      });

      console.log(`[Onboarding] ✅ Client ${user.id} (${user.email}) completed onboarding`);
      console.log(`[Onboarding] Goals: ${coachingGoals.substring(0, 100)}...`);
      console.log(`[Onboarding] Symptoms: ${symptoms.substring(0, 100)}...`);
      console.log(`[Onboarding] Mood: ${currentMood}/5`);

      return jsonResponse({
        success: true,
        data: {
          profileId: profile.id,
          completedAt: profile.onboardingCompletedAt,
        },
      });
    } catch (err) {
      console.error('[Onboarding] ❌ Database error:', err);
      return jsonResponse(
        { success: false, error: 'Failed to save onboarding data' },
        { status: 500 }
      );
    }
  }

  // GET /api/onboarding/status - Check if onboarding is completed
  if (path === '/api/onboarding/status' && method === 'GET') {
    try {
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
        select: {
          onboardingCompleted: true,
          onboardingCompletedAt: true,
        },
      });

      return jsonResponse({
        success: true,
        data: {
          completed: profile?.onboardingCompleted ?? false,
          completedAt: profile?.onboardingCompletedAt ?? null,
        },
      });
    } catch (err) {
      console.error('[Onboarding] ❌ Database error:', err);
      return jsonResponse(
        { success: false, error: 'Failed to check onboarding status' },
        { status: 500 }
      );
    }
  }

  // GET /api/onboarding/data - Get onboarding data (for AI context)
  if (path === '/api/onboarding/data' && method === 'GET') {
    try {
      const profile = await prisma.profile.findUnique({
        where: { userId: user.id },
        select: {
          onboardingCompleted: true,
          onboardingCompletedAt: true,
          intakeCoachingGoals: true,
          intakeSymptoms: true,
          intakeInitialMood: true,
        },
      });

      if (!profile || !profile.onboardingCompleted) {
        return jsonResponse(
          { success: false, error: 'Onboarding not completed' },
          { status: 404 }
        );
      }

      return jsonResponse({
        success: true,
        data: {
          coachingGoals: profile.intakeCoachingGoals,
          symptoms: profile.intakeSymptoms,
          currentMood: profile.intakeInitialMood,
          completedAt: profile.onboardingCompletedAt,
        },
      });
    } catch (err) {
      console.error('[Onboarding] ❌ Database error:', err);
      return jsonResponse(
        { success: false, error: 'Failed to get onboarding data' },
        { status: 500 }
      );
    }
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}

// Helper function to check onboarding status (for use in other routes)
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { onboardingCompleted: true },
    });
    return profile?.onboardingCompleted ?? false;
  } catch {
    return false;
  }
}

// Helper function to get onboarding data (for AI context injection)
export async function getOnboardingData(userId: string) {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: {
        intakeCoachingGoals: true,
        intakeSymptoms: true,
        intakeInitialMood: true,
      },
    });
    return profile;
  } catch {
    return null;
  }
}
