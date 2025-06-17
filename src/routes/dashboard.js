import { Router } from 'express';
import dashboardController from '../controllers/dashboardController.js';
import { ensureAuthenticated } from '../middlewares/auth.js';

const router = Router();

router.get('/', ensureAuthenticated, dashboardController.index);

export default router; 