#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

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

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      recordVideo: {
        dir: './playwright-videos/',
        size: { width: 1920, height: 1080 }
      }
    });

    this.page = await this.context.newPage();

    // Load existing selectors
    await this.loadSelectors();

    // Inject enhanced workflow manager
    await this.injectWorkflowManager();

    console.log('🎬 Opening Skool.com...');
    await this.page.goto('https://www.skool.com/login');
    
    console.log('✅ Workflow Manager ready!');
    console.log('📋 Use the bottom-left panel to build your bot workflow');
    console.log('🎯 Ctrl + Right-click elements to tag them');
    
    // Keep the page open for interaction
    await this.page.pause();
  }

  async injectWorkflowManager() {
    await this.page.addInitScript(() => {
      // Global state
      window.markedElements = {};
      window.botWorkflow = [
        { id: 1, type: 'click', target: 'mail-icon', description: 'Click mail icon to open conversation list', selector: '.styled__ButtonWrapper-sc-1crx28g-1.GvgtH', status: 'pending' },
        { id: 2, type: 'wait', target: 'conversation-list', description: 'Wait for conversation list to load', delay: 2000, status: 'pending' },
        { id: 3, type: 'click', target: 'sterling-conversation', description: 'Click Sterling Cooley conversation', selector: 'text="Sterling Cooley"', status: 'pending' },
        { id: 4, type: 'wait', target: 'chat-window', description: 'Wait for chat window to open', delay: 3000, status: 'pending' },
        { id: 5, type: 'type', target: 'message-input', description: 'Type login message', selector: '.styled__MultiLineInput-sc-1saiqqb-2', text: 'I will have your link shortly...', status: 'pending' },
        { id: 6, type: 'click', target: 'send-button', description: 'Send the message', selector: 'button[type="submit"]', status: 'pending' }
      ];

      let draggedItem = null;
      let currentElement = null;
      let customMenu = null;

      // Element types for tagging
      const ELEMENT_TYPES = {
        'mail-icon-normal': '📧 Mail Icon (Normal)',
        'mail-icon-unread': '🔴 Mail Icon (Unread)',
        'conversation-item': '📄 Conversation List Item',
        'conversation-sterling-cooley': '👤 Sterling Cooley Conversation',
        'conversation-jie-lu': '👤 Jie Lu Conversation',
        'message-input': '📝 Message Input Field',
        'send-button': '📤 Send Button',
        'chat-close-button': '❌ Chat Close Button',
        'profile-link': '🔗 Profile Link',
        'username-them': '👤 Username (Other Person)',
        'timestamp-time': '🕐 Message Timestamp',
        'message-bubble': '💬 Message Bubble',
        'green-radio-button': '🟢 Green Radio Button (UNREAD)',
        'blue-radio-button': '🔵 Blue Radio Button (UNREAD)',
        'conversation-unread': '🔴 Unread Conversation Item',
        'conversation-read': '✅ Read Conversation Item'
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

        container.innerHTML = window.botWorkflow.map((step, index) => `
          <div class="workflow-step" data-step-id="${step.id}" style="
            margin-bottom: 8px; 
            padding: 8px; 
            background: ${step.status === 'completed' ? '#d4edda' : step.status === 'running' ? '#fff3cd' : '#f8f9fa'}; 
            border: 1px solid ${step.status === 'completed' ? '#c3e6cb' : step.status === 'running' ? '#ffeaa7' : '#dee2e6'}; 
            border-radius: 4px; 
            cursor: grab;
            user-select: none;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="flex: 1;">
                <strong style="color: #333;">${index + 1}. ${step.type.toUpperCase()}</strong>
                <div style="color: #666; font-size: 10px; margin-top: 2px;">${step.description}</div>
                ${step.selector ? `<div style="color: #007bff; font-size: 9px; font-family: monospace; margin-top: 2px;">${step.selector}</div>` : ''}
              </div>
              <div>
                <button onclick="editWorkflowStep(${step.id})" style="background: #17a2b8; border: none; color: white; padding: 2px 4px; border-radius: 2px; cursor: pointer; font-size: 9px; margin-right: 2px;">✏️</button>
                <button onclick="deleteWorkflowStep(${step.id})" style="background: #dc3545; border: none; color: white; padding: 2px 4px; border-radius: 2px; cursor: pointer; font-size: 9px;">🗑️</button>
              </div>
            </div>
          </div>
        `).join('');

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

      // Run workflow
      window.runWorkflow = async function() {
        for (const step of window.botWorkflow) {
          step.status = 'running';
          renderWorkflow();
          
          try {
            if (step.type === 'click') {
              const element = document.querySelector(step.selector);
              if (element) {
                element.click();
                console.log(`✅ Clicked: ${step.description}`);
              } else {
                console.error(`❌ Element not found: ${step.selector}`);
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
            }
            
            step.status = 'completed';
            renderWorkflow();
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`❌ Step failed: ${step.description}`, error);
            step.status = 'pending';
            renderWorkflow();
            break;
          }
        }
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

      // Mark element function
      function markElement(element, type, description) {
        const selector = generateSelector(element);
        
        window.markedElements[type] = {
          selector: { selector },
          description,
          timestamp: new Date().toISOString(),
          element: element
        };

        updateElementDisplay();
        console.log(`🎯 Marked ${type}: ${selector}`);
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

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
async function main() {
  const manager = new SkoolWorkflowManager();
  
  try {
    await manager.initialize();
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await manager.cleanup();
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down workflow manager...');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
