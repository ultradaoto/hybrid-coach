import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';
import calendarService from '../services/calendarService.js';
import userService from '../services/userService.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// Connect calendar (only for coach)
router.get('/calendar/connect', ensureAuthenticated, (req, res) => {
  if (req.user.role !== 'coach') return res.redirect('/dashboard');
  const url = calendarService.getAuthUrl();
  res.redirect(url);
});

router.get('/calendar/callback', ensureAuthenticated, async (req, res, next) => {
  if (req.user.role !== 'coach') return res.redirect('/dashboard');
  const { code } = req.query;
  try {
    const tokens = await calendarService.getToken(code);
    await userService.updateGoogleTokens(req.user.id, tokens);
    res.redirect('/dashboard?calendar=connected');
  } catch (err) {
    next(err);
  }
});

// Toggle coach availability
router.post('/toggle-availability', ensureAuthenticated, async (req, res, next) => {
  if (req.user.role !== 'coach') return res.redirect('/dashboard');
  
  try {
    // Toggle the current availability status
    await prisma.user.update({
      where: { id: req.user.id },
      data: { isAvailable: !req.user.isAvailable }
    });
    
    res.redirect('/dashboard?availability=updated');
  } catch (err) {
    next(err);
  }
});

// Reassign appointment back to coach pool
router.post('/reassign-appointment', ensureAuthenticated, async (req, res, next) => {
  if (req.user.role !== 'coach') return res.redirect('/dashboard');
  
  const { appointmentId } = req.body;
  if (!appointmentId) return res.status(400).send('Missing appointment ID');
  
  try {
    // Verify the coach owns this appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, coach: true }
    });
    
    if (!appointment || appointment.coachId !== req.user.id) {
      return res.status(403).send('Unauthorized');
    }
    
    if (appointment.status === 'cancelled') {
      return res.status(400).send('Cannot reassign cancelled appointment');
    }
    
    // Update appointment status to reassigned
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { 
        status: 'reassigned',
        cancelledAt: new Date(),
        cancelledBy: 'coach'
      }
    });
    
    // TODO: In the future, we can implement logic to:
    // 1. Find another available coach
    // 2. Update calendar events
    // 3. Send notifications
    
    res.redirect('/dashboard?reassigned=success');
  } catch (err) {
    next(err);
  }
});

export default router; 