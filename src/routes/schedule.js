import { Router } from 'express';
import { ensureAuthenticated } from '../middlewares/auth.js';

const router = Router();

router.post('/', ensureAuthenticated, (req, res) => {
  if (req.user.role !== 'client') return res.redirect('/dashboard');
  const { slot } = req.body;
  // TODO: create calendar event invitation email etc.
  console.log(`Client ${req.user.email} booked slot ${slot}`);
  res.send('Booking received! (stub)');
});

export default router; 