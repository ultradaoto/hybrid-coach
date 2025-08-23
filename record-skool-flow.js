#!/usr/bin/env node

import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Playwright Codegen Script for Skool
 * This script will open Playwright's built-in code generator
 * which records your actions and generates the code automatically
 */

async function startCodegen() {
  console.log('🎬 Starting Playwright Code Generator for Skool...');
  console.log('📋 This will open a browser with recording capabilities');
  console.log('💡 Everything you click will be recorded as code!');
  
  const browser = await chromium.launch({
    headless: false,
    devtools: true,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    // Load existing auth if available
    storageState: 'skool-auth.json'
  });

  const page = await context.newPage();

  console.log('🚀 Opening Skool login page...');
  console.log('📝 Perform your login and DM flow - all actions will be recorded!');
  console.log('🛑 Close the browser when done to save the recording');

  // Start at login page
  await page.goto('https://www.skool.com/login');

  // Keep the process alive until browser closes
  page.on('close', () => {
    console.log('✅ Recording session ended');
    process.exit(0);
  });

  // Wait indefinitely
  await new Promise(() => {});
}

startCodegen().catch(console.error);
