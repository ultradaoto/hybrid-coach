import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';
import { randomUUID } from 'crypto';
import { issueToken } from '../middlewares/jwtAuth.js';
import { prisma } from '../lib/prisma.js';
import { generateJwtWithExpiry } from '../utils/jwtUtils.js';
import { getOrCreateSessionId } from '../utils/sessionUtils.js';

const router = Router();

router.get('/create', ensureAuthenticated, async (req, res, next) => {
  try {
    const roomId = randomUUID();

    let coachId;
    let clientId;

    if (req.user.role === 'coach') {
      coachId = req.user.id;
      // Pick any client (for quick testing) other than coach
      const client = await prisma.user.findFirst({ where: { role: 'client' } });
      clientId = client ? client.id : req.user.id; // fallback self
    } else {
      clientId = req.user.id;
      const coach = await prisma.user.findFirst({ where: { role: 'coach' } });
      coachId = coach ? coach.id : req.user.id; // fallback self
    }

    const appointment = await prisma.appointment.create({
      data: {
        scheduledFor: new Date(),
        durationMin: 30,
        clientId,
        coachId,
        roomId,
        status: 'active',
      },
    });

    res.redirect(`/room/${appointment.roomId}`);
  } catch (err) {
    next(err);
  }
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
    if (!isParticipant) {
      // If appointment currently has coachId placeholder as clientId, allow first real client to claim
      if (req.user.role === 'client' && appointment.clientId === appointment.coachId) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { clientId: req.user.id },
        });
      } else {
        return res.status(403).send('You are not part of this appointment');
      }
    }

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

// Add a new route for the simplified room
router.get('/:roomId/simple', ensureAuthenticated, async (req, res, next) => {
  const { roomId } = req.params;
  const token = issueToken(req.user);
  
  try {
    // 1. Find appointment by roomId
    const appointment = await prisma.appointment.findUnique({ where: { roomId } });
    if (!appointment) return res.status(404).send('Room not found');
    
    // 2. Verify current user is part of this appointment
    const isParticipant = [appointment.clientId, appointment.coachId].includes(req.user.id);
    if (!isParticipant) {
      // If appointment currently has coachId placeholder as clientId, allow first real client to claim
      if (req.user.role === 'client' && appointment.clientId === appointment.coachId) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { clientId: req.user.id },
        });
      } else {
        return res.status(403).send('You are not part of this appointment');
      }
    }
    
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
    
    res.render('room-simple', {
      title: 'Hybrid Coaching Call (Simple)',
      roomId,
      user: req.user,
      jwt: token,
      sessionId: session.id,
    });
  } catch (err) {
    next(err);
  }
});

// Add a new route for the fallback room
router.get('/:roomId/fallback', ensureAuthenticated, async (req, res) => {
  const { roomId } = req.params;
    // Generate a JWT token for the room with a 2-hour expiration
  const jwt = generateJwtWithExpiry(req.user, '2h');
    // Get or create a session ID for the room
  const sessionId = await getOrCreateSessionId(roomId);
    // Render the fallback room template
  res.render('room-fallback', {
     title: 'Coaching Call',
    roomId,
    jwt,
    sessionId,
    user: req.user
  });
});

export default router;
