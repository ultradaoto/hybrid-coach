import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import calendarService from '../services/calendarService.js';

const router = Router();

// Simple booking endpoint: client posts ISO date string in `slot`
router.post('/', ensureAuthenticated, async (req, res, next) => {
  if (req.user.role !== 'client') return res.redirect('/dashboard');

  const { slot, coachId } = req.body;
  if (!slot) return res.status(400).send('Missing slot');
  if (!coachId) return res.status(400).send('Missing coach selection');

  try {
    // Find the selected coach and verify they're available
    const coach = await prisma.user.findFirst({ 
      where: { 
        id: coachId,
        role: 'coach',
        isAvailable: true 
      } 
    });
    if (!coach) return res.status(400).send('Selected coach is not available');

    const roomId = randomUUID();

    const appointmentDate = new Date(slot);
    const endDate = new Date(appointmentDate.getTime() + 30 * 60 * 1000); // 30 minutes later

    const appointment = await prisma.appointment.create({
      data: {
        scheduledFor: appointmentDate,
        durationMin: 30,
        clientId: req.user.id,
        coachId: coach.id,
        roomId,
      },
    });

    // Create calendar event from client's calendar with coach as invitee
    if (req.user.googleTokens) {
      try {
        const meetingLink = `${req.protocol}://${req.get('host')}/room/${roomId}`;
        const coachDisplayName = coach.coachName || coach.displayName;
        const eventData = {
          summary: 'Hybrid Coaching Session',
          description: `Hybrid coaching session between ${req.user.displayName} (client) and ${coachDisplayName} (coach)${coach.coachLevel ? ` - Level ${coach.coachLevel}` : ''}.\n\nThis is a tri-party video call including AI assistance.`,
          startTime: appointmentDate.toISOString(),
          endTime: endDate.toISOString(),
          meetingLink,
          attendees: [
            { email: coach.email, displayName: coachDisplayName }
          ]
        };

        await calendarService.createEvent(req.user.googleTokens, eventData);
        console.log('✅ Event created by client with coach as invitee');
      } catch (error) {
        console.error('❌ Failed to create calendar event:', error.message);
      }
    } else {
      console.log('⚠️ Client calendar not connected - no event created');
    }

    // Redirect back to dashboard with confirmation toast
    res.redirect('/dashboard?booked=1');
  } catch (err) {
    next(err);
  }
});

export default router; 