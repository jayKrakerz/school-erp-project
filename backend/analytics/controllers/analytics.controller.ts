/**
 * Analytics Controller
 * Handles request-response logic for the intelligence engine.
 */

import { Request, Response } from 'express';
import { MockDataGenerator } from '../MockDataGenerator';
import { StudentIntelligenceEngine } from '../services/studentIntelligence.service';

// In-memory "DB" for localhost testing
let cachedProfiles: any[] = [];

export const AnalyticsController = {
  /**
   * Main dashboard stats.
   */
  async getDashboard(req: Request, res: Response) {
    if (cachedProfiles.length === 0) {
      cachedProfiles = await MockDataGenerator.generate(40);
    }

    const stats = {
      totalStudents: cachedProfiles.length,
      criticalRisk: cachedProfiles.filter(p => p.risk_level === 'Critical').length,
      highRisk: cachedProfiles.filter(p => p.risk_level === 'High').length,
      moderateRisk: cachedProfiles.filter(p => p.risk_level === 'Moderate').length,
      lowRisk: cachedProfiles.filter(p => p.risk_level === 'Low').length,
      improvementTrend: 12 // Mock percentage
    };

    res.json(stats);
  },

  /**
   * List of at-risk students.
   */
  async getAtRiskStudents(req: Request, res: Response) {
    if (cachedProfiles.length === 0) {
      cachedProfiles = await MockDataGenerator.generate(40);
    }
    const atRisk = cachedProfiles.filter(p => ['Critical', 'High'].includes(p.risk_level));
    res.json(atRisk);
  },

  /**
   * Specific student details with charts.
   */
  async getStudentInsights(req: Request, res: Response) {
    const { id } = req.params;
    const profile = cachedProfiles.find(p => p.student_id === id);
    
    if (!profile) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    res.json(profile);
  },

  /**
   * Recalculate risk for all students.
   */
  async recalculate(req: Request, res: Response) {
    console.log('[Analytics] Manual recalculation triggered.');
    cachedProfiles = await MockDataGenerator.generate(40);
    res.json({ success: true, message: 'Recalculated successfully' });
  },

  /**
   * System-wide trends and insights.
   */
  async getTrends(req: Request, res: Response) {
    res.json({
      atRiskClass: 'BASIC 8',
      failingSubject: 'Mathematics',
      attendanceDrop: '12%',
      topPerforming: 'STU1088',
      defaulterCluster: 'JHS Division'
    });
  }
};
