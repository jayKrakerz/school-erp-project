/**
 * Analytics Routes
 * Defines API endpoints for the intelligence system.
 */

import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';

const router = Router();

router.get('/dashboard', AnalyticsController.getDashboard);
router.get('/at-risk', AnalyticsController.getAtRiskStudents);
router.get('/student/:id', AnalyticsController.getStudentInsights);
router.get('/trends', AnalyticsController.getTrends);
router.post('/recalculate', AnalyticsController.recalculate);

export default router;
