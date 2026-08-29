/**
 * Mock Data Generator
 * Seeds the system with experimental data for localhost testing.
 */

import { StudentIntelligenceEngine, StudentRiskProfile } from './services/studentIntelligence.service';

export const MockDataGenerator = {
  /**
   * Generates a list of mock risk profiles.
   */
  async generate(count: number = 30): Promise<StudentRiskProfile[]> {
    const profiles: StudentRiskProfile[] = [];
    
    for (let i = 1; i <= count; i++) {
      const studentId = `STU${1000 + i}`;
      
      // Randomize patterns for diverse testing
      const seed = Math.random();
      let attendanceRate = 70 + Math.random() * 30;
      let gradeAverage = 65 + Math.random() * 35;
      let feesPaid = 1000;
      let incidentCount = 0;

      if (seed > 0.9) { // 10% Critical/High Risk cases
        attendanceRate = 30 + Math.random() * 30;
        gradeAverage = 30 + Math.random() * 30;
        feesPaid = 0;
        incidentCount = 3 + Math.floor(Math.random() * 5);
      } else if (seed > 0.7) { // 20% Moderate Risk
        attendanceRate = 60 + Math.random() * 20;
        gradeAverage = 50 + Math.random() * 20;
        feesPaid = 400;
        incidentCount = 1;
      }

      const profile = await StudentIntelligenceEngine.processStudent({
        id: studentId,
        attendanceRate,
        gradeAverage,
        feesPaid,
        totalFees: 1000,
        incidentCount,
        engagementRate: attendanceRate - 10
      });

      profiles.push(profile);
    }

    console.log(`[Analytics] Successfully generated ${profiles.length} mock student profiles.`);
    return profiles;
  }
};
