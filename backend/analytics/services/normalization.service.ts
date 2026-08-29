/**
 * Normalization Service
 * Ensures all metrics are scaled to a 0-100 range.
 */

export const NormalizationService = {
  /**
   * Scales a value based on min and max.
   */
  scale(value: number, min: number, max: number): number {
    if (max === min) return 0;
    const normalized = ((value - min) / (max - min)) * 100;
    return Math.min(Math.max(normalized, 0), 100);
  },

  /**
   * Normalizes attendance percentage (usually already 0-100).
   */
  normalizeAttendance(attendanceRate: number): number {
    return Math.min(Math.max(attendanceRate, 0), 100);
  },

  /**
   * Normalizes GPA or Grade Average (assuming 0-100 scale).
   */
  normalizeAcademic(score: number): number {
    return Math.min(Math.max(score, 0), 100);
  },

  /**
   * Normalizes financial status (Percentage of fees paid).
   */
  normalizeFinancial(paid: number, total: number): number {
    if (total <= 0) return 100;
    const percentage = (paid / total) * 100;
    // For risk scoring, we want 0 = paid in full (low risk), 100 = 0 paid (high risk)
    // Actually, the risk engine logic usually expects 0-100 where higher is BETTER or WORSE?
    // User formula: finalRiskScore = sum(metric * weight).
    // This implies metrics should be "Risk Points" (Higher = Higher Risk).
    // So 0 paid = 100 risk, 100 paid = 0 risk.
    return 100 - Math.min(Math.max(percentage, 0), 100);
  },

  /**
   * Normalizes behavior score (assumed 0-10, where 10 is many incidents).
   */
  normalizeBehavior(incidentCount: number): number {
    // 5+ incidents is considered 100% risk in this simple model
    return Math.min((incidentCount / 5) * 100, 100);
  }
};
