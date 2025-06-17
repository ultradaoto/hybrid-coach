#!/usr/bin/env node

import fetch from 'node-fetch';
import { WebSocket } from 'ws';

// Test configuration
const CPU_API_URL = 'http://localhost:3000';
const GPU_API_URL = 'http://localhost:8001';
const GPU_WS_URL = 'ws://localhost:8001';

// Test state
let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Utility functions
function log(message, type = 'INFO') {
  console.log(`[${type}] ${new Date().toISOString()} - ${message}`);
}

function assert(condition, message) {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    log(`✅ PASS: ${message}`, 'TEST');
    testResults.details.push({ status: 'PASS', message });
  } else {
    testResults.failed++;
    log(`❌ FAIL: ${message}`, 'TEST');
    testResults.details.push({ status: 'FAIL', message });
  }
}

async function makeRequest(url, method = 'GET', data = null) {
  try {
    const config = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data) {
      config.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, config);
    const result = await response.json();
    
    return {
      success: response.ok,
      status: response.status,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test functions
async function testGPUServerHealth() {
  log('Testing GPU server health...', 'TEST');
  
  const response = await makeRequest(`${GPU_API_URL}/health`);
  assert(response.success, 'GPU server is responding');
  assert(response.data.status === 'healthy', 'GPU server reports healthy status');
}

async function testCPUServerHealth() {
  log('Testing CPU server health...', 'TEST');
  
  const response = await makeRequest(`${CPU_API_URL}/health`);
  assert(response.success, 'CPU server is responding');
}

async function testGPUPowerManagement() {
  log('Testing GPU power management...', 'TEST');
  
  // Test power on
  const powerOn = await makeRequest(`${GPU_API_URL}/api/system/power/on`, 'POST');
  assert(powerOn.success, 'GPU power on request successful');
  assert(powerOn.data.message === 'Received expected input - GPU powered on', 'GPU power on returns expected message');
  
  // Test status check
  const status = await makeRequest(`${GPU_API_URL}/api/system/capacity`);
  assert(status.success, 'GPU status check successful');
  assert(status.data.message === 'Received expected input', 'GPU status returns expected message');
  
  // Test power off
  const powerOff = await makeRequest(`${GPU_API_URL}/api/system/power/off`, 'POST');
  assert(powerOff.success, 'GPU power off request successful');
  assert(powerOff.data.message === 'Received expected input - GPU powered off', 'GPU power off returns expected message');
  
  // Power back on for other tests
  await makeRequest(`${GPU_API_URL}/api/system/power/on`, 'POST');
}

async function testCPUGPUCommunication() {
  log('Testing CPU-GPU communication...', 'TEST');
  
  // Test GPU status through CPU API
  const status = await makeRequest(`${CPU_API_URL}/api/ai/gpu/status`);
  assert(status.success, 'CPU can communicate with GPU');
  
  if (status.success && status.data) {
    assert(status.data.message === 'Received expected input - GPU status', 'CPU receives expected GPU status message');
  } else {
    log(`CPU-GPU communication failed: ${status.error || 'Unknown error'}`, 'ERROR');
  }
  
  // Test GPU power management through CPU
  const powerTest = await makeRequest(`${CPU_API_URL}/api/ai/gpu/power/on`, 'POST');
  assert(powerTest.success, 'CPU can control GPU power');
  
  if (powerTest.success && powerTest.data) {
    assert(powerTest.data.message === 'Received expected input - GPU power on initiated', 'CPU power control returns expected message');
  } else {
    log(`CPU power control failed: ${powerTest.error || 'Unknown error'}`, 'ERROR');
  }
}

async function testSingleSessionLifecycle() {
  log('Testing single AI session lifecycle...', 'TEST');
  
  const sessionData = {
    appointmentId: 'test-appointment-1',
    clientId: 'test-client-1',
    coachId: 'test-coach-1'
  };
  
  // Start session
  const startResponse = await makeRequest(`${CPU_API_URL}/api/ai/session/start`, 'POST', sessionData);
  assert(startResponse.success, 'AI session starts successfully');
  
  if (!startResponse.success) {
    log(`Session start failed: ${startResponse.error || 'Unknown error'}`, 'ERROR');
    return; // Skip rest of test if session start fails
  }
  
  assert(startResponse.data && startResponse.data.message === 'Received expected input - AI session initialized', 'Session start returns expected message');
  
  const sessionId = startResponse.data ? startResponse.data.sessionId : null;
  assert(sessionId && sessionId.startsWith('ai-'), 'Session ID is generated correctly');
  
  // Test session status
  const statusResponse = await makeRequest(`${CPU_API_URL}/api/ai/session/${sessionId}/transcript`);
  assert(statusResponse.success, 'Can retrieve session transcript');
  assert(statusResponse.data.message === 'Received expected input - transcript data', 'Transcript returns expected message');
  
  // Test pause
  const pauseResponse = await makeRequest(`${CPU_API_URL}/api/ai/session/${sessionId}/pause`, 'POST', {
    coachId: 'test-coach-1',
    reason: 'test intervention'
  });
  assert(pauseResponse.success, 'AI session pauses successfully');
  assert(pauseResponse.data.message === 'Received expected input - AI paused, coach in control', 'Pause returns expected message');
  
  // Test resume
  const resumeResponse = await makeRequest(`${CPU_API_URL}/api/ai/session/${sessionId}/resume`, 'POST', {
    coachId: 'test-coach-1'
  });
  assert(resumeResponse.success, 'AI session resumes successfully');
  assert(resumeResponse.data.message === 'Received expected input - AI resumed, back in control', 'Resume returns expected message');
  
  // End session
  const endResponse = await makeRequest(`${CPU_API_URL}/api/ai/session/${sessionId}`, 'DELETE');
  assert(endResponse.success, 'AI session ends successfully');
  assert(endResponse.data.message === 'Received expected input - AI session ended', 'End session returns expected message');
}

async function testMultipleSessionsSimulation() {
  log('Testing multiple concurrent AI sessions...', 'TEST');
  
  const sessions = [];
  const sessionCount = 3;
  
  // Start multiple sessions
  for (let i = 1; i <= sessionCount; i++) {
    const sessionData = {
      appointmentId: `test-appointment-${i}`,
      clientId: `test-client-${i}`,
      coachId: `test-coach-${i}`
    };
    
    const response = await makeRequest(`${CPU_API_URL}/api/ai/session/start`, 'POST', sessionData);
    if (response.success) {
      sessions.push({
        sessionId: response.data.sessionId,
        ...sessionData
      });
    }
    
    await sleep(500); // Small delay between sessions
  }
  
  assert(sessions.length === sessionCount, `All ${sessionCount} sessions started successfully`);
  
  // Test session list
  const listResponse = await makeRequest(`${CPU_API_URL}/api/ai/sessions`);
  assert(listResponse.success, 'Can retrieve active sessions list');
  assert(listResponse.data.data.activeSessions === sessionCount, `Reports correct number of active sessions (${sessionCount})`);
  assert(listResponse.data.message === 'Received expected input - active sessions list', 'Sessions list returns expected message');
  
  // Test GPU capacity
  const capacityResponse = await makeRequest(`${CPU_API_URL}/api/ai/gpu/status`);
  assert(capacityResponse.success, 'Can check GPU capacity');
  assert(capacityResponse.data.data.activeSessions === sessionCount, `GPU reports correct session count (${sessionCount})`);
  
  // End all sessions
  for (const session of sessions) {
    const endResponse = await makeRequest(`${CPU_API_URL}/api/ai/session/${session.sessionId}`, 'DELETE');
    assert(endResponse.success, `Session ${session.sessionId} ends successfully`);
  }
  
  // Verify all sessions ended
  const finalListResponse = await makeRequest(`${CPU_API_URL}/api/ai/sessions`);
  assert(finalListResponse.data.data.activeSessions === 0, 'All sessions ended successfully');
}

async function testDirectGPUAPIs() {
  log('Testing direct GPU API endpoints...', 'TEST');
  
  // Test session creation directly on GPU
  const sessionData = {
    sessionId: 'direct-test-session',
    clientContext: { name: 'Test Client', id: 'test-123' }
  };
  
  const createResponse = await makeRequest(`${GPU_API_URL}/api/session/create`, 'POST', sessionData);
  assert(createResponse.success, 'Direct GPU session creation works');
  assert(createResponse.data.message === 'Received expected input', 'GPU session creation returns expected message');
  
  // Test audio processing simulation
  const audioData = {
    audioData: 'mock-audio-bytes',
    timestamp: new Date().toISOString()
  };
  
  const audioResponse = await makeRequest(`${GPU_API_URL}/api/session/direct-test-session/audio`, 'POST', audioData);
  assert(audioResponse.success, 'Direct GPU audio processing works');
  assert(audioResponse.data.message === 'Received expected input - audio processed', 'GPU audio processing returns expected message');
  
  // Clean up
  await makeRequest(`${GPU_API_URL}/api/session/direct-test-session`, 'DELETE');
}

async function testWebSocketConnections() {
  log('Testing WebSocket connections...', 'TEST');
  
  return new Promise((resolve) => {
    let audioConnected = false;
    let transcriptConnected = false;
    
    // Test audio stream WebSocket
    const audioWs = new WebSocket(`${GPU_WS_URL}/audio/test-ws-session`);
    
    audioWs.on('open', () => {
      log('Audio WebSocket connected', 'WS');
    });
    
    audioWs.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'connected') {
        audioConnected = true;
        assert(true, 'Audio WebSocket connection established');
        audioWs.close();
      }
    });
    
    // Test transcript stream WebSocket  
    const transcriptWs = new WebSocket(`${GPU_WS_URL}/transcript/test-ws-session`);
    
    transcriptWs.on('open', () => {
      log('Transcript WebSocket connected', 'WS');
    });
    
    transcriptWs.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'connected') {
        transcriptConnected = true;
        assert(true, 'Transcript WebSocket connection established');
        transcriptWs.close();
      }
    });
    
    // Wait for both connections or timeout
    setTimeout(() => {
      if (!audioConnected) {
        assert(false, 'Audio WebSocket connection failed');
      }
      if (!transcriptConnected) {
        assert(false, 'Transcript WebSocket connection failed');
      }
      resolve();
    }, 5000);
  });
}

async function testErrorHandling() {
  log('Testing error handling...', 'TEST');
  
  // Test invalid session ID
  const invalidResponse = await makeRequest(`${CPU_API_URL}/api/ai/session/invalid-session-id/pause`, 'POST', {
    coachId: 'test-coach'
  });
  assert(!invalidResponse.success, 'Invalid session ID returns error');
  assert(invalidResponse.status === 404, 'Invalid session returns 404 status');
  
  // Test missing required fields
  const incompleteResponse = await makeRequest(`${CPU_API_URL}/api/ai/session/start`, 'POST', {
    appointmentId: 'test-appointment'
    // Missing clientId and coachId
  });
  assert(!incompleteResponse.success, 'Incomplete session data returns error');
  assert(incompleteResponse.status === 400, 'Incomplete data returns 400 status');
}

// Main test runner
async function runAllTests() {
  log('🚀 Starting AI System Test Suite...', 'MAIN');
  log('Testing CPU ↔ GPU communication protocol', 'MAIN');
  
  try {
    // Basic connectivity tests
    await testGPUServerHealth();
    await testCPUServerHealth();
    
    // Power management tests
    await testGPUPowerManagement();
    
    // Communication tests
    await testCPUGPUCommunication();
    
    // Session lifecycle tests
    await testSingleSessionLifecycle();
    
    // Concurrent session tests
    await testMultipleSessionsSimulation();
    
    // Direct GPU API tests
    await testDirectGPUAPIs();
    
    // WebSocket tests
    await testWebSocketConnections();
    
    // Error handling tests
    await testErrorHandling();
    
  } catch (error) {
    log(`Test suite error: ${error.message}`, 'ERROR');
    assert(false, `Test suite encountered error: ${error.message}`);
  }
  
  // Print results
  log('', 'MAIN');
  log('🏁 Test Suite Complete!', 'MAIN');
  log(`📊 Results: ${testResults.passed}/${testResults.total} passed`, 'MAIN');
  
  if (testResults.failed > 0) {
    log(`❌ ${testResults.failed} tests failed`, 'MAIN');
    log('Failed tests:', 'MAIN');
    testResults.details
      .filter(t => t.status === 'FAIL')
      .forEach(t => log(`  - ${t.message}`, 'MAIN'));
  } else {
    log('✅ All tests passed!', 'MAIN');
  }
  
  log('', 'MAIN');
  log('💡 Next steps:', 'MAIN');
  log('  1. Deploy GPU droplet with real AI processing', 'MAIN');
  log('  2. Implement WebRTC audio streaming integration', 'MAIN');
  log('  3. Add real STT/TTS and OpenAI integration', 'MAIN');
  log('  4. Build coach dashboard with live transcript', 'MAIN');
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Wait a moment for servers to be ready
setTimeout(runAllTests, 2000);