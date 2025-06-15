#!/usr/bin/env node

import SkoolMonitoringService from './src/services/skoolMonitoringService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function quickTest() {
  console.log('🚀 Quick test of Skool member sync...');
  
  if (!process.env.SKOOL_EMAIL || !process.env.SKOOL_PASSWORD) {
    console.error('❌ Missing SKOOL_EMAIL or SKOOL_PASSWORD environment variables');
    process.exit(1);
  }
  
  const monitoringService = new SkoolMonitoringService();
  
  try {
    // Initialize browser and login
    console.log('🌐 Initializing browser and logging in...');
    const browserInitialized = await monitoringService.browserService.initialize();
    if (!browserInitialized) {
      throw new Error('Failed to initialize browser service');
    }

    const loginSuccess = await monitoringService.browserService.loginToSkool();
    if (!loginSuccess) {
      throw new Error('Failed to login to Skool');
    }
    console.log('✅ Successfully logged in to Skool');
    
    // Test just Ultra sync (5 members)
    console.log('🔄 Testing Ultra Skool sync (5 most recent members)...');
    const ultraResult = await monitoringService.syncCommunity('ultra');
    
    if (ultraResult.success) {
      console.log('✅ Ultra Skool sync completed successfully!');
      console.log(`📊 Ultra members: ${ultraResult.membersFound}`);
      console.log(`🔄 Changes: ${JSON.stringify(ultraResult.changes, null, 2)}`);
    } else {
      console.error('❌ Ultra Skool sync failed:', ultraResult.error);
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  } finally {
    console.log('🔒 Closing browser...');
    await monitoringService.browserService.close();
  }
}

quickTest()
  .then(() => {
    console.log('🏁 Quick test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });