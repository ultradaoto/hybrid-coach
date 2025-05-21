import { Router } from 'express';
import { chat } from '../services/aiService.js';
import { synth } from '../services/ttsService.js';
import { getTwilioIceServers } from '../services/turnService.js';
import profileRouter from './api/profile.js';
import { jwtAuth } from '../middlewares/jwtAuth.js';
import messageRouter from './api/message.js';
import { router as wsRelayRouter } from './api/ws-relay.js';
import { router as wsTestRouter } from './api/websocket-test.js';
import { router as protooTestRouter } from './api/protoo-test.js';
import { router as directWsTestRouter } from './api/direct-ws-test.js';

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

export default router; 