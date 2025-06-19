/**
 * Session Rating Controller - Handles post-call rating and feedback
 */

import { prisma } from '../lib/prisma.js';

/**
 * Show session rating page
 */
export const showRatingPage = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        
        // Get session with related data
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: {
                appointment: {
                    include: {
                        coach: true,
                        client: true
                    }
                },
                user: true,
                rating: true // Check if already rated
            }
        });
        
        if (!session) {
            return res.status(404).render('error', {
                title: 'Session Not Found',
                message: 'The session you are trying to rate could not be found.',
                layout: 'layout'
            });
        }
        
        // Check if user has permission to rate this session
        if (session.userId !== req.user.id) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to rate this session.',
                layout: 'layout'
            });
        }
        
        // Check if session is already rated
        if (session.rating) {
            return res.redirect('/dashboard?message=session_already_rated');
        }
        
        // Calculate session duration
        const durationMs = session.endedAt ? 
            new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() :
            session.durationMinutes * 60 * 1000;
        const durationMinutes = Math.round(durationMs / 60000);
        
        console.log(`[RATING] 📊 Showing rating page for session ${sessionId}`);
        
        res.render('session-rating', {
            title: 'Rate Your Session',
            session,
            coach: session.appointment.coach,
            client: session.user,
            durationMinutes,
            layout: 'layout'
        });
        
    } catch (error) {
        console.error('[RATING] ❌ Error showing rating page:', error);
        next(error);
    }
};

/**
 * Submit session rating
 */
export const submitRating = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const { rating, comment, tipAmount } = req.body;
        
        // Validate rating
        const ratingNum = parseInt(rating);
        if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({
                error: 'Rating must be between 1 and 5 stars'
            });
        }
        
        // Validate tip amount if provided
        let tipAmountNum = null;
        if (tipAmount) {
            tipAmountNum = parseFloat(tipAmount);
            if (![1, 3, 5].includes(tipAmountNum)) {
                return res.status(400).json({
                    error: 'Tip amount must be $1, $3, or $5'
                });
            }
        }
        
        // Check session exists and user has permission
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: {
                rating: true,
                appointment: {
                    include: { coach: true }
                }
            }
        });
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        if (session.userId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (session.rating) {
            return res.status(400).json({ error: 'Session already rated' });
        }
        
        // Create rating
        const sessionRating = await prisma.sessionRating.create({
            data: {
                sessionId: sessionId,
                rating: ratingNum,
                comment: comment?.trim() || null,
                tipAmount: tipAmountNum
            }
        });
        
        console.log(`[RATING] ⭐ Session ${sessionId} rated: ${ratingNum} stars, tip: $${tipAmountNum || 0}`);
        
        // Log tip for coach tracking (future payment processing)
        if (tipAmountNum > 0) {
            console.log(`[RATING] 💰 Tip recorded: $${tipAmountNum} for coach ${session.appointment.coach.displayName}`);
            // TODO: Integrate with payment system
        }
        
        // Respond based on request type
        if (req.headers.accept?.includes('application/json')) {
            res.json({
                success: true,
                message: 'Rating submitted successfully',
                rating: sessionRating
            });
        } else {
            res.redirect('/dashboard?message=rating_submitted');
        }
        
    } catch (error) {
        console.error('[RATING] ❌ Error submitting rating:', error);
        
        if (req.headers.accept?.includes('application/json')) {
            res.status(500).json({ error: 'Failed to submit rating' });
        } else {
            next(error);
        }
    }
};

/**
 * Get session ratings for a coach (analytics)
 */
export const getCoachRatings = async (req, res, next) => {
    try {
        const coachId = req.user.role === 'coach' ? req.user.id : null;
        
        if (!coachId) {
            return res.status(403).json({ error: 'Coach access required' });
        }
        
        const ratings = await prisma.sessionRating.findMany({
            include: {
                session: {
                    include: {
                        appointment: {
                            where: { coachId: coachId },
                            include: { client: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        
        // Calculate analytics
        const analytics = {
            totalRatings: ratings.length,
            averageRating: ratings.length > 0 ? 
                ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0,
            totalTips: ratings.reduce((sum, r) => sum + (r.tipAmount || 0), 0),
            ratingDistribution: {
                5: ratings.filter(r => r.rating === 5).length,
                4: ratings.filter(r => r.rating === 4).length,
                3: ratings.filter(r => r.rating === 3).length,
                2: ratings.filter(r => r.rating === 2).length,
                1: ratings.filter(r => r.rating === 1).length
            }
        };
        
        res.json({
            ratings,
            analytics
        });
        
    } catch (error) {
        console.error('[RATING] ❌ Error getting coach ratings:', error);
        next(error);
    }
};

/**
 * Skip rating (still record completion)
 */
export const skipRating = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        
        // Check session exists and user has permission
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: { rating: true }
        });
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        if (session.userId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (session.rating) {
            return res.status(400).json({ error: 'Session already rated' });
        }
        
        // Create minimal rating record (indicates completion without rating)
        await prisma.sessionRating.create({
            data: {
                sessionId: sessionId,
                rating: 0, // 0 indicates skipped
                comment: null,
                tipAmount: null
            }
        });
        
        console.log(`[RATING] ⏭️ Session ${sessionId} rating skipped`);
        
        res.redirect('/dashboard?message=session_completed');
        
    } catch (error) {
        console.error('[RATING] ❌ Error skipping rating:', error);
        next(error);
    }
};