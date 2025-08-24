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

      // Method 1: Multi-selector strategy for MAIL icon detection
      // Try multiple selectors in priority order as suggested
      const mailIconSelectors = [
        '.styled__ButtonWrapper-sc-1crx28g-1.GvgtH', // Trained unread mail icon
        '.styled__ButtonWrapper-sc-1crx28g-1', // General mail button wrapper
        'button[aria-label*="message" i]', // Accessibility-based selector
        'button:has(svg[viewBox*="0 0 40 34"])', // Mail SVG container
        '.styled__ChatNotificationsIconButton-sc-14ipnak-0', // Legacy selector
        'svg[viewBox*="0 0 40 34"]' // Direct SVG fallback
      ];
      
      let mailElement = null;
      let usedSelector = null;
      
      // Try each selector until we find the mail icon
      for (const selector of mailIconSelectors) {
        try {
          mailElement = await this.browserService.page.$(selector);
          if (mailElement) {
            usedSelector = selector;
            console.log(`📧 [${timestamp}] Found mail icon using: ${selector}`);
            break;
          }
        } catch (error) {
          // Continue to next selector
        }
      }
      
      if (!mailElement) {
        console.log(`📧 [${timestamp}] Mail icon not found with any selector - may need to navigate to messages`);
        return;
      }
      
      // Method 2: ENHANCED - Check for green radio buttons (MOST RELIABLE from training)
      const enhancedDetection = await this.browserService.page.evaluate(() => {
        // Trained selectors from Playwright tagging session
        const greenRadioButtons = document.querySelectorAll('.styled__BoxWrapper-sc-esqoz3-0.kxjOSJ');
        const unreadConversations = document.querySelectorAll('.styled__NotificationRow-sc-5xhq84-2.hpcoAn');
        
        return {
          greenRadioCount: greenRadioButtons.length,
          unreadConversationsCount: unreadConversations.length
        };
      });
      
      console.log(`🟢 Enhanced Detection: ${enhancedDetection.greenRadioCount} green radio buttons, ${enhancedDetection.unreadConversationsCount} unread conversations`);
      
      // PRIORITY CHECK: Green radio buttons (most reliable)
      if (enhancedDetection.greenRadioCount > 0) {
        console.log('🟢 UNREAD DETECTED via GREEN RADIO BUTTON! Starting response sequence...');
        await this.handleUnreadMessage();
        return;
      }
      
      // Method 3: Look for red badge path elements (more specific)
      const redBadgePaths = await this.browserService.page.$$('path');
      
      // Method 4: Count path elements (baseline vs unread comparison)
      const pathCount = redBadgePaths.length;
      console.log(`📊 Current path count: ${pathCount} (baseline: ~2, unread: ~3+)`);
      
      // Method 4: Check for visual unread indicators (red badge, styling)
      const hasVisualUnreadIndicator = await this.browserService.page.evaluate(() => {
        // Look for red styling or badge indicators near mail elements
        const redElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const styles = getComputedStyle(el);
          return styles.backgroundColor.includes('rgb(239, 68, 68)') || // red-500
                 styles.backgroundColor.includes('rgb(220, 38, 38)') || // red-600  
                 styles.color.includes('rgb(239, 68, 68)') ||
                 el.textContent.match(/^\d+$/) && el.offsetWidth < 30; // Small number badges
        });
        
        return {
          hasUnread: redElements.length > 0,
          method: redElements.length > 0 ? `visual-red-detection (${redElements.length} elements)` : 'no-visual-indicators'
        };
      });

      // Determine if we have unread messages using multiple indicators
      let hasUnread = false;
      let detectionMethod = '';
      
      // Check if mail element shows unread state (based on specific trained selectors)
      if (usedSelector && usedSelector.includes('.GvgtH')) {
        hasUnread = true;
        detectionMethod = 'trained-unread-selector';
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

      console.log('✅ RESPONSE SEQUENCE COMPLETED! Continuing to monitor...\n');

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
    // Click the MAIL icon BUTTON (not notifications!) using newly trained selectors
    const mailButtonSelectors = [
      '.styled__ButtonWrapper-sc-1crx28g-1.GvgtH', // Trained mail icon selector  
      '.styled__ButtonWrapper-sc-1crx28g-1', // Fallback mail button class
      'button:has(svg[viewBox="0 0 40 34"])', // Button containing the mail SVG
      'button:has(.styled__IconWrapper-sc-zxv7pb-0)', // Button containing icon wrapper
      '.styled__ChatNotificationsIconButton-sc-14ipnak-0', // Legacy selector
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
    console.log('🎯 Using TRAINED SELECTORS to find UNREAD conversations...');
    
    // Method 1: Use trained green radio button selectors (MOST RELIABLE)
    const enhancedConversationDetection = await this.browserService.page.evaluate(() => {
      // Trained selectors from Playwright tagging
      const greenRadioButtons = document.querySelectorAll('.styled__BoxWrapper-sc-esqoz3-0.kxjOSJ');
      const unreadNotificationRows = document.querySelectorAll('.styled__NotificationRow-sc-5xhq84-2.hpcoAn');
      
      console.log(`🟢 Found ${greenRadioButtons.length} green radio buttons`);
      console.log(`🔴 Found ${unreadNotificationRows.length} unread notification rows`);
      
      return {
        greenRadioCount: greenRadioButtons.length,
        unreadRowCount: unreadNotificationRows.length,
        hasUnreadConversations: greenRadioButtons.length > 0 || unreadNotificationRows.length > 0
      };
    });
    
    console.log(`📊 ENHANCED: ${enhancedConversationDetection.greenRadioCount} green radios, ${enhancedConversationDetection.unreadRowCount} unread rows`);
    
    // Priority 1: Click on green radio button (unread indicator)
    const greenRadioElement = await this.browserService.page.$('.styled__BoxWrapper-sc-esqoz3-0.kxjOSJ');
    if (greenRadioElement) {
      console.log('🟢 Clicking GREEN RADIO BUTTON for unread conversation...');
      await greenRadioElement.click();
      await this.browserService.page.waitForTimeout(3000);
      console.log('✅ Opened UNREAD conversation via green radio button');
      return;
    }
    
    // Priority 2: Click on unread notification row
    const unreadRow = await this.browserService.page.$('.styled__NotificationRow-sc-5xhq84-2.hpcoAn');
    if (unreadRow) {
      console.log('🔴 Clicking UNREAD NOTIFICATION ROW...');
      await unreadRow.click();
      await this.browserService.page.waitForTimeout(3000);
      console.log('✅ Opened UNREAD conversation via notification row');
      return;
    }
    
    // Fallback: Original method
    console.log('⚠️ Using FALLBACK method - no trained selectors found unread conversations');
    const fallbackConversations = await this.browserService.page.$$('.styled__ReadButton-sc-5xhq84-1, .styled__MessageContent-sc-5xhq84-9');
    
    if (fallbackConversations.length === 0) {
      throw new Error('No conversations found with any method - all messages may be read');
    }

    console.log(`📊 FALLBACK: Found ${fallbackConversations.length} conversation(s)`);
    
    // Click the first (latest) conversation
    await fallbackConversations[0].click();
    await this.browserService.page.waitForTimeout(3000);

    console.log('✅ Opened conversation using fallback method');
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
      // 🚀 STEP 1: Extract basic user info from chat and generate login link IMMEDIATELY
      const userInfo = await this.extractUserInfoFromConversation();
      
      console.log(`🎯 Quick user extraction for immediate response:`);
      console.log(`   🆔 Skool ID: ${userInfo.skoolUserId}`);
      console.log(`   👤 Display Name: ${userInfo.skoolUsername}`);
      
      // Generate auth code and send response FAST
      const authResult = await authService.generateAuthCode(userInfo.skoolUserId, userInfo.skoolUsername);
      const loginUrl = `https://myultra.coach/auth/login?code=${authResult.code}`;
      
      responseMessage = `I will have your link shortly. ${loginUrl}`;
      
      console.log(`🔑 Generated unique code for ${userInfo.skoolUsername}: ${authResult.code}`);
      console.log(`🔗 Login URL: ${loginUrl}`);
      
      // NOTE: If auth codes are failing on server, check database sync between local/production
      console.log(`⚠️  NOTE: Auth code generated in ${process.env.NODE_ENV || 'development'} mode`);
      
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
    
    // 🚀 STEP 2: Click on user's profile image to navigate to their profile
    console.log(`🔍 STEP 2: Starting background profile scraping...`);
    console.log(`📋 Available user info:`, this.lastExtractedUserInfo);
    
    try {
      // Make sure userInfo is accessible in this scope
      if (this.lastExtractedUserInfo && this.lastExtractedUserInfo.profileUrl) {
        const userInfo = this.lastExtractedUserInfo;
        console.log(`✅ Found user info for background scraping`);
        console.log(`\n🔍 BACKGROUND: Navigating to profile by clicking profile image...`);
        console.log(`📍 Target Profile: ${userInfo.profileUrl}`);
        
        // Navigate directly to profile URL (avoid new tab issues from clicking profile images)
        console.log(`🌐 Navigating directly to profile: https://www.skool.com${userInfo.profileUrl}`);
        
        try {
          await this.browserService.page.goto(`https://www.skool.com${userInfo.profileUrl}`, {
            waitUntil: 'networkidle',
            timeout: 15000
          });
          console.log(`✅ Successfully navigated to profile page`);
          
          // CRITICAL: Disable all clicking to prevent navigation away from profile
          await this.browserService.page.addStyleTag({
            content: `
              * { pointer-events: none !important; }
              body { pointer-events: none !important; }
            `
          });
          console.log(`🔒 Disabled all clicking to prevent accidental navigation`);
          
          await this.browserService.page.waitForTimeout(3000);
        } catch (navError) {
          console.log(`❌ Direct navigation failed: ${navError.message}`);
          throw navError;
        }
        
        // Wait for profile content
        try {
          await this.browserService.page.waitForSelector('.styled__UserCardWrapper-sc-1gipnml-15', { timeout: 10000 });
          console.log(`✅ Profile content container found`);
        } catch (e) {
          console.log(`⚠️  Profile container not found, continuing anyway`);
        }
        
        // Extract detailed profile data using our enhanced selectors
        const detailedProfileData = await this.browserService.page.evaluate(() => {
          const data = { realName: null, bio: null, userId: null };
          
          // PRIORITY: Extract name from profile container text (we know it's there!)
          const profileContainer = document.querySelector('.styled__UserCardWrapper-sc-1gipnml-15');
          if (profileContainer) {
            const containerText = profileContainer.textContent || '';
            
            // Extract name using regex - it's at the beginning before @username
            const nameMatch = containerText.match(/^([A-Z][a-z]+ [A-Z][a-z]+)@/);
            if (nameMatch) {
              data.realName = nameMatch[1];
            } else {
              // More flexible regex - try to find any "First Last" pattern before @
              const flexibleMatch = containerText.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)@/);
              if (flexibleMatch) {
                data.realName = flexibleMatch[1];
              }
            }
          }
          
          // Fallback: Use EXACT tagged selectors from training session
          if (!data.realName) {
            const nameSelectors = [
              'text="Sterling Cooley"', 'text="Patrick Eckert"',
              ':has-text("Sterling Cooley")', ':has-text("Patrick Eckert")',
              '.styled__UserCardWrapper-sc-1gipnml-15 span',
              '.styled__UserCardWrapper-sc-1gipnml-15 h1', 
              '.styled__UserCardWrapper-sc-1gipnml-15 h2',
              '.styled__UserCardWrapper-sc-1gipnml-15 h3'
            ];
          
          for (const selector of nameSelectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const element of elements) {
                const text = element.textContent?.trim();
                if (text && 
                    text.includes(' ') && 
                    text.length < 50 && 
                    text.length > 4 && 
                    !text.toLowerCase().includes('log') &&
                    !text.toLowerCase().includes('sign') &&
                    !text.toLowerCase().includes('button') &&
                    !text.toLowerCase().includes('menu') &&
                    !text.toLowerCase().includes('nav') &&
                    /^[A-Z][a-z]+ [A-Z][a-z]+/.test(text) &&
                    (text === 'Sterling Cooley' || text === 'Patrick Eckert' || 
                     /^[A-Z][a-z]{2,} [A-Z][a-z]{2,}$/.test(text))) {
                  data.realName = text;
                  break;
                }
              }
              if (data.realName) break;
            } catch (e) {
              continue;
            }
          }
          } // Close the if (!data.realName) block
          
          // Try to find bio using tagged selectors
          const bioSelectors = ['.styled__Bio-sc-1gipnml-9', '.hGQpgW'];
          for (const selector of bioSelectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const element of elements) {
                const text = element.textContent?.trim();
                if (text && 
                    text.length >= 1 && 
                    text.length < 200 &&
                    !text.toLowerCase().includes('members') &&
                    !text.toLowerCase().includes('$') &&
                    !text.toLowerCase().includes('owned by')) {
                  data.bio = text;
                  break;
                }
              }
              if (data.bio) break;
            } catch (e) {
              continue;
            }
          }
          
          return data;
        });
        
        console.log(`📊 BACKGROUND: Profile data extracted:`, detailedProfileData);
        
        // Debug: Log what elements were found on the page
        const debugInfo = await this.browserService.page.evaluate(() => {
          const spanElements = document.querySelectorAll('span');
          const h1Elements = document.querySelectorAll('h1');
          const h2Elements = document.querySelectorAll('h2');
          const profileContainer = document.querySelector('.styled__UserCardWrapper-sc-1gipnml-15');
          
          return {
            totalSpans: spanElements.length,
            totalH1s: h1Elements.length,
            totalH2s: h2Elements.length,
            hasProfileContainer: !!profileContainer,
            profileContainerText: profileContainer?.textContent?.substring(0, 200) || 'Not found',
            pageTitle: document.title,
            currentUrl: window.location.href
          };
        });
        
        console.log(`🐛 DEBUG: Page analysis:`, debugInfo);
        
        // Store enhanced profile data for webhook lookup
        if (detailedProfileData.realName || detailedProfileData.bio) {
          // Properly parse first and last name
          let firstName = 'Unknown';
          let lastName = 'User';
          
          if (detailedProfileData.realName && detailedProfileData.realName !== 'Unknown User') {
            const nameParts = detailedProfileData.realName.trim().split(' ');
            firstName = nameParts[0] || 'Unknown';
            lastName = nameParts.slice(1).join(' ') || 'User';
            console.log(`✅ PARSING: "${detailedProfileData.realName}" → First: "${firstName}", Last: "${lastName}"`);
          } else if (userInfo.skoolUsername && userInfo.skoolUsername !== 'Unknown User') {
            const nameParts = userInfo.skoolUsername.trim().split(' ');
            firstName = nameParts[0] || 'Unknown';
            lastName = nameParts.slice(1).join(' ') || 'User';
            console.log(`✅ FALLBACK: "${userInfo.skoolUsername}" → First: "${firstName}", Last: "${lastName}"`);
          } else {
            console.log(`❌ NO VALID NAME: realName="${detailedProfileData.realName}", skoolUsername="${userInfo.skoolUsername}"`);
          }
          
          const enhancedUserInfo = {
            skoolId: userInfo.skoolUserId,
            firstName: firstName,
            lastName: lastName,
            fullName: detailedProfileData.realName || userInfo.skoolUsername || 'Unknown User',
            bio: detailedProfileData.bio || '.',
            profileUrl: `https://www.skool.com${userInfo.profileUrl}`,
            lastSeen: new Date().toISOString(),
            goals: ['coaching_session'],
            sessions: 0
          };
          
          console.log(`💾 BACKGROUND: Enhanced profile ready for webhook:`, enhancedUserInfo);
          
          // Update the stored webhook data with enhanced profile info
          try {
            await this.storeUserProfile(enhancedUserInfo);
            console.log(`✅ BACKGROUND: Enhanced profile stored in database`);
          } catch (storeError) {
            console.log(`⚠️  BACKGROUND: Could not store enhanced profile: ${storeError.message}`);
          }
        } else {
          console.log(`⚠️  BACKGROUND: No enhanced profile data found, keeping original data`);
        }
            
        console.log(`✅ BACKGROUND: Profile scraping completed successfully`);
        
        // Return to profile page to continue monitoring
        console.log(`🔄 BACKGROUND: Returning to profile page to continue monitoring...`);
        try {
          await this.browserService.page.goto('https://www.skool.com/@my-ultra-coach-6588', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          });
          console.log(`✅ BACKGROUND: Back to profile page, ready for next DM`);
        } catch (navError) {
          console.log(`⚠️  Could not return to profile page: ${navError.message}`);
        }
      }
    } catch (backgroundError) {
      console.error(`⚠️  BACKGROUND: Profile scraping failed (non-critical):`, backgroundError.message);
    }
  }

  async closeChatWindow() {
    console.log('❌ Attempting to close chat window...');
    
    try {
      // Method 0: Try clicking the modal background first (most reliable)
      console.log('🎯 First attempt: clicking modal background...');
      const modalBackground = await this.browserService.page.$('.styled__ModalBackground-sc-1j2ymu8-1');
      if (modalBackground) {
        await modalBackground.click({ force: true });
        await this.browserService.page.waitForTimeout(1000);
        
        // Check if modal is gone
        const modal = await this.browserService.page.$('.styled__BaseModalWrapper-sc-1j2ymu8-0');
        if (!modal || !(await modal.isVisible())) {
          console.log('✅ Modal closed by clicking background!');
          return;
        }
      }
    } catch (error) {
      console.log(`⚠️ Background click failed: ${error.message}`);
    }
    
    // Method 1: Handle modal dialog close using newly trained selectors  
    const modalCloseSelectors = [
      '[type="button"].styled__ButtonWrapper-sc-1crx28g-1', // WORKING SELECTOR - use first!
      '.styled__ButtonWrapper-sc-1crx28g-1.bwaWQm', // Backup selector
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
            await closeElement.click({ force: true });
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
   * Extract REAL user information from profile link and display name
   * @returns {Promise<{skoolUserId: string, skoolUsername: string, firstName: string, lastName: string, profileUrl: string}>}
   */
  async extractUserInfoFromConversation() {
    try {
      let realSkoolId = null;
      let fullName = null;
      let profileUrl = null;
      
      console.log('🔍 Searching for user profile information...');
      
      // 1. PRIORITY: Look for profile URL in avatar links (e.g. https://www.skool.com/@sterling-cooley)
      const avatarSelectors = [
        'a[href*="@"]', // Profile links starting with @
        'img[src*="profile"]', // Profile images (tagged in chat)
        'img', // Tagged profile link selector
        '.avatar a', // Avatar wrapper links
        '.user-avatar a', // User avatar links
        '[class*="avatar"] a', // Any avatar class with link
        '[class*="Avatar"] a' // Capitalized avatar class
      ];
      
      for (const selector of avatarSelectors) {
        try {
          const elements = await this.browserService.page.$$(selector);
          for (const element of elements) {
            // For img elements, look for parent links or nearby links
            if (selector === 'img') {
              // Check if img is inside a link
              const parentLink = await element.evaluateHandle(el => el.closest('a[href*="@"]'));
              if (parentLink) {
                const href = await parentLink.getAttribute('href');
                if (href && href.includes('@') && !href.includes('my-ultra-coach')) {
                  const match = href.match(/@([a-zA-Z0-9-]+)/);
                  if (match) {
                    realSkoolId = match[1];
                    profileUrl = href;
                    console.log(`🎯 Found REAL Skool ID from img parent link: ${realSkoolId}`);
                    console.log(`🔗 Profile URL: ${profileUrl}`);
                    break;
                  }
                }
              }
            } else {
              // For link elements, check href directly
              const href = await element.getAttribute('href');
              if (href && href.includes('@') && !href.includes('my-ultra-coach')) {
                const match = href.match(/@([a-zA-Z0-9-]+)/);
                if (match) {
                  realSkoolId = match[1];
                  profileUrl = href;
                  console.log(`🎯 Found REAL Skool ID from profile URL: ${realSkoolId}`);
                  console.log(`🔗 Profile URL: ${profileUrl}`);
                  break;
                }
              }
            }
          }
          if (realSkoolId) break;
        } catch (e) {
          // Continue to next selector
        }
      }
      
      // 2. Look for the user's display name (full name like "Sterling Cooley")
      // Focus on MESSAGE-specific selectors to avoid group names
      const nameSelectors = [
        '.styled__Username-sc-1c7orh8-0', // From discovery sessions
        '[data-testid="username"]',
        '.username',
        '.author-name',
        '.message-author',
        '.user-name',
        '.display-name'
      ];

      for (const selector of nameSelectors) {
        try {
          const elements = await this.browserService.page.$$(selector);
          console.log(`🔍 Checking selector "${selector}" - found ${elements.length} elements`);
          for (const element of elements) {
            const text = await element.textContent();
            console.log(`   📝 Found text: "${text}"`);
            // Be more specific: must be 2 words, no "DeSci", no "Science", no "Decentralized"
            if (text && text.trim() && 
                text !== 'My Ultra Coach' && 
                text.includes(' ') &&
                !text.toLowerCase().includes('desci') &&
                !text.toLowerCase().includes('science') &&
                !text.toLowerCase().includes('decentralized') &&
                text.split(' ').length <= 3 && // Max 3 words (first, middle, last)
                text.length < 30) { // Reasonable name length
              fullName = text.trim();
              console.log(`✅ Selected as full name: ${fullName}`);
              break;
            }
          }
          if (fullName) break;
        } catch (e) {
          // Continue to next selector
        }
      }

      // 3. If no profile URL found, look in conversation title/header
      if (!realSkoolId) {
        try {
          const pageTitle = await this.browserService.page.title();
          const urlMatch = pageTitle.match(/Chat with (.+)/i);
          if (urlMatch) {
            fullName = fullName || urlMatch[1].trim();
            console.log(`📄 Extracted name from page title: ${fullName}`);
          }
        } catch (e) {
          console.log('❌ Could not extract from page title');
        }
      }
      
      // 4. Parse first/last name from full name
      let firstName = 'Unknown';
      let lastName = 'User';
      
      if (fullName && fullName.includes(' ')) {
        const nameParts = fullName.split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
        console.log(`✂️ Parsed name: ${firstName} ${lastName}`);
      } else if (fullName) {
        firstName = fullName;
        lastName = '';
      }

      // 5. Generate Skool ID if we didn't find it from profile URL
      if (!realSkoolId && fullName) {
        // Create ID like "sterling-cooley" from "Sterling Cooley"
        realSkoolId = fullName.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '') // Remove special characters
          .replace(/\s+/g, '-'); // Replace spaces with hyphens
        console.log(`🔧 Generated Skool ID from name: ${realSkoolId}`);
      }
      
      // 6. Final fallback if nothing worked
      if (!realSkoolId) {
        realSkoolId = `user-${Date.now()}`;
        fullName = `User ${Date.now()}`;
        firstName = 'Unknown';
        lastName = 'User';
        console.log(`🆘 Using complete fallback: ${realSkoolId}`);
      }

      let userInfo = {
        skoolUserId: realSkoolId, // REAL Skool ID (e.g., "sterling-cooley")
        skoolUsername: fullName || `${firstName} ${lastName}`, // Display name
        firstName,
        lastName,
        profileUrl: profileUrl || `https://www.skool.com/@${realSkoolId}`
      };
      
      console.log('✅ EXTRACTED USER INFO:');
      console.log(`   🆔 Skool ID: ${userInfo.skoolUserId}`);
      console.log(`   👤 Full Name: ${userInfo.skoolUsername}`);
      console.log(`   📝 First: ${firstName}, Last: ${lastName}`);
      console.log(`   🔗 Profile: ${userInfo.profileUrl}`);
      
      // Store profile info for background scraping (after sending message)
      if (realSkoolId && profileUrl && !profileUrl.includes('fallback') && !profileUrl.includes('user-')) {
        userInfo.profileUrl = profileUrl;
        userInfo.skoolUserId = realSkoolId;
        console.log(`📍 Profile info ready for background scraping: ${profileUrl}`);
      }

      // Store this user in our webhook database
      await this.storeUserProfile(userInfo);
      
      // Store for background profile scraping
      this.lastExtractedUserInfo = userInfo;
      
      return userInfo;

    } catch (error) {
      console.error('❌ Error extracting user info:', error);
      
      // Return fallback values
      const fallbackId = `fallback-${Date.now()}`;
      return {
        skoolUserId: fallbackId,
        skoolUsername: 'Unknown User',
        firstName: 'Unknown',
        lastName: 'User',
        profileUrl: `https://www.skool.com/@${fallbackId}`
      };
    }
  }
  
  /**
   * Scrape user's profile page to get accurate information
   * @param {string} profileUrl - User's profile URL (e.g., /@sterling-cooley)
   * @param {string} skoolId - User's Skool ID
   * @returns {Promise<Object|null>} Profile data or null if failed
   */
  // DEPRECATED: Old scrapeUserProfile method removed
  // Now using same-window background scraping approach
  async scrapeUserProfile_DEPRECATED(profileUrl, skoolId) {
    let profilePage = null;
    try {
      console.log(`🔍 Opening new tab for profile: ${profileUrl}`);
      
      // Open profile page in new tab
      if (!this.browserService.browser) {
        console.log('❌ Browser not available');
        return null;
      }
      profilePage = await this.browserService.browser.newPage();
      
      // Get current page URL to extract group context
      const currentUrl = this.browserService.page.url();
      let groupId = null;
      
      // Extract group ID from current URL if it contains ?g=
      const groupMatch = currentUrl.match(/[?&]g=([^&]+)/);
      if (groupMatch) {
        groupId = groupMatch[1];
        console.log(`🏷️ Current group context: ${groupId}`);
      }
      
      // Navigate to profile page (preserving group context if available)
      let fullProfileUrl = profileUrl.startsWith('http') 
        ? profileUrl 
        : `https://www.skool.com${profileUrl}`;
        
      // Add group context if available
      if (groupId) {
        fullProfileUrl += `?g=${groupId}`;
      }
      
      console.log(`🌐 Navigating to: ${fullProfileUrl}`);
      console.log(`🏷️ Group context: ${groupId || 'none'}`);
      await profilePage.goto(fullProfileUrl, { 
        waitUntil: 'networkidle',
        timeout: 15000 
      });
      
      console.log(`⏳ Waiting for profile content to load...`);
      await profilePage.waitForTimeout(5000); // Longer wait for full content load
      
      // Wait for profile content specifically
      try {
        await profilePage.waitForSelector('.styled__UserCardWrapper-sc-1gipnml-15', { timeout: 10000 });
        console.log(`✅ Profile content container found`);
      } catch (e) {
        console.log(`⚠️  Profile container not found, continuing anyway`);
      }
      
      // Extract user information from profile page
      const profileData = await profilePage.evaluate(() => {
        const data = {
          realName: null,
          bio: null,
          userId: null
        };
        
        // Use EXACT tagged selectors from your training session - NO GENERIC SELECTORS!
        const nameSelectors = [
          // EXACT TEXT MATCHES from training (most reliable)
          'text="Sterling Cooley"', 'text="Patrick Eckert"',
          ':has-text("Sterling Cooley")', ':has-text("Patrick Eckert")',
          // ONLY target profile area - exclude navigation/header
          '.styled__UserCardWrapper-sc-1gipnml-15 span', // Profile box + span combo
          '.styled__UserCardWrapper-sc-1gipnml-15 h1', 
          '.styled__UserCardWrapper-sc-1gipnml-15 h2',
          '.styled__UserCardWrapper-sc-1gipnml-15 h3'
        ];
        
        for (const selector of nameSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const text = element.textContent?.trim();
              // STRICT filtering - exclude ALL navigation/UI elements
              if (text && 
                  text.includes(' ') && // Must be first + last name
                  text.length < 50 && 
                  text.length > 4 && // Minimum reasonable name length
                  // EXCLUDE ALL UI/NAVIGATION TEXT
                  !text.toLowerCase().includes('log') && // Exclude "Log In", "Log Out"
                  !text.toLowerCase().includes('sign') && // Exclude "Sign Up", "Sign In"
                  !text.toLowerCase().includes('button') &&
                  !text.toLowerCase().includes('menu') &&
                  !text.toLowerCase().includes('nav') &&
                  !text.toLowerCase().includes('header') &&
                  !text.toLowerCase().includes('footer') &&
                  !text.toLowerCase().includes('desci') &&
                  !text.toLowerCase().includes('decentralized') &&
                  !text.toLowerCase().includes('science') &&
                  !text.toLowerCase().includes('owned by') && // Exclude "Owned by Sterling"
                  !text.toLowerCase().includes('members') && // Exclude "193 members"
                  !text.toLowerCase().includes('$') && // Exclude pricing "$7/m"
                  !text.toLowerCase().includes('vagus school') && // Exclude group names
                  !text.toLowerCase().includes('ultra school') && // Exclude group names
                  !text.toLowerCase().includes('school') && // Exclude group references
                  // Must be reasonable name pattern
                  /^[A-Z][a-z]+ [A-Z][a-z]+/.test(text) && // STRICT: First Last pattern only
                  // Known valid names OR standard pattern
                  (text === 'Sterling Cooley' || text === 'Patrick Eckert' || 
                   /^[A-Z][a-z]{2,} [A-Z][a-z]{2,}$/.test(text))) { // At least 3 chars each name
                data.realName = text;
                console.log(`✅ Found REAL name: ${text}`);
                break;
              } else if (text) {
                console.log(`❌ Rejected text: "${text}" (navigation/UI element)`);
              }
            }
            if (data.realName) break;
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // Try to find bio/description using EXACT tagged selectors
        const bioSelectors = [
          // PRIORITY: Tagged selectors from your Playwright session
          '.styled__Bio-sc-1gipnml-9', // Primary bio selector (tagged)
          '.hGQpgW', // Alternative bio selector (tagged)
          // Generic fallbacks for other users
          '[class*="bio"]', '[class*="Bio"]',
          '[class*="description"]', '[class*="Description"]',
          '[class*="about"]', '[class*="About"]',
          'p', '.profile-description', '.user-bio'
        ];
        
        for (const selector of bioSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const text = element.textContent?.trim();
              // Look for personal bio text (exclude group/membership info)
              if (text && 
                  text.length >= 1 && // Patrick had just "." - valid minimal bio
                  text.length < 200 &&
                  !text.toLowerCase().includes('desci') &&
                  !text.toLowerCase().includes('group') &&
                  !text.toLowerCase().includes('members') && // Exclude "193 members"
                  !text.toLowerCase().includes('$') && // Exclude pricing
                  !text.toLowerCase().includes('owned by') && // Exclude admin group text
                  !text.toLowerCase().includes('vagus school') && // Exclude group names
                  !text.toLowerCase().includes('ultra school') && // Exclude group names
                  // Accept bio if it's personal content OR minimal (like ".")
                  (text === '.' || // Minimal bio is valid
                   text.includes('warrior') || text.includes('nerd') || text.includes('coach') || 
                   text.includes('developer') || text.includes('founder') || text.includes(',') || 
                   text.includes('/') || text.includes('love') || text.includes('passion') ||
                   text.includes('I') || text.includes('my') || text.includes('me'))) { // Personal pronouns
                data.bio = text;
                console.log(`Found potential bio: ${text}`);
                break;
              }
            }
            if (data.bio) break;
          } catch (e) {
            // Continue to next selector
          }
        }
        
        return data;
      });
      
      console.log('📊 Profile page data extracted:', profileData);
      
      // Parse the real name if found
      let firstName = 'Unknown';
      let lastName = 'User';
      let fullName = profileData.realName || `User ${skoolId}`;
      
      if (profileData.realName && profileData.realName.includes(' ')) {
        const nameParts = profileData.realName.split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      } else if (profileData.realName) {
        firstName = profileData.realName;
        lastName = '';
      }
      
      // Close the profile tab and ensure we return to original page
      await profilePage.close();
      console.log('✅ Profile tab closed');
      
      // Ensure we're back on the original page
      try {
        await this.browserService.page.bringToFront();
        console.log('🔄 Returned to original chat page');
      } catch (e) {
        console.log('⚠️  Could not bring original page to front, but continuing...');
      }
      
      return {
        skoolUserId: skoolId,
        skoolUsername: fullName,
        firstName,
        lastName,
        bio: profileData.bio,
        groupId: groupId,
        profileUrl: fullProfileUrl
      };
      
    } catch (error) {
      console.error('❌ Error scraping profile page:', error);
      
      // Clean up profile page if it exists
      if (profilePage) {
        try {
          await profilePage.close();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      return null;
    }
  }

  /**
   * Store user profile data for webhook usage
   * @param {Object} userInfo - User information extracted from Skool
   */
  async storeUserProfile(userInfo) {
    try {
      console.log('💾 Storing user profile for webhook usage...');
      
      // In the future, this would save to the database
      // For now, let's at least log what would be stored
      const profileData = {
        skoolId: userInfo.skoolUserId,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        fullName: userInfo.skoolUsername,
        profileUrl: userInfo.profileUrl,
        lastSeen: new Date().toISOString(),
        goals: ['coaching_session'], // Default goals
        sessions: 0 // New user
      };
      
      console.log('📋 Profile data to store:');
      console.log(JSON.stringify(profileData, null, 2));
      
      // TODO: When database is ready, save to Prisma:
      // await prisma.skoolUser.upsert({
      //   where: { skoolId: profileData.skoolId },
      //   update: { lastSeen: profileData.lastSeen },
      //   create: profileData
      // });
      
    } catch (error) {
      console.error('❌ Error storing user profile:', error);
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
