/**
 * Analytics Engine Server
 * Entry point for the AI Academic Analytics microservice.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyticsRoutes from './routes/analytics.routes';

dotenv.config();

const app = express();
const PORT = process.env.ANALYTICS_PORT || 5001;

app.use(cors());
app.use(express.json());

// Global Headers
app.use((req, res, next) => {
  res.setHeader('X-System', 'StudentIntelligenceEngine');
  next();
});

// Routes
app.use('/api/analytics', analyticsRoutes);

// Start Background Jobs
import { RiskRecalculationJob } from './jobs/riskRecalculation.job';
RiskRecalculationJob.start(10 * 60 * 1000); // 10 minutes interval

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', engine: 'AI Academic Analytics' });
});

app.listen(PORT, () => {
  console.log(`--------------------------------------------------`);
  console.log(`🚀 AI Analytics Engine running on port ${PORT}`);
  console.log(`🧠 Centralized StudentIntelligenceEngine active`);
  console.log(`--------------------------------------------------`);
});
