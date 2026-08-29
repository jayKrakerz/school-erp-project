/**
 * Risk Scoring Engine
 * Computes the weighted risk score for a student.
 */

import { NormalizationService } from './normalization.service';

export interface ScoreWeights {
  attendance: number;
  academic: number;
  financial: number;
  behavior: number;
  engagement: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  attendance: 0.25,
  academic: 0.35,
  financial: 0.20,
  behavior: 0.10,
  engagement: 0.10,
};

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical';

export const RiskEngineService = {
  /**
   * Computes final risk score based on normalized metrics.
   */
  calculateFinalRiskScore(
    metrics: { 
      attendance: number, 
      academic: number, 
      financial: number, 
      behavior: number, 
      engagement: number 
    },
    weights: ScoreWeights = DEFAULT_WEIGHTS
  ): number {
    const score = 
      (metrics.attendance * weights.attendance) +
      (metrics.academic * weights.academic) +
      (metrics.financial * weights.financial) +
      (metrics.behavior * weights.behavior) +
      (metrics.engagement * weights.engagement);
    
    return Math.round(score * 100) / 100;
  },

  /**
   * Classifies numerical score into human-readable levels.
   */
  classifyRisk(score: number): RiskLevel {
    if (score >= 80) return 'Critical';
    if (score >= 60) return 'High';
    if (score >= 40) return 'Moderate';
    return 'Low';
  },

  /**
   * Classify risk badge color.
   */
  getRiskColor(level: RiskLevel): string {
    switch (level) {
      case 'Critical': return '#ef4444'; // Red-500
      case 'High': return '#f97316';     // Orange-500
      case 'Moderate': return '#eab308'; // Yellow-500
      case 'Low': return '#22c55e';      // Green-500
      default: return '#94a3b8';         // Slate-400
    }
  }
};
