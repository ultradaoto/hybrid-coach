import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';

const router = Router();

// Simple booking endpoint: client posts ISO date string in `slot`
router.post('/', ensureAuthenticated, async (req, res, next) => {
  if (req.user.role !== 'client') return res.redirect('/dashboard');

  const { slot } = req.body; // ISO string
  if (!slot) return res.status(400).send('Missing slot');

  try {
    // TEMP: pick the first coach in DB (improve later)
    const coach = await prisma.user.findFirst({ where: { role: 'coach' } });
    if (!coach) return res.status(500).send('No coach available');

    const roomId = randomUUID();

    const appointment = await prisma.appointment.create({
      data: {
        scheduledFor: new Date(slot),
        durationMin: 30,
        clientId: req.user.id,
        coachId: coach.id,
        roomId,
      },
    });

    // Redirect back to dashboard with confirmation toast
    res.redirect('/dashboard?booked=1');
  } catch (err) {
    next(err);
  }
});

export default router; 