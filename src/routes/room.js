import { Router } from 'express';
import { requireSkoolAuth, checkSkoolAuth } from '../middlewares/skoolAuthMiddleware.js';
import { randomUUID } from 'crypto';
import { issueToken } from '../middlewares/jwtAuth.js';
import { prisma } from '../lib/prisma.js';
import { generateJwtWithExpiry } from '../utils/jwtUtils.js';
import { getOrCreateSessionId } from '../utils/sessionUtils.js';
import { orbManager } from '../services/OrbManager.js';

const router = Router();

// Apply Skool auth check to all room routes
router.use(checkSkoolAuth);

router.get('/create', requireSkoolAuth, async (req, res, next) => {
  try {
    const roomId = randomUUID();

    // For Skool users, we'll create a simpler room system
    // All Skool users are clients, and we don't need coach/client distinction yet
    const skoolUserId = req.skoolUser.skoolUserId;
    const skoolUsername = req.skoolUser.skoolUsername;

    // Create a simplified appointment record for Skool users
    console.log(`🏠 Creating room for Skool user: ${skoolUsername} (${skoolUserId})`);

    // For now, just use the Skool user ID as both client and coach
    // This will be enhanced later when we add human coaches
    const clientId = skoolUserId;
    const coachId = 'ai-coach'; // Placeholder for AI coach

    // For Skool users, skip appointment creation for now
    // Just redirect directly to the room
    console.log(`🚀 Redirecting to room: ${roomId}`);
    res.redirect(`/room/${roomId}`);
  } catch (err) {
    next(err);
  }
});

router.get('/:roomId', requireSkoolAuth, async (req, res, next) => {
  const { roomId } = req.params;
  
  // Create a simple token for Skool users
  const token = {
    userId: req.skoolUser.skoolUserId,
    username: req.skoolUser.skoolUsername,
    role: 'client'
  };

  try {
    // For Skool users, we'll create a simplified room system
    // Skip appointment validation for now - any authenticated Skool user can access any room
    console.log(`🏠 Skool user ${req.skoolUser.skoolUsername} accessing room ${roomId}`);

    // Get or create session ID for the room
    const sessionId = await getOrCreateSessionId(roomId);
    
    // For Skool users, we'll track sessions differently (future enhancement)
    console.log(`🔑 Session ID for room ${roomId}: ${sessionId}`);

    // For Skool users, we'll implement simpler client profile tracking later
    console.log(`👤 Loading room for Skool client: ${req.skoolUser.skoolUsername}`);
    
    // Skip complex OrbManager for now - we'll use ElevenLabs widget instead
    const orbExists = false; // We'll handle AI agent differently

    // Prepare view data for Skool users
    const viewData = {
      title: 'AI Coaching Session - MyUltra.Coach',
      roomId,
      user: {
        id: req.skoolUser.skoolUserId,
        displayName: req.skoolUser.skoolUsername,
        email: req.skoolUser.skoolUserId + '@skool.user',
        role: 'client'
      },
      jwt: token,
      sessionId: sessionId,
      clientProfile: null, // Will implement later
      coachProfile: null,  // Will implement later
      appointment: null,   // Simplified for Skool users
      orbStatus: null,     // Using ElevenLabs instead
      orbExists: orbExists,
      elevenlabsAgentId: process.env.ELEVENLABS_AGENT_ID || 'agent_01jy88zv6zfe1a9v9zdxt69abd'
    };

    // All Skool users get the client view for now
    console.log(`🎬 Rendering room-client view for ${req.skoolUser.skoolUsername}`);
    res.render('room-client', viewData);
  } catch (err) {
    next(err);
  }
});


// Add a new route for the fallback room
router.get('/:roomId/fallback', requireSkoolAuth, async (req, res) => {
  const { roomId } = req.params;
    // Generate a JWT token for the room with a 2-hour expiration
  // Simple token for Skool users
  const jwt = {
    userId: req.skoolUser.skoolUserId,
    username: req.skoolUser.skoolUsername,
    role: 'client'
  };
  
  // Get or create a session ID for the room
  const sessionId = await getOrCreateSessionId(roomId);
  
  // Render the fallback room template
  res.render('room-fallback', {
    title: 'Coaching Call',
    roomId,
    jwt,
    sessionId,
    user: {
      id: req.skoolUser.skoolUserId,
      displayName: req.skoolUser.skoolUsername,
      email: req.skoolUser.skoolUserId + '@skool.user'
    }
  });
});

export default router;
