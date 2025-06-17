#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let processes = [];

function log(message, type = 'MAIN') {
  console.log(`[${type}] ${new Date().toISOString()} - ${message}`);
}

function cleanup() {
  log('Cleaning up processes...', 'CLEANUP');
  processes.forEach(proc => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });
  process.exit(0);
}

// Handle cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function runTests() {
  log('🚀 Starting Local AI System Test Suite...', 'MAIN');
  
  try {
    // Step 1: Start Virtual GPU Server
    log('📡 Starting Virtual GPU Server...', 'SETUP');
    const gpuServer = spawn('node', ['virtual-gpu-server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });
    processes.push(gpuServer);
    
    gpuServer.stdout.on('data', (data) => {
      console.log(`[GPU] ${data.toString().trim()}`);
    });
    
    gpuServer.stderr.on('data', (data) => {
      console.error(`[GPU-ERR] ${data.toString().trim()}`);
    });
    
    // Step 2: Start Main App
    log('🖥️  Starting Main CPU Application...', 'SETUP');
    const mainApp = spawn('node', ['src/app.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: 'development' }
    });
    processes.push(mainApp);
    
    mainApp.stdout.on('data', (data) => {
      console.log(`[CPU] ${data.toString().trim()}`);
    });
    
    mainApp.stderr.on('data', (data) => {
      console.error(`[CPU-ERR] ${data.toString().trim()}`);
    });
    
    // Step 3: Wait for services to start
    log('⏳ Waiting for services to initialize...', 'SETUP');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 4: Run Tests
    log('🧪 Running Test Suite...', 'TEST');
    const testRunner = spawn('node', ['test-ai-system.js'], {
      stdio: 'inherit',
      cwd: __dirname
    });
    processes.push(testRunner);
    
    testRunner.on('close', (code) => {
      log(`Test suite completed with code: ${code}`, 'TEST');
      
      if (code === 0) {
        log('✅ All tests passed!', 'RESULT');
      } else {
        log('❌ Some tests failed. Check output above.', 'RESULT');
      }
      
      setTimeout(cleanup, 1000);
    });
    
  } catch (error) {
    log(`Error starting test suite: ${error.message}`, 'ERROR');
    cleanup();
  }
}

// Check if required files exist
import { existsSync } from 'fs';

const requiredFiles = [
  'virtual-gpu-server.js',
  'src/app.js', 
  'test-ai-system.js'
];

const missingFiles = requiredFiles.filter(file => !existsSync(join(__dirname, file)));

if (missingFiles.length > 0) {
  log(`❌ Missing required files: ${missingFiles.join(', ')}`, 'ERROR');
  process.exit(1);
}

// Start the test suite
runTests();