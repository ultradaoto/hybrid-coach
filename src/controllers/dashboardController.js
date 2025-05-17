import calendarService from '../services/calendarService.js';

async function index(req, res, next) {
  try {
    let meetings = [];
    let slots = [];

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

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.user,
      meetings,
      slots,
    });
  } catch (err) {
    next(err);
  }
}

export default { index }; 