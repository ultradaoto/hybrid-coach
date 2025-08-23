import { Router } from 'express';
import dashboardController from '../controllers/dashboardController.js';
import { requireSkoolAuth } from '../middlewares/skoolAuthMiddleware.js';

const router = Router();

router.get('/', requireSkoolAuth, dashboardController.index);

export default router; 