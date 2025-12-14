import { Router } from 'express';
import homeController from '../controllers/homeController.js';

const router = Router();

router.get('/', homeController.index);

// Treat /home as the public landing page route.
router.get('/home', homeController.index);

// Compatibility aliases for auth routes.
router.get('/login', (req, res) => {
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(`/auth/login${qs}`);
});

router.get('/login/:code', (req, res) => {
  const { code } = req.params;
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const separator = qs ? '&' : '?';
  res.redirect(`/auth/login?code=${encodeURIComponent(code)}${qs ? `${separator}${qs.slice(1)}` : ''}`);
});

export default router; 