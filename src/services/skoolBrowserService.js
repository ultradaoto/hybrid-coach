import { chromium } from 'playwright';
import winston from 'winston';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/skool-monitoring.log' })
  ],
});

class SkoolBrowserService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  // Helper method for human-like delays
  async humanDelay(baseMs = 1000, variationMs = 500) {
    const delay = baseMs + (Math.random() * variationMs);
    await this.page.waitForTimeout(delay);
  }

  async initialize() {
    try {
      logger.info('Initializing Skool browser service...');
      
      this.browser = await chromium.launch({
        headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      this.page = await this.browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 }
      });

      // Add enhanced stealth measures
      await this.page.addInitScript(() => {
        // Hide webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        
        // Mock plugins and languages to appear more human
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
        
        // Mock chrome object
        window.chrome = {
          runtime: {},
        };
        
        // Mock permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });

      logger.info('Browser initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize browser: ${error.message}`);
      return false;
    }
  }

  async loginToSkool() {
    try {
      logger.info('Attempting to login to Skool...');
      
      if (!process.env.SKOOL_EMAIL || !process.env.SKOOL_PASSWORD) {
        throw new Error('SKOOL_EMAIL and SKOOL_PASSWORD environment variables are required');
      }

      // Navigate to Skool login page
      await this.page.goto('https://www.skool.com/login', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Human-like random delay
      await this.page.waitForTimeout(2000 + Math.random() * 1000);

      // Fill login form with human-like typing delays
      await this.page.click('#email');
      await this.page.waitForTimeout(300 + Math.random() * 200);
      await this.page.type('#email', process.env.SKOOL_EMAIL, { delay: 50 + Math.random() * 50 });
      await this.page.waitForTimeout(800 + Math.random() * 400);
      
      await this.page.click('#password');
      await this.page.waitForTimeout(200 + Math.random() * 200);
      await this.page.type('#password', process.env.SKOOL_PASSWORD, { delay: 60 + Math.random() * 40 });
      await this.page.waitForTimeout(500 + Math.random() * 500);

      // Click login button
      await this.page.click('button[type="submit"]');
      
      // Wait a bit and check what happened
      await this.page.waitForTimeout(3000);
      
      // Log current URL for debugging
      const currentUrl = this.page.url();
      logger.info(`Current URL after login attempt: ${currentUrl}`);
      
      // Check if there are any error messages
      const errorMessages = await this.page.$$eval('[class*="error"], [class*="Error"], .error-message', 
        elements => elements.map(el => el.textContent?.trim()).filter(text => text)
      ).catch(() => []);
      
      if (errorMessages.length > 0) {
        logger.error(`Login errors found: ${errorMessages.join(', ')}`);
        throw new Error(`Login failed with errors: ${errorMessages.join(', ')}`);
      }
      
      // Check if we're still on login page
      if (currentUrl.includes('/login')) {
        // Take a screenshot for debugging (if needed)
        logger.error('Still on login page after form submission');
        throw new Error('Login form submission did not redirect - check credentials');
      }
      
      // If we got here, login was likely successful
      logger.info('Login appears successful, checking for user indicators...');
      
      // Try to find any logged-in indicator (be more flexible)
      try {
        await this.page.waitForSelector('a[href*="profile"], a[href*="settings"], [class*="avatar"], [class*="user"], [data-testid*="user"]', { 
          timeout: 5000 
        });
      } catch (selectorError) {
        logger.warn('Could not find specific user indicator, but URL suggests login success');
      }
      
      logger.info('Successfully logged in to Skool');
      this.isLoggedIn = true;
      return true;

    } catch (error) {
      logger.error(`Login failed: ${error.message}`);
      this.isLoggedIn = false;
      return false;
    }
  }

  async navigateToMembersList(community) {
    try {
      const communityUrls = {
        ultra: `https://www.skool.com/ultra/-/members`,
        vagus: `https://www.skool.com/vagus/-/members`
      };

      const url = communityUrls[community];
      if (!url) {
        throw new Error(`Unknown community: ${community}`);
      }

      logger.info(`Navigating to ${community} members list...`);
      
      await this.page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      await this.page.waitForTimeout(5000);

      // Check current URL to see if we got redirected or have access issues
      const currentUrl = this.page.url();
      logger.info(`Current URL after navigation: ${currentUrl}`);
      
      // Check if we were redirected to an access denied or login page
      if (currentUrl.includes('/login') || currentUrl.includes('/denied') || currentUrl.includes('/error')) {
        throw new Error(`Access denied to ${community} community. Current URL: ${currentUrl}`);
      }

      // Wait for members list to load using the correct selector from HTML
      try {
        await this.page.waitForSelector('.styled__MemberItemWrapper-sc-qwyv4g-0, [class*="MemberItemWrapper"]', { 
          timeout: 10000 
        });
        logger.info(`Successfully navigated to ${community} members list`);
        return true;
      } catch (selectorError) {
        // Log page content for debugging
        const pageContent = await this.page.content();
        logger.error(`Member elements not found. Page title: ${await this.page.title()}`);
        logger.error(`Current URL: ${currentUrl}`);
        
        // Check if there's an access message or error
        const errorMessage = await this.page.$eval('body', el => el.textContent).catch(() => 'Unable to read page content');
        if (errorMessage.includes('access') || errorMessage.includes('permission') || errorMessage.includes('member')) {
          throw new Error(`No access to ${community} community members list`);
        }
        
        throw selectorError;
      }

    } catch (error) {
      logger.error(`Failed to navigate to ${community} members list: ${error.message}`);
      return false;
    }
  }

  async extractMembersList(community, limit = null) {
    try {
      logger.info(`Extracting members from ${community} community${limit ? ` (limit: ${limit})` : ''}...`);
      
      const members = [];
      let currentPage = 1;
      let hasMorePages = true;
      const targetLimit = limit || Infinity;

      while (hasMorePages && members.length < targetLimit) {
        logger.info(`Processing page ${currentPage} of ${community} members...`);

        // Wait for member cards to load using correct selector
        await this.page.waitForSelector('.styled__MemberItemWrapper-sc-qwyv4g-0, [class*="MemberItemWrapper"]', { 
          timeout: 10000 
        });

        // Extract member cards from current page using the actual HTML structure
        const pageMembers = await this.page.evaluate(() => {
          // Use the correct selector for member items
          const memberElements = document.querySelectorAll('.styled__MemberItemWrapper-sc-qwyv4g-0, [class*="MemberItemWrapper"]');

          return Array.from(memberElements).map((element, index) => {
            // Extract name from the correct location
            const nameElement = element.querySelector('.styled__UserNameText-sc-24o0l3-1 span, [class*="UserNameText"] span');
            
            // Extract username/handle from the link
            const usernameElement = element.querySelector('a[class*="UserNameLink"], a[href*="@"]');
            
            // Extract bio/description
            const descriptionElement = element.querySelector('.styled__MemberBio-sc-qwyv4g-6, [class*="MemberBio"]');
            
            // 📧 EXTRACT REAL EMAIL from members list
            let email = '';
            
            // Look for email in various possible locations within the member card
            const emailSelectors = [
              // Common email patterns in Skool member lists
              'span:contains("@")',
              '[class*="email"]',
              '[class*="Email"]', 
              'div:contains("@")',
              // Member info items that might contain emails
              '[class*="MemberInfoItem"] span',
              '[class*="memberInfo"] span',
              // Text content that looks like an email
              'span, div, p'
            ];
            
            // Search through all text content for email patterns
            const allTextElements = element.querySelectorAll('span, div, p');
            for (const textEl of allTextElements) {
              const text = textEl.textContent?.trim() || '';
              
              // Email regex pattern
              const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
              if (emailMatch) {
                email = emailMatch[0];
                break; // Use first valid email found
              }
            }
            
            // 🖼️ EXTRACT PROFILE PHOTO
            let profilePhotoUrl = '';
            const photoElement = element.querySelector('img[class*="avatar"], img[class*="Avatar"], img[class*="profile"], img[src*="avatar"]');
            if (photoElement) {
              profilePhotoUrl = photoElement.src || photoElement.getAttribute('src') || '';
            }
            
            // Extract subscription info from the member info area
            const memberInfoItems = element.querySelectorAll('[class*="MemberInfoItem"] span');
            let price = '';
            let renewalInfo = '';
            let joinedInfo = '';
            
            memberInfoItems.forEach(span => {
              const text = span.textContent.trim();
              if (text.includes('$') && text.includes('month')) {
                price = text;
              } else if (text.includes('Renews in') || text.includes('days')) {
                renewalInfo = text;
              } else if (text.includes('Joined')) {
                joinedInfo = text;
              }
            });
            
            return {
              index,
              name: nameElement ? nameElement.textContent.trim() : '',
              username: usernameElement ? usernameElement.textContent.trim() : '',
              handle: usernameElement ? usernameElement.getAttribute('href') : '',
              description: descriptionElement ? descriptionElement.textContent.trim() : '',
              email: email, // Real email extracted from DOM
              profilePhotoUrl: profilePhotoUrl, // Profile photo URL
              price,
              renewalInfo,
              joinedInfo,
              elementIndex: index
            };
          });
        });

        logger.info(`Found ${pageMembers.length} members on page ${currentPage}`);

        // Process each member and add community info
        const processedMembers = pageMembers.map(member => {
          // Determine subscription status from renewal info
          let subscriptionStatus = 'unknown';
          if (member.renewalInfo.includes('Renews in')) {
            subscriptionStatus = 'active';
          } else if (member.renewalInfo.includes('Churns in') || member.renewalInfo.includes('Cancelled')) {
            subscriptionStatus = 'cancelled';
          }
          
          // Parse join date from joinedInfo (e.g., "Joined Jun 14, 2025")
          let joinedDate = null;
          if (member.joinedInfo) {
            const joinedMatch = member.joinedInfo.match(/Joined\s+(.+)/i);
            if (joinedMatch) {
              joinedDate = new Date(joinedMatch[1]);
            }
          }
          
          // 📧 VALIDATION: Ensure we have a valid email
          let validEmail = member.email || '';
          if (!validEmail || !validEmail.includes('@')) {
            logger.warn(`No valid email found for member: ${member.name} in ${community}`);
            // For members without emails, we'll skip them or mark for manual review
            validEmail = ''; // Don't create placeholder emails
          }
          
          // Create member details with available info
          return {
            ...member,
            community,
            subscriptionStatus,
            joinedDate,
            lastChecked: new Date(),
            email: validEmail, // Use real extracted email only
            hasValidEmail: !!validEmail && validEmail.includes('@'),
            hasProfilePhoto: !!member.profilePhotoUrl
          };
        });
        
        // Sort by join date (most recent first) and take the limit
        processedMembers.sort((a, b) => {
          if (!a.joinedDate && !b.joinedDate) return 0;
          if (!a.joinedDate) return 1;
          if (!b.joinedDate) return -1;
          return b.joinedDate - a.joinedDate; // Most recent first
        });
        
        // Process each member individually with enhanced email extraction
        for (let i = 0; i < Math.min(processedMembers.length, targetLimit - members.length); i++) {
          const memberDetails = processedMembers[i];
          
          logger.info(`Processing member ${members.length + 1}/${targetLimit}: ${memberDetails.name}...`);
          
          // 📧 ENHANCED EMAIL EXTRACTION: Click Membership button for each member
          const memberWithEnhancedEmail = await this.extractMembershipDetails(memberDetails, i, community);
          
          // 🖼️ DOWNLOAD PROFILE PHOTO if available
          const memberWithPhoto = await this.processMemberWithPhoto(memberWithEnhancedEmail, community);
          
          members.push(memberWithPhoto);
          
          // Enhanced logging with email and photo status
          const emailStatus = memberWithPhoto.hasValidEmail ? '✅' : '❌';
          const photoStatus = memberWithPhoto.photoDownloaded ? '🖼️' : '🚫';
          const joinedStr = memberWithPhoto.joinedDate ? memberWithPhoto.joinedDate.toDateString() : 'unknown';
          
          logger.info(`✅ Processed member ${members.length}/${targetLimit}: ${memberWithPhoto.name} | Email: ${emailStatus} ${memberWithPhoto.email || 'none'} | Photo: ${photoStatus} | Joined: ${joinedStr}`);
          
          // Small delay between member processing to avoid overwhelming the UI
          await this.page.waitForTimeout(1000);
        }

        // Check if we've reached our limit or if there are more pages
        if (members.length >= targetLimit) {
          logger.info(`Reached target limit of ${targetLimit} members`);
          break;
        }

        hasMorePages = await this.checkForNextPage();
        if (hasMorePages) {
          await this.goToNextPage();
          currentPage++;
          await this.page.waitForTimeout(3000); // Wait between pages
        }
      }

      logger.info(`Successfully extracted ${members.length} members from ${community} community`);
      return members;

    } catch (error) {
      logger.error(`Failed to extract members from ${community}: ${error.message}`);
      return [];
    }
  }

  async extractMemberDetails(member, community) {
    try {
      // Click on member to open detailed view/modal
      const memberElements = await this.page.$$('[data-testid="member-card"], .member-item, .member-card');
      
      if (memberElements[member.elementIndex]) {
        await memberElements[member.elementIndex].click();
        await this.page.waitForTimeout(2000);

        // Look for membership button or details
        const membershipButton = await this.page.$('button:has-text("Membership"), [class*="membership"], [class*="Membership"]');
        
        if (membershipButton) {
          await membershipButton.click();
          await this.page.waitForTimeout(2000);
        }

        // Extract detailed membership information
        const details = await this.page.evaluate(() => {
          // Look for email
          const emailSelectors = [
            'input[type="email"]',
            '[class*="email"]',
            'text*="@"'
          ];
          
          let email = '';
          for (const selector of emailSelectors) {
            const emailElement = document.querySelector(selector);
            if (emailElement) {
              email = emailElement.value || emailElement.textContent || '';
              if (email.includes('@')) break;
            }
          }

          // Look for subscription status
          const statusText = document.body.textContent.toLowerCase();
          let subscriptionStatus = 'unknown';
          let renewalDate = null;
          let churnDate = null;

          if (statusText.includes('renews in') || statusText.includes('active')) {
            subscriptionStatus = 'active';
            // Try to extract renewal date
            const renewsMatch = statusText.match(/renews in (\d+) days?/);
            if (renewsMatch) {
              const daysUntilRenewal = parseInt(renewsMatch[1]);
              renewalDate = new Date();
              renewalDate.setDate(renewalDate.getDate() + daysUntilRenewal);
            }
          } else if (statusText.includes('cancelled') || statusText.includes('churns in')) {
            subscriptionStatus = 'cancelled';
            // Try to extract churn date
            const churnMatch = statusText.match(/churns in (\d+) days?/);
            if (churnMatch) {
              const daysUntilChurn = parseInt(churnMatch[1]);
              churnDate = new Date();
              churnDate.setDate(churnDate.getDate() + daysUntilChurn);
            }
          }

          // Look for price information
          const priceMatch = statusText.match(/\$(\d+(?:\.\d{2})?)/);
          const membershipPrice = priceMatch ? parseFloat(priceMatch[1]) : null;

          // Look for join date
          const joinedMatch = statusText.match(/joined.+?(\d{1,2}\/\d{1,2}\/\d{4}|\w+ \d{1,2}, \d{4})/i);
          let joinedDate = null;
          if (joinedMatch) {
            joinedDate = new Date(joinedMatch[1]);
          }

          return {
            email: email.trim(),
            subscriptionStatus,
            membershipPrice,
            renewalDate,
            churnDate,
            joinedDate
          };
        });

        // Close modal/go back
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(1000);

        return {
          ...member,
          ...details,
          community,
          lastChecked: new Date()
        };
      }

      return null;

    } catch (error) {
      logger.warn(`Failed to extract member details: ${error.message}`);
      return null;
    }
  }

  async checkForNextPage() {
    try {
      // Look for next page button or pagination
      const nextButton = await this.page.$('button:has-text("Next"), [class*="next"], [aria-label*="next"]');
      return nextButton !== null;
    } catch (error) {
      return false;
    }
  }

  async goToNextPage() {
    try {
      const nextButton = await this.page.$('button:has-text("Next"), [class*="next"], [aria-label*="next"]');
      if (nextButton) {
        await nextButton.click();
        await this.page.waitForTimeout(3000);
        return true;
      }
      return false;
    } catch (error) {
      logger.warn(`Failed to go to next page: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract detailed membership information by clicking Membership button
   * @param {Object} member - Basic member data
   * @param {number} memberIndex - Index of member in the list
   * @param {string} community - Community name
   * @returns {Object} - Enhanced member data with email from modal
   */
  async extractMembershipDetails(member, memberIndex, community) {
    try {
      logger.info(`📧 Extracting email for ${member.name} via Membership modal...`);
      
      // Find all member cards on the current page
      const memberCards = await this.page.$$('.styled__MemberItemWrapper-sc-qwyv4g-0, [class*="MemberItemWrapper"]');
      
      if (memberIndex >= memberCards.length) {
        logger.warn(`Member index ${memberIndex} out of range for ${member.name}`);
        return { ...member, modalEmailExtracted: false };
      }
      
      const memberCard = memberCards[memberIndex];
      
      // Look for the Membership button within this specific member card
      const membershipButton = await memberCard.$('button:has-text("Membership"), button[class*="ButtonWrapper"]:has-text("Membership")');
      
      if (!membershipButton) {
        logger.warn(`No Membership button found for ${member.name}`);
        return { ...member, modalEmailExtracted: false };
      }
      
      // Click the Membership button to open modal
      await membershipButton.click();
      logger.info(`🔘 Clicked Membership button for ${member.name}`);
      
      // Wait for modal to appear
      await this.page.waitForTimeout(2000);
      
      // Wait for the modal to be visible
      try {
        await this.page.waitForSelector('.styled__TabModalDesktop-sc-1p35nnr-1, [class*="TabModalDesktop"]', { 
          timeout: 5000 
        });
      } catch (modalError) {
        logger.warn(`Modal did not appear for ${member.name}: ${modalError.message}`);
        return { ...member, modalEmailExtracted: false };
      }
      
      // Extract email from the modal
      const modalEmail = await this.page.evaluate(() => {
        // Look for the membership info with Email label
        const emailInfoElements = document.querySelectorAll('.styled__MembershipInfo-sc-gmyn28-1, [class*="MembershipInfo"]');
        
        for (const element of emailInfoElements) {
          const label = element.querySelector('label');
          const span = element.querySelector('span');
          
          if (label && span && label.textContent.trim().toLowerCase().includes('email')) {
            const email = span.textContent.trim();
            // Validate email format
            if (email && email.includes('@')) {
              return email;
            }
          }
        }
        
        return null;
      });
      
      // Extract additional details from modal if available
      const modalDetails = await this.page.evaluate(() => {
        const details = {};
        
        // Look for subscription info items
        const subscriptionItems = document.querySelectorAll('.styled__SubscriptionInfoItem-sc-gmyn28-7, [class*="SubscriptionInfoItem"]');
        
        subscriptionItems.forEach(item => {
          const text = item.textContent.trim();
          if (text.includes('Joined')) {
            details.joinedInfo = text;
          } else if (text.includes('$') || text.toLowerCase().includes('free')) {
            details.subscriptionType = text;
          }
        });
        
        // Look for role info
        const roleElement = document.querySelector('[class*="MembershipInfo"] span:contains("Member"), [class*="MembershipInfo"] span:contains("Admin")');
        if (roleElement) {
          details.role = roleElement.textContent.trim();
        }
        
        return details;
      });
      
      // Close modal by pressing Escape
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(1000); // Wait for modal to close
      
      logger.info(`📧 Email extraction for ${member.name}: ${modalEmail ? '✅ ' + modalEmail : '❌ not found'}`);
      
      // Return enhanced member data
      return {
        ...member,
        email: modalEmail || member.email || '', // Use modal email if found, fallback to original
        hasValidEmail: !!(modalEmail && modalEmail.includes('@')),
        modalEmailExtracted: !!modalEmail,
        modalDetails: modalDetails,
        extractionMethod: modalEmail ? 'membership_modal' : 'members_list'
      };
      
    } catch (error) {
      logger.error(`Failed to extract membership details for ${member.name}: ${error.message}`);
      
      // Try to close any open modal
      try {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
      } catch (escapeError) {
        // Ignore escape errors
      }
      
      return {
        ...member,
        modalEmailExtracted: false,
        extractionError: error.message
      };
    }
  }

  /**
   * Download and store profile photo from Skool
   * @param {string} photoUrl - URL of the profile photo
   * @param {string} memberHandle - Member's unique handle for naming
   * @param {string} community - Community name (ultra/vagus)
   * @returns {string|null} - Local file path or null if failed
   */
  async downloadProfilePhoto(photoUrl, memberHandle, community) {
    try {
      if (!photoUrl || !photoUrl.startsWith('http')) {
        logger.warn(`Invalid photo URL: ${photoUrl}`);
        return null;
      }

      // Create directory structure if it doesn't exist
      const photoDir = path.join(__dirname, '../../public/profile-photos/skool', community);
      await fs.mkdir(photoDir, { recursive: true });

      // Generate unique filename
      const timestamp = Date.now();
      const cleanHandle = memberHandle.replace(/[/@\-\?]/g, '_').slice(0, 20); // Sanitize and limit length
      const filename = `user_${cleanHandle}_${timestamp}.jpg`;
      const filepath = path.join(photoDir, filename);

      // Download photo using the page context (to maintain session)
      const response = await this.page.goto(photoUrl, { waitUntil: 'domcontentloaded' });
      
      if (!response || !response.ok()) {
        throw new Error(`Failed to fetch photo: ${response?.status()}`);
      }

      const buffer = await response.body();
      
      // Save to disk
      await fs.writeFile(filepath, buffer);
      
      // Return relative path for database storage
      const relativePath = `/profile-photos/skool/${community}/${filename}`;
      logger.info(`Photo downloaded: ${photoUrl} -> ${relativePath}`);
      
      return relativePath;
      
    } catch (error) {
      logger.error(`Failed to download profile photo from ${photoUrl}: ${error.message}`);
      return null;
    }
  }

  /**
   * Process member and download their profile photo
   * @param {Object} member - Member data object
   * @param {string} community - Community name
   * @returns {Object} - Updated member data with photo path
   */
  async processMemberWithPhoto(member, community) {
    try {
      let profilePhotoPath = null;
      
      if (member.profilePhotoUrl && member.handle) {
        profilePhotoPath = await this.downloadProfilePhoto(
          member.profilePhotoUrl, 
          member.handle,
          community
        );
        
        // Add small delay to avoid overwhelming the server
        await this.page.waitForTimeout(500);
      }

      return {
        ...member,
        profilePhotoPath,
        photoDownloaded: !!profilePhotoPath,
        photoDownloadedAt: profilePhotoPath ? new Date() : null
      };
      
    } catch (error) {
      logger.error(`Failed to process member photo for ${member.name}: ${error.message}`);
      return {
        ...member,
        profilePhotoPath: null,
        photoDownloaded: false,
        photoDownloadedAt: null
      };
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        logger.info('Browser closed successfully');
      }
    } catch (error) {
      logger.error(`Failed to close browser: ${error.message}`);
    }
  }
}

export default SkoolBrowserService;