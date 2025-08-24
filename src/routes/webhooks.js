import { Router } from 'express';

const router = Router();

/**
 * GET /api/user-info
 * Webhook endpoint for ElevenLabs to get user information
 * 
 * Query parameters:
 * - user_name: The user's name (passed from dynamic variables)
 * - session_id: Session identifier
 * - room_id: Room identifier
 */
router.get('/user-info', async (req, res) => {
    try {
        console.log('[WEBHOOK] ElevenLabs requesting user info:', req.query);
        
        const { user_name, session_id, room_id } = req.query;
        
        // For now, return basic user info
        // In the future, this could query database for user profile, history, etc.
        const userInfo = {
            name: user_name || 'Kirby',
            session_id: session_id,
            room_id: room_id,
            greeting: `Hello ${user_name || 'Kirby'}! Welcome to your coaching session.`,
            profile: {
                coaching_style: 'supportive',
                previous_sessions: 0,
                current_goals: ['stress_reduction', 'better_sleep'],
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
