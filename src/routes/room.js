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
    // 1. Find appointment by roomId
    const appointment = await prisma.appointment.findUnique({ where: { roomId } });
    if (!appointment) return res.status(404).send('Room not found');

    // 2. Verify current user is part of this appointment
    const isParticipant = [appointment.clientId, appointment.coachId].includes(req.user.id);
    if (!isParticipant) return res.status(403).send('You are not part of this appointment');

    // 3. Upsert user-specific session linked to appointment
    const session = await prisma.session.upsert({
      where: { appointment_user: { appointmentId: appointment.id, userId: req.user.id } },
      create: {
        roomId,
        appointmentId: appointment.id,
        userId: req.user.id,
      },
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
