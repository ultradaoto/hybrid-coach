import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';

const router = Router();

/**
 * Video Debug Page - Coach ↔ AI Orb Connection Testing
 */
router.get('/video', ensureAuthenticated, (req, res) => {
    const roomId = req.query.room || null;
    const autostart = req.query.autostart === 'true';
    
    res.render('debug-video', {
        title: 'Coach ↔ AI Orb Video Debug',
        layout: false, // Use no layout for this debug page
        roomId,
        autostart,
        user: req.user
    });
});

export default router;