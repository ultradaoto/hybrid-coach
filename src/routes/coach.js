import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';
import calendarService from '../services/calendarService.js';

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
    req.user.googleTokens = tokens; // store in-memory
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

export default router; 