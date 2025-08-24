import { Router } from 'express';

const router = Router();

/**
 * GET /api/user-info
 * Webhook endpoint for ElevenLabs to get user information
 * 
 * Query parameters:
 * - user_id: The user's Skool ID (e.g., "sterling-cooley" - safer than full name)
 * - current_session: Session identifier (maps to session_id dynamic variable)
 * - current_room: Room identifier (maps to room_id dynamic variable)
 */
router.get('/user-info', async (req, res) => {
    try {
        console.log('[WEBHOOK] ElevenLabs requesting user info:', req.query);
        
        const { user_id, current_session, current_room } = req.query;
        
        // TODO: Query database for user profile by Skool ID
        // For now, simulate user lookup by Skool ID
        const userProfiles = {
            'sterling-cooley': {
                firstName: 'Sterling',
                lastName: 'Cooley',
                fullName: 'Sterling Cooley',
                skoolId: 'sterling-cooley',
                goals: ['stress_reduction', 'better_sleep'],
                sessions: 3
            },
            'dev-user-123': {
                firstName: 'Kirby',
                lastName: 'Dev',
                fullName: 'Kirby Dev',
                skoolId: 'dev-user-123',
                goals: ['testing', 'development'],
                sessions: 0
            }
        };
        
        const userProfile = userProfiles[user_id] || {
            firstName: 'New',
            lastName: 'User',
            fullName: 'New User',
            skoolId: user_id,
            goals: ['getting_started'],
            sessions: 0
        };
        
        const userInfo = {
            name: userProfile.fullName,
            firstName: userProfile.firstName,
            lastName: userProfile.lastName,
            skoolId: userProfile.skoolId,
            session_id: current_session,
            room_id: current_room,
            greeting: `Hello ${userProfile.firstName}! Welcome to your coaching session.`,
            profile: {
                coaching_style: 'supportive',
                previous_sessions: userProfile.sessions,
                current_goals: userProfile.goals,
                preferred_topics: ['vagus_nerve', 'breathing_exercises']
            },
            timestamp: new Date().toISOString()
        };
        
        console.log('[WEBHOOK] Sending user info to ElevenLabs:', userInfo);
        
        res.json(userInfo);
        
    } catch (error) {
        console.error('[WEBHOOK] Error in user-info endpoint:', error);
        res.status(500).json({
            error: 'Failed to get user info',
            message: error.message
        });
    }
});

/**
 * POST /api/conversation-summary
 * Webhook endpoint for ElevenLabs to send conversation summaries
 * 
 * Body should contain:
 * - conversation_id: ElevenLabs conversation ID
 * - user_name: User's name
 * - summary: Conversation summary
 * - key_points: Array of key discussion points
 * - action_items: Recommended actions for user
 */
router.post('/conversation-summary', async (req, res) => {
    try {
        console.log('[WEBHOOK] Received conversation summary from ElevenLabs:', req.body);
        
        const { 
            conversation_id, 
            user_name, 
            summary, 
            key_points, 
            action_items,
            session_id,
            room_id
        } = req.body;
        
        // TODO: Store in database when Prisma is available
        // For now, just log the data
        const conversationData = {
            conversation_id,
            user_name,
            summary,
            key_points,
            action_items,
            session_id,
            room_id,
            received_at: new Date().toISOString()
        };
        
        console.log('[WEBHOOK] Conversation data to store:', conversationData);
        
        // In production, you would store this:
        // await prisma.conversationSummary.create({ data: conversationData });
        
        res.json({ 
            success: true, 
            message: 'Conversation summary received',
            data: conversationData
        });
        
    } catch (error) {
        console.error('[WEBHOOK] Error in conversation-summary endpoint:', error);
        res.status(500).json({
            error: 'Failed to store conversation summary',
            message: error.message
        });
    }
});

export default router;
