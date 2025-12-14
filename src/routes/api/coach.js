import { Router } from 'express';
import calendarService from '../../services/calendarService.js';
import { prisma } from '../../lib/prisma.js';

const router = Router();

function ensureApiAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthenticated', loginUrl: '/auth/login' });
}

function requireCoachRole(req, res, next) {
  if (req.user?.role === 'coach') return next();
  return res.status(403).json({ error: 'Forbidden (coach only)' });
}

function toSafeUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    isAvailable: user.isAvailable,
    coachName: user.coachName,
    coachLevel: user.coachLevel,
  };
}

router.get('/dashboard', ensureApiAuthenticated, requireCoachRole, async (req, res, next) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!currentUser) return res.status(401).json({ error: 'Unauthenticated', loginUrl: '/auth/login' });

    let calendarConnected = false;
    let meetings = [];

    if (currentUser.googleTokens) {
      try {
        const events = await calendarService.listUpcomingEvents(currentUser.googleTokens);
        meetings = events.map((e) => ({
          summary: e.summary || 'Meeting',
          start: e.start.dateTime || e.start.date,
        }));
        calendarConnected = true;
      } catch (error) {
        console.log('Calendar access error:', error.message);
        await prisma.user.update({
          where: { id: req.user.id },
          data: { googleTokens: null },
        });
        calendarConnected = false;
        meetings = [];
      }
    }

    const now = new Date();
    const appointments = await prisma.appointment.findMany({
      where: {
        scheduledFor: { gte: now },
        coachId: req.user.id,
      },
      orderBy: { scheduledFor: 'asc' },
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        roomId: true,
        client: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        coach: {
          select: {
            id: true,
            displayName: true,
            email: true,
            coachName: true,
            coachLevel: true,
          },
        },
      },
    });

    const message =
      req.query.calendar === 'connected'
        ? 'Calendar connected successfully!'
        : req.query.availability === 'updated'
          ? 'Availability status updated!'
          : req.query.reassigned === 'success'
            ? 'Appointment returned to coach pool.'
            : null;

    res.json({
      user: toSafeUser(currentUser),
      calendarConnected,
      meetings,
      appointments,
      message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/toggle-availability', ensureApiAuthenticated, requireCoachRole, async (req, res, next) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isAvailable: true },
    });

    if (!currentUser) return res.status(401).json({ error: 'Unauthenticated', loginUrl: '/auth/login' });

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { isAvailable: !currentUser.isAvailable },
      select: { isAvailable: true },
    });

    res.json({ success: true, isAvailable: updated.isAvailable });
  } catch (err) {
    next(err);
  }
});

router.post('/reassign-appointment', ensureApiAuthenticated, requireCoachRole, async (req, res, next) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json({ error: 'Missing appointmentId' });

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        coachId: true,
        status: true,
      },
    });

    if (!appointment || appointment.coachId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot reassign cancelled appointment' });
    }

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'reassigned',
        cancelledAt: new Date(),
        cancelledBy: 'coach',
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
