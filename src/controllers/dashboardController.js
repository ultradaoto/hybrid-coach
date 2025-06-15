import calendarService from '../services/calendarService.js';
import userService from '../services/userService.js';
import { prisma } from '../lib/prisma.js';

async function index(req, res, next) {
  try {
    let meetings = [];
    let slots = [];
    let appointments = [];
    let calendarConnected = false;

    // Fetch fresh user data from database to get updated googleTokens
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (req.user.role === 'coach' && currentUser?.googleTokens) {
      try {
        const events = await calendarService.listUpcomingEvents(currentUser.googleTokens);
        meetings = events.map(e => ({
          summary: e.summary || 'Meeting',
          start: e.start.dateTime || e.start.date,
        }));
        calendarConnected = true;
      } catch (error) {
        console.log('Calendar access error:', error.message);
        // Token might be expired, clear it
        await prisma.user.update({
          where: { id: req.user.id },
          data: { googleTokens: null }
        });
        req.user.googleTokens = null;
      }
    }

    // Check calendar connection for clients too
    if (req.user.role === 'client' && currentUser?.googleTokens) {
      calendarConnected = true;
    }

    // Get membership warning information
    const membershipWarning = await userService.getMembershipWarning(currentUser || req.user);

    // For clients, get available coaches and time slots
    let availableCoaches = [];
    if (req.user.role === 'client') {
      // Fetch available coaches
      availableCoaches = await prisma.user.findMany({
        where: { 
          role: 'coach',
          isAvailable: true 
        },
        select: {
          id: true,
          displayName: true,
          email: true,
          coachName: true,
          coachLevel: true
        },
        orderBy: { coachLevel: 'desc' } // Order by level, highest first
      });

      // Generate placeholder slots for now
      slots = [
        { iso: new Date(Date.now() + 86400000).toISOString(), label: 'Tomorrow 10:00 AM' },
        { iso: new Date(Date.now() + 2 * 86400000).toISOString(), label: 'Day After Tomorrow 2:00 PM' },
        { iso: new Date(Date.now() + 3 * 86400000).toISOString(), label: 'In 3 Days 9:00 AM' },
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
      availableCoaches,
      calendarConnected,
      membershipWarning,
      message: req.query.calendar === 'connected' ? 'Calendar connected successfully!' : 
               req.query.availability === 'updated' ? 'Availability status updated!' :
               req.query.cancelled === 'success' ? 'Appointment cancelled successfully. Calendar updated.' :
               req.query.reassigned === 'success' ? 'Appointment returned to coach pool.' :
               req.query.booked === '1' ? 'Appointment booked successfully!' : null,
    });
  } catch (err) {
    next(err);
  }
}

export default { index }; 