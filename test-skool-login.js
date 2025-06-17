#!/usr/bin/env node

import SkoolMonitoringService from './src/services/skoolMonitoringService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSkoolLogin() {
  console.log('🚀 Testing Skool login and Ultra member scraping...');
  
  // Check required environment variables
  if (!process.env.SKOOL_EMAIL || !process.env.SKOOL_PASSWORD) {
    console.error('❌ Missing SKOOL_EMAIL or SKOOL_PASSWORD environment variables');
    process.exit(1);
  }
  
  console.log(`📧 Using email: ${process.env.SKOOL_EMAIL}`);
  
  const monitoringService = new SkoolMonitoringService();
  
  try {
    // Initialize browser service first
    console.log('🌐 Initializing browser...');
    const browserInitialized = await monitoringService.browserService.initialize();
    if (!browserInitialized) {
      throw new Error('Failed to initialize browser service');
    }
    console.log('✅ Browser initialized');

    // Login to Skool
    console.log('🔑 Logging in to Skool...');
    const loginSuccess = await monitoringService.browserService.loginToSkool();
    if (!loginSuccess) {
      throw new Error('Failed to login to Skool');
    }
    console.log('✅ Successfully logged in to Skool');
    
    // Test the sync for both communities
    console.log('🔄 Starting Ultra Skool sync test...');
    const ultraResult = await monitoringService.syncCommunity('ultra');
    
    if (ultraResult.success) {
      console.log('✅ Ultra Skool sync completed successfully!');
      console.log(`📊 Ultra members found: ${ultraResult.membersFound}`);
      console.log(`🔄 Ultra changes: ${JSON.stringify(ultraResult.changes, null, 2)}`);
    } else {
      console.error('❌ Ultra Skool sync failed:', ultraResult.error);
    }

    console.log('\n🔄 Starting Vagus Skool sync test...');
    const vagusResult = await monitoringService.syncCommunity('vagus');
    
    if (vagusResult.success) {
      console.log('✅ Vagus Skool sync completed successfully!');
      console.log(`📊 Vagus members found: ${vagusResult.membersFound}`);
      console.log(`🔄 Vagus changes: ${JSON.stringify(vagusResult.changes, null, 2)}`);
    } else {
      console.error('❌ Vagus Skool sync failed:', vagusResult.error);
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Always close the browser
    console.log('🔒 Closing browser...');
    await monitoringService.browserService.close();
  }
}

// Run the test
testSkoolLogin()
  .then(() => {
    console.log('🏁 Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });