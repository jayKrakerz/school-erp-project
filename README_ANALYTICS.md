# AI Academic Analytics System (StudentIntelligenceEngine)

This is a centralized intelligence microservice designed to provide real-time risk scoring and predicted outcomes for students based on multiple data sources.

## 🚀 Key Features
- **StudentIntelligenceEngine**: Centrally orchestrates normalization, risk scoring, and AI insights.
- **Weighted Risk Engine**: Configurable weights for Attendance (25%), Academics (35%), Fees (20%), Behavior (10%), and Engagement (10%).
- **AI Layer**: Generates human-readable reasons, recommendations, and predictions for every student.
- **Micro-service Architecture**: Modular TypeScript backend (Controllers, Services, Routes, Jobs).
- **Advanced UI**: Real-time dashboard with Recharts visualizations and deep-profile analysis.

## 📁 Directory Structure
- `backend/analytics/services`: Core logic (Normalization, Risk, Prediction).
- `backend/analytics/controllers`: API handlers.
- `backend/analytics/routes`: Endpoint definitions.
- `backend/analytics/jobs`: Automated recalculation tasks.
- `frontend/src/pages/AnalyticsDashboard.jsx`: Premium React UI.

## 🛠️ Localhost Testing
The system includes a **MockDataGenerator** that seeds 20-50 students with varied patterns for instant validation.

### How to Run:
1. **Analytics Engine (Backend)**:
   ```bash
   cd backend/analytics
   npm install
   npm start
   ```
   *The engine runs on port 5001.*

2. **ERP Application (Frontend)**:
   ```bash
   # In the root directory
   npm run dev
   ```
   *The dashboard is accessible at `/analytics` for Admin users.*

### API Endpoints:
- `GET /api/analytics/dashboard`: Fetch summary stats.
- `GET /api/analytics/at-risk`: Get students in high/critical categories.
- `GET /api/analytics/student/:id`: Deep dive into specific student insights.
- `GET /api/analytics/trends`: System-wide academic trends.
- `POST /api/analytics/recalculate`: Manually trigger the risk engine.

## ⚖️ Customizing Weights
You can adjust the risk calculation weights in `backend/analytics/services/riskEngine.service.ts`:
```typescript
export const DEFAULT_WEIGHTS = {
  attendance: 0.25,
  academic: 0.35,
  financial: 0.20,
  behavior: 0.10,
  engagement: 0.10,
};
```
