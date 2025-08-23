#!/usr/bin/env node

import SkoolBrowserService from './src/services/skoolBrowserService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSkoolProfile() {
  console.log('🚀 Testing Skool profile navigation...');
  
  // Check required environment variables
  if (!process.env.SKOOL_EMAIL || !process.env.SKOOL_PASSWORD) {
    console.error('❌ Missing SKOOL_EMAIL or SKOOL_PASSWORD environment variables');
    process.exit(1);
  }
  
  console.log(`📧 Using email: ${process.env.SKOOL_EMAIL}`);
  
  const browserService = new SkoolBrowserService();
  
  try {
    // Initialize browser service
    console.log('🌐 Initializing browser...');
    const browserInitialized = await browserService.initialize();
    if (!browserInitialized) {
      throw new Error('Failed to initialize browser service');
    }
    console.log('✅ Browser initialized');

    // Login to Skool
    console.log('🔑 Logging in to Skool...');
    const loginSuccess = await browserService.loginToSkool();
    if (!loginSuccess) {
      throw new Error('Failed to login to Skool');
    }
    console.log('✅ Successfully logged in to Skool');
    
    // Navigate to your profile
    console.log('👤 Navigating to My Ultra Coach profile...');
    await browserService.page.goto('https://www.skool.com/@my-ultra-coach-6588', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait a moment for page to load
    await browserService.page.waitForTimeout(3000);
    
    // Check if we can see the profile
    const currentUrl = browserService.page.url();
    console.log(`🌐 Current URL: ${currentUrl}`);
    
    // Get page title
    const pageTitle = await browserService.page.title();
    console.log(`📄 Page title: ${pageTitle}`);
    
    // Look for profile indicators
    try {
      // Check for profile name or username
      const profileName = await browserService.page.textContent('h1, [class*="ProfileName"], [class*="UserName"]').catch(() => null);
      if (profileName) {
        console.log(`✅ Profile name found: ${profileName}`);
      }
      
      // Check for profile description or bio
      const profileBio = await browserService.page.textContent('[class*="bio"], [class*="description"], p').catch(() => null);
      if (profileBio) {
        console.log(`📝 Profile bio: ${profileBio.substring(0, 100)}...`);
      }
      
      // Check if we can see the profile photo
      const profilePhoto = await browserService.page.$('img[class*="avatar"], img[class*="profile"]');
      if (profilePhoto) {
        console.log('🖼️  Profile photo detected');
      }
      
    } catch (error) {
      console.warn('⚠️  Could not extract all profile details:', error.message);
    }
    
    // Check if we have access to DMs/messages
    console.log('💬 Looking for message/DM functionality...');
    
    // Look for message button or DM link
    const messageButton = await browserService.page.$('button:has-text("Message"), a:has-text("Message"), [class*="message"], [class*="Message"]');
    if (messageButton) {
      console.log('✅ Message button found - DM functionality available');
    } else {
      console.log('⚠️  No obvious message button found');
    }
    
    // Try to navigate to messages/inbox
    console.log('📥 Attempting to navigate to messages inbox...');
    try {
      await browserService.page.goto('https://www.skool.com/messages', { 
        waitUntil: 'networkidle',
        timeout: 15000 
      });
      
      const messagesUrl = browserService.page.url();
      console.log(`💬 Messages URL: ${messagesUrl}`);
      
      if (messagesUrl.includes('/messages')) {
        console.log('✅ Successfully accessed messages inbox!');
        
        // Look for existing conversations
        const conversations = await browserService.page.$$('[class*="conversation"], [class*="chat"], [class*="message-item"]');
        console.log(`📊 Found ${conversations.length} conversation elements`);
        
        if (conversations.length > 0) {
          console.log('🎉 Existing conversations detected - ready for DM monitoring!');
        }
      } else {
        console.log('⚠️  Could not access messages inbox');
      }
      
    } catch (error) {
      console.warn('⚠️  Error accessing messages:', error.message);
    }
    
    console.log('\n✅ Profile test completed successfully!');
    console.log('🤖 Ready to implement DM monitoring system');
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Always close the browser
    console.log('🔒 Closing browser...');
    await browserService.close();
  }
}

// Run the test
testSkoolProfile()
  .then(() => {
    console.log('🏁 Profile test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
