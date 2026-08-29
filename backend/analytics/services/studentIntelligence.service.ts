/**
 * Student Intelligence Engine
 * The main orchestrator connecting data sources to the risk and prediction engines.
 */

import { NormalizationService } from './normalization.service';
import { RiskEngineService, RiskLevel } from './riskEngine.service';
import { PredictionEngineService, AIInsight } from './predictionEngine.service';

export interface StudentRiskProfile {
  student_id: string;
  attendance_score: number;
  academic_score: number;
  financial_score: number;
  behavior_score: number;
  engagement_score: number;
  final_risk_score: number;
  risk_level: RiskLevel;
  ai_reason: string;
  ai_recommendation: string;
  prediction: string;
  last_updated: string;
}

export const StudentIntelligenceEngine = {
  /**
   * Processes raw student data into a complete intelligence profile.
   */
  async processStudent(raw: {
    id: string;
    attendanceRate: number;      // 0-100
    gradeAverage: number;        // 0-100
    feesPaid: number;
    totalFees: number;
    incidentCount: number;
    engagementRate: number;      // 0-100
  }): Promise<StudentRiskProfile> {
    
    // 1. Normalize metrics
    const metrics = {
      attendance: 100 - NormalizationService.normalizeAttendance(raw.attendanceRate), // Higher risk if low attendance
      academic: 100 - NormalizationService.normalizeAcademic(raw.gradeAverage),      // Higher risk if low grades
      financial: NormalizationService.normalizeFinancial(raw.feesPaid, raw.totalFees),
      behavior: NormalizationService.normalizeBehavior(raw.incidentCount),
      engagement: 100 - raw.engagementRate // Assuming high engagement = low risk
    };

    // 2. Compute Risk Score
    const final_risk_score = RiskEngineService.calculateFinalRiskScore(metrics);
    const risk_level = RiskEngineService.classifyRisk(final_risk_score);

    // 3. Generate AI Insights
    const insights = PredictionEngineService.generateInsights(metrics, risk_level);

    return {
      student_id: raw.id,
      attendance_score: metrics.attendance,
      academic_score: metrics.academic,
      financial_score: metrics.financial,
      behavior_score: metrics.behavior,
      engagement_score: metrics.engagement,
      final_risk_score,
      risk_level,
      ai_reason: insights.reason,
      ai_recommendation: insights.recommendation,
      prediction: insights.prediction,
      last_updated: new Date().toISOString()
    };
  }
};
