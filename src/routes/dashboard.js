import { Router } from 'express';
import dashboardController from '../controllers/dashboardController.js';
import { checkSkoolAuth, requireSkoolAuth } from '../middlewares/skoolAuthMiddleware.js';

const router = Router();

// Apply Skool auth check to all dashboard routes
router.use(checkSkoolAuth);

router.get('/', requireSkoolAuth, dashboardController.index);

export default router; 