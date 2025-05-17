import { Router } from 'express';
import { chat } from '../services/aiService.js';
import { synth } from '../services/ttsService.js';
import profileRouter from './api/profile.js';
import { jwtAuth } from '../middlewares/jwtAuth.js';
import messageRouter from './api/message.js';

const router = Router();

router.use('/profile', profileRouter);
router.use('/message', messageRouter);

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