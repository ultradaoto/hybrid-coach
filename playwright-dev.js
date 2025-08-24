#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Interactive Playwright Development Mode for Skool Bot
 * This script opens a browser with inspector tools to help you:
 * 1. Find the best selectors for Skool elements
 * 2. Test interactions in real-time
 * 3. Build a selector repository
 * 4. Debug your bot logic step by step
 */

class SkoolPlaywrightDev {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.selectors = {};
  }

  async initialize() {
    console.log('🎬 Starting Playwright Development Mode...');
    console.log('💡 This will open a browser with interactive tools');
    
    // Launch browser with development settings
    this.browser = await chromium.launch({
      headless: false,          // SEE what's happening
      devtools: true,          // F12 console access
      slowMo: 100,            // Slow down actions to see them
      args: [
        '--start-maximized',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    // Create context with fresh session (no stored auth to avoid wrong account)
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      // Start with clean session - no storageState to avoid wrong account
      recordVideo: {
        dir: './playwright-videos/',
        size: { width: 1920, height: 1080 }
      }
    });

    this.page = await this.context.newPage();

    // Load existing selectors if available
    await this.loadSelectors();

    // Inject helper functions into the page
    await this.setupPageHelpers();

    console.log('✅ Browser initialized with development tools');
    return true;
  }

  async setupPageHelpers() {
    // Expose selector saving function to browser console
    await this.page.exposeFunction('saveSelector', async (name, selector, description = '') => {
      this.selectors[name] = {
        selector,
        description,
        timestamp: new Date().toISOString()
      };
      
      console.log(`💾 Saved selector: "${name}" -> "${selector}"`);
      if (description) console.log(`   📝 Description: ${description}`);
      
      await this.saveSelectors();
    });

    // Expose selector testing function
    await this.page.exposeFunction('testSelector', async (selector) => {
      try {
        const elements = await this.page.$$(selector);
        console.log(`🔍 Selector "${selector}" found ${elements.length} elements`);
        
        if (elements.length > 0) {
          // Highlight the first element
          await this.page.locator(selector).first().highlight();
          
          // Get element info
          const elementInfo = await this.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) {
              return {
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                text: el.textContent?.substring(0, 100),
                attributes: Array.from(el.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ')
              };
            }
            return null;
          }, selector);
          
          console.log('📋 Element info:', elementInfo);
        }
        
        return elements.length;
      } catch (error) {
        console.error(`❌ Error testing selector "${selector}":`, error.message);
        return 0;
      }
    });

    // Inject enhanced client-side helper functions with custom right-click menu
    await this.page.addInitScript(() => {
      let currentElement = null;
      let customMenu = null;

      // Skool element types for the right-click menu
      const ELEMENT_TYPES = {
        // Mail Icon States (DMs/Messages)
        'mail-icon-normal': '📧 Mail Icon (Normal - No Unread Messages)',
        'mail-icon-unread': '🔴 Mail Icon (With Red Badge + Number)',
        'mail-unread-badge': '🔴 Mail Unread Count Badge (Red Circle)',
        'mail-unread-number': '🔢 Mail Unread Message Count Number',
        
        // Notifications Icon States (Different from Mail!)
        'notifications-icon-normal': '🔔 Notifications Icon (No New Notifications)', 
        'notifications-icon-unread': '🔴 Notifications Icon (With Red Badge + Number)',
        'notifications-unread-badge': '🔴 Notifications Unread Count Badge (Red Circle)',
        'notifications-unread-number': '🔢 Notifications Unread Count Number',
        
        // Chat Interface
        'chat-open-button': '💬 Chat Open Button',
        'chat-close-button': '❌ Chat Close Button (X in top-right corner)', 
        'chat-modal-close': '❌ Chat Modal Close Button (X button on modal)',
        'chat-modal-background': '🖼️ Chat Modal Background (click to close)',
        'chat-window': '🪟 Chat Window Container',
        'chat-popup': '📋 Chat Popup Container',
        
        // Message Direction (Critical for Bot Logic)
        'message-sent-by-us': '➡️ Message Sent BY My Ultra Coach',
        'message-received-from-user': '⬅️ Message Received FROM Other User',
        'our-message-bubble': '🟦 Our Message Bubble (My Ultra Coach)',
        'their-message-bubble': '⬜ Their Message Bubble (Other User)',
        
        // Message Elements  
        'message-input': '📝 Message Input Field',
        'message-text': '💭 Message Text Content',
        'message-bubble': '💬 Message Bubble Container',
        'message-header': '📋 Message Header (name + time)',
        
        // Conversation List States
        'conversation-item': '📄 Conversation List Item',
        'conversation-preview': '👁️ Conversation Preview Text',
        'conversation-unread': '🔴 Unread Conversation Item',
        'conversation-read': '✅ Read Conversation Item',
        'unread-indicator': '🔴 Unread Message Indicator',
        
        // User Elements
        'user-avatar-us': '👤 My Ultra Coach Avatar',
        'user-avatar-them': '👥 Other User Avatar',
        'username-us': '🏷️ My Ultra Coach Username',
        'username-them': '🏷️ Other User Username',
        'profile-link': '🔗 Profile Link',
        
        // Profile Page Elements (for scraping user data)
        'profile-box': '📦 Profile Information Box/Container (entire profile section)',
        'profile-real-name': '👤 Profile Real Name (e.g., "Sterling Cooley")',
        'profile-skool-id': '🆔 Profile Skool ID (e.g., "@sterling-cooley")',
        'profile-bio-description': '📄 Profile Bio/Description (e.g., "Neuro and data nerd...")',
        'profile-display-name': '🏷️ Profile Display Name/Title',
        'profile-user-info': '📋 Profile User Information Section',
        'profile-about-section': '📖 Profile About/Bio Section',
        'profile-header': '📄 Profile Header Area',
        'profile-main-content': '📝 Profile Main Content Area',
        'profile-avatar': '🖼️ Profile Avatar/Picture',
        'profile-title-heading': '🎯 Profile Title/Main Heading (h1, h2)',
        'profile-subtitle': '📝 Profile Subtitle (secondary text)',
        'profile-metadata': '📊 Profile Metadata (joined date, stats, etc.)',
        'profile-admin-badge': '⭐ Admin Badge/Special Status Indicator',
        'profile-group-admin-info': '👑 Group Admin Information (admin-specific)',
        'profile-regular-user-info': '👥 Regular User Information (non-admin)',
        'profile-personal-bio': '💬 Personal Bio Text (not group description)',
        'profile-group-description': '🏢 Group Description Text (admin profiles)',
        'profile-stats-section': '📈 Profile Stats Section (followers, posts, etc.)',
        
        // Timestamp Types (Important Distinction)
        'timestamp-date': '📅 Date Timestamp (e.g., "Dec 25, 2024")',
        'timestamp-time': '🕐 Time Timestamp (e.g., "10:30pm")',
        'timestamp-relative': '⏰ Relative Time (e.g., "2h ago")',
        
        // Message Status
        'read-status': '✓ Message Read Status',
        'delivered-status': '📬 Message Delivered Status',
        'typing-indicator': '⌨️ Typing Indicator',
        
        // Navigation & UI
        'navigation-menu': '🧭 Navigation Menu',
        'back-button': '⬅️ Back Button',
        'loading-indicator': '⏳ Loading Spinner',
        'modal-dialog': '📋 Modal Dialog',
        'close-button': '❌ Close Button',
        'dropdown-menu': '📋 Dropdown Menu',
        
        // Login Elements
        'login-email': '📧 Login Email Field',
        'login-password': '🔒 Login Password Field',
        'login-submit': '🚀 Login Submit Button',
        
        // Special Detection Elements
        'logged-out-indicator': '🚪 Logged Out Indicator',
        'login-required': '🔐 Login Required Element'
      };

      // Helper to generate multiple selector options for an element
      window.getSelectors = (element) => {
        const selectors = [];
        
        // ID selector
        if (element.id) {
          selectors.push(`#${element.id}`);
        }
        
        // Class selectors
        if (element.className && typeof element.className === 'string') {
          const classes = element.className.split(' ').filter(c => c.length > 0);
          classes.forEach(cls => {
            selectors.push(`.${cls}`);
          });
        } else if (element.classList && element.classList.length > 0) {
          // Handle SVG elements or elements with classList instead of className string
          Array.from(element.classList).forEach(cls => {
            selectors.push(`.${cls}`);
          });
        }
        
        // Attribute selectors
        ['aria-label', 'data-testid', 'role', 'type', 'placeholder'].forEach(attr => {
          const value = element.getAttribute(attr);
          if (value) {
            selectors.push(`[${attr}="${value}"]`);
          }
        });
        
        // Text-based selectors
        const text = element.textContent?.trim();
        if (text && text.length < 50) {
          selectors.push(`text="${text}"`);
          selectors.push(`:has-text("${text}")`);
        }
        
        return selectors;
      };

      // Enhanced element analysis with detailed context
      window.analyzeElement = (element) => {
        const analysis = {
          basic: {
            tagName: element.tagName,
            id: element.id || 'none',
            className: element.className || 'none',
            textContent: element.textContent?.trim().substring(0, 100) || 'none',
            innerHTML: element.innerHTML?.substring(0, 200) || 'none'
          },
          position: {
            boundingRect: element.getBoundingClientRect(),
            offsetParent: element.offsetParent?.tagName || 'none',
            scrollPosition: { top: element.scrollTop, left: element.scrollLeft },
            clientSize: { width: element.clientWidth, height: element.clientHeight }
          },
          attributes: {},
          styling: {
            backgroundColor: window.getComputedStyle(element).backgroundColor,
            color: window.getComputedStyle(element).color,
            display: window.getComputedStyle(element).display,
            position: window.getComputedStyle(element).position,
            zIndex: window.getComputedStyle(element).zIndex,
            cursor: window.getComputedStyle(element).cursor,
            visibility: window.getComputedStyle(element).visibility
          },
          hierarchy: {
            parentTag: element.parentElement?.tagName || 'none',
            parentClass: element.parentElement?.className || 'none',
            parentId: element.parentElement?.id || 'none',
            grandparentTag: element.parentElement?.parentElement?.tagName || 'none',
            grandparentClass: element.parentElement?.parentElement?.className || 'none',
            children: Array.from(element.children).map(child => ({
              tag: child.tagName,
              class: child.className,
              id: child.id,
              text: child.textContent?.trim().substring(0, 20)
            })),
            siblings: []
          },
          context: {
            nearbyText: '',
            nearbyImages: [],
            nearbyButtons: [],
            nearbySvgs: [],
            nearbyPaths: [],
            containsNumbers: false,
            hasRedStyling: false
          },
          mailIconAnalysis: {
            couldBeMail: false,
            reasons: [],
            pathCount: 0,
            hasRedElements: false,
            distanceFromSvg: null
          }
        };

        // Capture all attributes
        for (let attr of element.attributes) {
          analysis.attributes[attr.name] = attr.value;
        }

        // Analyze siblings
        if (element.parentElement) {
          analysis.hierarchy.siblings = Array.from(element.parentElement.children)
            .filter(sibling => sibling !== element)
            .map(sibling => ({
              tag: sibling.tagName,
              class: sibling.className,
              id: sibling.id,
              text: sibling.textContent?.trim().substring(0, 30)
            }));
        }

        // Check if element contains numbers (potential unread count)
        const text = element.textContent?.trim();
        if (text && /^\d+$/.test(text) && parseInt(text) < 100) {
          analysis.context.containsNumbers = true;
        }

        // Check for red styling (potential notification)
        const bgColor = analysis.styling.backgroundColor;
        const color = analysis.styling.color;
        const redPatterns = ['rgb(220, 38, 38)', 'rgb(239, 68, 68)', 'rgb(248, 113, 113)', 'rgb(255, 0, 0)', 'rgb(204, 0, 0)'];
        analysis.context.hasRedStyling = redPatterns.some(pattern => bgColor.includes(pattern) || color.includes(pattern));

        // Analyze nearby elements (within 150px)
        const rect = element.getBoundingClientRect();
        const allElements = Array.from(document.querySelectorAll('*'));
        
        allElements.forEach(el => {
          const elRect = el.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(rect.x - elRect.x, 2) + Math.pow(rect.y - elRect.y, 2)
          );
          
          if (distance < 150 && el !== element) {
            if (el.tagName === 'SVG') {
              const paths = el.querySelectorAll('path').length;
              analysis.context.nearbySvgs.push({
                distance: Math.round(distance),
                class: el.className,
                id: el.id,
                paths: paths,
                viewBox: el.getAttribute('viewBox'),
                fill: el.getAttribute('fill')
              });
              
              // Special analysis for potential mail icons
              if (distance < 50) {
                analysis.mailIconAnalysis.distanceFromSvg = Math.round(distance);
                analysis.mailIconAnalysis.pathCount += paths;
              }
            } else if (el.tagName === 'PATH') {
              analysis.context.nearbyPaths.push({
                distance: Math.round(distance),
                d: el.getAttribute('d')?.substring(0, 50),
                fill: el.getAttribute('fill'),
                stroke: el.getAttribute('stroke')
              });
            } else if (el.tagName === 'BUTTON') {
              analysis.context.nearbyButtons.push({
                distance: Math.round(distance),
                class: el.className,
                text: el.textContent?.trim().substring(0, 20),
                type: el.getAttribute('type'),
                ariaLabel: el.getAttribute('aria-label')
              });
            } else if (el.tagName === 'IMG') {
              analysis.context.nearbyImages.push({
                distance: Math.round(distance),
                src: el.src?.substring(0, 50),
                alt: el.alt,
                class: el.className
              });
            }
          }
        });

        // Mail icon analysis
        const mailKeywords = ['mail', 'message', 'inbox', 'notification', 'chat'];
        const elementStr = (element.className + ' ' + element.id + ' ' + (element.getAttribute('aria-label') || '')).toLowerCase();
        
        if (mailKeywords.some(keyword => elementStr.includes(keyword))) {
          analysis.mailIconAnalysis.couldBeMail = true;
          analysis.mailIconAnalysis.reasons.push('Contains mail-related keywords');
        }
        
        if (element.tagName === 'SVG' || analysis.context.nearbySvgs.length > 0) {
          analysis.mailIconAnalysis.couldBeMail = true;
          analysis.mailIconAnalysis.reasons.push('Is or near SVG element');
        }
        
        if (analysis.context.hasRedStyling || analysis.context.containsNumbers) {
          analysis.mailIconAnalysis.couldBeMail = true;
          analysis.mailIconAnalysis.reasons.push('Has notification styling or numbers');
        }

        return analysis;
      };

      // Create custom context menu
      function createCustomMenu() {
        if (customMenu) {
          customMenu.remove();
        }

        customMenu = document.createElement('div');
        customMenu.id = 'skool-element-menu';
        customMenu.style.cssText = `
          position: fixed;
          background: white;
          border: 2px solid #4CAF50;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 10000;
          padding: 8px 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          min-width: 250px;
          max-height: 400px;
          overflow-y: auto;
        `;

        // Add header
        const header = document.createElement('div');
        header.style.cssText = `
          padding: 8px 16px;
          background: #4CAF50;
          color: white;
          font-weight: bold;
          margin-bottom: 4px;
        `;
        header.textContent = '🎭 Mark This Element As:';
        customMenu.appendChild(header);

        // Add menu items for each element type
        Object.entries(ELEMENT_TYPES).forEach(([key, label]) => {
          const item = document.createElement('div');
          item.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            transition: background-color 0.2s;
            border-bottom: 1px solid #eee;
          `;
          item.textContent = label;
          
          item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#f0f0f0';
          });
          
          item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'white';
          });
          
          item.addEventListener('click', () => {
            markElement(currentElement, key, label);
            hideCustomMenu();
          });
          
          customMenu.appendChild(item);
        });

        // Add separator and inspect option
        const separator = document.createElement('div');
        separator.style.cssText = `
          height: 1px;
          background: #ddd;
          margin: 4px 0;
        `;
        customMenu.appendChild(separator);

        const inspectItem = document.createElement('div');
        inspectItem.style.cssText = `
          padding: 8px 16px;
          cursor: pointer;
          color: #2196F3;
          font-style: italic;
        `;
        inspectItem.textContent = '🔍 Show Element Info';
        inspectItem.addEventListener('click', () => {
          showElementInfo(currentElement);
          hideCustomMenu();
        });
        customMenu.appendChild(inspectItem);

        document.body.appendChild(customMenu);
      }

      // Mark element with specific type
      function markElement(element, type, label) {
        if (!element) return;

        const selectors = getSelectors(element);
        const bestSelector = selectors[0] || element.tagName.toLowerCase();
        
        // Highlight the element
        element.style.outline = '3px solid #4CAF50';
        element.style.outlineOffset = '2px';
        
        // Add a floating label
        const floatingLabel = document.createElement('div');
        floatingLabel.style.cssText = `
          position: absolute;
          background: #4CAF50;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          z-index: 9999;
          pointer-events: none;
        `;
        floatingLabel.textContent = label;
        
        const rect = element.getBoundingClientRect();
        floatingLabel.style.left = (rect.left + window.scrollX) + 'px';
        floatingLabel.style.top = (rect.top + window.scrollY - 30) + 'px';
        document.body.appendChild(floatingLabel);
        
        // Remove label after 3 seconds
        setTimeout(() => {
          floatingLabel.remove();
          element.style.outline = '';
          element.style.outlineOffset = '';
        }, 3000);

        // Enhanced logging with detailed analysis
        const analysis = window.analyzeElement(element);
        
        console.log('🎯 Marked element as "' + label + '":');
        console.log('   Primary Selector: ' + bestSelector);
        console.log('   All Selectors: ', selectors);
        console.log('📊 DETAILED ANALYSIS:');
        console.log('   Basic:', analysis.basic);
        console.log('   Position: x=' + Math.round(analysis.position.boundingRect.x) + 
                   ', y=' + Math.round(analysis.position.boundingRect.y) + 
                   ', w=' + Math.round(analysis.position.boundingRect.width) + 
                   ', h=' + Math.round(analysis.position.boundingRect.height));
        console.log('   Parent: ' + analysis.hierarchy.parentTag + ' .' + analysis.hierarchy.parentClass);
        console.log('   Grandparent: ' + analysis.hierarchy.grandparentTag + ' .' + analysis.hierarchy.grandparentClass);
        console.log('   Nearby SVGs: ', analysis.context.nearbySvgs);
        console.log('   Nearby Paths: ', analysis.context.nearbyPaths);  
        console.log('   Nearby Buttons: ', analysis.context.nearbyButtons);
        console.log('   Mail Icon Analysis: ', analysis.mailIconAnalysis);
        console.log('   Styling: bg=' + analysis.styling.backgroundColor + ', color=' + analysis.styling.color);
        console.log('   Has Red Styling: ' + analysis.context.hasRedStyling);
        console.log('   Contains Numbers: ' + analysis.context.containsNumbers);
        console.log('   All Attributes: ', analysis.attributes);
        
        // Save comprehensive data
        const selectorData = {
          selector: bestSelector,
          alternativeSelectors: selectors,
          description: label + ' - marked via right-click menu',
          timestamp: new Date().toISOString(),
          analysis: analysis
        };
        
        // Call the save function with enhanced data
        window.saveSelector(type, selectorData);
      }

      // Show element information
      function showElementInfo(element) {
        if (!element) return;

        const selectors = getSelectors(element);
        const info = {
          tagName: element.tagName,
          id: element.id,
          className: element.className,
          textContent: element.textContent?.substring(0, 100),
          attributes: Array.from(element.attributes).map(attr => attr.name + '="' + attr.value + '"'),
          selectors: selectors
        };

        console.log('%c🔍 Element Information:', 'color: #2196F3; font-size: 16px; font-weight: bold;');
        console.log(info);
        
        // Show in a nice alert
        const message = 'Element: ' + info.tagName + '\\n' +
          'ID: ' + (info.id || 'none') + '\\n' +
          'Classes: ' + (info.className || 'none') + '\\n' +
          'Text: ' + (info.textContent || 'none') + '\\n' +
          'Best Selectors: ' + selectors.slice(0, 3).join(', ');
        
        alert(message);
      }

      // Show custom menu
      function showCustomMenu(e, element) {
        e.preventDefault();
        currentElement = element;
        createCustomMenu();
        
        customMenu.style.left = e.pageX + 'px';
        customMenu.style.top = e.pageY + 'px';
        
        // Adjust position if menu goes off screen
        const rect = customMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          customMenu.style.left = (e.pageX - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
          customMenu.style.top = (e.pageY - rect.height) + 'px';
        }
      }

      // Hide custom menu
      function hideCustomMenu() {
        if (customMenu) {
          customMenu.remove();
          customMenu = null;
        }
      }

      // Add event listeners
      document.addEventListener('contextmenu', (e) => {
        // Only show custom menu if Ctrl key is held
        if (e.ctrlKey) {
          showCustomMenu(e, e.target);
        }
      });

      document.addEventListener('click', (e) => {
        // Hide menu when clicking elsewhere
        if (customMenu && !customMenu.contains(e.target)) {
          hideCustomMenu();
        }
      });

      // Console styling and instructions
      console.log('%c🎭 Skool Bot Development Mode Active', 'color: #4CAF50; font-size: 16px; font-weight: bold;');
      console.log('%c📋 Instructions:', 'color: #2196F3; font-size: 14px; font-weight: bold;');
      console.log('%c  • Hold Ctrl + Right-click any element to mark it', 'color: #666; font-size: 12px;');
      console.log('%c  • Choose from the dropdown menu what type of element it is', 'color: #666; font-size: 12px;');
      console.log('%c  • Elements will be automatically saved to your selector repository', 'color: #666; font-size: 12px;');
      console.log('%c  • Use F12 console to see saved selectors', 'color: #666; font-size: 12px;');
      console.log('%c\n🎯 Try it: Hold Ctrl + Right-click on any button or input field!', 'color: #FF9800; font-style: italic;');
    });
  }

  async loadSelectors() {
    try {
      const data = await fs.readFile('skool-selectors.json', 'utf8');
      this.selectors = JSON.parse(data);
      console.log(`📂 Loaded ${Object.keys(this.selectors).length} existing selectors`);
    } catch (error) {
      console.log('📝 No existing selectors file found, starting fresh');
      this.selectors = {};
    }
  }

  async saveSelectors() {
    try {
      await fs.writeFile('skool-selectors.json', JSON.stringify(this.selectors, null, 2));
      console.log(`💾 Saved ${Object.keys(this.selectors).length} selectors to skool-selectors.json`);
    } catch (error) {
      console.error('❌ Error saving selectors:', error.message);
    }
  }

  async loginToSkool() {
    console.log('🔑 Logging into Skool...');
    
    if (!process.env.SKOOL_EMAIL || !process.env.SKOOL_PASSWORD) {
      throw new Error('Missing SKOOL_EMAIL or SKOOL_PASSWORD environment variables');
    }

    try {
      // Try to navigate to login page with retries
      let retries = 3;
      while (retries > 0) {
        try {
          await this.page.goto('https://www.skool.com/login', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
          });
          break;
        } catch (error) {
          retries--;
          console.log(`⚠️  Navigation attempt failed, ${retries} retries left...`);
          if (retries === 0) throw error;
          await this.page.waitForTimeout(2000);
        }
      }

      console.log('📄 Login page loaded');
      
      // Wait for form elements to be available
      await this.page.waitForSelector('#email', { timeout: 10000 });
      
      // Fill login form with delays
      await this.page.fill('#email', process.env.SKOOL_EMAIL);
      await this.page.waitForTimeout(500);
      
      await this.page.fill('#password', process.env.SKOOL_PASSWORD);
      await this.page.waitForTimeout(500);
      
      // Click submit and wait
      await this.page.click('button[type="submit"]');
      
      // Wait for navigation after login
      await this.page.waitForTimeout(5000);
      
      // Check if login was successful by looking at URL
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login')) {
        console.log('⚠️  Still on login page, login may have failed');
        console.log('🔍 Current URL:', currentUrl);
        // Continue anyway for manual debugging
      } else {
        console.log('✅ Login appears successful');
        console.log('🌐 Current URL:', currentUrl);
      }
      
      // Save authentication state
      await this.context.storageState({ path: 'skool-auth.json' });
      console.log('💾 Authentication state saved');
      
    } catch (error) {
      console.log('⚠️  Login error:', error.message);
      console.log('🔄 Continuing anyway - you can login manually...');
      
      // Navigate to main page instead
      try {
        await this.page.goto('https://www.skool.com', { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        console.log('📄 Navigated to main Skool page');
      } catch (navError) {
        console.log('❌ Could not navigate to Skool at all');
        throw navError;
      }
    }
  }

  async startInteractiveMode() {
    console.log('\n🎯 Starting Interactive Development Mode');
    console.log('📋 Instructions:');
    console.log('  1. Login manually if needed');
    console.log('  2. Hold Ctrl + Right-click any element to mark it');
    console.log('  3. Choose element type from the dropdown menu');
    console.log('  4. Use F12 to see console logs');
    console.log('  5. Press F8 or click Resume in Playwright Inspector to continue');
    console.log('  6. Press Ctrl+C to exit when done\n');

    try {
      // Try to navigate to your profile
      console.log('👤 Navigating to your profile...');
      await this.page.goto('https://www.skool.com/@my-ultra-coach-6588', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      console.log('✅ Profile page loaded');
    } catch (error) {
      console.log('⚠️  Could not load profile, starting at main page');
      try {
        await this.page.goto('https://www.skool.com', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
      } catch (mainError) {
        console.log('❌ Network issues - you may need to navigate manually');
      }
    }
    
    // Enable Playwright Inspector - this pauses execution and opens the inspector
    console.log('🔍 Opening Playwright Inspector...');
    console.log('🎯 Ready to mark elements! Hold Ctrl + Right-click on any element');
    await this.page.pause();
    
    // After resuming from pause, try to navigate to messages
    console.log('📥 Navigating to messages...');
    try {
      await this.page.goto('https://www.skool.com/messages', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      console.log('✅ Messages page loaded');
    } catch (error) {
      console.log('⚠️  Could not load messages page - navigate manually if needed');
    }
    
    // Another pause to explore messages
    console.log('🎯 Explore messages and mark elements! Hold Ctrl + Right-click');
    await this.page.pause();
    
    console.log('✅ Interactive session completed');
  }

  async close() {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    console.log('🔒 Browser closed');
  }

  // Helper method to take annotated screenshots
  async takeScreenshot(name, description = '') {
    const filename = `screenshot-${name}-${Date.now()}.png`;
    await this.page.screenshot({ 
      path: `./screenshots/${filename}`,
      fullPage: true 
    });
    
    console.log(`📸 Screenshot saved: ${filename}`);
    if (description) console.log(`   📝 ${description}`);
  }

  // Method to record a complete interaction flow
  async recordFlow(flowName) {
    console.log(`🎥 Starting flow recording: ${flowName}`);
    
    const actions = [];
    
    // Listen for page events
    this.page.on('click', async (event) => {
      actions.push({
        type: 'click',
        selector: await this.page.evaluate(() => window.getElementPath(document.activeElement)),
        timestamp: Date.now()
      });
    });

    await this.page.pause(); // Let user perform actions

    // Save the recorded flow
    await fs.writeFile(`flow-${flowName}.json`, JSON.stringify(actions, null, 2));
    console.log(`💾 Flow recorded and saved: flow-${flowName}.json`);
  }
}

// Main execution
async function main() {
  const dev = new SkoolPlaywrightDev();
  
  try {
    await dev.initialize();
    await dev.loginToSkool();
    await dev.startInteractiveMode();
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    await dev.close();
  }
}

// Handle cleanup
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

// Run it
main().catch(console.error);
