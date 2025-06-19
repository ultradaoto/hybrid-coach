import { Router } from 'express';
import { chat } from '../services/aiService.js';
import { synth } from '../services/ttsService.js';
import { getTwilioIceServers } from '../services/turnService.js';
import profileRouter from './api/profile.js';
import { jwtAuth } from '../middlewares/jwtAuth.js';
import { ensureAuthenticated } from '../middlewares/auth.js';
import userService from '../services/userService.js';
import messageRouter from './api/message.js';
import { router as wsRelayRouter } from './api/ws-relay.js';
import { router as wsTestRouter } from './api/websocket-test.js';
import { router as protooTestRouter } from './api/protoo-test.js';
import { router as directWsTestRouter } from './api/direct-ws-test.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.use('/profile', profileRouter);
router.use('/message', messageRouter);
router.use('/ws-relay', wsRelayRouter);
router.use('/ws-test', wsTestRouter);
router.use('/protoo-test', protooTestRouter);
router.use('/direct-ws-test', directWsTestRouter);

// Add TURN credentials endpoint - no auth required as these are temporary
router.get('/turn-credentials', async (req, res, next) => {
  try {
    const iceServers = await getTwilioIceServers();
    res.json({ iceServers });
  } catch (err) {
    console.error('Error in /turn-credentials:', err);
    res.status(500).json({ error: 'Failed to get TURN credentials' });
    next(err);
  }
});

router.post('/chat', async (req, res, next) => {
  const { message, userId, sessionId } = req.body;
  try {
    const reply = await chat(message, userId, sessionId);
    res.json({ reply });
  } catch (err) {
    next(err);
  }
});

// TTS endpoint
router.post('/tts', jwtAuth, async (req, res, next) => {
  const { text } = req.body;
  try {
    const audio = await synth(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (err) {
    next(err);
  }
});

// Network connectivity test endpoint
router.get('/network-test', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    clientIp: req.ip || req.connection.remoteAddress,
    headers: {
      'user-agent': req.headers['user-agent'],
      'x-forwarded-for': req.headers['x-forwarded-for']
    }
  });
});

// Browser compatibility endpoint for audio format detection
router.get('/system/browser-compatibility', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const userAgentLower = userAgent.toLowerCase();
  
  // Detect browser type from user agent
  let browserType = 'unknown';
  if (userAgentLower.includes('chrome') && !userAgentLower.includes('edg')) {
    browserType = 'chrome';
  } else if (userAgentLower.includes('safari') && !userAgentLower.includes('chrome')) {
    browserType = 'safari';
  } else if (userAgentLower.includes('firefox')) {
    browserType = 'firefox';
  } else if (userAgentLower.includes('edg')) {
    browserType = 'edge';
  }
  
  // Browser-specific compatibility info OPTIMIZED FOR WHISPER STT
  const browserCompatibility = {
    chrome: {
      preferredFormat: "audio/wav",
      fallbackFormats: ["audio/mp4", "audio/webm", "audio/webm;codecs=opus"],
      whisperCompatible: true,
      chunking: {
        recommended: true,
        chunkSize: 3000,
        overlap: 200
      }
    },
    safari: {
      preferredFormat: "audio/mp4",
      fallbackFormats: ["audio/wav", "audio/webm"],
      whisperCompatible: true,
      chunking: {
        recommended: true,
        chunkSize: 3000,
        overlap: 200
      }
    },
    firefox: {
      preferredFormat: "audio/wav",
      fallbackFormats: ["audio/mp4", "audio/webm", "audio/webm;codecs=opus"],
      whisperCompatible: true,
      chunking: {
        recommended: true,
        chunkSize: 3000,
        overlap: 200
      }
    },
    edge: {
      preferredFormat: "audio/wav",
      fallbackFormats: ["audio/mp4", "audio/webm", "audio/webm;codecs=opus"],
      whisperCompatible: true,
      chunking: {
        recommended: true,
        chunkSize: 3000,
        overlap: 200
      }
    },
    universalFallback: "audio/wav"
  };
  
  // Format testing steps OPTIMIZED FOR WHISPER STT
  const formatTestingSteps = [
    {
      step: 1,
      format: "audio/wav",
      description: "Test WAV (Whisper's favorite - maximum compatibility)",
      whisperSupported: true
    },
    {
      step: 2,
      format: "audio/mp4",
      description: "Test MP4 (Whisper supported, Safari preferred)",
      whisperSupported: true
    },
    {
      step: 3,
      format: "audio/webm",
      description: "Test WebM without codec (Whisper supported)",
      whisperSupported: true
    },
    {
      step: 4,
      format: "audio/webm;codecs=opus",
      description: "Test WebM+Opus (known Whisper format issues)",
      whisperSupported: false,
      note: "May cause 'Invalid file format' errors in Whisper STT"
    }
  ];
  
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    detectedBrowser: browserType,
    userAgent: userAgent,
    browserCompatibility,
    formatTestingSteps,
    recommendations: {
      primary: browserCompatibility[browserType] || {
        preferredFormat: browserCompatibility.universalFallback,
        fallbackFormats: ["audio/wav"],
        chunking: { recommended: true, chunkSize: 3000, overlap: 200 }
      },
      testing: {
        message: "Test formats in order, use first supported format",
        fallback: "If all formats fail, use MediaRecorder() with no options"
      }
    }
  });
});

// Dismiss membership warning endpoint
router.post('/dismiss-membership-warning', ensureAuthenticated, async (req, res, next) => {
  try {
    await userService.markWarningShown(req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// 🎯 SESSION MANAGEMENT: API endpoints for storing session summaries and context updates
router.post('/sessions/:sessionId/summary', jwtAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { transcript, summary, contextUpdates } = req.body;
    
    console.log('[API] 📝 Storing session summary:', {
      sessionId,
      transcript_length: transcript?.length || 0,
      summary_length: summary?.length || 0,
      has_context_updates: !!contextUpdates
    });
    
    // Update session with transcript and summary
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        transcript: transcript,
        aiSummary: summary,
        endedAt: new Date(),
        status: 'completed'
      },
      include: {
        user: { include: { profile: true } },
        appointment: { include: { client: { include: { profile: true } } } }
      }
    });
    
    // Update client profile with new summary (for the CLIENT, not the current user)
    if (session.appointment?.client?.profile) {
      const clientId = session.appointment.client.id;
      
      await prisma.profile.update({
        where: { userId: clientId },
        data: {
          lastSummary: summary,
          // Add any context updates from the AI
          ...(contextUpdates?.facts && { 
            clientFacts: { push: contextUpdates.facts } 
          }),
          ...(contextUpdates?.challenges && { 
            challenges: { push: contextUpdates.challenges } 
          })
        }
      });
      
      console.log('[API] ✅ Updated client profile with session insights');
    }
    
    res.json({ 
      success: true, 
      sessionUpdated: true,
      profileUpdated: !!session.appointment?.client?.profile 
    });
    
  } catch (error) {
    console.error('[API] ❌ Error storing session summary:', error);
    res.status(500).json({ error: 'Failed to store session summary' });
    next(error);
  }
});

router.post('/sessions/:sessionId/context', jwtAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const updates = req.body;
    
    console.log('[API] 🔄 Storing context updates for session:', sessionId, updates);
    
    // Get the session to find the client
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        appointment: { include: { client: { include: { profile: true } } } }
      }
    });
    
    if (!session?.appointment?.client) {
      return res.status(404).json({ error: 'Session or client not found' });
    }
    
    const clientId = session.appointment.client.id;
    
    // Update client profile with new context insights
    const updateData = {};
    if (updates.facts && updates.facts.length > 0) {
      updateData.clientFacts = { push: updates.facts };
    }
    if (updates.challenges && updates.challenges.length > 0) {
      updateData.challenges = { push: updates.challenges };
    }
    if (updates.preferences) {
      updateData.preferences = updates.preferences;
    }
    if (updates.contextNotes) {
      updateData.contextNotes = updates.contextNotes;
    }
    
    if (Object.keys(updateData).length > 0) {
      await prisma.profile.update({
        where: { userId: clientId },
        data: updateData
      });
      console.log('[API] ✅ Context updates applied to client profile');
    }
    
    res.json({ success: true, updatesApplied: Object.keys(updateData).length });
    
  } catch (error) {
    console.error('[API] ❌ Error storing context updates:', error);
    res.status(500).json({ error: 'Failed to store context updates' });
    next(error);
  }
});

export default router; 