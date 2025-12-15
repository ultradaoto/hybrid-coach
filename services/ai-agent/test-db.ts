/**
 * Database Connection Test for Phase 3
 * 
 * Run this to verify:
 * 1. Prisma can connect to the database
 * 2. Session and Message models work correctly
 * 3. Database helper functions are working
 * 
 * Usage:
 *   npx tsx test-db.ts
 */

import { prisma, cleanupAbandonedSessions } from './src/db/index.js';

async function testDatabaseConnection() {
  console.log('='.repeat(60));
  console.log('🧪 Phase 3 Database Integration Test');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Test 1: Database connection
    console.log('Test 1: Testing database connection...');
    const userCount = await prisma.user.count();
    console.log(`✅ Connected! User count: ${userCount}`);
    console.log('');

    // Test 2: Session creation (with optional appointmentId)
    console.log('Test 2: Creating test session (without appointment)...');
    
    // First, get or create a test user
    let testUser = await prisma.user.findFirst({
      select: { id: true, displayName: true }
    });
    
    if (!testUser) {
      console.log('   No users found, creating a test user...');
      testUser = await prisma.user.create({
        data: {
          email: 'test-ai-session@test.local',
          displayName: 'Test User',
          role: 'client',
        },
        select: { id: true, displayName: true }
      });
      console.log(`   Created test user: ${testUser.id}`);
    }
    
    const testSession = await prisma.session.create({
      data: {
        roomId: 'test-room-' + Date.now(),
        userId: testUser.id, // Use real user ID
        // appointmentId is optional now - omitted for test
        status: 'active',
        startedAt: new Date(),
        durationMinutes: 0,
      }
    });
    console.log(`✅ Session created: ${testSession.id} (User: ${testUser.displayName})`);
    console.log('');

    // Test 3: Message creation (with optional userId)
    console.log('Test 3: Creating test message (AI sender, no userId)...');
    const testMessage = await prisma.message.create({
      data: {
        sessionId: testSession.id,
        sender: 'ai',
        content: 'Test message from AI',
        // userId is optional now - omitted for AI messages
      }
    });
    console.log(`✅ Message created: ${testMessage.id}`);
    console.log('');

    // Test 4: Message with userId
    console.log('Test 4: Creating test message (client sender, with userId)...');
    
    // First, get a real user ID from the database
    const firstUser = await prisma.user.findFirst({
      select: { id: true, displayName: true }
    });
    
    if (firstUser) {
      const clientMessage = await prisma.message.create({
        data: {
          sessionId: testSession.id,
          userId: firstUser.id,
          sender: 'client',
          content: 'Test message from client',
        }
      });
      console.log(`✅ Client message created: ${clientMessage.id} (User: ${firstUser.displayName})`);
    } else {
      console.log('⚠️  No users found in database - skipping client message test');
    }
    console.log('');

    // Test 5: Session completion
    console.log('Test 5: Completing test session...');
    const updatedSession = await prisma.session.update({
      where: { id: testSession.id },
      data: {
        status: 'completed',
        endedAt: new Date(),
        durationMinutes: 5,
        transcript: 'AI: Test message from AI\nClient: Test message from client',
      }
    });
    console.log(`✅ Session completed: ${updatedSession.id}`);
    console.log('');

    // Test 6: Cleanup abandoned sessions
    console.log('Test 6: Testing cleanup of abandoned sessions...');
    const cleaned = await cleanupAbandonedSessions();
    console.log(`✅ Cleanup completed: ${cleaned} sessions cleaned`);
    console.log('');

    // Test 7: Verify messages are linked
    console.log('Test 7: Verifying message retrieval...');
    const messages = await prisma.message.findMany({
      where: { sessionId: testSession.id },
      orderBy: { createdAt: 'asc' },
      select: { 
        id: true, 
        sender: true, 
        content: true,
        userId: true 
      }
    });
    console.log(`✅ Found ${messages.length} messages for session:`);
    messages.forEach((msg, i) => {
      console.log(`   ${i + 1}. [${msg.sender}] ${msg.content.substring(0, 40)}... (userId: ${msg.userId || 'none'})`);
    });
    console.log('');

    // Cleanup test data
    console.log('Cleaning up test data...');
    await prisma.message.deleteMany({ where: { sessionId: testSession.id }});
    await prisma.session.delete({ where: { id: testSession.id }});
    console.log('✅ Test data cleaned up');
    console.log('');

    // Final summary
    console.log('='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Phase 3 database integration is working correctly:');
    console.log('  ✓ Prisma client connects successfully');
    console.log('  ✓ Sessions can be created without appointments');
    console.log('  ✓ Messages can be created without userId (for AI)');
    console.log('  ✓ Messages can be created with userId (for humans)');
    console.log('  ✓ Session completion works');
    console.log('  ✓ Cleanup functions work');
    console.log('');
    console.log('Ready to use in AI Agent! 🚀');

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(60));
    console.error('');
    console.error('Error:', error);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Check DATABASE_URL in .env file');
    console.error('  2. Ensure PostgreSQL is running');
    console.error('  3. Run: npx prisma db push (to apply schema changes)');
    console.error('  4. Run: npx prisma generate (to update Prisma client)');
    console.error('');
    process.exit(1);

  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testDatabaseConnection();
