/**
 * Seed Goals from Onboarding Data
 * 
 * Extracts coaching goals from existing profiles and creates ClientGoal records.
 * Run this once after deploying V2 schema to populate initial goals.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedGoalsFromOnboarding() {
  console.log('🌱 Seeding goals from onboarding data...\n');

  try {
    // Find all profiles with completed onboarding and coaching goals
    const profiles = await prisma.profile.findMany({
      where: {
        onboardingCompleted: true,
        intakeCoachingGoals: { not: null },
      },
      include: { user: true },
    });

    console.log(`📊 Found ${profiles.length} profiles with onboarding goals\n`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const profile of profiles) {
      if (!profile.intakeCoachingGoals) {
        skippedCount++;
        continue;
      }

      // Check if goal already exists for this user
      const existingGoal = await prisma.clientGoal.findFirst({
        where: {
          userId: profile.userId,
          source: 'onboarding',
        },
      });

      if (existingGoal) {
        console.log(`⏭️  Skipping ${profile.user.email} - already has onboarding goal`);
        skippedCount++;
        continue;
      }

      // Create initial goal from onboarding
      const goal = await prisma.clientGoal.create({
        data: {
          userId: profile.userId,
          goalText: profile.intakeCoachingGoals,
          category: determineCategory(profile.intakeCoachingGoals, profile.intakeSymptoms),
          status: 'active',
          source: 'onboarding',
          currentProgress: 0,
        },
      });

      console.log(`✅ Created goal for ${profile.user.email}`);
      console.log(`   Goal: ${goal.goalText.substring(0, 80)}...`);
      console.log(`   Category: ${goal.category}\n`);
      
      createdCount++;
    }

    console.log('\n🎉 Goal seeding complete!');
    console.log(`   Created: ${createdCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total: ${profiles.length}`);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Determine goal category based on goal text and symptoms
 */
function determineCategory(goalText: string, symptoms?: string | null): string {
  const text = `${goalText} ${symptoms || ''}`.toLowerCase();

  if (text.includes('breath') || text.includes('breathing')) return 'breathing';
  if (text.includes('stress') || text.includes('anxiety')) return 'stress';
  if (text.includes('sleep') || text.includes('insomnia')) return 'sleep';
  if (text.includes('energy') || text.includes('fatigue')) return 'energy';
  if (text.includes('health') || text.includes('physical')) return 'health';
  
  return 'wellness';
}

seedGoalsFromOnboarding();
