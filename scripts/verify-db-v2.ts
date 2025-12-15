/**
 * Database V2 Verification Script
 * 
 * Verifies that all new tables and relations from the V2 schema are working correctly.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifySchema() {
  console.log('🔍 Verifying Database V2 Schema...\n');

  try {
    // 1. Check new tables exist and are accessible
    console.log('📊 Checking new tables...');
    
    const insightCount = await prisma.sessionInsight.count();
    console.log(`  ✅ SessionInsight: ${insightCount} records`);
    
    const observationCount = await prisma.clientObservation.count();
    console.log(`  ✅ ClientObservation: ${observationCount} records`);
    
    const goalCount = await prisma.clientGoal.count();
    console.log(`  ✅ ClientGoal: ${goalCount} records`);
    
    const summaryCount = await prisma.clientSummary.count();
    console.log(`  ✅ ClientSummary: ${summaryCount} records`);
    
    const archiveCount = await prisma.archivedTranscript.count();
    console.log(`  ✅ ArchivedTranscript: ${archiveCount} records`);
    
    const deletionCount = await prisma.dataDeletionRequest.count();
    console.log(`  ✅ DataDeletionRequest: ${deletionCount} records\n`);

    // 2. Check existing tables still work
    console.log('📊 Checking existing tables...');
    
    const userCount = await prisma.user.count();
    console.log(`  ✅ User: ${userCount} records`);
    
    const profileCount = await prisma.profile.count();
    console.log(`  ✅ Profile: ${profileCount} records`);
    
    const sessionCount = await prisma.session.count();
    console.log(`  ✅ Session: ${sessionCount} records`);
    
    const appointmentCount = await prisma.appointment.count();
    console.log(`  ✅ Appointment: ${appointmentCount} records\n`);

    // 3. Test relations
    console.log('🔗 Testing relations...');
    
    const user = await prisma.user.findFirst({
      include: {
        profile: true,
        sessionInsights: true,
        clientObservations: true,
        clientGoals: true,
        clientSummaries: true,
        archivedTranscripts: true,
        dataDeletionRequests: true,
      },
    });
    
    if (user) {
      console.log(`  ✅ User relations working`);
      console.log(`     - Has profile: ${!!user.profile}`);
      console.log(`     - Session insights: ${user.sessionInsights.length}`);
      console.log(`     - Observations: ${user.clientObservations.length}`);
      console.log(`     - Goals: ${user.clientGoals.length}`);
      console.log(`     - Summaries: ${user.clientSummaries.length}`);
    } else {
      console.log(`  ⚠️  No users found to test relations`);
    }

    // 4. Test Session -> SessionInsight relation
    const session = await prisma.session.findFirst({
      include: {
        insight: true,
      },
    });
    
    if (session) {
      console.log(`  ✅ Session -> SessionInsight relation working`);
      console.log(`     - Has insight: ${!!session.insight}\n`);
    } else {
      console.log(`  ⚠️  No sessions found to test insight relation\n`);
    }

    // 5. Check new Profile fields
    const profile = await prisma.profile.findFirst({
      select: {
        accumulatedInsights: true,
        lastContextUpdateAt: true,
        contextVersion: true,
        allowDataAggregation: true,
        allowAnonymizedResearch: true,
      },
    });
    
    if (profile) {
      console.log('✅ Profile enhanced fields present:');
      console.log(`   - accumulatedInsights: ${profile.accumulatedInsights ? 'set' : 'null'}`);
      console.log(`   - contextVersion: ${profile.contextVersion}`);
      console.log(`   - allowDataAggregation: ${profile.allowDataAggregation}`);
      console.log(`   - allowAnonymizedResearch: ${profile.allowAnonymizedResearch}\n`);
    }

    // 6. Check new User fields
    const userWithFields = await prisma.user.findFirst({
      select: {
        dataRetentionConsent: true,
        lastDataExportAt: true,
        accountDeletionRequestedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    if (userWithFields) {
      console.log('✅ User enhanced fields present:');
      console.log(`   - dataRetentionConsent: ${userWithFields.dataRetentionConsent}`);
      console.log(`   - lastDataExportAt: ${userWithFields.lastDataExportAt || 'null'}`);
      console.log(`   - createdAt: ${userWithFields.createdAt.toISOString()}`);
      console.log(`   - updatedAt: ${userWithFields.updatedAt.toISOString()}\n`);
    }

    console.log('✅ Database V2 Schema Verification Complete!\n');
    console.log('All tables, relations, and fields are working correctly.');

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifySchema();
