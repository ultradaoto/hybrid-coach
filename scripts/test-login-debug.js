#!/usr/bin/env node

/**
 * Login Debug Test
 * Test the authentication flow step by step
 */

import authService from './src/services/authService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testAuthFlow() {
  console.log('🔍 Testing Skool Authentication Flow...\n');
  
  try {
    // Step 1: Generate a test code
    console.log('📝 Step 1: Generating test auth code...');
    const testUser = {
      skoolUserId: 'test_user_debug_123',
      skoolUsername: 'Debug Test User'
    };
    
    const authResult = await authService.generateAuthCode(testUser.skoolUserId, testUser.skoolUsername);
    console.log('✅ Code generated:', authResult.code);
    console.log('⏰ Expires at:', authResult.expiresAt.toLocaleString());
    
    // Step 2: Test the URL format
    const testUrl = `https://myultra.coach/login?code=${authResult.code}`;
    console.log('🔗 Test URL:', testUrl);
    
    // Step 3: Validate the code (simulate what the server does)
    console.log('\n📝 Step 2: Validating the auth code...');
    const validation = await authService.validateAuthCode(
      authResult.code, 
      '127.0.0.1', 
      'test-user-agent'
    );
    
    if (validation.valid) {
      console.log('✅ Code validation successful!');
      console.log('👤 User data:', validation.authData);
      
      // Step 4: Create session
      console.log('\n📝 Step 3: Creating user session...');
      const session = await authService.createUserSession(authResult.code, validation.authData);
      console.log('✅ Session created!');
      console.log('🔑 Session ID:', session.sessionId);
      console.log('⏰ Session expires:', session.expiresAt.toLocaleString());
      
    } else {
      console.log('❌ Code validation failed:', validation.error);
    }
    
    // Step 5: Check database state
    console.log('\n📝 Step 4: Checking database state...');
    const stats = await authService.getAuthStats(1);
    console.log('📊 Auth stats:', stats);
    
    console.log('\n🎉 Authentication flow test completed!');
    console.log('\nIf you see ✅ for all steps, the auth system is working.');
    console.log('If login still fails in browser, the issue is in route handling.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error.message.includes('does not exist')) {
      console.log('\n💡 SOLUTION: Run database migration on your production server:');
      console.log('   ssh into your server');
      console.log('   cd /var/www/myultracoach');
      console.log('   npx prisma migrate deploy');
      console.log('   npx prisma generate');
    }
  }
}

testAuthFlow().catch(console.error);
