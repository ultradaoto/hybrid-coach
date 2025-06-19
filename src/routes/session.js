/**
 * Session Routes - Handle session rating and management
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';
import * as sessionRatingController from '../controllers/sessionRatingController.js';

const router = Router();

// Session rating routes
router.get('/:sessionId/rate', ensureAuthenticated, sessionRatingController.showRatingPage);
router.post('/:sessionId/rate', ensureAuthenticated, sessionRatingController.submitRating);
router.post('/:sessionId/skip-rating', ensureAuthenticated, sessionRatingController.skipRating);

// Coach analytics
router.get('/ratings/analytics', ensureAuthenticated, sessionRatingController.getCoachRatings);

export default router;