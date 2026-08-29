/**
 * Prediction & AI Reasoning Engine
 * Generates natural language insights and recommendations.
 */

import { RiskLevel } from './riskEngine.service';

export interface AIInsight {
  riskLevel: RiskLevel;
  reason: string;
  recommendation: string;
  prediction: string;
}

export const PredictionEngineService = {
  /**
   * Generates AI insights based on student metrics.
   */
  generateInsights(
    metrics: { 
      attendance: number, 
      academic: number, 
      financial: number, 
      behavior: number, 
      engagement: number 
    },
    riskLevel: RiskLevel
  ): AIInsight {
    let reason = '';
    let recommendation = '';
    let prediction = '';

    const concerns = [];
    if (metrics.attendance > 30) concerns.push('declining attendance');
    if (metrics.academic > 40) concerns.push('poor academic performance');
    if (metrics.financial > 50) concerns.push('unpaid fees');
    if (metrics.behavior > 20) concerns.push('frequent disciplinary incidents');

    if (riskLevel === 'Low') {
      reason = 'Student is performing consistently across all monitored metrics.';
      recommendation = 'Maintain current patterns; provide enrichment opportunities.';
      prediction = 'High probability of academic excellence this term.';
    } else {
      reason = `Student risk is ${riskLevel} due to ${concerns.join(', ')}.`;
      
      if (metrics.attendance > 50) {
        recommendation = 'Schedule urgent guardian meeting and assign a peer mentor.';
        prediction = 'High risk of chronic absenteeism and potential dropout.';
      } else if (metrics.academic > 60) {
        recommendation = 'Enroll in remedial classes and schedule focused counseling sessions.';
        prediction = 'Likely to fail key subjects without immediate academic intervention.';
      } else if (metrics.financial > 70) {
        recommendation = 'Review financial aid options and schedule a payment plan discussion.';
        prediction = 'Registration might be suspended due to outstanding arrears.';
      } else {
        recommendation = 'General counseling and closer monitoring by class teacher.';
        prediction = 'Gradual decline expected if no intervention is initiated.';
      }
    }

    return {
      riskLevel,
      reason,
      recommendation,
      prediction
    };
  }
};
