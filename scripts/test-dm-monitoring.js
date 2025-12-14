#!/usr/bin/env node

import SkoolDMService from './src/services/skoolDMService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testDMMonitoring() {
  console.log('🤖 Testing Skool DM Monitoring System...');
  
  // Check required environment variables
  if (!process.env.SKOOL_EMAIL || !process.env.SKOOL_PASSWORD) {
    console.error('❌ Missing SKOOL_EMAIL or SKOOL_PASSWORD environment variables');
    process.exit(1);
  }
  
  console.log(`📧 Using email: ${process.env.SKOOL_EMAIL}`);
  console.log(`⏱️  Check interval: ${process.env.BOT_CHECK_INTERVAL || 45000}ms`);
  
  const dmService = new SkoolDMService();
  
  try {
    // Initialize the DM service
    console.log('🚀 Initializing DM service...');
    const initialized = await dmService.initialize();
    
    if (!initialized) {
      throw new Error('Failed to initialize DM service');
    }
    
    console.log('✅ DM service initialized successfully!');
    
    // Show current status
    const status = dmService.getStatus();
    console.log('📊 Service Status:', JSON.stringify(status, null, 2));
    
    // Start monitoring
    console.log('🎯 Starting DM monitoring...');
    console.log('💡 The bot will now check for new messages every 45 seconds');
    console.log('💬 Send a test message in your existing Skool chat to see the response!');
    console.log('🛑 Press Ctrl+C to stop monitoring');
    
    await dmService.startMonitoring();
    
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received stop signal, shutting down gracefully...');
      await dmService.close();
      process.exit(0);
    });
    
    // Keep alive
    setInterval(() => {
      const currentStatus = dmService.getStatus();
      console.log(`💓 Bot heartbeat - Monitoring: ${currentStatus.isMonitoring ? '✅' : '❌'}`);
    }, 60000); // Heartbeat every minute
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error(error.stack);
    await dmService.close();
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
console.log('🎬 Starting DM monitoring test...');
testDMMonitoring();
