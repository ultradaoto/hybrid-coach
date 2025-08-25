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
      // PERSISTENT Global state - survives page changes
      window.markedElements = {};
      
      // Workflow state persistence
      const WORKFLOW_STATE_KEY = 'skool-bot-workflow-state';
      const WORKFLOW_DATA_KEY = 'skool-bot-workflow-data';
      
      // Load existing workflow state if available
      let workflowState = null;
      let workflowData = {};
      try {
        const savedState = localStorage.getItem(WORKFLOW_STATE_KEY);
        const savedData = localStorage.getItem(WORKFLOW_DATA_KEY);
        if (savedState) {
          workflowState = JSON.parse(savedState);
          console.log(`🔄 Recovered workflow state: Step ${workflowState.currentStep}, Status: ${workflowState.status}`);
        }
        if (savedData) {
          workflowData = JSON.parse(savedData);
          console.log(`📊 Recovered workflow data:`, Object.keys(workflowData));
        }
      } catch (e) {
        console.log('⚠️ No previous workflow state found, starting fresh');
      }
      
      window.botWorkflow = [
        { id: 1, type: 'monitor', target: 'unread-badge-polling', description: 'Monitor for unread count badges like "(1)" (poll every 10s)', selector: '.styled__UnreadCount-sc-5xhq84-7', condition: 'wait_for_unread_badge', status: 'pending', polling: true, interval: 10000 },
        { id: 2, type: 'find', target: 'unread-conversation', description: 'Find conversation with unread count badge (e.g., Jie Lu with "(1)")', selector: '.styled__NotificationRow-sc-5xhq84-2', condition: 'first_blue_unread', status: 'pending' },
        { id: 3, type: 'click', target: 'conversation-preview', description: 'Click the UNREAD conversation (not Sterling - the one with badge)', selector: 'stored-target', dynamic: true, status: 'pending' },
        { id: 4, type: 'wait', target: 'chat-window', description: 'Wait for chat window to open', delay: 2000, status: 'pending' },
        { id: 5, type: 'extract', target: 'user-info', description: 'Extract username and profile link', selector: '.styled__ChildrenLink-sc-1brgbbt-1', status: 'pending' },
        { id: 6, type: 'type', target: 'message-input', description: 'Type login message with unique code + ENTER', selector: '.styled__MultiLineInput-sc-1saiqqb-2', text: 'I will have your link shortly. {generated_link}\n', status: 'pending' },
        { id: 7, type: 'wait', target: 'message-sent', description: 'Wait for message to send', delay: 2000, status: 'pending' },
        { id: 8, type: 'extract', target: 'profile-link', description: 'Extract user profile link from chat header', selector: '.styled__ChatModalHeader-sc-f4viec-2 a[href*="/@"]', status: 'pending' },
        { id: 9, type: 'navigate', target: 'user-profile', description: 'Navigate to user profile page', selector: 'extracted-profile-url', status: 'pending' },
        { id: 10, type: 'wait', target: 'profile-loaded', description: 'Wait for profile page to load completely', delay: 2000, condition: 'profile_elements_ready', status: 'pending' },
        { id: 11, type: 'extract', target: 'profile-details', description: 'Extract user name, bio, and details from profile', selector: '.styled__UserCardWrapper-sc-1gipnml-15, .styled__ProfileContainer-sc-*', status: 'pending' },
        { id: 12, type: 'save', target: 'user-database', description: 'Save extracted user data to database', condition: 'profile_data_extracted', status: 'pending' },
        { id: 13, type: 'navigate', target: 'back-to-chat', description: 'Navigate back to chat window', selector: 'previous-chat-url', status: 'pending' },
        { id: 14, type: 'close', target: 'chat-window', description: 'Close chat window with X button', selector: '.styled__ChatModalHeader-sc-f4viec-2 ~ div button[type="button"]:last-child, button[type="button"] .styled__IconWrapper-sc-zxv7pb-0:has(svg[viewBox="0 0 40 40"])', status: 'pending' },
        { id: 15, type: 'navigate', target: 'return-monitoring', description: 'Return to MyUltra Coach profile for monitoring', selector: 'https://www.skool.com/@my-ultra-coach-6588', status: 'pending' },
        { id: 16, type: 'loop', target: 'monitoring', description: 'Return to step 1 - Continue monitoring', delay: 2000, status: 'pending', loop_to: 1 }
      ];

      let draggedItem = null;
      let currentElement = null;
      let customMenu = null;
      
      // Workflow state management functions
      function saveWorkflowState(currentStepIndex, status = 'running', data = {}) {
        const state = {
          currentStep: currentStepIndex,
          status: status,
          timestamp: new Date().toISOString(),
          url: window.location.href
        };
        
        // Merge with existing data
        const allData = { ...workflowData, ...data };
        
        localStorage.setItem(WORKFLOW_STATE_KEY, JSON.stringify(state));
        localStorage.setItem(WORKFLOW_DATA_KEY, JSON.stringify(allData));
        
        console.log(`💾 Saved workflow state: Step ${currentStepIndex}, Status: ${status}`);
        if (Object.keys(data).length > 0) {
          console.log(`📊 Saved data:`, data);
        }
      }
      
      function clearWorkflowState() {
        localStorage.removeItem(WORKFLOW_STATE_KEY);
        localStorage.removeItem(WORKFLOW_DATA_KEY);
        workflowState = null;
        workflowData = {};
        console.log(`🗑️ Cleared workflow state`);
      }
      
      function getWorkflowData(key) {
        return workflowData[key];
      }
      
      function setWorkflowData(key, value) {
        workflowData[key] = value;
        localStorage.setItem(WORKFLOW_DATA_KEY, JSON.stringify(workflowData));
      }

      // Element types for tagging - ENHANCED with DEEP VISUAL STATE DETECTION
      const ELEMENT_TYPES = {
        // CRITICAL: Radio Button States (DEEP ANALYSIS)
        'radio-blue-unread': '🔵 Radio Button - BLUE FILLED (UNREAD STATE)',
        'radio-empty-read': '⚪ Radio Button - EMPTY/CLEAR (READ STATE)', 
        'radio-container-unread': '📦 Radio Container - WITH BLUE CONTENT',
        'radio-container-read': '📦 Radio Container - EMPTY CONTENT',
        'radio-svg-unread': '🎨 Radio SVG - BLUE FILLED STATE',
        'radio-svg-read': '🎨 Radio SVG - EMPTY STATE',
        'radio-path-blue': '🛤️ Radio Path Element - BLUE FILLED',
        'radio-path-empty': '🛤️ Radio Path Element - EMPTY',
        
        // Mail Detection
        'mail-icon-normal': '📧 Mail Icon (Normal - No Unread)',
        'mail-icon-unread': '🔴 Mail Icon (With Unread Badge)',
        'mail-unread-badge': '🔴 Mail Unread Count Badge',
        
        // Conversation Detection  
        'conversation-unread-full': '🔴 FULL Unread Conversation (entire row)',
        'conversation-read-full': '✅ FULL Read Conversation (entire row)',
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
            'keypress': '#ffc107', // Yellow for keypress
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

      // Enhanced workflow execution with PERSISTENT STATE
      window.runWorkflow = async function() {
        console.log('🚀 Starting smart monitoring workflow with state persistence...');
        
        // Check if we're resuming from a previous state
        let currentStepIndex = 0;
        if (workflowState && workflowState.status === 'running') {
          currentStepIndex = workflowState.currentStep;
          console.log(`🔄 RESUMING workflow from step ${currentStepIndex + 1}`);
          console.log(`📍 Previous URL: ${workflowState.url}`);
          console.log(`📍 Current URL: ${window.location.href}`);
          
          // Show resuming indicator in UI
          const panel = document.getElementById('workflow-manager');
          if (panel) {
            const header = panel.querySelector('#panel-header h3');
            if (header) {
              header.textContent = `🔄 Bot Workflow Manager (RESUMING Step ${currentStepIndex + 1})`;
              header.style.color = '#ffc107'; // Yellow to indicate resuming
            }
          }
          
          // Restore any saved data
          if (workflowData.extractedProfileUrl) {
            window.extractedProfileUrl = workflowData.extractedProfileUrl;
            console.log(`📂 Restored profile URL: ${workflowData.extractedProfileUrl}`);
          }
          if (workflowData.currentChatUrl) {
            window.currentChatUrl = workflowData.currentChatUrl;
            console.log(`📂 Restored chat URL: ${workflowData.currentChatUrl}`);
          }
          if (workflowData.extractedProfileData) {
            window.extractedProfileData = workflowData.extractedProfileData;
            console.log(`📂 Restored profile data:`, workflowData.extractedProfileData);
          }
          if (workflowData.targetUnreadConversation) {
            // Can't restore DOM element, but we can log it
            console.log('📋 Previous target conversation data available');
          }
        } else {
          console.log('🆕 Starting fresh workflow...');
          clearWorkflowState(); // Clean slate
          
          // Reset UI header
          const panel = document.getElementById('workflow-manager');
          if (panel) {
            const header = panel.querySelector('#panel-header h3');
            if (header) {
              header.textContent = '🤖 Bot Workflow Manager';
              header.style.color = 'white';
            }
          }
        }
        
        while (currentStepIndex < window.botWorkflow.length) {
          const step = window.botWorkflow[currentStepIndex];
          step.status = 'running';
          renderWorkflow();
          
          // Save current state before each step
          saveWorkflowState(currentStepIndex, 'running');
          
          // GLOBAL STEP TIMEOUT - Never hang on any step!
          const stepTimeout = setTimeout(() => {
            console.log(`⏰ GLOBAL TIMEOUT: Step ${currentStepIndex + 1} took too long, FORCING continuation...`);
            step.status = 'completed';
            renderWorkflow();
          }, 15000); // 15 second max per step
          
          try {
            if (step.type === 'monitor') {
              if (step.condition === 'wait_for_unread_badge' || step.condition === 'wait_for_blue') {
                console.log('👁️ MONITORING: Checking for unread count badges...');
                
                let foundUnread = false;
                
                // ENHANCED: Check for UNREAD conversations using the unread count badge
                const allConversations = document.querySelectorAll('.styled__NotificationRow-sc-5xhq84-2');
                console.log(`🔍 Found ${allConversations.length} total conversations`);
                
                for (const conversation of allConversations) {
                  // Method 1: Look for unread count badge (MOST RELIABLE)
                  const unreadBadge = conversation.querySelector('.styled__UnreadCount-sc-5xhq84-7');
                  if (unreadBadge && unreadBadge.textContent.includes('(')) {
                    console.log('🔴 FOUND: Unread conversation with badge:', unreadBadge.textContent);
                    foundUnread = true;
                    break;
                  }
                  
                  // Method 2: Check for specific unread radio button classes
                  const readButton = conversation.querySelector('.styled__ReadButton-sc-5xhq84-1');
                  if (readButton) {
                    const classList = readButton.className;
                    // Sterling (read) has 'dduCXD', Jie Lu (unread) has 'eXgJxH'
                    if (classList.includes('eXgJxH')) {
                      console.log('🔵 FOUND: Unread conversation with eXgJxH class');
                      foundUnread = true;
                      break;
                    }
                  }
                  
                  // Method 3: Check for username to debug
                  const username = conversation.querySelector('.styled__UserNameText-sc-24o0l3-1');
                  if (username) {
                    console.log(`👤 Conversation: ${username.textContent} - Badge: ${unreadBadge ? unreadBadge.textContent : 'none'} - ReadButton: ${readButton ? readButton.className : 'none'}`);
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
                // Find the specific conversation with UNREAD badge
                const allConversations = document.querySelectorAll('.styled__NotificationRow-sc-5xhq84-2');
                console.log(`🔍 Searching through ${allConversations.length} conversations for unread...`);
                
                let foundUnreadConversation = null;
                for (const conversation of allConversations) {
                  // Look for unread count badge (e.g., "(1)")
                  const unreadBadge = conversation.querySelector('.styled__UnreadCount-sc-5xhq84-7');
                  const username = conversation.querySelector('.styled__UserNameText-sc-24o0l3-1');
                  
                  if (unreadBadge && unreadBadge.textContent.includes('(')) {
                    console.log(`🎯 Found UNREAD conversation: ${username ? username.textContent : 'unknown'} with badge: ${unreadBadge.textContent}`);
                    foundUnreadConversation = conversation;
                    break;
                  } else {
                    console.log(`✅ READ conversation: ${username ? username.textContent : 'unknown'} (no unread badge)`);
                  }
                }
                
                if (!foundUnreadConversation) {
                  console.log('❌ No unread conversations found - returning to monitoring');
                  currentStepIndex = 0; // Go back to monitoring
                  continue;
                } else {
                  // Store the found conversation for the next click step
                  window.targetUnreadConversation = foundUnreadConversation;
                  console.log('✅ Target unread conversation stored for clicking');
                }
              }
            } else if (step.type === 'click') {
              if (step.target === 'conversation-preview') {
                // Use the stored target unread conversation
                if (window.targetUnreadConversation) {
                  const targetConversation = window.targetUnreadConversation;
                  const username = targetConversation.querySelector('.styled__UserNameText-sc-24o0l3-1');
                  const unreadBadge = targetConversation.querySelector('.styled__UnreadCount-sc-5xhq84-7');
                  
                  console.log(`🎯 Clicking UNREAD conversation: ${username ? username.textContent : 'unknown'} with badge: ${unreadBadge ? unreadBadge.textContent : 'none'}`);
                  
                  // Try multiple click targets within the unread conversation
                  const clickTargets = [
                    targetConversation.querySelector('.styled__MessageContent-sc-5xhq84-9'), // Message preview text
                    targetConversation.querySelector('.styled__ChildrenLink-sc-1brgbbt-1'), // The link wrapper
                    targetConversation.querySelector('.styled__Overlay-sc-5xhq84-6'), // Content overlay
                    targetConversation // The conversation row itself
                  ];
                  
                  let clicked = false;
                  for (const target of clickTargets) {
                    if (target) {
                      try {
                        target.click();
                        console.log(`✅ Successfully clicked unread conversation via: ${target.className}`);
                        clicked = true;
                        break;
                      } catch (error) {
                        console.log(`⚠️ Click attempt failed on: ${target.className}`);
                      }
                    }
                  }
                  
                  if (!clicked) {
                    console.error(`❌ Failed to click unread conversation`);
                  }
                  
                  // Clear the stored target
                  window.targetUnreadConversation = null;
                } else {
                  console.error(`❌ No target unread conversation stored`);
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
              if (step.condition === 'profile_elements_ready') {
                // MINIMAL WAIT - Just check if we're on a profile page
                console.log(`⏳ MINIMAL PROFILE CHECK...`);
                console.log(`📍 Current URL: ${window.location.href}`);
                
                // Just wait 2 seconds then proceed regardless
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const totalElements = document.querySelectorAll('*').length;
                console.log(`🔢 Page has ${totalElements} elements - proceeding with extraction`);
                
                // FORCE IMMEDIATE CONTINUATION
                console.log(`🚀 FORCING IMMEDIATE CONTINUATION to extraction...`);
              } else {
                // Standard wait
                await new Promise(resolve => setTimeout(resolve, step.delay || 1000));
                console.log(`⏱️ Waited: ${step.delay}ms`);
              }
            } else if (step.type === 'type' && step.text) {
              // ENHANCED TYPING with newline support
              console.log(`📝 ENHANCED TYPING with newline support...`);
              
              const element = document.querySelector(step.selector);
              if (element) {
                console.log(`🎯 Found textarea: ${element.placeholder}`);
                console.log(`📄 Text to type: "${step.text}"`);
                
                // Focus and clear first
                element.focus();
                element.click();
                element.value = '';
                
                // Set the text including newline
                element.value = step.text;
                
                // Trigger multiple events to ensure React picks it up
                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                
                // If there's a newline, also trigger keydown/keyup for Enter
                if (step.text.includes('\n')) {
                  console.log(`🔥 Text contains newline - triggering ENTER events...`);
                  
                  const enterKeyDown = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                  });
                  
                  const enterKeyUp = new KeyboardEvent('keyup', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                  });
                  
                  element.dispatchEvent(enterKeyDown);
                  setTimeout(() => element.dispatchEvent(enterKeyUp), 50);
                  
                  console.log(`✅ ENTER events dispatched for newline character`);
                }
                
                console.log(`📝 Typed: "${step.text}" (${step.text.length} chars)`);
              } else {
                console.error(`❌ Textarea not found with selector: ${step.selector}`);
              }
            } else if (step.type === 'keypress') {
              // PHYSICAL KEY SIMULATION - Most aggressive approach
              console.log(`⌨️ PHYSICAL KEY SIMULATION - AGGRESSIVE MESSAGE SEND...`);
              
              // Step 1: Find the correct textarea
              const messageSelectors = [
                'textarea[data-testid="input-component"]',
                'textarea[placeholder*="Message"]',
                '.styled__MultiLineInput-sc-1saiqqb-2:not([aria-hidden="true"])',
                '.styled__ChatTextArea-sc-1w0nbeu-4 textarea:not([aria-hidden="true"])'
              ];
              
              let messageTextarea = null;
              for (const selector of messageSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                  if (el.offsetParent !== null && !el.hasAttribute('aria-hidden') && el.placeholder && el.placeholder.includes('Message')) {
                    messageTextarea = el;
                    console.log(`🎯 Found VISIBLE message textarea: "${el.placeholder}"`);
                    break;
                  }
                }
                if (messageTextarea) break;
              }
              
              if (messageTextarea) {
                console.log(`📝 Target textarea: "${messageTextarea.placeholder}" | Value: "${messageTextarea.value}"`);
                
                // AGGRESSIVE FOCUS
                messageTextarea.scrollIntoView();
                messageTextarea.focus();
                messageTextarea.click();
                
                // Ensure cursor is at end
                messageTextarea.selectionStart = messageTextarea.value.length;
                messageTextarea.selectionEnd = messageTextarea.value.length;
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Method 1: DIRECT PLAYWRIGHT-STYLE KEY PRESS
                console.log(`🔥 Method 1: Direct key simulation...`);
                try {
                  // Simulate actual physical key press
                  await new Promise(resolve => {
                    const keydown = new KeyboardEvent('keydown', {
                      key: 'Enter',
                      code: 'Enter',
                      keyCode: 13,
                      which: 13,
                      charCode: 13,
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      detail: 0,
                      view: window,
                      ctrlKey: false,
                      altKey: false,
                      shiftKey: false,
                      metaKey: false
                    });
                    
                    const keyup = new KeyboardEvent('keyup', {
                      key: 'Enter',
                      code: 'Enter',
                      keyCode: 13,
                      which: 13,
                      charCode: 13,
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      detail: 0,
                      view: window
                    });
                    
                    messageTextarea.dispatchEvent(keydown);
                    setTimeout(() => {
                      messageTextarea.dispatchEvent(keyup);
                      resolve();
                    }, 50);
                  });
                  
                  console.log(`✅ Physical key press simulated`);
                } catch (e) {
                  console.log(`⚠️ Physical key simulation failed:`, e);
                }
                
                // Method 2: FORCE SUBMIT via any available method
                console.log(`🔥 Method 2: Force submit...`);
                const container = messageTextarea.closest('div, form, section');
                if (container) {
                  // Look for submit buttons in container
                  const submitButtons = container.querySelectorAll('button, input[type="submit"], [role="button"]');
                  for (const btn of submitButtons) {
                    if (btn.type === 'submit' || btn.textContent.toLowerCase().includes('send') || btn.getAttribute('aria-label')?.toLowerCase().includes('send')) {
                      console.log(`📤 Found and clicking submit button: ${btn.textContent || btn.getAttribute('aria-label')}`);
                      btn.click();
                      break;
                    }
                  }
                }
                
                // Method 3: TRIGGER FORM SUBMISSION
                const parentForm = messageTextarea.form || messageTextarea.closest('form');
                if (parentForm) {
                  console.log(`📝 Submitting parent form...`);
                  parentForm.submit();
                }
                
              } else {
                console.error(`❌ CRITICAL: No message textarea found!`);
                
                // Emergency debug
                const allTextareas = document.querySelectorAll('textarea');
                console.log(`🔍 DEBUG: ${allTextareas.length} textareas found:`);
                allTextareas.forEach((ta, i) => {
                  console.log(`  ${i}: "${ta.placeholder}" | Visible: ${ta.offsetParent !== null} | Hidden: ${ta.hasAttribute('aria-hidden')} | Value: "${ta.value}"`);
                });
              }
            } else if (step.type === 'close') {
              // Close chat window - find the X button specifically
              console.log(`❌ Attempting to close chat window...`);
              let closed = false;
              
              // Method 1: Look for the X button in the chat header
              const closeButtons = document.querySelectorAll('button[type="button"]');
              for (const btn of closeButtons) {
                const svg = btn.querySelector('svg[viewBox="0 0 40 40"]');
                if (svg) {
                  const path = svg.querySelector('path');
                  if (path && path.getAttribute('d').includes('40 4.02857L35.9714 0L20 15.9714')) {
                    console.log(`✅ Found X button, clicking...`);
                    btn.click();
                    closed = true;
                    break;
                  }
                }
              }
              
              // Method 2: Try the specific selectors from your HTML
              if (!closed) {
                const specificSelectors = [
                  '.styled__ChatModalHeader-sc-f4viec-2 ~ div button[type="button"]:last-child',
                  'button[type="button"]:has(svg[viewBox="0 0 40 40"])',
                  '.styled__ButtonWrapper-sc-1crx28g-1:last-child'
                ];
                
                for (const selector of specificSelectors) {
                  try {
                    const closeBtn = document.querySelector(selector);
                    if (closeBtn) {
                      console.log(`✅ Closing with selector: ${selector}`);
                      closeBtn.click();
                      closed = true;
                      break;
                    }
                  } catch (e) {
                    console.log(`⚠️ Selector failed: ${selector}`);
                  }
                }
              }
              
              // Method 3: Fallback to Escape key
              if (!closed) {
                console.log(`🔄 Fallback: Using Escape key to close`);
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
                console.log(`✅ Sent Escape key events`);
              }
            } else if (step.type === 'extract') {
              if (step.target === 'profile-link') {
                // Extract profile link from chat header
                const profileLinks = document.querySelectorAll('.styled__ChatModalHeader-sc-f4viec-2 a[href*="/@"]');
                if (profileLinks.length > 0) {
                  const profileUrl = profileLinks[0].href;
                  const currentChatUrl = window.location.href;
                  
                  // Save to both window and persistent storage
                  window.extractedProfileUrl = profileUrl;
                  window.currentChatUrl = currentChatUrl;
                  setWorkflowData('extractedProfileUrl', profileUrl);
                  setWorkflowData('currentChatUrl', currentChatUrl);
                  
                  console.log(`🔗 Extracted & saved profile URL: ${profileUrl}`);
                  console.log(`💾 Saved current chat URL: ${currentChatUrl}`);
                } else {
                  console.error(`❌ Profile link not found in chat header`);
                }
              } else if (step.target === 'profile-details') {
                // SUPER AGGRESSIVE profile extraction with MAXIMUM logging
                console.log(`🔍 ========== PROFILE EXTRACTION START ==========`);
                console.log(`📍 URL: ${window.location.href}`);
                console.log(`📊 Page Title: ${document.title}`);
                console.log(`🔢 Total Elements: ${document.querySelectorAll('*').length}`);
                
                const profileData = {
                  name: 'Unknown',
                  bio: '',
                  skoolId: '',
                  joinDate: '',
                  location: ''
                };
                
                // IMMEDIATE URL extraction - ALWAYS works
                const immediateUrlMatch = window.location.href.match(/\/@([^\/\?]+)/);
                if (immediateUrlMatch) {
                  profileData.skoolId = immediateUrlMatch[1];
                  console.log(`✅ IMMEDIATE Skool ID: ${profileData.skoolId}`);
                } else {
                  console.log(`❌ Could not extract Skool ID from URL!`);
                }
                
                // Extract name - try multiple selectors
                const nameSelectors = [
                  'h1', 
                  '.styled__UserNameText-sc-24o0l3-1', 
                  '.styled__ProfileName-sc-*',
                  '[class*="ProfileName"]',
                  '[class*="UserName"]',
                  '[data-testid*="name"]',
                  '.profile-name',
                  '.user-name'
                ];
                
                for (const selector of nameSelectors) {
                  const nameEl = document.querySelector(selector);
                  if (nameEl && nameEl.textContent.trim().length > 0) {
                    profileData.name = nameEl.textContent.trim();
                    console.log(`✅ Found name: "${profileData.name}" using selector: ${selector}`);
                    break;
                  }
                }
                
                // Extract bio - try multiple selectors and filter meaningful content
                const bioSelectors = [
                  '.styled__Bio-sc-*', 
                  '.styled__Description-sc-*', 
                  '[class*="Bio"]',
                  '[class*="Description"]',
                  '[class*="About"]',
                  'p',
                  '.profile-bio',
                  '.user-bio'
                ];
                
                for (const selector of bioSelectors) {
                  const bioElements = document.querySelectorAll(selector);
                  for (const bio of bioElements) {
                    const text = bio.textContent.trim();
                    if (text.length > 20 && !text.includes('joined') && !text.includes('ago') && !text.includes('posts')) {
                      profileData.bio = text;
                      console.log(`✅ Found bio: "${text.substring(0, 50)}..." using selector: ${selector}`);
                      break;
                    }
                  }
                  if (profileData.bio) break;
                }
                
                // Extract Skool ID from URL (if not already extracted)
                if (!profileData.skoolId) {
                  const secondUrlMatch = window.location.href.match(/\/@([^\/\?]+)/);
                  if (secondUrlMatch) {
                    profileData.skoolId = secondUrlMatch[1];
                    console.log(`✅ Extracted Skool ID: ${profileData.skoolId}`);
                  }
                }
                
                // Additional data extraction attempts
                const joinElements = document.querySelectorAll('*');
                for (const el of joinElements) {
                  const text = el.textContent;
                  if (text && text.includes('joined') && text.length < 50) {
                    profileData.joinDate = text.trim();
                    break;
                  }
                }
                
                // Save to both window and persistent storage
                window.extractedProfileData = profileData;
                setWorkflowData('extractedProfileData', profileData);
                
                console.log(`👤 COMPLETE PROFILE DATA EXTRACTED:`);
                console.log(`  Name: ${profileData.name}`);
                console.log(`  Bio: ${profileData.bio ? profileData.bio.substring(0, 100) + '...' : 'Not found'}`);
                console.log(`  Skool ID: ${profileData.skoolId}`);
                console.log(`  Join Date: ${profileData.joinDate || 'Not found'}`);
                
                // ALWAYS extract at least the Skool ID from URL - never fail completely
                if (!profileData.skoolId) {
                  const finalUrlMatch = window.location.href.match(/\/@([^\/\?]+)/);
                  if (finalUrlMatch) {
                    profileData.skoolId = finalUrlMatch[1];
                    console.log(`🔧 FORCED Skool ID extraction: ${profileData.skoolId}`);
                  }
                }
                
                // If name is still unknown, try to extract from URL
                if (profileData.name === 'Unknown' && profileData.skoolId) {
                  // Convert skool-id to readable name (e.g., jie-lu-3653 -> Jie Lu)
                  const nameFromId = profileData.skoolId.replace(/-\d+$/, '').split('-').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ');
                  profileData.name = nameFromId;
                  console.log(`🔧 FORCED name from ID: ${profileData.name}`);
                }
                
                // Validate and log results
                if (profileData.name === 'Unknown' && !profileData.bio && !profileData.skoolId) {
                  console.error(`❌ Failed to extract ANY profile data!`);
                  console.log(`📄 Current page URL: ${window.location.href}`);
                  console.log(`🔍 Available elements:`, document.querySelectorAll('*').length);
                  
                  // FORCE basic data from URL as last resort
                  const basicMatch = window.location.href.match(/skool\.com\/@([^\/\?]+)/);
                  if (basicMatch) {
                    profileData.skoolId = basicMatch[1];
                    profileData.name = basicMatch[1].replace(/-/g, ' ').replace(/\d+/g, '').trim();
                    console.log(`🚨 EMERGENCY extraction from URL: ${profileData.name} (${profileData.skoolId})`);
                  }
                } else {
                  console.log(`✅ Profile extraction successful!`);
                }
                
                // ALWAYS proceed - never get stuck here
                console.log(`🚀 FORCING continuation to next step regardless of extraction quality...`);
                
                // IMMEDIATE FORCED COMPLETION - No more hanging!
                console.log(`🚀 IMMEDIATE STEP COMPLETION - No timeouts needed!`);
                
                // Set a very short timeout just to ensure async completion
                setTimeout(() => {
                  if (step.status !== 'completed') {
                    console.log(`⏰ FORCING step completion NOW`);
                    step.status = 'completed';
                    renderWorkflow();
                  }
                }, 100);
              } else {
                console.log(`🔍 Extract step: ${step.description}`);
              }
            } else if (step.type === 'conditional') {
              console.log(`🔀 Conditional step: ${step.description} (simulation)`);
            } else if (step.type === 'save') {
              if (step.target === 'user-database') {
                // Save extracted profile data (simulation)
                if (window.extractedProfileData) {
                  console.log(`💾 Saving user data to database:`, window.extractedProfileData);
                  // Here you could make an API call to save the data
                } else {
                  console.error(`❌ No profile data to save`);
                }
              } else {
                console.log(`💾 Save step: ${step.description}`);
              }
            } else if (step.type === 'navigate') {
              if (step.target === 'user-profile') {
                // Navigate to extracted profile URL
                const profileUrl = window.extractedProfileUrl || getWorkflowData('extractedProfileUrl');
                if (profileUrl) {
                  // Save state before navigation - CRITICAL!
                  saveWorkflowState(currentStepIndex + 1, 'running', {
                    navigatingTo: 'profile',
                    targetUrl: profileUrl
                  });
                  
                  console.log(`🧭 Navigating to profile: ${profileUrl}`);
                  console.log(`💾 Saved state - will resume at step ${currentStepIndex + 2} after page load`);
                  
                  // Set a flag to auto-resume workflow after page loads
                  localStorage.setItem('auto-resume-workflow', 'true');
                  
                  window.location.href = profileUrl;
                  return; // Exit workflow execution as page will reload
                } else {
                  console.error(`❌ No profile URL to navigate to`);
                }
              } else if (step.target === 'back-to-chat') {
                // Navigate back to chat - ENHANCED with fallback
                console.log(`🧭 ========== NAVIGATION BACK TO CHAT ==========`);
                const chatUrl = window.currentChatUrl || getWorkflowData('currentChatUrl');
                console.log(`🔗 Stored chat URL: ${chatUrl}`);
                
                if (chatUrl) {
                  // Save state before navigation
                  saveWorkflowState(currentStepIndex + 1, 'running', {
                    navigatingTo: 'chat',
                    targetUrl: chatUrl,
                    fromProfile: true
                  });
                  
                  console.log(`🧭 Navigating back to chat: ${chatUrl}`);
                  console.log(`💾 Saved state - will resume at step ${currentStepIndex + 2} after page load`);
                  
                  localStorage.setItem('auto-resume-workflow', 'true');
                  
                  window.location.href = chatUrl;
                  return; // Exit workflow execution as page will reload
                } else {
                  console.error(`❌ No chat URL stored! Using fallback navigation...`);
                  
                  // FALLBACK: Go directly to close chat step by skipping back to chat
                  console.log(`🔄 SKIPPING back-to-chat, jumping to close-chat step...`);
                  currentStepIndex = window.botWorkflow.findIndex(s => s.target === 'return-monitoring') - 1;
                  if (currentStepIndex < 0) currentStepIndex = window.botWorkflow.length - 3; // Go near end
                  console.log(`⏭️ Jumping to step ${currentStepIndex + 1}`);
                }
              } else if (step.target === 'return-monitoring') {
                // Enhanced return to monitoring with forced navigation
                console.log(`🏠 ========== RETURNING TO MONITORING ==========`);
                const monitoringUrl = 'https://www.skool.com/@my-ultra-coach-6588';
                
                // Clear workflow state since we're completing the cycle
                console.log(`🗑️ Clearing workflow state - cycle complete`);
                clearWorkflowState();
                
                console.log(`🧭 Navigating to monitoring URL: ${monitoringUrl}`);
                window.location.href = monitoringUrl;
                return; // Exit workflow execution as page will reload
              } else if (step.selector && step.selector.startsWith('https://')) {
                // Navigate to specific URL
                saveWorkflowState(currentStepIndex + 1, 'running', {
                  navigatingTo: 'url',
                  targetUrl: step.selector
                });
                
                console.log(`🧭 Navigating to: ${step.selector}`);
                localStorage.setItem('auto-resume-workflow', 'true');
                
                window.location.href = step.selector;
                return; // Exit workflow execution as page will reload
              } else {
                console.log(`🧭 Navigate step: ${step.description}`);
              }
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
            
            // Clear the global timeout
            clearTimeout(stepTimeout);
            
            step.status = 'completed';
            renderWorkflow();
            
            console.log(`✅ STEP ${currentStepIndex + 1} COMPLETED: ${step.description}`);
            console.log(`➡️ Moving to step ${currentStepIndex + 2}...`);
            
            // Move to next step
            currentStepIndex++;
            await new Promise(resolve => setTimeout(resolve, 800));
            
          } catch (error) {
            // Clear the global timeout on error too
            clearTimeout(stepTimeout);
            
            console.error(`❌ Step failed: ${step.description}`, error);
            step.status = 'pending';
            renderWorkflow();
            
            // On error, go back to monitoring
            console.log('🔄 Error occurred - returning to monitoring mode');
            currentStepIndex = 0;
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        console.log('🎉 Workflow completed! Clearing state and restarting monitoring...');
        
        // Clear workflow state as we completed successfully
        clearWorkflowState();
        
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
        
        // Log deep analysis for radio buttons
        if (selectorData.selector.analysis && selectorData.selector.analysis.radioButtonState) {
          const radioState = selectorData.selector.analysis.radioButtonState;
          console.log(`🔍 DEEP ANALYSIS:`, {
            visualState: radioState.visualState,
            hasBlueColor: radioState.hasBlueColor,
            hasContent: radioState.hasContent,
            isEmpty: radioState.isEmpty,
            svgPathCount: radioState.svgPaths.length,
            pathColors: radioState.pathColors,
            pathFills: radioState.pathFills
          });
          
          // Log the full SVG path data for analysis
          if (radioState.svgPaths.length > 0) {
            console.log(`🎨 SVG PATHS:`, radioState.svgPaths);
          }
        }
        
        // Output the complete selector data for manual saving
        console.log(`📋 COMPLETE SELECTOR DATA FOR ${type}:`);
        console.log(JSON.stringify({ [type]: selectorData }, null, 2));
        
        console.log(`💾 Save attempted (check console for data if auto-save failed)`);
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

      // DEEP element analysis for radio button state detection
      function generateElementAnalysis(element) {
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        
        // DEEP VISUAL STATE ANALYSIS
        const deepVisualAnalysis = analyzeRadioButtonState(element);
        
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
            ariaLabel: element.getAttribute('aria-label') || 'none',
            allAttributes: getAllAttributes(element)
          },
          styling: {
            backgroundColor: styles.backgroundColor,
            color: styles.color,
            display: styles.display,
            position: styles.position,
            zIndex: styles.zIndex,
            cursor: styles.cursor,
            visibility: styles.visibility,
            border: styles.border,
            borderRadius: styles.borderRadius,
            boxShadow: styles.boxShadow,
            opacity: styles.opacity,
            transform: styles.transform
          },
          // CRITICAL: Deep visual state analysis
          radioButtonState: deepVisualAnalysis,
          // Child elements analysis
          children: analyzeChildElements(element),
          // SVG and Path analysis
          svgAnalysis: analyzeSVGContent(element)
        };
      }

      // Analyze radio button visual state in detail
      function analyzeRadioButtonState(element) {
        const analysis = {
          isRadioButton: false,
          visualState: 'unknown',
          hasBlueColor: false,
          hasContent: false,
          isEmpty: false,
          svgPaths: [],
          pathColors: [],
          pathFills: []
        };

        // Check if this could be a radio button
        const parent = element.closest('.styled__BoxWrapper-sc-esqoz3-0, .styled__NotificationRow-sc-5xhq84-2');
        if (parent) {
          analysis.isRadioButton = true;
          
          // Analyze all SVG elements within and nearby
          const svgs = element.querySelectorAll('svg');
          const nearbysvgs = parent.querySelectorAll('svg');
          
          [...svgs, ...nearbysvgs].forEach(svg => {
            const paths = svg.querySelectorAll('path, circle, rect');
            paths.forEach(path => {
              const pathStyles = getComputedStyle(path);
              const fill = path.getAttribute('fill') || pathStyles.fill;
              const stroke = path.getAttribute('stroke') || pathStyles.stroke;
              
              analysis.svgPaths.push({
                tag: path.tagName,
                fill: fill,
                stroke: stroke,
                d: path.getAttribute('d'),
                opacity: pathStyles.opacity,
                visibility: pathStyles.visibility
              });
              
              // Check for blue colors
              if (fill && (fill.includes('blue') || fill.includes('#') || fill.includes('rgb'))) {
                analysis.hasBlueColor = true;
                analysis.pathColors.push(fill);
              }
            });
          });
          
          // Check if the element appears to have content vs empty
          const computedStyles = getComputedStyle(element);
          const hasVisibleContent = element.offsetWidth > 0 && element.offsetHeight > 0;
          const hasBackground = computedStyles.backgroundColor !== 'rgba(0, 0, 0, 0)';
          
          if (hasVisibleContent && (analysis.hasBlueColor || hasBackground)) {
            analysis.visualState = 'filled_unread';
            analysis.hasContent = true;
          } else if (hasVisibleContent && !analysis.hasBlueColor && !hasBackground) {
            analysis.visualState = 'empty_read';
            analysis.isEmpty = true;
          }
        }

        return analysis;
      }

      // Get all attributes of an element
      function getAllAttributes(element) {
        const attrs = {};
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          attrs[attr.name] = attr.value;
        }
        return attrs;
      }

      // Analyze child elements
      function analyzeChildElements(element) {
        const children = [];
        for (let child of element.children) {
          const childStyles = getComputedStyle(child);
          children.push({
            tagName: child.tagName.toLowerCase(),
            className: child.className,
            textContent: child.textContent ? child.textContent.trim().substring(0, 50) : '',
            backgroundColor: childStyles.backgroundColor,
            color: childStyles.color,
            display: childStyles.display
          });
        }
        return children;
      }

      // Analyze SVG content
      function analyzeSVGContent(element) {
        const svgData = {
          hasSVG: false,
          svgCount: 0,
          pathData: [],
          fillColors: [],
          strokeColors: []
        };

        const svgs = element.querySelectorAll('svg');
        if (svgs.length > 0) {
          svgData.hasSVG = true;
          svgData.svgCount = svgs.length;
          
          svgs.forEach(svg => {
            const paths = svg.querySelectorAll('path, circle, rect, polygon');
            paths.forEach(path => {
              const fill = path.getAttribute('fill');
              const stroke = path.getAttribute('stroke');
              const d = path.getAttribute('d');
              
              svgData.pathData.push({ tag: path.tagName, fill, stroke, d });
              if (fill) svgData.fillColors.push(fill);
              if (stroke) svgData.strokeColors.push(stroke);
            });
          });
        }

        return svgData;
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

      // Recover auto-saved data from previous sessions
      function recoverAutoSavedData() {
        try {
          // Check for auto-save data
          const autoSaveData = localStorage.getItem('skool-selectors-auto-save');
          const periodicData = localStorage.getItem('skool-selectors-periodic');
          
          let recoveredData = null;
          
          if (autoSaveData) {
            const autoSave = JSON.parse(autoSaveData);
            recoveredData = autoSave;
            console.log(`🔄 Found auto-save data from: ${autoSave.timestamp}`);
          }
          
          if (periodicData) {
            const periodic = JSON.parse(periodicData);
            if (!recoveredData || new Date(periodic.timestamp) > new Date(recoveredData.timestamp)) {
              recoveredData = periodic;
              console.log(`🔄 Found newer periodic save from: ${periodic.timestamp}`);
            }
          }
          
          if (recoveredData && recoveredData.elements) {
            window.markedElements = recoveredData.elements;
            console.log(`✅ Recovered ${Object.keys(recoveredData.elements).length} tagged elements`);
            
            // Show recovery notification
            setTimeout(() => {
              alert(`🔄 Recovered ${Object.keys(recoveredData.elements).length} previously tagged elements from your last session!`);
            }, 1000);
          }
          
        } catch (error) {
          console.log('⚠️ Error recovering auto-saved data:', error);
        }
      }

      // Initialize when DOM is ready
      function initializeWorkflowManager() {
        if (document.getElementById('workflow-manager')) return;
        
        // Try to recover auto-saved data
        recoverAutoSavedData();
        
        const panel = createWorkflowPanel();
        renderWorkflow();

        // Panel controls
        document.getElementById('run-workflow')?.addEventListener('click', runWorkflow);
        document.getElementById('close-panel')?.addEventListener('click', () => panel.remove());
        
        // Add export button for manual data extraction
        const exportBtn = document.createElement('button');
        exportBtn.textContent = '📥 Export Tags';
        exportBtn.style.cssText = 'background: #28a745; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 8px; font-size: 11px;';
        exportBtn.addEventListener('click', () => {
          console.log('📋 ALL TAGGED ELEMENTS:');
          console.log(JSON.stringify(window.markedElements, null, 2));
          
          // Save to server instead of random download
          saveSelectorsToFile();
          console.log('💾 Tagged elements saved to project directory');
        });
        
        document.getElementById('panel-header').appendChild(exportBtn);
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

      // Auto-save when browser window closes
      window.addEventListener('beforeunload', () => {
        if (Object.keys(window.markedElements).length > 0) {
          console.log('💾 Auto-saving tagged elements on window close...');
          
          // Save to localStorage as backup
          localStorage.setItem('skool-selectors-auto-save', JSON.stringify({
            timestamp: new Date().toISOString(),
            elements: window.markedElements
          }));
          
          // Try to save to file (may not complete due to page unload)
          saveSelectorsToFile();
          
          // Don't download random files - just save to server
          console.log('💾 Tagged elements preserved in localStorage and server');
        }
      });

      // Auto-save periodically every 30 seconds
      setInterval(() => {
        if (Object.keys(window.markedElements).length > 0) {
          console.log('🔄 Periodic auto-save...');
          localStorage.setItem('skool-selectors-periodic', JSON.stringify({
            timestamp: new Date().toISOString(),
            elements: window.markedElements
          }));
          saveSelectorsToFile();
        }
      }, 30000);

      // Auto-resume workflow after page navigation
      function checkAutoResume() {
        const shouldResume = localStorage.getItem('auto-resume-workflow');
        if (shouldResume === 'true') {
          localStorage.removeItem('auto-resume-workflow');
          console.log('🔄 Auto-resuming workflow after page navigation...');
          console.log(`📍 Current URL: ${window.location.href}`);
          
          // Check if we have workflow state to resume
          const savedState = localStorage.getItem('skool-bot-workflow-state');
          if (savedState) {
            const state = JSON.parse(savedState);
            console.log(`📋 Resuming from step ${state.currentStep + 1}: ${window.botWorkflow[state.currentStep]?.description || 'Unknown'}`);
          }
          
          // Wait for page to fully load, then resume with retries
          let resumeAttempts = 0;
          const maxResumeAttempts = 5;
          
          function attemptResume() {
            resumeAttempts++;
            console.log(`🔄 Resume attempt ${resumeAttempts}/${maxResumeAttempts}...`);
            
            if (typeof window.runWorkflow === 'function') {
              console.log('✅ Workflow function found, resuming...');
              window.runWorkflow();
            } else if (resumeAttempts < maxResumeAttempts) {
              console.log('⚠️ Workflow function not ready, retrying in 2s...');
              setTimeout(attemptResume, 2000);
            } else {
              console.error('❌ Failed to resume workflow - function not available after multiple attempts');
              // Clear the state to prevent infinite loops
              localStorage.removeItem('skool-bot-workflow-state');
              localStorage.removeItem('skool-bot-workflow-data');
            }
          }
          
          // Initial delay to let page settle
          setTimeout(attemptResume, 2000);
        }
      }
      
      // Initialize when page loads
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          initializeWorkflowManager();
          checkAutoResume();
        });
      } else {
        initializeWorkflowManager();
        checkAutoResume();
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
