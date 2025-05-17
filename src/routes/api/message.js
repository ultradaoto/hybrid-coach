import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { jwtAuth } from '../../middlewares/jwtAuth.js';

const router = Router();

router.post('/', jwtAuth, async (req, res, next) => {
  const { sessionId, sender, content } = req.body;
  try {
    const message = await prisma.message.create({ data: { sessionId, sender, content, userId: req.user.id } });
    res.json({ message });
  } catch (err) {
    next(err);
  }
});

export default router; 