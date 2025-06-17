#!/usr/bin/env node

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// In-memory session storage
const sessions = new Map();
const systemStatus = {
  status: 'ready',
  activeSessions: 0,
  maxSessions: 4,
  cpuUsage: '25%',
  memoryUsage: '1.2GB/8GB',
  lastStarted: new Date()
};

// Logging helper
function log(message) {
  console.log(`[VIRTUAL-GPU] ${new Date().toISOString()} - ${message}`);
}

// Session management
function createSession(sessionId, clientContext = {}) {
  const session = {
    id: sessionId,
    status: 'active',
    createdAt: new Date(),
    clientContext,
    transcript: [],
    aiResponses: [],
    pausedAt: null,
    resumedAt: null
  };
  
  sessions.set(sessionId, session);
  systemStatus.activeSessions = sessions.size;
  log(`Session created: ${sessionId}`);
  return session;
}

function deleteSession(sessionId) {
  if (sessions.delete(sessionId)) {
    systemStatus.activeSessions = sessions.size;
    log(`Session deleted: ${sessionId}`);
    return true;
  }
  return false;
}

// API Routes

// Create new AI session
app.post('/api/session/create', (req, res) => {
  const { sessionId, clientContext } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({
      status: 'error',
      message: 'sessionId is required'
    });
  }

  if (sessions.size >= systemStatus.maxSessions) {
    return res.status(503).json({
      status: 'error', 
      message: 'Maximum session capacity reached'
    });
  }

  try {
    const session = createSession(sessionId, clientContext);
    
    res.json({
      status: 'success',
      message: 'Received expected input',
      sessionId,
      data: {
        aiContextReady: true,
        audioStreamUrl: `ws://localhost:8001/audio/${sessionId}`,
        transcriptUrl: `ws://localhost:8001/transcript/${sessionId}`,
        session
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get session status
app.get('/api/session/:sessionId/status', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: 'Session not found'
    });
  }

  res.json({
    status: 'success',
    message: 'Received expected input',
    data: session
  });
});

// Pause AI processing
app.post('/api/session/:sessionId/pause', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: 'Session not found'
    });
  }

  session.status = 'paused';
  session.pausedAt = new Date();
  log(`Session paused: ${sessionId}`);

  res.json({
    status: 'success',
    message: 'Received expected input - AI processing paused',
    data: { sessionId, pausedAt: session.pausedAt }
  });
});

// Resume AI processing
app.post('/api/session/:sessionId/resume', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: 'Session not found'
    });
  }

  session.status = 'active';
  session.resumedAt = new Date();
  log(`Session resumed: ${sessionId}`);

  res.json({
    status: 'success',
    message: 'Received expected input - AI processing resumed',
    data: { sessionId, resumedAt: session.resumedAt }
  });
});

// Simulate audio stream processing with more realistic responses
app.post('/api/session/:sessionId/audio', (req, res) => {
  const { sessionId } = req.params;
  const { audioData, timestamp, speaker = 'client' } = req.body;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: 'Session not found'
    });
  }

  if (session.status === 'paused') {
    return res.json({
      status: 'success',
      message: 'Received expected input - session paused, no AI response',
      data: { sessionPaused: true }
    });
  }

  // Simulate more realistic transcript generation
  const mockPhrases = [
    "I've been having trouble with my phone lately",
    "The app keeps crashing when I try to open it", 
    "I think there might be a software issue",
    "My email isn't syncing properly",
    "The screen freezes sometimes",
    "I'm not sure how to fix this problem"
  ];
  
  const mockTranscript = speaker === 'client' 
    ? mockPhrases[Math.floor(Math.random() * mockPhrases.length)]
    : `Coach intervention: ${audioData}`;
    
  session.transcript.push({
    timestamp: timestamp || new Date().toISOString(),
    text: mockTranscript,
    speaker: speaker,
    confidence: 0.85 + (Math.random() * 0.15) // 85-100% confidence
  });

  // Generate contextual AI response based on transcript
  let mockAiResponse = '';
  if (speaker === 'client' && session.status === 'active') {
    const responses = [
      "I understand that can be frustrating. Let's try a few troubleshooting steps.",
      "Have you tried restarting the device? That often resolves software issues.",
      "Let's check if your software is up to date first.",
      "That sounds like a common issue. I can walk you through some solutions.",
      "Before we dive deeper, can you tell me when this started happening?",
      "I've seen this before. There are a few things we can try to fix this."
    ];
    
    mockAiResponse = responses[Math.floor(Math.random() * responses.length)];
    
    session.aiResponses.push({
      timestamp: new Date().toISOString(),
      text: mockAiResponse,
      type: 'coaching_response',
      category: 'technical_support',
      confidence: 0.92
    });
  }

  log(`Audio processed for session: ${sessionId} (${speaker})`);

  res.json({
    status: 'success',
    message: 'Received expected input - audio processed',
    data: {
      transcript: mockTranscript,
      aiResponse: mockAiResponse,
      processingTime: `${120 + Math.floor(Math.random() * 80)}ms`,
      speaker: speaker,
      sessionStatus: session.status
    }
  });
});

// Get session transcript and AI responses
app.get('/api/session/:sessionId/transcript', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: 'Session not found'
    });
  }

  res.json({
    status: 'success',
    message: 'Received expected input - transcript data',
    data: {
      sessionId,
      transcript: session.transcript,
      aiResponses: session.aiResponses,
      sessionStatus: session.status,
      totalMessages: session.transcript.length,
      lastUpdated: new Date().toISOString()
    }
  });
});

// Generate session summary
app.post('/api/session/:sessionId/summary', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: 'Session not found'
    });
  }

  const summary = {
    sessionId,
    duration: Math.floor((Date.now() - session.createdAt.getTime()) / 1000),
    totalInteractions: session.transcript.length,
    aiResponses: session.aiResponses.length,
    coachInterventions: session.pausedAt ? 1 : 0,
    mainTopics: ['technical_support', 'troubleshooting'],
    clientSatisfaction: 4.2 + (Math.random() * 0.8), // 4.2-5.0 rating
    actionItems: [
      'Follow up on software update',
      'Check device compatibility',
      'Schedule follow-up if issues persist'
    ],
    nextWeekGoals: [
      'Complete device optimization',
      'Learn backup procedures'
    ]
  };

  log(`Session summary generated: ${sessionId}`);

  res.json({
    status: 'success',
    message: 'Received expected input - session summary generated',
    data: summary
  });
});

// End session
app.delete('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (deleteSession(sessionId)) {
    res.json({
      status: 'success',
      message: 'Received expected input - session ended',
      data: { sessionId, endedAt: new Date() }
    });
  } else {
    res.status(404).json({
      status: 'error',
      message: 'Session not found'
    });
  }
});

// System capacity
app.get('/api/system/capacity', (req, res) => {
  res.json({
    status: 'success',
    message: 'Received expected input',
    data: {
      ...systemStatus,
      availableSlots: systemStatus.maxSessions - systemStatus.activeSessions,
      uptime: Math.floor((Date.now() - systemStatus.lastStarted.getTime()) / 1000)
    }
  });
});

// Mock GPU power management
app.post('/api/system/power/on', (req, res) => {
  log('GPU power on simulation');
  systemStatus.status = 'ready';
  systemStatus.lastStarted = new Date();
  
  res.json({
    status: 'success',
    message: 'Received expected input - GPU powered on',
    data: {
      powerState: 'on',
      bootTime: '45s',
      status: systemStatus.status
    }
  });
});

app.post('/api/system/power/off', (req, res) => {
  log('GPU power off simulation');
  systemStatus.status = 'offline';
  
  // Clear all sessions
  sessions.clear();
  systemStatus.activeSessions = 0;
  
  res.json({
    status: 'success', 
    message: 'Received expected input - GPU powered off',
    data: {
      powerState: 'off',
      sessionsCleared: sessions.size,
      shutdownTime: new Date()
    }
  });
});

// Advanced simulation controls
app.post('/api/simulation/trigger-event', (req, res) => {
  const { sessionId, eventType, data } = req.body;
  
  log(`Triggering simulation event: ${eventType} for session: ${sessionId}`);
  
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: 'Session not found'
    });
  }

  switch (eventType) {
    case 'client_speaks':
      // Simulate client speaking
      session.transcript.push({
        timestamp: new Date().toISOString(),
        text: data.text || "This is a simulated client message",
        speaker: 'client',
        confidence: 0.95
      });
      break;
      
    case 'ai_responds':
      // Simulate AI response
      session.aiResponses.push({
        timestamp: new Date().toISOString(),
        text: data.text || "This is a simulated AI response",
        type: 'coaching_response',
        category: data.category || 'general',
        confidence: 0.88
      });
      break;
      
    case 'technical_issue':
      // Simulate technical problem
      session.transcript.push({
        timestamp: new Date().toISOString(),
        text: "My computer won't start up properly",
        speaker: 'client',
        confidence: 0.92
      });
      session.aiResponses.push({
        timestamp: new Date().toISOString(),
        text: "Let's troubleshoot this step by step. First, can you check if the power cable is securely connected?",
        type: 'technical_support',
        category: 'hardware_troubleshooting',
        confidence: 0.94
      });
      break;
  }

  res.json({
    status: 'success',
    message: 'Received expected input - simulation event triggered',
    data: {
      eventType,
      sessionId,
      timestamp: new Date().toISOString()
    }
  });
});

// Simulate realistic conversation flow
app.post('/api/simulation/conversation/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { duration = 30 } = req.body; // seconds
  
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({
      status: 'error', 
      message: 'Session not found'
    });
  }

  log(`Starting conversation simulation for ${duration} seconds`);

  // Simulate a realistic back-and-forth conversation
  const conversationFlow = [
    { speaker: 'client', text: "Hi, I'm having some issues with my laptop", delay: 1000 },
    { speaker: 'ai', text: "Hello! I'm here to help. Can you describe what specific issues you're experiencing?", delay: 2000 },
    { speaker: 'client', text: "It's running very slowly and keeps freezing", delay: 3000 },
    { speaker: 'ai', text: "That can definitely be frustrating. Let's start with some basic troubleshooting. When did you first notice these issues?", delay: 2500 },
    { speaker: 'client', text: "It started about a week ago, maybe after a software update", delay: 4000 },
    { speaker: 'ai', text: "Software updates can sometimes cause compatibility issues. Let's check your system resources first. Can you open Task Manager?", delay: 3000 }
  ];

  let currentIndex = 0;
  const startTime = Date.now();

  const simulationInterval = setInterval(() => {
    if (currentIndex >= conversationFlow.length || 
        (Date.now() - startTime) > (duration * 1000)) {
      clearInterval(simulationInterval);
      return;
    }

    const entry = conversationFlow[currentIndex];
    
    if (entry.speaker === 'client') {
      session.transcript.push({
        timestamp: new Date().toISOString(),
        text: entry.text,
        speaker: 'client',
        confidence: 0.90 + (Math.random() * 0.1)
      });
    } else {
      session.aiResponses.push({
        timestamp: new Date().toISOString(),
        text: entry.text,
        type: 'coaching_response',
        category: 'technical_support',
        confidence: 0.92 + (Math.random() * 0.08)
      });
    }

    currentIndex++;
  }, 2000); // New interaction every 2 seconds

  res.json({
    status: 'success',
    message: 'Received expected input - conversation simulation started',
    data: {
      sessionId,
      duration,
      expectedInteractions: conversationFlow.length,
      startTime: new Date().toISOString()
    }
  });
});

// WebSocket handling for real-time communication
wss.on('connection', (ws, req) => {
  const url = req.url;
  log(`WebSocket connection: ${url}`);
  
  if (url.startsWith('/audio/')) {
    const sessionId = url.split('/audio/')[1];
    ws.sessionId = sessionId;
    ws.type = 'audio';
    
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Audio stream ready',
      sessionId,
      capabilities: ['speech_recognition', 'voice_synthesis', 'real_time_processing']
    }));
    
    // Simulate more realistic audio processing with variable timing
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        const processingTime = 80 + Math.random() * 120; // 80-200ms
        
        ws.send(JSON.stringify({
          type: 'audio_processed',
          timestamp: new Date().toISOString(),
          data: {
            processingTime: `${Math.round(processingTime)}ms`,
            sessionStatus: session?.status || 'unknown',
            audioQuality: 'excellent',
            backgroundNoise: Math.random() < 0.1 ? 'detected' : 'clear'
          }
        }));
      }
    }, 3000 + Math.random() * 4000); // Variable intervals
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        log(`Received audio data: ${data.type} for session ${sessionId}`);
        
        // Simulate audio processing response
        ws.send(JSON.stringify({
          type: 'processing_result',
          timestamp: new Date().toISOString(),
          result: 'Audio chunk processed successfully',
          confidence: 0.94,
          sessionId
        }));
      } catch (error) {
        log(`WebSocket message error: ${error.message}`, 'ERROR');
      }
    });
    
    ws.on('close', () => {
      clearInterval(interval);
      log(`Audio stream closed: ${sessionId}`);
    });
  }
  
  if (url.startsWith('/transcript/')) {
    const sessionId = url.split('/transcript/')[1];
    ws.sessionId = sessionId;
    ws.type = 'transcript';
    
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Transcript stream ready',
      sessionId,
      features: ['real_time_transcription', 'speaker_identification', 'confidence_scoring']
    }));
    
    // Send periodic transcript updates
    const transcriptInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        
        ws.send(JSON.stringify({
          type: 'transcript_update',
          timestamp: new Date().toISOString(),
          data: {
            latestTranscript: session.transcript.slice(-5), // Last 5 entries
            totalEntries: session.transcript.length,
            sessionStatus: session.status
          }
        }));
      }
    }, 5000);
    
    ws.on('close', () => {
      clearInterval(transcriptInterval);
      log(`Transcript stream closed: ${sessionId}`);
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Virtual GPU server running',
    timestamp: new Date(),
    sessions: sessions.size
  });
});

// Start server
const PORT = 8001;
server.listen(PORT, () => {
  log(`Virtual GPU Server running on port ${PORT}`);
  log(`Health check: http://localhost:${PORT}/health`);
  log(`WebSocket endpoint: ws://localhost:${PORT}`);
  log('Ready to receive API tests from CPU instance');
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down Virtual GPU Server...');
  wss.close();
  server.close(() => {
    log('Virtual GPU Server stopped');
    process.exit(0);
  });
});