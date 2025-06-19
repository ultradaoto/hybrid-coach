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

    // 4. 🎯 CLIENT CONTEXT: Load client profile and coach information
    let clientProfile = null;
    let coachProfile = null;
    
    try {
      // Get client and coach from appointment
      const appointmentWithUsers = await prisma.appointment.findUnique({
        where: { id: appointment.id },
        include: {
          client: {
            include: { profile: true }
          },
          coach: {
            include: { profile: true }
          }
        }
      });
      
      if (appointmentWithUsers) {
        // For AI context, we need the CLIENT's profile (regardless of who's viewing)
        const client = appointmentWithUsers.client;
        const coach = appointmentWithUsers.coach;
        
        // Load or create client profile
        clientProfile = await prisma.profile.upsert({
          where: { userId: client.id },
          create: {
            userId: client.id,
            clientFacts: [],
            challenges: [],
            preferences: null,
            lastSummary: null,
            contextNotes: null
          },
          update: {} // Don't overwrite existing data
        });
        
        // Load coach profile too
        coachProfile = coach.profile;
        
        console.log(`[ROOM] 🎯 Loaded client context for ${client.displayName}: ${clientProfile.clientFacts.length} facts, ${clientProfile.challenges.length} challenges`);
      }
    } catch (profileError) {
      console.error('[ROOM] ❌ Error loading client profile:', profileError);
      // Continue without profile - don't break the session
    }

    res.render('room-ai-hybrid', {
      title: 'AI Hybrid Coaching Call',
      roomId,
      user: req.user,
      jwt: token,
      sessionId: session.id,
      clientProfile: clientProfile, // Pass client context to frontend
      coachProfile: coachProfile,
      appointment: appointment
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
