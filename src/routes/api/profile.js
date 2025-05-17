import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { jwtAuth } from '../../middlewares/jwtAuth.js';

const router = Router();

// Get profile
router.get('/', jwtAuth, async (req, res, next) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

// Update profile
router.put('/', jwtAuth, async (req, res, next) => {
  const { bioJson } = req.body;
  try {
    const profile = await prisma.profile.upsert({
      where: { userId: req.user.id },
      update: { bioJson },
      create: { userId: req.user.id, bioJson },
    });
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

export default router; 