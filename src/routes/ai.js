import { Router } from 'express';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';
import { prisma } from '../lib/prisma.js';

const router = Router();

// Configuration
const GPU_SERVER_URL = process.env.GPU_SERVER_URL || 'http://localhost:8001';
const GPU_WS_URL = process.env.GPU_WS_URL || 'ws://localhost:8001';

// In-memory session tracking
const activeSessions = new Map();

// Logging helper
function log(message) {
  console.log(`[CPU-AI] ${new Date().toISOString()} - ${message}`);
}

// GPU Communication Helper
async function callGPU(endpoint, method = 'GET', data = null) {
  try {
    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(`${GPU_SERVER_URL}${endpoint}`, config);
    const result = await response.json();
    
    log(`GPU ${method} ${endpoint} - Status: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`GPU API Error: ${result.message || 'Unknown error'}`);
    }
    
    return result;
  } catch (error) {
    log(`GPU communication error: ${error.message}`);
    throw error;
  }
}

// Start AI Session
router.post('/session/start', async (req, res) => {
  try {
    const { appointmentId, clientId, coachId } = req.body;
    
    if (!appointmentId || !clientId || !coachId) {
      return res.status(400).json({
        status: 'error',
        message: 'appointmentId, clientId, and coachId are required'
      });
    }

    // Get client context from database
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      include: { profile: true }
    });

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });

    if (!appointment) {
      return res.status(404).json({
        status: 'error',
        message: 'Appointment not found'
      });
    }

    // Create session ID
    const sessionId = `ai-${appointmentId}-${Date.now()}`;
    
    // Prepare client context for AI
    const clientContext = {
      clientId,
      name: client.displayName,
      profile: client.profile?.bioJson || {},
      previousSessions: [], // TODO: Fetch from database
      currentGoals: [], // TODO: Implement
      lastSessionSummary: null // TODO: Implement
    };

    // Call GPU to create AI session
    const gpuResponse = await callGPU('/api/session/create', 'POST', {
      sessionId,
      clientContext
    });

    // Store session info locally
    activeSessions.set(sessionId, {
      sessionId,
      appointmentId,
      clientId,
      coachId,
      status: 'active',
      startedAt: new Date(),
      gpuData: gpuResponse.data
    });

    log(`AI session started: ${sessionId}`);

    res.json({
      status: 'success',
      message: 'Received expected input - AI session initialized',
      data: {
        sessionId,
        audioStreamUrl: gpuResponse.data.audioStreamUrl,
        transcriptUrl: gpuResponse.data.transcriptUrl,
        aiReady: true
      }
    });

  } catch (error) {
    log(`Error starting AI session: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Pause AI (Coach takeover)
router.post('/session/:sessionId/pause', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { coachId, reason } = req.body;

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    // Call GPU to pause AI processing
    const gpuResponse = await callGPU(`/api/session/${sessionId}/pause`, 'POST', {
      coachId,
      reason
    });

    // Update local session
    session.status = 'paused';
    session.pausedAt = new Date();
    session.pausedBy = coachId;
    session.pauseReason = reason;

    log(`AI paused by coach: ${sessionId}`);

    res.json({
      status: 'success',
      message: 'Received expected input - AI paused, coach in control',
      data: {
        sessionId,
        pausedAt: session.pausedAt,
        coachInControl: true
      }
    });

  } catch (error) {
    log(`Error pausing AI session: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Resume AI
router.post('/session/:sessionId/resume', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { coachId } = req.body;

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    // Call GPU to resume AI processing
    const gpuResponse = await callGPU(`/api/session/${sessionId}/resume`, 'POST', {
      coachId
    });

    // Update local session
    session.status = 'active';
    session.resumedAt = new Date();
    session.resumedBy = coachId;

    log(`AI resumed by coach: ${sessionId}`);

    res.json({
      status: 'success',
      message: 'Received expected input - AI resumed, back in control',
      data: {
        sessionId,
        resumedAt: session.resumedAt,
        aiInControl: true
      }
    });

  } catch (error) {
    log(`Error resuming AI session: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get live transcript
router.get('/session/:sessionId/transcript', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    // Get transcript from GPU
    const gpuResponse = await callGPU(`/api/session/${sessionId}/status`);

    res.json({
      status: 'success',
      message: 'Received expected input - transcript data',
      data: {
        sessionId,
        transcript: gpuResponse.data.transcript || [],
        aiResponses: gpuResponse.data.aiResponses || [],
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    log(`Error getting transcript: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// End AI Session
router.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    // Call GPU to end session
    const gpuResponse = await callGPU(`/api/session/${sessionId}`, 'DELETE');

    // Remove from local tracking
    activeSessions.delete(sessionId);

    log(`AI session ended: ${sessionId}`);

    res.json({
      status: 'success',
      message: 'Received expected input - AI session ended',
      data: {
        sessionId,
        endedAt: new Date(),
        duration: Date.now() - session.startedAt.getTime()
      }
    });

  } catch (error) {
    log(`Error ending AI session: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GPU Power Management
router.post('/gpu/power/on', async (req, res) => {
  try {
    log('Requesting GPU power on...');
    
    const gpuResponse = await callGPU('/api/system/power/on', 'POST');

    res.json({
      status: 'success',
      message: 'Received expected input - GPU power on initiated',
      data: gpuResponse.data
    });

  } catch (error) {
    log(`Error powering on GPU: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

router.post('/gpu/power/off', async (req, res) => {
  try {
    log('Requesting GPU power off...');
    
    // Clear all active sessions first
    activeSessions.clear();
    
    const gpuResponse = await callGPU('/api/system/power/off', 'POST');

    res.json({
      status: 'success',
      message: 'Received expected input - GPU power off initiated',
      data: gpuResponse.data
    });

  } catch (error) {
    log(`Error powering off GPU: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// GPU Status Check
router.get('/gpu/status', async (req, res) => {
  try {
    const gpuResponse = await callGPU('/api/system/capacity');

    res.json({
      status: 'success',
      message: 'Received expected input - GPU status',
      data: {
        ...gpuResponse.data,
        cpuActiveSessions: activeSessions.size,
        cpuSessionIds: Array.from(activeSessions.keys())
      }
    });

  } catch (error) {
    log(`Error checking GPU status: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'GPU not responding - may be offline',
      data: {
        cpuActiveSessions: activeSessions.size,
        lastError: error.message
      }
    });
  }
});

// List active AI sessions
router.get('/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.values());
  
  res.json({
    status: 'success',
    message: 'Received expected input - active sessions list',
    data: {
      activeSessions: sessions.length,
      sessions: sessions.map(s => ({
        sessionId: s.sessionId,
        appointmentId: s.appointmentId,
        status: s.status,
        startedAt: s.startedAt,
        duration: Date.now() - s.startedAt.getTime()
      }))
    }
  });
});

export default router;