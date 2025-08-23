import SkoolBrowserService from './skoolBrowserService.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [SKOOL-DM] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/skool-dm.log' })
  ],
});

class SkoolDMService {
  constructor() {
    this.browserService = new SkoolBrowserService();
    this.isMonitoring = false;
    this.lastCheckedMessageId = null;
    this.checkInterval = null;
    this.monitoringInterval = parseInt(process.env.BOT_CHECK_INTERVAL) || 45000; // 45 seconds default
  }

  /**
   * Initialize the DM service and login to Skool
   */
  async initialize() {
    try {
      logger.info('Initializing Skool DM Service...');
      
      // Initialize browser
      const browserInitialized = await this.browserService.initialize();
      if (!browserInitialized) {
        throw new Error('Failed to initialize browser service');
      }

      // Login to Skool
      const loginSuccess = await this.browserService.loginToSkool();
      if (!loginSuccess) {
        throw new Error('Failed to login to Skool');
      }

      // Navigate to messages inbox
      await this.navigateToMessages();
      
      logger.info('✅ Skool DM Service initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize DM service: ${error.message}`);
      return false;
    }
  }

  /**
   * Navigate to your profile first, then to messages
   */
  async navigateToMessages() {
    logger.info('👤 First navigating to My Ultra Coach profile...');
    
    // Navigate to your profile first
    await this.browserService.page.goto('https://www.skool.com/@my-ultra-coach-6588', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Wait for profile to load
    await this.browserService.page.waitForTimeout(3000);
    
    const profileUrl = this.browserService.page.url();
    logger.info(`🌐 Profile URL: ${profileUrl}`);
    
    // Get profile info for confirmation
    try {
      const profileName = await this.browserService.page.textContent('h1, [class*="ProfileName"], [class*="UserName"]').catch(() => 'Profile');
      logger.info(`✅ Successfully accessed profile: ${profileName}`);
    } catch (error) {
      logger.warn('⚠️  Could not extract profile name, but continuing...');
    }

    // Now navigate to messages inbox
    logger.info('📥 Now navigating to messages inbox...');
    
    await this.browserService.page.goto('https://www.skool.com/messages', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Wait for messages to load
    await this.browserService.page.waitForTimeout(3000);
    
    const currentUrl = this.browserService.page.url();
    if (!currentUrl.includes('/messages')) {
      throw new Error('Could not access messages inbox');
    }
    
    logger.info('✅ Successfully navigated to messages inbox');
  }

  /**
   * Alternative method: Try to access messages directly from profile
   */
  async navigateToMessagesFromProfile() {
    logger.info('👤 Navigating to My Ultra Coach profile...');
    
    // Navigate to your profile
    await this.browserService.page.goto('https://www.skool.com/@my-ultra-coach-6588', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    await this.browserService.page.waitForTimeout(3000);
    
    // Look for message/DM options on the profile
    logger.info('🔍 Looking for message options on profile...');
    
    // Try to find message-related links or buttons
    const messageSelectors = [
      'a[href*="messages"]',
      'a[href*="chat"]', 
      'button:has-text("Message")',
      'a:has-text("Messages")',
      '[class*="message"]',
      '[class*="Message"]',
      '[data-testid*="message"]'
    ];
    
    for (const selector of messageSelectors) {
      try {
        const element = await this.browserService.page.$(selector);
        if (element) {
          logger.info(`✅ Found message element with selector: ${selector}`);
          const href = await element.getAttribute('href');
          const text = await element.textContent();
          logger.info(`📝 Element text: "${text}", href: "${href}"`);
          
          // Click the element if it looks like a messages link
          if (href && (href.includes('message') || href.includes('chat'))) {
            logger.info('🔗 Clicking messages link...');
            await element.click();
            await this.browserService.page.waitForTimeout(3000);
            
            const newUrl = this.browserService.page.url();
            logger.info(`🌐 New URL after click: ${newUrl}`);
            
            if (newUrl.includes('message') || newUrl.includes('chat')) {
              logger.info('✅ Successfully navigated to messages from profile!');
              return true;
            }
          }
        }
      } catch (error) {
        // Continue trying other selectors
        continue;
      }
    }
    
    // If no direct message link found, try the regular messages URL
    logger.info('⚠️  No direct message link found on profile, trying messages URL...');
    await this.browserService.page.goto('https://www.skool.com/messages', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await this.browserService.page.waitForTimeout(3000);
    return this.browserService.page.url().includes('messages');
  }

  /**
   * Start monitoring for new DMs
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('DM monitoring is already running');
      return;
    }

    logger.info(`🤖 Starting DM monitoring (checking every ${this.monitoringInterval}ms)...`);
    this.isMonitoring = true;

    // Initial check
    await this.checkForNewMessages();

    // Set up interval for continuous monitoring
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkForNewMessages();
      } catch (error) {
        logger.error(`Error during message check: ${error.message}`);
        
        // Try to recover by re-navigating to messages
        try {
          await this.navigateToMessages();
        } catch (recoveryError) {
          logger.error(`Recovery failed: ${recoveryError.message}`);
        }
      }
    }, this.monitoringInterval);

    logger.info('✅ DM monitoring started successfully');
  }

  /**
   * Stop monitoring for DMs
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      logger.warn('DM monitoring is not running');
      return;
    }

    logger.info('🛑 Stopping DM monitoring...');
    this.isMonitoring = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('✅ DM monitoring stopped');
  }

  /**
   * Check for new messages by monitoring the mail icon (no page refresh)
   */
  async checkForNewMessages() {
    try {
      logger.info('🔍 Checking mail icon for unread messages...');

      // First check if we're still logged in
      const isLoggedIn = await this.checkLoginStatus();
      if (!isLoggedIn) {
        logger.warn('🚪 Not logged in, attempting to re-login...');
        await this.handleRelogin();
        return;
      }

      // Check mail icon status (unread badge vs normal)
      const hasUnreadMessages = await this.checkMailIconStatus();
      
      if (!hasUnreadMessages) {
        logger.info('📧 No unread messages detected');
        return;
      }

      logger.info('🔴 Unread messages detected! Opening mail popup...');
      
      // Click mail icon to open popup
      await this.openMailPopup();
      
      // Check for unread conversations in the popup
      await this.checkUnreadConversations();

    } catch (error) {
      logger.error(`Error checking for new messages: ${error.message}`);
      
      // Try to recover without full page refresh
      try {
        await this.recoverFromError();
      } catch (recoveryError) {
        logger.error(`Recovery failed: ${recoveryError.message}`);
        throw error;
      }
    }
  }

  /**
   * Check if user is still logged in by looking for login indicators
   */
  async checkLoginStatus() {
    try {
      // Look for elements that indicate we're logged in
      const loggedInIndicators = [
        '[class*="avatar"]', // User avatar in header
        '[class*="profile"]', // Profile elements
        'a[href*="@my-ultra-coach"]', // Our profile link
        '[class*="mail"]' // Mail icon
      ];

      for (const selector of loggedInIndicators) {
        const element = await this.browserService.page.$(selector);
        if (element) {
          return true; // Found logged-in indicator
        }
      }

      // Check for login form (indicates we're logged out)
      const loginForm = await this.browserService.page.$('#email, input[type="email"]');
      if (loginForm) {
        return false; // Login form present = logged out
      }

      return true; // Assume logged in if no clear indicators
    } catch (error) {
      logger.warn(`Error checking login status: ${error.message}`);
      return false;
    }
  }

  /**
   * Check mail icon for unread message indicators
   */
  async checkMailIconStatus() {
    try {
      // Look for unread badge/indicator on mail icon
      // This will need to be updated with actual selectors from your discovery
      const unreadSelectors = [
        '[class*="unread"]', // Generic unread class
        '[class*="badge"]', // Badge indicator
        '.mail-icon [class*="notification"]', // Notification on mail icon
        '[class*="mail"] [class*="count"]', // Count on mail icon
        '[class*="red"]' // Red indicator
      ];

      for (const selector of unreadSelectors) {
        const unreadElement = await this.browserService.page.$(selector);
        if (unreadElement) {
          // Check if element is visible and has content
          const isVisible = await unreadElement.isVisible();
          const hasContent = await unreadElement.textContent();
          
          if (isVisible && (hasContent || hasContent === '')) {
            logger.info(`📮 Unread indicator found: ${selector}`);
            return true;
          }
        }
      }

      return false; // No unread indicators found
    } catch (error) {
      logger.warn(`Error checking mail icon status: ${error.message}`);
      return false;
    }
  }

  /**
   * Open the mail popup by clicking the mail icon
   */
  async openMailPopup() {
    try {
      // Find and click the mail icon
      const mailIconSelectors = [
        '[class*="mail"]', // Generic mail class
        'svg[class*="mail"]', // SVG mail icon
        'button[aria-label*="mail" i]', // Mail button with aria-label
        'a[href*="messages"]' // Messages link
      ];

      for (const selector of mailIconSelectors) {
        const mailIcon = await this.browserService.page.$(selector);
        if (mailIcon) {
          logger.info(`📧 Clicking mail icon: ${selector}`);
          await mailIcon.click();
          await this.browserService.page.waitForTimeout(2000);
          
          // Check if popup opened
          const popup = await this.browserService.page.$('[class*="popup"], [class*="dropdown"], [class*="modal"]');
          if (popup) {
            logger.info('✅ Mail popup opened successfully');
            return true;
          }
        }
      }

      throw new Error('Could not find or click mail icon');
    } catch (error) {
      logger.error(`Error opening mail popup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check for unread conversations in the mail popup
   */
  async checkUnreadConversations() {
    try {
      logger.info('🔍 Scanning for unread conversations in popup...');

      // Look for unread conversation items
      const unreadConversations = await this.browserService.page.$$('[class*="unread"], [class*="new"]');
      
      if (unreadConversations.length === 0) {
        logger.info('📭 No unread conversations found in popup');
        return;
      }

      logger.info(`📊 Found ${unreadConversations.length} unread conversation(s)`);

      // Process each unread conversation
      for (let i = 0; i < unreadConversations.length; i++) {
        try {
          await this.processUnreadConversation(unreadConversations[i], i);
        } catch (error) {
          logger.error(`Error processing unread conversation ${i}: ${error.message}`);
        }
      }

    } catch (error) {
      logger.error(`Error checking unread conversations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a specific unread conversation
   */
  async processUnreadConversation(conversationElement, index) {
    try {
      logger.info(`💬 Processing unread conversation ${index + 1}...`);

      // Click on the conversation to open it
      await conversationElement.click();
      await this.browserService.page.waitForTimeout(2000);

      // Extract the latest message
      const messageData = await this.extractLatestMessage();
      
      if (messageData) {
        logger.info(`🆕 New message from ${messageData.sender}: "${messageData.text}"`);
        
        // Check if we should respond
        if (this.shouldRespondToMessage(messageData)) {
          await this.respondToMessage(messageData);
        }
        
        // Update last checked message
        this.lastCheckedMessageId = messageData.id;
      }

    } catch (error) {
      logger.error(`Error processing unread conversation: ${error.message}`);
    }
  }

  /**
   * Extract the latest message from the current conversation
   */
  async extractLatestMessage() {
    try {
      // Look for message elements (will use discovered selectors)
      const messages = await this.browserService.page.$$('[class*="message"], [class*="Message"]');
      
      if (messages.length === 0) {
        return null;
      }

      // Get the last message
      const lastMessage = messages[messages.length - 1];
      return await this.extractMessageData(lastMessage);

    } catch (error) {
      logger.error(`Error extracting latest message: ${error.message}`);
      return null;
    }
  }

  /**
   * Handle automatic re-login
   */
  async handleRelogin() {
    try {
      logger.info('🔐 Attempting automatic re-login...');
      
      // Navigate to login page
      await this.browserService.page.goto('https://www.skool.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Use existing login method
      await this.browserService.loginToSkool();
      
      // Navigate back to profile/messages
      await this.navigateToMessages();
      
      logger.info('✅ Automatic re-login successful');
      
    } catch (error) {
      logger.error(`Automatic re-login failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Recover from errors without full page refresh
   */
  async recoverFromError() {
    try {
      logger.info('🔄 Attempting error recovery...');
      
      // Try to close any open popups
      await this.browserService.page.keyboard.press('Escape');
      await this.browserService.page.waitForTimeout(1000);
      
      // Check if we're still on the right page
      const currentUrl = this.browserService.page.url();
      if (!currentUrl.includes('skool.com')) {
        await this.navigateToMessages();
      }
      
      logger.info('✅ Error recovery completed');
      
    } catch (error) {
      logger.error(`Error recovery failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check a specific conversation for new messages
   */
  async checkConversation(conversationElement, index) {
    try {
      logger.info(`💬 Checking conversation ${index + 1}...`);

      // Click on the conversation to open it
      await conversationElement.click();
      await this.browserService.page.waitForTimeout(2000);

      // Look for messages in the conversation
      const messages = await this.browserService.page.$$('[class*="message"], [class*="Message"], [data-testid*="message"]');
      
      if (messages.length === 0) {
        logger.info(`📭 No messages found in conversation ${index + 1}`);
        return;
      }

      logger.info(`📨 Found ${messages.length} message(s) in conversation ${index + 1}`);

      // Check the most recent message
      const lastMessage = messages[messages.length - 1];
      const messageData = await this.extractMessageData(lastMessage);

      if (messageData && this.isNewMessage(messageData)) {
        logger.info(`🆕 New message detected from ${messageData.sender}: "${messageData.text}"`);
        
        // Check if this is a message we should respond to
        if (this.shouldRespondToMessage(messageData)) {
          await this.respondToMessage(messageData);
        }
        
        // Update last checked message
        this.lastCheckedMessageId = messageData.id;
      }

    } catch (error) {
      logger.error(`Error checking conversation: ${error.message}`);
    }
  }

  /**
   * Extract message data from a message element
   */
  async extractMessageData(messageElement) {
    try {
      const messageData = await this.browserService.page.evaluate((element) => {
        // Get message text
        const textElement = element.querySelector('[class*="text"], [class*="content"], p, span');
        const text = textElement ? textElement.textContent.trim() : '';

        // Get sender info
        const senderElement = element.querySelector('[class*="sender"], [class*="author"], [class*="name"]');
        const sender = senderElement ? senderElement.textContent.trim() : 'Unknown';

        // Get timestamp if available
        const timestampElement = element.querySelector('[class*="timestamp"], [class*="time"], time');
        const timestamp = timestampElement ? timestampElement.textContent.trim() : '';

        // Generate a simple ID based on content and timestamp
        const id = btoa(text + sender + timestamp).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);

        return {
          id,
          text,
          sender,
          timestamp,
          element: element.outerHTML.substring(0, 200) // First 200 chars for debugging
        };
      }, messageElement);

      return messageData;
    } catch (error) {
      logger.error(`Error extracting message data: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if this is a new message we haven't seen before
   */
  isNewMessage(messageData) {
    if (!this.lastCheckedMessageId) {
      // First run - consider all messages as "seen"
      return false;
    }
    
    return messageData.id !== this.lastCheckedMessageId;
  }

  /**
   * Determine if we should respond to this message
   */
  shouldRespondToMessage(messageData) {
    const text = messageData.text.toLowerCase();
    
    // Don't respond to our own messages
    if (messageData.sender.toLowerCase().includes('ultra') || 
        messageData.sender.toLowerCase().includes('coach')) {
      return false;
    }

    // Respond to any message for now (can add keyword filtering later)
    return text.length > 0;
  }

  /**
   * Respond to a message with MyUltraCoach link (uses Enter key to send)
   */
  async respondToMessage(messageData) {
    try {
      logger.info(`🤖 Responding to message from ${messageData.sender}...`);

      // Look for the message input field using discovered selectors
      const inputSelectors = [
        '.styled__MultiLineInput-sc-1saiqqb-2', // Discovered selector
        'textarea[placeholder*="message" i]',
        'input[placeholder*="message" i]',
        '[contenteditable="true"]',
        '[class*="message-input"]'
      ];

      let messageInput = null;
      for (const selector of inputSelectors) {
        messageInput = await this.browserService.page.$(selector);
        if (messageInput) {
          logger.info(`📝 Found message input: ${selector}`);
          break;
        }
      }
      
      if (!messageInput) {
        logger.error('❌ Could not find message input field');
        return false;
      }

      // Our response with MyUltraCoach link
      const response = "That's great man, thanks for sharing! Let me look into that right now. In the meantime, check out https://myultra.coach for more resources!";

      // Clear any existing text and type the response
      await messageInput.click();
      await this.browserService.page.waitForTimeout(500);
      
      // Clear the input field first
      await this.browserService.page.keyboard.down('Control');
      await this.browserService.page.keyboard.press('a');
      await this.browserService.page.keyboard.up('Control');
      await this.browserService.page.keyboard.press('Delete');
      
      // Type the response with human-like delays
      await messageInput.type(response, { delay: 50 + Math.random() * 50 });
      await this.browserService.page.waitForTimeout(1000);

      // Send message using Enter key (as specified - no send button)
      await this.browserService.page.keyboard.press('Enter');
      logger.info('✅ Response sent via Enter key!');
      
      // Wait for message to be sent
      await this.browserService.page.waitForTimeout(2000);
      
      // Verify message was sent by checking if input is cleared
      const inputValue = await messageInput.inputValue().catch(() => '');
      if (inputValue === '' || inputValue.length === 0) {
        logger.info('✅ Message sent successfully - input field cleared');
        return true;
      } else {
        logger.warn('⚠️ Message may not have sent - input still has content');
        return false;
      }

    } catch (error) {
      logger.error(`Error responding to message: ${error.message}`);
      return false;
    }
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      monitoringInterval: this.monitoringInterval,
      lastCheckedMessageId: this.lastCheckedMessageId,
      isLoggedIn: this.browserService.isLoggedIn
    };
  }

  /**
   * Close the DM service
   */
  async close() {
    this.stopMonitoring();
    await this.browserService.close();
    logger.info('✅ Skool DM Service closed');
  }
}

export default SkoolDMService;
