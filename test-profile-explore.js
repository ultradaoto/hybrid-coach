#!/usr/bin/env node

import SkoolDMService from './src/services/skoolDMService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function exploreProfile() {
  console.log('🔍 Exploring My Ultra Coach profile for DM options...');
  
  if (!process.env.SKOOL_EMAIL || !process.env.SKOOL_PASSWORD) {
    console.error('❌ Missing SKOOL_EMAIL or SKOOL_PASSWORD environment variables');
    process.exit(1);
  }
  
  const dmService = new SkoolDMService();
  
  try {
    // Initialize the DM service
    console.log('🚀 Initializing browser and logging in...');
    const initialized = await dmService.initialize();
    
    if (!initialized) {
      throw new Error('Failed to initialize DM service');
    }
    
    console.log('✅ Successfully logged in!');
    
    // Navigate to your profile
    console.log('👤 Navigating to your profile...');
    await dmService.browserService.page.goto('https://www.skool.com/@my-ultra-coach-6588', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await dmService.browserService.page.waitForTimeout(3000);
    
    const currentUrl = dmService.browserService.page.url();
    console.log(`🌐 Current URL: ${currentUrl}`);
    
    // Get page title
    const pageTitle = await dmService.browserService.page.title();
    console.log(`📄 Page title: ${pageTitle}`);
    
    // Look for all clickable elements that might be related to messages
    console.log('🔍 Scanning for message-related elements...');
    
    const allLinks = await dmService.browserService.page.evaluate(() => {
      const links = [];
      
      // Get all links
      const aElements = document.querySelectorAll('a');
      aElements.forEach((a, index) => {
        const href = a.href;
        const text = a.textContent.trim();
        if (text && (text.toLowerCase().includes('message') || 
                     text.toLowerCase().includes('chat') ||
                     text.toLowerCase().includes('dm') ||
                     href.includes('message') ||
                     href.includes('chat'))) {
          links.push({
            type: 'link',
            text: text.substring(0, 50),
            href: href,
            index
          });
        }
      });
      
      // Get all buttons
      const buttons = document.querySelectorAll('button');
      buttons.forEach((button, index) => {
        const text = button.textContent.trim();
        if (text && (text.toLowerCase().includes('message') || 
                     text.toLowerCase().includes('chat') ||
                     text.toLowerCase().includes('dm'))) {
          links.push({
            type: 'button',
            text: text.substring(0, 50),
            href: null,
            index
          });
        }
      });
      
      return links;
    });
    
    if (allLinks.length > 0) {
      console.log(`📋 Found ${allLinks.length} message-related elements:`);
      allLinks.forEach((link, i) => {
        console.log(`  ${i + 1}. [${link.type.toUpperCase()}] "${link.text}" ${link.href ? `-> ${link.href}` : ''}`);
      });
    } else {
      console.log('❌ No obvious message-related elements found');
    }
    
    // Try to find any navigation menu
    console.log('\n🧭 Looking for navigation menu...');
    const navElements = await dmService.browserService.page.evaluate(() => {
      const navs = [];
      const navSelectors = ['nav', '[class*="nav"]', '[class*="menu"]', '[class*="header"]'];
      
      navSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const links = el.querySelectorAll('a');
          links.forEach(link => {
            const text = link.textContent.trim();
            const href = link.href;
            if (text && href) {
              navs.push({
                text: text.substring(0, 30),
                href: href
              });
            }
          });
        });
      });
      
      return navs;
    });
    
    if (navElements.length > 0) {
      console.log(`🧭 Navigation elements found:`);
      navElements.forEach((nav, i) => {
        console.log(`  ${i + 1}. "${nav.text}" -> ${nav.href}`);
      });
    }
    
    // Try the direct messages URL
    console.log('\n📥 Trying direct messages URL...');
    try {
      await dmService.browserService.page.goto('https://www.skool.com/messages', { 
        waitUntil: 'networkidle',
        timeout: 15000 
      });
      
      await dmService.browserService.page.waitForTimeout(3000);
      
      const messagesUrl = dmService.browserService.page.url();
      console.log(`💬 Messages page URL: ${messagesUrl}`);
      
      if (messagesUrl.includes('messages')) {
        console.log('✅ Successfully accessed messages page!');
        
        // Look for conversations
        const conversations = await dmService.browserService.page.$$('[class*="conversation"], [class*="chat"], [data-testid*="conversation"]');
        console.log(`📊 Found ${conversations.length} conversation elements`);
        
        if (conversations.length > 0) {
          console.log('🎉 Ready to monitor conversations!');
        } else {
          console.log('📭 No conversations found - waiting for someone to message you');
        }
      } else {
        console.log('❌ Could not access messages page');
      }
    } catch (error) {
      console.error('❌ Error accessing messages:', error.message);
    }
    
    console.log('\n✅ Profile exploration completed!');
    
  } catch (error) {
    console.error('💥 Exploration failed:', error.message);
    console.error(error.stack);
  } finally {
    await dmService.close();
  }
}

// Run the exploration
exploreProfile()
  .then(() => {
    console.log('🏁 Exploration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
