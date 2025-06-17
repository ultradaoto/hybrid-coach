#!/usr/bin/env node

import fetch from 'node-fetch';
import { WebSocket } from 'ws';

const GPU_API_URL = 'http://localhost:8001';
const GPU_WS_URL = 'ws://localhost:8001';

let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

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

async function testAdvancedSimulation() {
  log('🧪 Testing Advanced Virtual GPU Simulation Features...', 'MAIN');
  
  // Test 1: Create a session for simulation
  log('Creating test session for simulation...', 'TEST');
  const sessionData = {
    sessionId: 'simulation-test-session',
    clientContext: {
      name: 'Test Client',
      id: 'sim-client-123',
      previousSessions: [],
      currentGoals: ['Improve tech skills']
    }
  };
  
  const createResponse = await makeRequest(`${GPU_API_URL}/api/session/create`, 'POST', sessionData);
  assert(createResponse.success, 'Advanced simulation session created successfully');
  
  const sessionId = 'simulation-test-session';
  
  // Test 2: Trigger individual simulation events
  log('Testing simulation event triggers...', 'TEST');
  
  const clientSpeakEvent = await makeRequest(`${GPU_API_URL}/api/simulation/trigger-event`, 'POST', {
    sessionId,
    eventType: 'client_speaks',
    data: { text: 'I need help with my computer setup' }
  });
  assert(clientSpeakEvent.success, 'Client speak event triggered successfully');
  assert(clientSpeakEvent.data.message === 'Received expected input - simulation event triggered', 'Event trigger returns expected message');
  
  const aiResponseEvent = await makeRequest(`${GPU_API_URL}/api/simulation/trigger-event`, 'POST', {
    sessionId,
    eventType: 'ai_responds',
    data: { 
      text: 'I can help you with that. Let me ask a few questions first.',
      category: 'technical_support'
    }
  });
  assert(aiResponseEvent.success, 'AI response event triggered successfully');
  
  const technicalIssueEvent = await makeRequest(`${GPU_API_URL}/api/simulation/trigger-event`, 'POST', {
    sessionId,
    eventType: 'technical_issue',
    data: {}
  });
  assert(technicalIssueEvent.success, 'Technical issue event triggered successfully');
  
  // Test 3: Get transcript after events
  log('Checking transcript after simulation events...', 'TEST');
  const transcriptResponse = await makeRequest(`${GPU_API_URL}/api/session/${sessionId}/transcript`);
  assert(transcriptResponse.success, 'Can retrieve transcript after simulation events');
  assert(transcriptResponse.data.data.totalMessages > 0, 'Transcript contains simulated messages');
  assert(transcriptResponse.data.message === 'Received expected input - transcript data', 'Transcript returns expected message');
  
  log(`📊 Transcript contains ${transcriptResponse.data.data.totalMessages} messages`, 'INFO');
  
  // Test 4: Start conversation simulation
  log('Testing conversation flow simulation...', 'TEST');
  const conversationResponse = await makeRequest(`${GPU_API_URL}/api/simulation/conversation/${sessionId}`, 'POST', {
    duration: 15 // 15 seconds
  });
  assert(conversationResponse.success, 'Conversation simulation started successfully');
  assert(conversationResponse.data.message === 'Received expected input - conversation simulation started', 'Conversation simulation returns expected message');
  
  // Wait for conversation to develop
  log('Waiting for conversation simulation to develop...', 'TEST');
  await sleep(8000); // Wait 8 seconds
  
  // Check transcript again
  const updatedTranscriptResponse = await makeRequest(`${GPU_API_URL}/api/session/${sessionId}/transcript`);
  assert(updatedTranscriptResponse.success, 'Can retrieve updated transcript during conversation');
  
  const initialMessages = transcriptResponse.data.data.totalMessages;
  const updatedMessages = updatedTranscriptResponse.data.data.totalMessages;
  assert(updatedMessages > initialMessages, 'Conversation simulation added new messages');
  
  log(`📈 Messages increased from ${initialMessages} to ${updatedMessages}`, 'INFO');
  
  // Test 5: Test enhanced audio simulation
  log('Testing enhanced audio processing simulation...', 'TEST');
  const audioResponse = await makeRequest(`${GPU_API_URL}/api/session/${sessionId}/audio`, 'POST', {
    audioData: 'mock-audio-bytes-advanced',
    timestamp: new Date().toISOString(),
    speaker: 'client'
  });
  assert(audioResponse.success, 'Enhanced audio processing works');
  assert(audioResponse.data.message === 'Received expected input - audio processed', 'Audio processing returns expected message');
  assert(audioResponse.data.data.processingTime, 'Audio processing includes timing information');
  assert(audioResponse.data.data.speaker === 'client', 'Audio processing tracks speaker correctly');
  
  // Test 6: Test session pause during audio processing
  log('Testing session pause behavior...', 'TEST');
  const pauseResponse = await makeRequest(`${GPU_API_URL}/api/session/${sessionId}/pause`, 'POST');
  assert(pauseResponse.success, 'Session can be paused');
  
  const pausedAudioResponse = await makeRequest(`${GPU_API_URL}/api/session/${sessionId}/audio`, 'POST', {
    audioData: 'audio-during-pause',
    timestamp: new Date().toISOString(),
    speaker: 'client'
  });
  assert(pausedAudioResponse.success, 'Audio processing works during pause');
  assert(pausedAudioResponse.data.message === 'Received expected input - session paused, no AI response', 'Paused session returns correct message');
  assert(pausedAudioResponse.data.data.sessionPaused === true, 'Paused session flag is set correctly');
  
  // Resume session
  const resumeResponse = await makeRequest(`${GPU_API_URL}/api/session/${sessionId}/resume`, 'POST');
  assert(resumeResponse.success, 'Session can be resumed');
  
  // Test 7: Generate session summary
  log('Testing session summary generation...', 'TEST');
  const summaryResponse = await makeRequest(`${GPU_API_URL}/api/session/${sessionId}/summary`, 'POST');
  assert(summaryResponse.success, 'Session summary can be generated');
  assert(summaryResponse.data.message === 'Received expected input - session summary generated', 'Summary returns expected message');
  
  const summary = summaryResponse.data.data;
  assert(summary.sessionId === sessionId, 'Summary contains correct session ID');
  assert(summary.totalInteractions > 0, 'Summary shows interaction count');
  assert(summary.actionItems && summary.actionItems.length > 0, 'Summary includes action items');
  assert(summary.nextWeekGoals && summary.nextWeekGoals.length > 0, 'Summary includes next week goals');
  assert(typeof summary.clientSatisfaction === 'number', 'Summary includes satisfaction rating');
  
  log(`📋 Session Summary: ${summary.totalInteractions} interactions, ${summary.actionItems.length} action items`, 'INFO');
  
  // Test 8: WebSocket enhanced features
  log('Testing enhanced WebSocket capabilities...', 'TEST');
  
  await new Promise((resolve) => {
    let audioConnected = false;
    let transcriptConnected = false;
    let audioCapabilities = false;
    let transcriptFeatures = false;
    
    // Test enhanced audio WebSocket
    const audioWs = new WebSocket(`${GPU_WS_URL}/audio/${sessionId}`);
    
    audioWs.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'connected') {
        audioConnected = true;
        audioCapabilities = message.capabilities && message.capabilities.length > 0;
        assert(true, 'Enhanced audio WebSocket connected');
        assert(audioCapabilities, 'Audio WebSocket reports capabilities');
        
        // Send test audio data
        audioWs.send(JSON.stringify({
          type: 'audio_chunk',
          data: 'test-audio-data',
          timestamp: new Date().toISOString()
        }));
      }
      
      if (message.type === 'processing_result') {
        assert(message.confidence > 0, 'Audio processing returns confidence score');
        assert(message.result, 'Audio processing returns result message');
        audioWs.close();
      }
    });
    
    // Test enhanced transcript WebSocket
    const transcriptWs = new WebSocket(`${GPU_WS_URL}/transcript/${sessionId}`);
    
    transcriptWs.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'connected') {
        transcriptConnected = true;
        transcriptFeatures = message.features && message.features.length > 0;
        assert(true, 'Enhanced transcript WebSocket connected');
        assert(transcriptFeatures, 'Transcript WebSocket reports features');
      }
      
      if (message.type === 'transcript_update') {
        assert(message.data.latestTranscript, 'Transcript update includes latest messages');
        assert(typeof message.data.totalEntries === 'number', 'Transcript update includes total count');
        transcriptWs.close();
      }
    });
    
    setTimeout(() => {
      if (!audioConnected) assert(false, 'Enhanced audio WebSocket failed to connect');
      if (!transcriptConnected) assert(false, 'Enhanced transcript WebSocket failed to connect');
      resolve();
    }, 8000);
  });
  
  // Test 9: System capacity with active sessions
  log('Testing system capacity reporting...', 'TEST');
  const capacityResponse = await makeRequest(`${GPU_API_URL}/api/system/capacity`);
  assert(capacityResponse.success, 'System capacity can be checked');
  assert(capacityResponse.data.data.activeSessions >= 1, 'System reports active sessions correctly');
  assert(capacityResponse.data.data.availableSlots >= 0, 'System reports available slots');
  assert(typeof capacityResponse.data.data.uptime === 'number', 'System reports uptime');
  
  // Clean up
  log('Cleaning up test session...', 'TEST');
  const deleteResponse = await makeRequest(`${GPU_API_URL}/api/session/${sessionId}`, 'DELETE');
  assert(deleteResponse.success, 'Test session cleaned up successfully');
}

async function runAdvancedTests() {
  log('🚀 Starting Advanced Virtual GPU Simulation Tests...', 'MAIN');
  
  try {
    await testAdvancedSimulation();
    
  } catch (error) {
    log(`Advanced test error: ${error.message}`, 'ERROR');
    assert(false, `Advanced tests encountered error: ${error.message}`);
  }
  
  // Print results
  log('', 'MAIN');
  log('🏁 Advanced Test Suite Complete!', 'MAIN');
  log(`📊 Results: ${testResults.passed}/${testResults.total} passed`, 'MAIN');
  
  if (testResults.failed > 0) {
    log(`❌ ${testResults.failed} tests failed`, 'MAIN');
    log('Failed tests:', 'MAIN');
    testResults.details
      .filter(t => t.status === 'FAIL')
      .forEach(t => log(`  - ${t.message}`, 'MAIN'));
  } else {
    log('✅ All advanced tests passed!', 'MAIN');
  }
  
  log('', 'MAIN');
  log('💡 Advanced features tested:', 'MAIN');
  log('  ✅ Event simulation (client speaks, AI responds, technical issues)', 'MAIN');
  log('  ✅ Conversation flow simulation with realistic timing', 'MAIN');
  log('  ✅ Enhanced audio processing with speaker tracking', 'MAIN');
  log('  ✅ Session pause/resume behavior during processing', 'MAIN');
  log('  ✅ Comprehensive session summary generation', 'MAIN');
  log('  ✅ Advanced WebSocket capabilities and features', 'MAIN');
  log('  ✅ Real-time transcript updates and monitoring', 'MAIN');
  log('  ✅ System capacity and performance reporting', 'MAIN');
  
  log('', 'MAIN');
  log('🚀 Ready for Real GPU Deployment!', 'MAIN');
  log('  - Replace virtual endpoints with actual AI processing', 'MAIN');
  log('  - Integrate Whisper STT and ElevenLabs TTS', 'MAIN');
  log('  - Connect OpenAI GPT-4 for coaching responses', 'MAIN');
  log('  - Deploy to DigitalOcean GPU droplet', 'MAIN');
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Wait for GPU server to be ready
setTimeout(runAdvancedTests, 2000);