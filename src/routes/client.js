import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';
import calendarService from '../services/calendarService.js';
import userService from '../services/userService.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// Connect calendar (only for client)
router.get('/calendar/connect', ensureAuthenticated, (req, res) => {
  if (req.user.role !== 'client') return res.redirect('/dashboard');
  const url = calendarService.getAuthUrl('/client/calendar/callback');
  res.redirect(url);
});

router.get('/calendar/callback', ensureAuthenticated, async (req, res, next) => {
  if (req.user.role !== 'client') return res.redirect('/dashboard');
  const { code } = req.query;
  try {
    const tokens = await calendarService.getToken(code, '/client/calendar/callback');
    await userService.updateGoogleTokens(req.user.id, tokens);
    res.redirect('/dashboard?calendar=connected');
  } catch (err) {
    next(err);
  }
});

// Cancel appointment
router.post('/cancel-appointment', ensureAuthenticated, async (req, res, next) => {
  if (req.user.role !== 'client') return res.redirect('/dashboard');
  
  const { appointmentId } = req.body;
  if (!appointmentId) return res.status(400).send('Missing appointment ID');
  
  try {
    // Verify the client owns this appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, coach: true }
    });
    
    if (!appointment || appointment.clientId !== req.user.id) {
      return res.status(403).send('Unauthorized');
    }
    
    if (appointment.status === 'cancelled') {
      return res.status(400).send('Appointment already cancelled');
    }
    
    // Update appointment status to cancelled
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { 
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: 'client'
      }
    });
    
    // Update calendar events to show cancellation
    const coachDisplayName = appointment.coach.coachName || appointment.coach.displayName;
    const eventTitle = `CANCELLED - Hybrid Coaching Session`;
    const eventDescription = `This coaching session was cancelled by the client on ${new Date().toLocaleString()}.\n\nOriginal session: ${appointment.client.displayName} (client) and ${coachDisplayName} (coach)${appointment.coach.coachLevel ? ` - Level ${appointment.coach.coachLevel}` : ''}.`;
    
    // Update coach's calendar if connected
    if (appointment.coach.googleTokens) {
      try {
        // For now, we'll create a simple calendar update by creating a new event
        // In a full implementation, you'd want to update the existing event
        const appointmentDate = new Date(appointment.scheduledFor);
        const endDate = new Date(appointmentDate.getTime() + appointment.durationMin * 60 * 1000);
        
        const cancelEventData = {
          summary: eventTitle,
          description: eventDescription,
          startTime: appointmentDate.toISOString(),
          endTime: endDate.toISOString(),
          attendees: []
        };
        
        await calendarService.createEvent(appointment.coach.googleTokens, cancelEventData);
        console.log('✅ Cancellation event added to coach calendar');
      } catch (error) {
        console.error('❌ Failed to update coach calendar:', error.message);
      }
    }
    
    // Update client's calendar if connected  
    if (appointment.client.googleTokens) {
      try {
        const appointmentDate = new Date(appointment.scheduledFor);
        const endDate = new Date(appointmentDate.getTime() + appointment.durationMin * 60 * 1000);
        
        const cancelEventData = {
          summary: eventTitle,
          description: eventDescription,
          startTime: appointmentDate.toISOString(),
          endTime: endDate.toISOString(),
          attendees: []
        };
        
        await calendarService.createEvent(appointment.client.googleTokens, cancelEventData);
        console.log('✅ Cancellation event added to client calendar');
      } catch (error) {
        console.error('❌ Failed to update client calendar:', error.message);
      }
    }
    
    res.redirect('/dashboard?cancelled=success');
  } catch (err) {
    next(err);
  }
});

export default router;