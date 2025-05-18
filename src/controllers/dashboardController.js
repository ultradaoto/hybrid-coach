import calendarService from '../services/calendarService.js';
import { prisma } from '../lib/prisma.js';

async function index(req, res, next) {
  try {
    let meetings = [];
    let slots = [];
    let appointments = [];

    if (req.user.role === 'coach' && req.user.googleTokens) {
      const events = await calendarService.listUpcomingEvents(req.user.googleTokens);
      meetings = events.map(e => ({
        summary: e.summary || 'Meeting',
        start: e.start.dateTime || e.start.date,
      }));
    }

    // For clients, we will later generate available slots. Placeholder:
    if (req.user.role === 'client') {
      slots = [
        { iso: new Date(Date.now() + 86400000).toISOString(), label: 'Tomorrow 10:00 AM' },
      ];
    }

    // Fetch upcoming appointments (both roles)
    const now = new Date();
    appointments = await prisma.appointment.findMany({
      where: {
        scheduledFor: { gte: now },
        OR: [{ clientId: req.user.id }, { coachId: req.user.id }],
      },
      orderBy: { scheduledFor: 'asc' },
      include: { client: true, coach: true },
    });

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.user,
      meetings,
      slots,
      appointments,
    });
  } catch (err) {
    next(err);
  }
}

export default { index }; 