#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import http from 'http';
import url from 'url';

dotenv.config();

/**
 * Enhanced Playwright Workflow Manager for Skool Bot
 * Features:
 * 1. Visual workflow builder with drag & drop
 * 2. Real-time element tagging and preview
 * 3. Live editing of bot actions
 * 4. Step-by-step execution control
 */

class SkoolWorkflowManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.selectors = {};
    this.workflow = [];
  }

  async initialize() {
    console.log('🤖 Starting Enhanced Workflow Manager...');
    console.log('🎯 Visual workflow builder with drag & drop controls');
    
    // Start save server
    await this.startSaveServer();
    
    // Launch browser with development settings
    this.browser = await chromium.launch({
      headless: false,
      devtools: true,
      slowMo: 100,
      args: [
        '--start-maximized',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    // Load existing authentication if available
    let contextOptions = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      recordVideo: {
        dir: './playwright-videos/',
        size: { width: 1920, height: 1080 }
      }
    };

    // Try to use existing session
    try {
      const authPath = './skool-auth.json';
      await fs.access(authPath);
      contextOptions.storageState = authPath;
      console.log('🔐 Using existing Skool authentication');
    } catch {
      console.log('🆕 No existing auth found - you may need to login');
    }

    this.context = await this.browser.newContext(contextOptions);

    this.page = await this.context.newPage();

    // Load existing selectors
    await this.loadSelectors();

    // Inject enhanced workflow manager
    await this.injectWorkflowManager();

    console.log('🎬 Opening My Ultra Coach profile...');
    await this.page.goto('https://www.skool.com/@my-ultra-coach-6588');
    
    console.log('✅ Workflow Manager ready!');
    console.log('📋 Use the bottom-left panel to build your bot workflow');
    console.log('🎯 Ctrl + Right-click elements to tag them');
    console.log('🔍 Browser should be open - interact with the page');
    
    // Keep the page open for interaction - use a promise that never resolves
    await new Promise(() => {
      console.log('⏸️ Workflow Manager is running... Press Ctrl+C to exit');
    });
  }

  async injectWorkflowManager() {
    await this.page.addInitScript(() => {
      // Global state
      window.markedElements = {};
      window.botWorkflow = [
        { id: 1, type: 'monitor', target: 'blue-radio-polling', description: 'Monitor for blue unread indicators (poll every 10s)', selector: '.styled__BoxWrapper-sc-esqoz3-0.kxjOSJ', condition: 'wait_for_blue', status: 'pending', polling: true, interval: 10000 },
        { id: 2, type: 'find', target: 'blue-radio-unread', description: 'Find conversation with blue unread indicator', selector: '.styled__BoxWrapper-sc-esqoz3-0.kxjOSJ', condition: 'first_blue_unread', status: 'pending' },
        { id: 3, type: 'click', target: 'conversation-preview', description: 'Click preview text of conversation with blue indicator', selector: '.styled__MessageContent-sc-5xhq84-9', dynamic: true, status: 'pending' },
        { id: 4, type: 'wait', target: 'chat-window', description: 'Wait for chat window to open', delay: 2000, status: 'pending' },
        { id: 5, type: 'extract', target: 'user-info', description: 'Extract username and profile link', selector: '.styled__ChildrenLink-sc-1brgbbt-1', status: 'pending' },
        { id: 6, type: 'type', target: 'message-input', description: 'Type login message with unique code', selector: '.styled__MultiLineInput-sc-1saiqqb-2', text: 'I will have your link shortly. {generated_link}', status: 'pending' },
        { id: 7, type: 'click', target: 'send-button', description: 'Send the message', selector: 'button[type="submit"]', status: 'pending' },
        { id: 8, type: 'wait', target: 'message-sent', description: 'Wait for message to send', delay: 1000, status: 'pending' },
        { id: 9, type: 'close', target: 'chat-window', description: 'Close chat window', selector: '.styled__CloseButton-sc-1w5xk2o-0, button[aria-label*="close"], .close-button', status: 'pending' },
        { id: 10, type: 'check', target: 'profile-scraped', description: 'Check if user profile already scraped', condition: 'database_check', status: 'pending' },
        { id: 11, type: 'conditional', target: 'profile-scraping', description: 'IF not scraped: Click profile link', selector: '.styled__ChildrenLink-sc-1brgbbt-1', condition: 'if_not_scraped', status: 'pending' },
        { id: 12, type: 'extract', target: 'profile-data', description: 'Extract name, bio, skoolId from profile', selector: '.styled__UserCardWrapper-sc-1gipnml-15', condition: 'if_profile_opened', status: 'pending' },
        { id: 13, type: 'save', target: 'database', description: 'Save user data to Prisma database', condition: 'if_profile_scraped', status: 'pending' },
        { id: 14, type: 'navigate', target: 'return-monitoring', description: 'Return to MyUltra Coach profile for monitoring', selector: 'https://www.skool.com/@my-ultra-coach-6588', status: 'pending' },
        { id: 15, type: 'loop', target: 'monitoring', description: 'Return to step 1 - Continue monitoring', delay: 2000, status: 'pending', loop_to: 1 }
      ];

      let draggedItem = null;
      let currentElement = null;
      let customMenu = null;

      // Element types for tagging - ENHANCED for smart bot workflow
      const ELEMENT_TYPES = {
        // Mail Detection
        'mail-icon-normal': '📧 Mail Icon (Normal - No Unread)',
        'mail-icon-unread': '🔴 Mail Icon (With Unread Badge)',
        'mail-unread-badge': '🔴 Mail Unread Count Badge',
        
        // Conversation Detection  
        'blue-radio-button': '🔵 Blue Radio Button (UNREAD Indicator)',
        'conversation-unread-any': '🔴 ANY Unread Conversation Item',
        'conversation-read-any': '✅ ANY Read Conversation Item',
        'conversation-list-container': '📋 Conversation List Container',
        'conversation-preview-text': '👁️ Conversation Preview Text',
        
        // Chat Interface
        'message-input': '📝 Message Input Field',
        'send-button': '📤 Send Message Button',
        'chat-window': '🪟 Chat Window Container',
        'chat-close-button': '❌ Chat Close Button',
        
        // User Profile Elements
        'profile-link': '🔗 User Profile Link (clickable)',
        'username-display': '👤 Username Display Text',
        'profile-container': '📦 Profile Information Container',
        'profile-real-name': '🏷️ Profile Real Name',
        'profile-skool-id': '🆔 Profile Skool ID',
        'profile-bio': '📄 Profile Bio/Description',
        
        // Message Elements
        'our-message': '🟦 Our Sent Message',
        'their-message': '⬜ Their Received Message',
        'message-timestamp': '🕐 Message Timestamp',
        
        // Navigation
        'return-to-profile': '🏠 Return to MyUltra Coach Profile',
        'close-modal': '❌ Close Any Modal/Popup'
      };

      // Create workflow manager panel
      function createWorkflowPanel() {
        const panel = document.createElement('div');
        panel.id = 'workflow-manager';
        panel.style.cssText = `
          position: fixed;
          bottom: 20px;
          left: 20px;
          width: 400px;
          max-height: 600px;
          background: white;
          border: 2px solid #667eea;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          z-index: 10000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          overflow: hidden;
        `;

        panel.innerHTML = `
          <div id="panel-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px; cursor: move; user-select: none; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 14px; font-weight: 600;">🤖 Bot Workflow Manager</h3>
            <div>
              <button id="run-workflow" style="background: #28a745; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 8px; font-size: 11px;">▶ Run</button>
              <button id="toggle-panels" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 8px; font-size: 11px;">👁️</button>
              <button id="minimize-panel" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1; margin-right: 4px;">-</button>
              <button id="close-panel" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1;">×</button>
            </div>
          </div>
          
          <!-- Workflow Steps Panel -->
          <div id="workflow-panel" style="background: white; padding: 15px; border-bottom: 1px solid #eee; max-height: 300px; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <strong style="color: #333; font-size: 13px;">🎯 Bot Action Sequence</strong>
              <button id="add-step" style="background: #007bff; border: none; color: white; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;">+ Add</button>
            </div>
            <div id="workflow-steps" style="font-size: 11px;"></div>
          </div>
          
          <!-- Element Tagging Panel -->
          <div id="tagging-panel" style="background: #f8f9fa; padding: 15px; max-height: 200px; overflow-y: auto;">
            <div id="current-element" style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 6px; border-left: 4px solid #667eea;">
              <strong style="color: #333;">Ready to mark elements!</strong><br>
              <small style="color: #666;">Hold Ctrl + Right-click on any element</small>
            </div>
            <div id="marked-count" style="margin-bottom: 10px; font-size: 12px; color: #666; font-weight: 500;">
              Tagged: <span id="count">0</span> elements
            </div>
            <div id="marked-elements" style="font-size: 11px; max-height: 100px; overflow-y: auto;"></div>
          </div>
        `;

        document.body.appendChild(panel);
        return panel;
      }

      // Render workflow steps
      function renderWorkflow() {
        const container = document.getElementById('workflow-steps');
        if (!container) return;

        container.innerHTML = window.botWorkflow.map((step, index) => {
          const typeColors = {
            'monitor': '#e83e8c', // Pink for monitoring
            'check': '#17a2b8',
            'find': '#6f42c1', 
            'conditional': '#fd7e14',
            'extract': '#20c997',
            'save': '#28a745',
            'close': '#dc3545', // Red for close
            'loop': '#6c757d'
          };
          const typeColor = typeColors[step.type] || '#007bff';
          
          return `
          <div class="workflow-step" data-step-id="${step.id}" style="
            margin-bottom: 8px; 
            padding: 8px; 
            background: ${step.status === 'completed' ? '#d4edda' : step.status === 'running' ? '#fff3cd' : '#f8f9fa'}; 
            border: 1px solid ${step.status === 'completed' ? '#c3e6cb' : step.status === 'running' ? '#ffeaa7' : '#dee2e6'}; 
            border-left: 4px solid ${typeColor};
            border-radius: 4px; 
            cursor: grab;
            user-select: none;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="flex: 1;">
                <strong style="color: #333; color: ${typeColor};">${index + 1}. ${step.type.toUpperCase()}</strong>
                <div style="color: #666; font-size: 10px; margin-top: 2px;">${step.description}</div>
                ${step.condition ? `<div style="color: #e83e8c; font-size: 9px; font-style: italic; margin-top: 1px;">Condition: ${step.condition}</div>` : ''}
                ${step.selector && step.selector !== 'auto-detected' ? `<div style="color: #007bff; font-size: 9px; font-family: monospace; margin-top: 2px;">${step.selector}</div>` : ''}
                ${step.dynamic ? `<div style="color: #28a745; font-size: 8px; margin-top: 1px;">🤖 Dynamic Detection</div>` : ''}
              </div>
              <div>
                <button onclick="editWorkflowStep(${step.id})" style="background: #17a2b8; border: none; color: white; padding: 2px 4px; border-radius: 2px; cursor: pointer; font-size: 9px; margin-right: 2px;">✏️</button>
                <button onclick="deleteWorkflowStep(${step.id})" style="background: #dc3545; border: none; color: white; padding: 2px 4px; border-radius: 2px; cursor: pointer; font-size: 9px;">🗑️</button>
              </div>
            </div>
          </div>
        `;
        }).join('');

        // Add drag and drop
        const steps = container.querySelectorAll('.workflow-step');
        steps.forEach(step => {
          step.addEventListener('dragstart', (e) => {
            draggedItem = step;
            e.dataTransfer.effectAllowed = 'move';
          });
          step.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          });
          step.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedItem && draggedItem !== step) {
              reorderWorkflowSteps(draggedItem.dataset.stepId, step.dataset.stepId);
            }
          });
          step.draggable = true;
        });
      }

      // Reorder workflow steps
      window.reorderWorkflowSteps = function(draggedId, targetId) {
        const draggedIndex = window.botWorkflow.findIndex(s => s.id == draggedId);
        const targetIndex = window.botWorkflow.findIndex(s => s.id == targetId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
          const [draggedStep] = window.botWorkflow.splice(draggedIndex, 1);
          window.botWorkflow.splice(targetIndex, 0, draggedStep);
          renderWorkflow();
        }
      };

      // Edit workflow step
      window.editWorkflowStep = function(stepId) {
        const step = window.botWorkflow.find(s => s.id === stepId);
        if (!step) return;

        const newSelector = prompt('Edit selector:', step.selector || '');
        if (newSelector !== null) {
          step.selector = newSelector;
          renderWorkflow();
        }
      };

      // Delete workflow step
      window.deleteWorkflowStep = function(stepId) {
        if (confirm('Delete this step?')) {
          window.botWorkflow = window.botWorkflow.filter(s => s.id !== stepId);
          renderWorkflow();
        }
      };

      // Enhanced workflow execution with smart blue radio detection
      window.runWorkflow = async function() {
        console.log('🚀 Starting smart monitoring workflow...');
        let currentStepIndex = 0;
        
        while (currentStepIndex < window.botWorkflow.length) {
          const step = window.botWorkflow[currentStepIndex];
          step.status = 'running';
          renderWorkflow();
          
          try {
            if (step.type === 'monitor') {
              if (step.condition === 'wait_for_blue') {
                console.log('👁️ MONITORING: Checking for blue unread indicators...');
                
                // Check for blue radio buttons
                const blueRadios = document.querySelectorAll(step.selector);
                let foundUnread = false;
                
                // Check if any blue radios are actually "filled" (indicating unread)
                for (const radio of blueRadios) {
                  const styles = getComputedStyle(radio);
                  const parent = radio.closest('.styled__NotificationRow-sc-5xhq84-2');
                  
                  // Check if this radio indicates an unread message
                  if (parent && (radio.offsetWidth > 0 && radio.offsetHeight > 0)) {
                    console.log('🔵 FOUND: Blue unread indicator detected!');
                    foundUnread = true;
                    break;
                  }
                }
                
                if (!foundUnread) {
                  console.log(`⏳ No unread messages found. Waiting ${step.interval / 1000} seconds...`);
                  await new Promise(resolve => setTimeout(resolve, step.interval));
                  step.status = 'pending';
                  renderWorkflow();
                  continue; // Stay on this step
                } else {
                  console.log('✅ Unread message detected! Proceeding to next step...');
                }
              }
            } else if (step.type === 'find') {
              if (step.condition === 'first_blue_unread') {
                // Find the specific conversation with blue unread indicator
                const blueRadios = document.querySelectorAll(step.selector);
                console.log(`🔍 Searching through ${blueRadios.length} potential unread indicators...`);
                
                let foundUnreadConversation = false;
                for (const radio of blueRadios) {
                  const parent = radio.closest('.styled__NotificationRow-sc-5xhq84-2');
                  if (parent && radio.offsetWidth > 0) {
                    console.log('🎯 Found conversation with blue unread indicator');
                    foundUnreadConversation = true;
                    break;
                  }
                }
                
                if (!foundUnreadConversation) {
                  console.log('❌ No unread conversations found - returning to monitoring');
                  currentStepIndex = 0; // Go back to monitoring
                  continue;
                }
              }
            } else if (step.type === 'click') {
              if (step.target === 'conversation-preview') {
                // Use your tagged conversation preview selector
                const previews = document.querySelectorAll(step.selector);
                if (previews.length > 0) {
                  // Find the preview that has an unread indicator nearby
                  let targetPreview = null;
                  for (const preview of previews) {
                    const parent = preview.closest('.styled__NotificationRow-sc-5xhq84-2');
                    if (parent && parent.querySelector('.styled__BoxWrapper-sc-esqoz3-0.kxjOSJ')) {
                      targetPreview = preview;
                      break;
                    }
                  }
                  
                  if (targetPreview) {
                    targetPreview.click();
                    console.log(`✅ Clicked conversation preview with unread indicator`);
                  } else {
                    previews[0].click(); // Fallback to first preview
                    console.log(`✅ Clicked first conversation preview (fallback)`);
                  }
                } else {
                  console.error(`❌ No conversation previews found: ${step.selector}`);
                }
              } else {
                // Standard click
                const element = document.querySelector(step.selector);
                if (element) {
                  element.click();
                  console.log(`✅ Clicked: ${step.description}`);
                } else {
                  console.error(`❌ Element not found: ${step.selector}`);
                }
              }
            } else if (step.type === 'wait') {
              await new Promise(resolve => setTimeout(resolve, step.delay || 1000));
              console.log(`⏱️ Waited: ${step.delay}ms`);
            } else if (step.type === 'type' && step.text) {
              const element = document.querySelector(step.selector);
              if (element) {
                element.value = step.text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                console.log(`📝 Typed: "${step.text}"`);
              }
            } else if (step.type === 'close') {
              // Close chat window using multiple possible selectors
              const closeSelectors = step.selector.split(', ');
              let closed = false;
              
              for (const closeSelector of closeSelectors) {
                const closeButton = document.querySelector(closeSelector.trim());
                if (closeButton) {
                  closeButton.click();
                  console.log(`✅ Closed chat window using: ${closeSelector}`);
                  closed = true;
                  break;
                }
              }
              
              if (!closed) {
                // Fallback: try pressing Escape
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                console.log(`✅ Closed chat window using Escape key (fallback)`);
              }
            } else if (step.type === 'extract') {
              console.log(`🔍 Extract step: ${step.description} (simulation)`);
            } else if (step.type === 'conditional') {
              console.log(`🔀 Conditional step: ${step.description} (simulation)`);
            } else if (step.type === 'save') {
              console.log(`💾 Save step: ${step.description} (simulation)`);
            } else if (step.type === 'navigate') {
              console.log(`🧭 Navigate step: ${step.description} (simulation)`);
            } else if (step.type === 'loop') {
              if (step.loop_to) {
                console.log(`🔄 Looping back to step ${step.loop_to}...`);
                currentStepIndex = step.loop_to - 1; // -1 because we'll increment at the end
                step.status = 'completed';
                renderWorkflow();
                await new Promise(resolve => setTimeout(resolve, step.delay || 2000));
                currentStepIndex++; // This will be decremented by the continue, so we end up at loop_to
                continue;
              } else {
                console.log(`🔄 Loop step: ${step.description} (simulation)`);
              }
            }
            
            step.status = 'completed';
            renderWorkflow();
            
            // Move to next step
            currentStepIndex++;
            await new Promise(resolve => setTimeout(resolve, 800));
            
          } catch (error) {
            console.error(`❌ Step failed: ${step.description}`, error);
            step.status = 'pending';
            renderWorkflow();
            
            // On error, go back to monitoring
            console.log('🔄 Error occurred - returning to monitoring mode');
            currentStepIndex = 0;
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        console.log('🎉 Workflow completed! Restarting monitoring...');
        // Restart the workflow
        setTimeout(() => window.runWorkflow(), 3000);
      };

      // Enhanced right-click menu
      function createCustomMenu(event, element) {
        if (customMenu) customMenu.remove();

        customMenu = document.createElement('div');
        customMenu.style.cssText = `
          position: fixed;
          background: white;
          border: 1px solid #ccc;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          z-index: 10001;
          padding: 8px 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 12px;
          min-width: 250px;
          max-height: 300px;
          overflow-y: auto;
        `;
        customMenu.style.left = event.pageX + 'px';
        customMenu.style.top = event.pageY + 'px';

        Object.entries(ELEMENT_TYPES).forEach(([key, description]) => {
          const item = document.createElement('div');
          item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
            transition: background-color 0.2s;
          `;
          item.innerHTML = `<strong>${key}</strong><br><small style="color: #666;">${description}</small>`;
          
          item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#667eea';
            item.style.color = 'white';
          });
          item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
            item.style.color = 'black';
          });
          
          item.addEventListener('click', () => {
            markElement(element, key, description);
            customMenu.remove();
          });
          
          customMenu.appendChild(item);
        });

        document.body.appendChild(customMenu);
      }

      // Enhanced mark element function with auto-save
      function markElement(element, type, description) {
        const selector = generateSelector(element);
        
        // Create enhanced selector data matching existing format
        const selectorData = {
          selector: {
            selector: selector,
            alternativeSelectors: generateAlternativeSelectors(element),
            description: description,
            timestamp: new Date().toISOString(),
            analysis: generateElementAnalysis(element)
          },
          description: description,
          timestamp: new Date().toISOString()
        };
        
        window.markedElements[type] = selectorData;
        
        // Save to file automatically
        saveSelectorsToFile();
        
        updateElementDisplay();
        console.log(`🎯 Marked ${type}: ${selector}`);
        console.log(`💾 Auto-saved to skool-selectors.json`);
      }

      // Generate alternative selectors
      function generateAlternativeSelectors(element) {
        const alternatives = [];
        
        if (element.id) alternatives.push(`#${element.id}`);
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.length > 0);
          classes.forEach(cls => alternatives.push(`.${cls}`));
        }
        if (element.tagName) alternatives.push(element.tagName.toLowerCase());
        if (element.textContent && element.textContent.trim()) {
          const text = element.textContent.trim();
          if (text.length < 50) {
            alternatives.push(`text="${text}"`);
            alternatives.push(`:has-text("${text}")`);
          }
        }
        
        return alternatives;
      }

      // Generate element analysis
      function generateElementAnalysis(element) {
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        
        return {
          basic: {
            tagName: element.tagName.toLowerCase(),
            id: element.id || 'none',
            className: element.className || 'none',
            textContent: element.textContent ? element.textContent.trim().substring(0, 100) : 'none'
          },
          position: {
            boundingRect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            scrollPosition: {
              x: window.scrollX,
              y: window.scrollY
            },
            clientSize: {
              width: document.documentElement.clientWidth,
              height: document.documentElement.clientHeight
            }
          },
          attributes: {
            type: element.type || 'none',
            role: element.getAttribute('role') || 'none',
            ariaLabel: element.getAttribute('aria-label') || 'none'
          },
          styling: {
            backgroundColor: styles.backgroundColor,
            color: styles.color,
            display: styles.display,
            position: styles.position,
            zIndex: styles.zIndex,
            cursor: styles.cursor,
            visibility: styles.visibility
          }
        };
      }

      // Save selectors to file via fetch
      async function saveSelectorsToFile() {
        try {
          // Send the marked elements to the save server
          const response = await fetch('http://localhost:3001/api/save-selectors', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              selectors: window.markedElements,
              timestamp: new Date().toISOString()
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log('✅ Selectors saved successfully to skool-selectors.json');
            console.log(`📊 ${result.message}`);
          } else {
            console.error('❌ Failed to save selectors:', response.statusText);
          }
        } catch (error) {
          console.error('❌ Error saving selectors:', error);
          // Fallback: save to localStorage
          localStorage.setItem('skool-selectors-backup', JSON.stringify(window.markedElements));
          console.log('💾 Saved to localStorage as backup');
        }
      }

      // Generate selector
      function generateSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.length > 0);
          if (classes.length > 0) return `.${classes.join('.')}`;
        }
        return element.tagName.toLowerCase();
      }

      // Update element display
      function updateElementDisplay() {
        const countEl = document.getElementById('count');
        const elementsEl = document.getElementById('marked-elements');
        
        if (countEl) countEl.textContent = Object.keys(window.markedElements).length;
        
        if (elementsEl) {
          elementsEl.innerHTML = Object.entries(window.markedElements)
            .map(([key, data]) => `
              <div style="margin-bottom: 6px; padding: 6px; background: white; border-radius: 4px; border-left: 3px solid #667eea;">
                <strong style="color: #333;">${key}</strong><br>
                <small style="color: #666; font-family: monospace;">${data.selector.selector}</small>
              </div>
            `).join('');
        }
      }

      // Event listeners
      document.addEventListener('contextmenu', (event) => {
        if (event.ctrlKey) {
          event.preventDefault();
          currentElement = event.target;
          createCustomMenu(event, event.target);
        }
      });

      document.addEventListener('click', (event) => {
        if (customMenu && !customMenu.contains(event.target)) {
          customMenu.remove();
        }
      });

      // Initialize when DOM is ready
      function initializeWorkflowManager() {
        if (document.getElementById('workflow-manager')) return;
        
        const panel = createWorkflowPanel();
        renderWorkflow();

        // Panel controls
        document.getElementById('run-workflow')?.addEventListener('click', runWorkflow);
        document.getElementById('close-panel')?.addEventListener('click', () => panel.remove());
        document.getElementById('minimize-panel')?.addEventListener('click', () => {
          const workflowPanel = document.getElementById('workflow-panel');
          const taggingPanel = document.getElementById('tagging-panel');
          if (workflowPanel && taggingPanel) {
            const isMinimized = workflowPanel.style.display === 'none';
            workflowPanel.style.display = isMinimized ? 'block' : 'none';
            taggingPanel.style.display = isMinimized ? 'block' : 'none';
          }
        });

        // Make panel draggable
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;

        const header = document.getElementById('panel-header');
        header.addEventListener('mousedown', (e) => {
          isDragging = true;
          initialX = e.clientX - panel.offsetLeft;
          initialY = e.clientY - panel.offsetTop;
        });

        document.addEventListener('mousemove', (e) => {
          if (isDragging) {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            panel.style.left = currentX + 'px';
            panel.style.top = currentY + 'px';
          }
        });

        document.addEventListener('mouseup', () => {
          isDragging = false;
        });

        console.log('🎯 Workflow Manager initialized!');
      }

      // Initialize when page loads
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeWorkflowManager);
      } else {
        initializeWorkflowManager();
      }
    });
  }

  async loadSelectors() {
    try {
      const selectorsPath = path.join(process.cwd(), 'skool-selectors.json');
      const data = await fs.readFile(selectorsPath, 'utf8');
      this.selectors = JSON.parse(data);
      console.log(`📂 Loaded ${Object.keys(this.selectors).length} existing selectors`);
    } catch (error) {
      console.log('📂 No existing selectors found, starting fresh');
      this.selectors = {};
    }
  }

  async startSaveServer() {
    const server = http.createServer(async (req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      const parsedUrl = url.parse(req.url, true);
      
      if (req.method === 'POST' && parsedUrl.pathname === '/api/save-selectors') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const { selectors } = JSON.parse(body);
            const success = await this.saveSelectors(selectors);
            
            res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success, message: success ? 'Saved successfully' : 'Save failed' }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(3001, () => {
      console.log('🗄️ Save server running on http://localhost:3001');
    });
  }

  async saveSelectors(newSelectors) {
    try {
      // Merge new selectors with existing ones
      const allSelectors = { ...this.selectors, ...newSelectors };
      
      const selectorsPath = path.join(process.cwd(), 'skool-selectors.json');
      await fs.writeFile(selectorsPath, JSON.stringify(allSelectors, null, 2), 'utf8');
      
      this.selectors = allSelectors;
      console.log(`💾 Saved ${Object.keys(newSelectors).length} new selectors to file`);
      console.log(`📊 Total selectors: ${Object.keys(allSelectors).length}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to save selectors:', error);
      return false;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting main function...');
  const manager = new SkoolWorkflowManager();
  
  try {
    console.log('🔧 Initializing manager...');
    await manager.initialize();
    console.log('✅ Manager initialized successfully');
  } catch (error) {
    console.error('❌ Error during initialization:', error);
    console.error('Stack trace:', error.stack);
  }
  // Don't cleanup automatically - let it stay open for interaction
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down workflow manager...');
  process.exit(0);
});

// Run the main function
main().catch(console.error);
