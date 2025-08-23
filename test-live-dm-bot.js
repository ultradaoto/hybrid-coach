#!/usr/bin/env node

import SkoolBrowserService from './src/services/skoolBrowserService.js';
import authService from './src/services/authService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Live DM Bot Test - Monitors mail icon and responds to messages
 * This script will sit on your profile page and monitor for unread messages
 * When detected, it will respond with a MyUltraCoach link
 */

class LiveDMBot {
  constructor() {
    this.browserService = new SkoolBrowserService();
    this.isMonitoring = false;
    this.checkInterval = null;
    this.monitoringInterval = 15000; // 15 seconds as requested
    this.lastMessageSentAt = null; // Track when we last sent a message
    this.messagesSentToday = new Set(); // Track messages sent to avoid duplicates
  }

  async initialize() {
    console.log('🤖 Initializing Live DM Bot...');
    
    if (!process.env.SKOOL_EMAIL || !process.env.SKOOL_PASSWORD) {
      throw new Error('Missing SKOOL_EMAIL or SKOOL_PASSWORD environment variables');
    }

    // Initialize browser (visible so you can watch)
    const browserInitialized = await this.browserService.initialize();
    if (!browserInitialized) {
      throw new Error('Failed to initialize browser service');
    }

    // Login to Skool - go directly to login page
    console.log('🔑 Logging into Skool...');
    await this.performLogin();

    // Navigate to your profile page
    console.log('👤 Navigating to My Ultra Coach profile...');
    await this.browserService.page.goto('https://www.skool.com/@my-ultra-coach-6588', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    await this.browserService.page.waitForTimeout(3000);
    console.log('✅ Ready on profile page - Bot initialized successfully!');
    return true;
  }

  async ensureLoggedIn() {
    try {
      // First, try to go to the main page to check login status
      console.log('🌐 Checking login status...');
      await this.browserService.page.goto('https://www.skool.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      await this.browserService.page.waitForTimeout(3000);

      // Check if we're already logged in by looking for user indicators
      const loggedInIndicators = [
        '[class*="avatar"]',
        '[class*="profile"]', 
        'a[href*="@"]',
        'svg' // Mail icon
      ];

      let isLoggedIn = false;
      for (const selector of loggedInIndicators) {
        const element = await this.browserService.page.$(selector);
        if (element) {
          console.log(`✅ Already logged in (found: ${selector})`);
          isLoggedIn = true;
          break;
        }
      }

      // Check if we're on login page or need to login
      const currentUrl = this.browserService.page.url();
      if (currentUrl.includes('/login') || !isLoggedIn) {
        console.log('🔐 Need to login - navigating to login page...');
        await this.performLogin();
      } else {
        console.log('✅ Already logged in successfully');
      }

    } catch (error) {
      console.error(`❌ Login check failed: ${error.message}`);
      // Force login attempt
      await this.performLogin();
    }
  }

  async performLogin() {
    try {
      console.log('📋 Going directly to Skool login page...');
      
      // Navigate directly to login page
      await this.browserService.page.goto('https://www.skool.com/login', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      console.log('📄 Login page loaded, filling credentials...');
      await this.browserService.page.waitForTimeout(2000);

      // Wait for and fill email field
      console.log('📧 Entering email...');
      await this.browserService.page.waitForSelector('#email', { timeout: 10000 });
      
      await this.browserService.page.click('#email');
      await this.browserService.page.waitForTimeout(300);
      
      // Clear field and type email
      await this.browserService.page.keyboard.down('Control');
      await this.browserService.page.keyboard.press('a');
      await this.browserService.page.keyboard.up('Control');
      await this.browserService.page.keyboard.press('Delete');
      
      await this.browserService.page.type('#email', process.env.SKOOL_EMAIL, { delay: 80 });
      console.log('✅ Email entered');

      // Wait for and fill password field  
      console.log('🔒 Entering password...');
      await this.browserService.page.waitForSelector('#password', { timeout: 10000 });
      
      await this.browserService.page.click('#password');
      await this.browserService.page.waitForTimeout(300);
      
      // Clear field and type password
      await this.browserService.page.keyboard.down('Control');
      await this.browserService.page.keyboard.press('a');
      await this.browserService.page.keyboard.up('Control');
      await this.browserService.page.keyboard.press('Delete');
      
      await this.browserService.page.type('#password', process.env.SKOOL_PASSWORD, { delay: 80 });
      console.log('✅ Password entered');

      // Click login button and wait for navigation
      console.log('🚀 Submitting login form...');
      const loginButton = await this.browserService.page.$('button[type="submit"]');
      if (!loginButton) {
        throw new Error('Login submit button not found');
      }
      
      await loginButton.click();
      console.log('⏳ Waiting for login redirect...');
      
      // Wait longer for navigation
      await this.browserService.page.waitForTimeout(8000);
      
      // Check final URL
      const finalUrl = this.browserService.page.url();
      console.log(`🌐 Final URL after login: ${finalUrl}`);
      
      // Verify we're NOT still on login page
      if (finalUrl.includes('/login')) {
        // Check for error messages
        const errorSelectors = ['.error', '[class*="error"]', '[class*="Error"]', '.alert', '[role="alert"]'];
        let errorText = '';
        
        for (const selector of errorSelectors) {
          const errorElement = await this.browserService.page.$(selector);
          if (errorElement) {
            errorText = await errorElement.textContent();
            break;
          }
        }
        
        if (errorText) {
          throw new Error(`Login failed: ${errorText}`);
        } else {
          throw new Error('Login failed - still on login page with no error message');
        }
      }

      // Now verify we're actually logged in by checking for authenticated elements
      console.log('🔍 Verifying login success...');
      
      // Look for elements that only appear when logged in
      const loggedInSelectors = [
        'svg', // Mail icon
        '[class*="avatar"]', // User avatar
        '[class*="profile"]', // Profile elements
        'a[href*="@"]', // Profile links
        '[class*="dropdown"]' // User dropdown
      ];

      let loginVerified = false;
      for (const selector of loggedInSelectors) {
        const element = await this.browserService.page.$(selector);
        if (element) {
          console.log(`✅ Login verified - found authenticated element: ${selector}`);
          loginVerified = true;
          break;
        }
      }

      if (!loginVerified) {
        throw new Error('Login may have failed - no authenticated user elements found');
      }

      console.log('🎉 Login completed successfully!');

    } catch (error) {
      console.error(`❌ Login process failed: ${error.message}`);
      
      // Take screenshot for debugging
      try {
        await this.browserService.page.screenshot({ 
          path: 'login-error.png',
          fullPage: true 
        });
        console.log('📸 Full page screenshot saved as login-error.png');
      } catch (screenshotError) {
        console.log('⚠️ Could not save screenshot');
      }
      
      throw error;
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Monitoring is already running');
      return;
    }

    console.log('🎯 Starting live DM monitoring...');
    console.log('📧 Checking mail icon every 15 seconds for unread messages');
    console.log('🔴 When unread badge appears, bot will respond automatically');
    console.log('👀 You can watch the browser - send a test message now!');
    console.log('🛑 Press Ctrl+C to stop monitoring\n');

    this.isMonitoring = true;

    // Initial check
    await this.checkMailIcon();

    // Set up interval for continuous monitoring
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkMailIcon();
      } catch (error) {
        console.error(`❌ Error during monitoring: ${error.message}`);
      }
    }, this.monitoringInterval);

    console.log('✅ Live monitoring started!');
  }

  async checkMailIcon() {
    try {
      const timestamp = new Date().toLocaleTimeString();
      
      // Check if we recently sent a message (avoid responding to our own messages)
      if (this.lastMessageSentAt && (Date.now() - this.lastMessageSentAt) < 60000) {
        console.log(`📧 [${timestamp}] Skipping check - recently sent message (${Math.round((Date.now() - this.lastMessageSentAt) / 1000)}s ago)`);
        return;
      }
      
      console.log(`🔍 [${timestamp}] Checking mail icon status...`);

      // Method 1: Look for the specific unread badge container (mail button with notifications)
      const unreadBadgeContainer = await this.browserService.page.$('.styled__ChatNotificationsIconButton-sc-14ipnak-0');
      
      // Method 2: Look for red badge path elements (more specific)
      const redBadgePaths = await this.browserService.page.$$('path');
      
      // Method 3: Advanced detection - look for red/notification styling
      const hasVisualUnreadIndicator = await this.browserService.page.evaluate(() => {
        // Look for elements with red background colors near mail icons
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (let element of allElements) {
          const computedStyle = window.getComputedStyle(element);
          const bgColor = computedStyle.backgroundColor;
          const color = computedStyle.color;
          
          // Check for red backgrounds (common notification colors)
          const redPatterns = [
            'rgb(220, 38, 38)', // Tailwind red-600
            'rgb(239, 68, 68)', // Tailwind red-500
            'rgb(248, 113, 113)', // Tailwind red-400
            'rgb(255, 0, 0)', // Pure red
            'rgb(204, 0, 0)', // Dark red
            'rgb(255, 51, 51)' // Bright red
          ];
          
          const hasRedBackground = redPatterns.some(pattern => bgColor.includes(pattern));
          
          if (hasRedBackground) {
            // Check if this red element is near an SVG (mail icon)
            const nearbyElements = [];
            let parent = element.parentElement;
            let child = element;
            
            // Check parent and siblings for SVG elements
            for (let i = 0; i < 3 && parent; i++) {
              const svgs = parent.querySelectorAll('svg');
              if (svgs.length > 0) {
                console.log('🔴 Found red element near SVG (mail icon)!');
                return { hasUnread: true, method: 'red-background-near-svg', element: element.className };
              }
              child = parent;
              parent = parent.parentElement;
            }
          }
        }
        
        // Also check for any elements containing numbers (like "1", "2", etc.)
        const numberElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent?.trim();
          return text && /^[0-9]+$/.test(text) && text.length <= 2;
        });
        
        for (let numEl of numberElements) {
          const parent = numEl.closest('svg, [class*="mail"], [class*="message"], [class*="notification"]');
          if (parent) {
            console.log('🔢 Found number badge near mail-related element!');
            return { hasUnread: true, method: 'number-badge', number: numEl.textContent };
          }
        }
        
        return { hasUnread: false };
      });

      // Method 4: Count path elements (baseline vs unread comparison)
      const pathCount = redBadgePaths.length;
      console.log(`📊 Current path count: ${pathCount} (baseline: ~2, unread: ~3+)`);
      
      // Determine if we have unread messages using multiple indicators
      let hasUnread = false;
      let detectionMethod = '';
      
      if (unreadBadgeContainer) {
        hasUnread = true;
        detectionMethod = 'unread-badge-container';
      } else if (hasVisualUnreadIndicator.hasUnread) {
        hasUnread = true;
        detectionMethod = hasVisualUnreadIndicator.method;
      } else if (pathCount > 3) {
        hasUnread = true;
        detectionMethod = 'path-count-increase';
      }
      
      if (hasUnread) {
        console.log(`🔴 UNREAD MESSAGE DETECTED via ${detectionMethod}! Starting response sequence...`);
        await this.handleUnreadMessage();
        return;
      }

      console.log(`📧 [${timestamp}] No unread messages detected - continuing to monitor...`);

    } catch (error) {
      console.error(`❌ Error checking mail icon: ${error.message}`);
    }
  }

  async handleUnreadMessage() {
    try {
      console.log('🚀 UNREAD MESSAGE WORKFLOW STARTED');
      
      // Step 1: Click mail icon to open popup
      console.log('📧 Step 1: Opening mail popup...');
      await this.openMailPopup();

      // Step 2: Find and open the latest unread conversation
      console.log('💬 Step 2: Finding latest unread conversation...');
      await this.openLatestConversation();

      // Step 3: Type and send response
      console.log('📝 Step 3: Sending response message...');
      await this.sendResponse();

      // Step 4: Close chat window
      console.log('❌ Step 4: Closing chat window...');
      await this.closeChatWindow();

      console.log('✅ RESPONSE SEQUENCE COMPLETED! Resuming monitoring...\n');

    } catch (error) {
      console.error(`❌ Error handling unread message: ${error.message}`);
      
      // Try to close any open windows and return to monitoring
      try {
        await this.browserService.page.keyboard.press('Escape');
        await this.browserService.page.waitForTimeout(1000);
        console.log('🔄 Attempted recovery - resuming monitoring...');
      } catch (recoveryError) {
        console.error(`❌ Recovery failed: ${recoveryError.message}`);
      }
    }
  }

  async openMailPopup() {
    // Click the mail icon BUTTON (not the SVG inside it) based on detailed analysis
    const mailButtonSelectors = [
      '.styled__ChatNotificationsIconButton-sc-14ipnak-0', // Specific mail button class
      'button.styled__ButtonWrapper-sc-1crx28g-1.GvgtH', // Button with specific classes
      'button:has(svg[viewBox="0 0 40 34"])', // Button containing the mail SVG
      'button:has(.styled__IconWrapper-sc-zxv7pb-0)', // Button containing icon wrapper
      'svg' // Fallback to SVG if button selectors fail
    ];

    let mailClicked = false;
    for (const selector of mailButtonSelectors) {
      try {
        const mailElement = await this.browserService.page.$(selector);
        if (mailElement) {
          console.log(`📧 Clicking mail element with selector: ${selector}`);
          
          // Ensure element is visible and clickable
          const isVisible = await mailElement.isVisible();
          if (isVisible) {
            await mailElement.click();
            await this.browserService.page.waitForTimeout(2000);
            mailClicked = true;
            break;
          } else {
            console.log(`⚠️ Mail element not visible: ${selector}`);
          }
        }
      } catch (error) {
        console.log(`⚠️ Failed to click mail element ${selector}: ${error.message}`);
      }
    }

    if (!mailClicked) {
      throw new Error('Could not find or click any mail icon element');
    }

    // Verify popup opened using discovered selector
    const popup = await this.browserService.page.$('.styled__DropdownContent-sc-13jov82-1');
    if (!popup) {
      throw new Error('Mail popup did not open');
    }

    console.log('✅ Mail popup opened successfully');
  }

  async openLatestConversation() {
    // Look for unread conversations using discovered selector
    const unreadConversations = await this.browserService.page.$$('.styled__ReadButton-sc-5xhq84-1, .styled__MessageContent-sc-5xhq84-9');
    
    if (unreadConversations.length === 0) {
      throw new Error('No conversations found in popup');
    }

    console.log(`📊 Found ${unreadConversations.length} conversation(s)`);
    
    // Click the first (latest) conversation
    await unreadConversations[0].click();
    await this.browserService.page.waitForTimeout(3000);

    console.log('✅ Opened latest conversation');
  }

  async sendResponse() {
    // Find message input using discovered selector
    const messageInput = await this.browserService.page.$('.styled__MultiLineInput-sc-1saiqqb-2');
    if (!messageInput) {
      throw new Error('Could not find message input field');
    }

    // Clear any existing text
    await messageInput.click();
    await this.browserService.page.waitForTimeout(500);
    
    await this.browserService.page.keyboard.down('Control');
    await this.browserService.page.keyboard.press('a');
    await this.browserService.page.keyboard.up('Control');
    await this.browserService.page.keyboard.press('Delete');

    // Generate unique auth code for this user
    let responseMessage;
    try {
      // Extract user info from the current conversation
      const userInfo = await this.extractUserInfoFromConversation();
      
      // Generate auth code
      const authResult = await authService.generateAuthCode(userInfo.skoolUserId, userInfo.skoolUsername);
      const loginUrl = `https://myultra.coach/login?code=${authResult.code}`;
      
      responseMessage = `I will have your link shortly. ${loginUrl}`;
      
      console.log(`🔑 Generated unique code for ${userInfo.skoolUsername}: ${authResult.code}`);
      console.log(`🔗 Login URL: ${loginUrl}`);
      
    } catch (error) {
      console.error('❌ Error generating auth code:', error);
      // Fallback to generic message
      responseMessage = "I will have your link shortly. Please DM me again with 'ACCESS' if you don't receive it.";
    }
    
    console.log('⌨️ Typing response message...');
    await messageInput.type(responseMessage, { delay: 100 });
    await this.browserService.page.waitForTimeout(1000);

    // Send message using Enter key
    console.log('📤 Sending message with Enter key...');
    await this.browserService.page.keyboard.press('Enter');
    await this.browserService.page.waitForTimeout(2000);

    // Mark that we just sent a message to avoid immediate re-triggering
    this.lastMessageSentAt = Date.now();
    console.log(`📝 Marked message sent at: ${new Date().toLocaleTimeString()}`);

    // Verify message was sent (input should be cleared)
    const inputValue = await messageInput.inputValue().catch(() => '');
    if (inputValue === '' || inputValue.length === 0) {
      console.log('✅ Message sent successfully!');
    } else {
      console.log('⚠️ Message may not have sent - input still has content');
    }
  }

  async closeChatWindow() {
    console.log('❌ Attempting to close chat window...');
    
    // Method 1: Handle modal dialog close (detected from error logs)
    const modalCloseSelectors = [
      '.styled__BaseModalWrapper-sc-1j2ymu8-0 button[aria-label*="close" i]', // Modal close button
      '.styled__BaseModalWrapper-sc-1j2ymu8-0 button:has-text("×")', // Modal × button
      '.skool-ui-base-modal button:has-text("×")', // Base modal × button
      '.styled__ModalBackground-sc-1j2ymu8-1', // Click modal background to close
      '[class*="Modal"] button[class*="close"]', // Any modal close button
    ];

    console.log('🔍 Looking for modal close buttons...');
    for (const selector of modalCloseSelectors) {
      try {
        const closeElement = await this.browserService.page.$(selector);
        if (closeElement) {
          console.log(`📍 Found modal close element: ${selector}`);
          const isVisible = await closeElement.isVisible();
          
          if (isVisible) {
            console.log('🖱️ Clicking modal close element...');
            await closeElement.click();
            await this.browserService.page.waitForTimeout(2000);
            
            // Check if modal is closed
            const modal = await this.browserService.page.$('.styled__BaseModalWrapper-sc-1j2ymu8-0');
            const modalVisible = modal ? await modal.isVisible() : false;
            
            if (!modalVisible) {
              console.log('✅ Successfully closed modal dialog');
              return;
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Modal close attempt failed: ${error.message}`);
      }
    }
    
    // Method 2: Look for dropdown close buttons (fallback)
    const closeButtonSelectors = [
      'button[aria-label*="close" i]', // Button with close aria-label
      'button:has-text("×")', // Button with × symbol
      'button:has-text("✕")', // Button with ✕ symbol
      'button:has-text("Close")', // Button with "Close" text
      '[role="button"]:has-text("×")', // Any clickable element with ×
      '.styled__DropdownContent-sc-13jov82-1 button:last-child', // Last button in dropdown
      '.styled__DropdownContent-sc-13jov82-1 button[class*="close"]', // Close button in dropdown
      'button[class*="close"]', // Any button with "close" in class name
      'button svg path[d*="M"]', // Button with SVG path (often close icons)
      '.styled__ButtonWrapper-sc-1crx28g-1:has(svg)', // Button wrapper with SVG
    ];

    for (const selector of closeButtonSelectors) {
      try {
        console.log(`🔍 Trying close selector: ${selector}`);
        const closeButton = await this.browserService.page.$(selector);
        
        if (closeButton) {
          // Check if button is visible and clickable
          const isVisible = await closeButton.isVisible();
          const boundingBox = await closeButton.boundingBox();
          
          if (isVisible && boundingBox) {
            console.log(`📍 Found visible close button at x=${Math.round(boundingBox.x)}, y=${Math.round(boundingBox.y)}`);
            await closeButton.click();
            await this.browserService.page.waitForTimeout(1500);
            
            // Verify popup is closed by checking if it's still visible
            const popup = await this.browserService.page.$('.styled__DropdownContent-sc-13jov82-1');
            const popupVisible = popup ? await popup.isVisible() : false;
            
            if (!popupVisible) {
              console.log('✅ Successfully closed chat window');
              return;
            } else {
              console.log('⚠️ Popup still visible after close attempt');
            }
          } else {
            console.log(`⚠️ Close button not visible or clickable: ${selector}`);
          }
        }
      } catch (error) {
        console.log(`⚠️ Failed to use close selector ${selector}: ${error.message}`);
      }
    }

    // Method 2: Try clicking outside the popup to close it
    console.log('🖱️ Trying to click outside popup to close...');
    try {
      await this.browserService.page.click('body', { position: { x: 100, y: 100 } });
      await this.browserService.page.waitForTimeout(1000);
      
      const popup = await this.browserService.page.$('.styled__DropdownContent-sc-13jov82-1');
      const popupVisible = popup ? await popup.isVisible() : false;
      
      if (!popupVisible) {
        console.log('✅ Closed chat by clicking outside');
        return;
      }
    } catch (error) {
      console.log(`⚠️ Click outside failed: ${error.message}`);
    }

    // Method 3: Try escape key (works with most modals)
    console.log('⌨️ Trying Escape key to close modal...');
    try {
      // Press escape multiple times to ensure it works
      await this.browserService.page.keyboard.press('Escape');
      await this.browserService.page.waitForTimeout(500);
      await this.browserService.page.keyboard.press('Escape');
      await this.browserService.page.waitForTimeout(1500);
      
      // Check if modal is closed
      const modal = await this.browserService.page.$('.styled__BaseModalWrapper-sc-1j2ymu8-0');
      const modalVisible = modal ? await modal.isVisible() : false;
      
      // Also check dropdown popup
      const popup = await this.browserService.page.$('.styled__DropdownContent-sc-13jov82-1');
      const popupVisible = popup ? await popup.isVisible() : false;
      
      if (!modalVisible && !popupVisible) {
        console.log('✅ Closed chat using Escape key');
        return;
      }
    } catch (error) {
      console.log(`⚠️ Escape key failed: ${error.message}`);
    }

    // Method 4: Force close by navigating back to profile
    console.log('🔄 Force closing by refreshing profile page...');
    try {
      await this.browserService.page.goto('https://www.skool.com/@my-ultra-coach-6588', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      await this.browserService.page.waitForTimeout(2000);
      console.log('✅ Force closed by navigating back to profile');
    } catch (error) {
      console.log(`⚠️ Force close failed: ${error.message}`);
    }
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Monitoring is not running');
      return;
    }

    console.log('🛑 Stopping live monitoring...');
    this.isMonitoring = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.log('✅ Monitoring stopped');
  }

  async close() {
    this.stopMonitoring();
    await this.browserService.close();
    console.log('🔒 Bot closed');
  }

  /**
   * Extract user information from the current conversation
   * @returns {Promise<{skoolUserId: string, skoolUsername: string}>}
   */
  async extractUserInfoFromConversation() {
    try {
      // Look for username elements in the conversation
      const usernameSelectors = [
        '.styled__Username-sc-1c7orh8-0', // From discovery sessions
        '[data-testid="username"]',
        '.username',
        '.author-name',
        '.message-author'
      ];

      let skoolUsername = null;
      
      for (const selector of usernameSelectors) {
        try {
          const element = await this.browserService.page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text && text.trim() && text !== 'My Ultra Coach') {
              skoolUsername = text.trim();
              console.log(`👤 Found username: ${skoolUsername}`);
              break;
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // Try to get username from conversation header or message area
      if (!skoolUsername) {
        try {
          // Look for any text that looks like a username (not "My Ultra Coach")
          const messageElements = await this.browserService.page.$$('.styled__ChatMessageHeader-sc-cfaah3-12, .message-header, .conversation-header');
          
          for (const element of messageElements) {
            const text = await element.textContent();
            if (text && text.includes(' ') && !text.includes('My Ultra Coach')) {
              // Extract the first word as potential username
              const words = text.trim().split(' ');
              if (words[0] && words[0].length > 2) {
                skoolUsername = words[0];
                console.log(`👤 Extracted username from header: ${skoolUsername}`);
                break;
              }
            }
          }
        } catch (e) {
          console.log('❌ Could not extract username from conversation elements');
        }
      }

      // Fallback: try to get from URL or page context
      if (!skoolUsername) {
        try {
          const pageTitle = await this.browserService.page.title();
          const urlMatch = pageTitle.match(/Chat with (.+)/i);
          if (urlMatch) {
            skoolUsername = urlMatch[1].trim();
            console.log(`👤 Extracted username from page title: ${skoolUsername}`);
          }
        } catch (e) {
          console.log('❌ Could not extract username from page title');
        }
      }

      // If we still don't have a username, use a generic identifier
      if (!skoolUsername) {
        skoolUsername = `User_${Date.now()}`;
        console.log(`👤 Using fallback username: ${skoolUsername}`);
      }

      // Generate a consistent user ID from the username
      // In a real implementation, you'd want to get this from Skool's API or user profile
      const skoolUserId = `skool_${skoolUsername.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${this.generateUserIdSuffix(skoolUsername)}`;

      return {
        skoolUserId,
        skoolUsername
      };

    } catch (error) {
      console.error('❌ Error extracting user info:', error);
      
      // Return fallback values
      const fallbackId = `fallback_${Date.now()}`;
      return {
        skoolUserId: fallbackId,
        skoolUsername: 'Unknown User'
      };
    }
  }

  /**
   * Generate a consistent suffix for user ID based on username
   * @param {string} username - The username to generate suffix for
   * @returns {string} Consistent suffix
   */
  generateUserIdSuffix(username) {
    // Create a simple hash-like suffix from username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      const char = username.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 6);
  }
}

// Main execution
async function main() {
  const bot = new LiveDMBot();
  
  try {
    await bot.initialize();
    await bot.startMonitoring();

    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received stop signal, shutting down gracefully...');
      await bot.close();
      process.exit(0);
    });

    // Keep alive indefinitely
    await new Promise(() => {});

  } catch (error) {
    console.error('💥 Bot failed:', error.message);
    await bot.close();
    process.exit(1);
  }
}

// Run the bot
console.log('🎬 Starting Live DM Bot Test...');
main().catch(console.error);
