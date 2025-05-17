import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';
import { randomUUID } from 'crypto';
import { issueToken } from '../middlewares/jwtAuth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/create', ensureAuthenticated, (req, res) => {
  const roomId = randomUUID();
  res.redirect(`/room/${roomId}`);
});

router.get('/:roomId', ensureAuthenticated, async (req, res, next) => {
  const { roomId } = req.params;
  const token = issueToken(req.user);
  try {
    const session = await prisma.session.upsert({
      where: { roomId_userId: { roomId, userId: req.user.id } },
      create: { roomId, userId: req.user.id },
      update: {},
    });
    res.render('room', {
      title: 'Hybrid Coaching Call',
      roomId,
      user: req.user,
      jwt: token,
      sessionId: session.id,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
